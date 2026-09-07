import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Image as ImageIcon, RefreshCw, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  applyFilter,
  canvasToJpeg,
  detectQuad,
  loadImageToCanvas,
  rotateCanvas,
  warpPerspective,
  type FilterKind,
  type Point,
  type Quad,
} from "@/lib/scan/image";
import { recognizePage } from "@/lib/scan/ocr";

export type CapturedPage = {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
  /** OCR text extracted in the background; null while pending or if extraction failed */
  ocrText: string | null;
};

const FILTERS: { key: FilterKind; label: string }[] = [
  { key: "enhance", label: "Realce" },
  { key: "bw", label: "P&B" },
  { key: "gray", label: "Cinza" },
  { key: "color", label: "Cor" },
];

export function CaptureFlow({
  onPage,
  onClose,
}: {
  onPage: (page: CapturedPage) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [filter, setFilter] = useState<FilterKind>("enhance");
  const [preview, setPreview] = useState<string | null>(null);
  const [processed, setProcessed] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"camera" | "crop" | "review">("camera");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setCameraError("Não foi possível acessar a câmera. Você ainda pode enviar uma foto do dispositivo.");
    }
  }, []);

  useEffect(() => {
    if (stage === "camera") void startCamera();
    return stopCamera;
  }, [stage, startCamera, stopCamera]);

  const useSourceCanvas = useCallback((canvas: HTMLCanvasElement) => {
    setShot(canvas);
    setQuad(detectQuad(canvas));
    setStage("crop");
    stopCamera();
  }, [stopCamera]);

  const takeShot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    useSourceCanvas(canvas);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    try {
      useSourceCanvas(await loadImageToCanvas(file));
    } catch {
      toast.error("Não foi possível abrir a imagem");
    }
  };

  const confirmCrop = async () => {
    if (!shot || !quad) return;
    setBusy(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const warped = warpPerspective(shot, quad);
      const filtered = applyFilter(warped, filter);
      setProcessed(filtered);
      setPreview(filtered.toDataURL("image/jpeg", 0.8));
      setStage("review");
    } finally {
      setBusy(false);
    }
  };

  const reFilter = (kind: FilterKind) => {
    setFilter(kind);
    if (stage !== "review" || !shot || !quad) return;
    setBusy(true);
    requestAnimationFrame(() => {
      try {
        const filtered = applyFilter(warpPerspective(shot, quad), kind);
        setProcessed(filtered);
        setPreview(filtered.toDataURL("image/jpeg", 0.8));
      } finally {
        setBusy(false);
      }
    });
  };

  const rotate = () => {
    if (!processed) return;
    const rotated = rotateCanvas(processed, 90);
    setProcessed(rotated);
    setPreview(rotated.toDataURL("image/jpeg", 0.8));
  };

  const confirmPage = async () => {
    if (!processed) return;
    setBusy(true);
    try {
      const blob = await canvasToJpeg(processed, 0.85);
      const page: CapturedPage = {
        id: crypto.randomUUID(),
        blob,
        width: processed.width,
        height: processed.height,
        previewUrl: URL.createObjectURL(blob),
        ocrText: null,
      };

      // Fire OCR in background — doesn't block the camera returning to live view.
      // We pass the processed canvas directly so tesseract gets the best-quality
      // (filtered, perspective-corrected) image rather than the JPEG-compressed blob.
      const processedSnapshot = processed; // capture ref before state reset
      recognizePage(processedSnapshot).then((text) => {
        page.ocrText = text;
      }).catch(() => {
        // OCR failure is silent — ocrText stays null
      });

      onPage(page);
      setShot(null);
      setQuad(null);
      setProcessed(null);
      setPreview(null);
      setStage("camera");
    } catch {
      toast.error("Não foi possível processar a página");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background safe-top safe-bottom safe-x">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-foreground">
          {stage === "camera" ? "Capturar página" : stage === "crop" ? "Ajustar recorte" : "Revisar página"}
        </span>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          aria-label="Fechar captura"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden bg-black/90 p-2">
        {stage === "camera" && (
          <div className="relative flex h-full w-full items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            {cameraError && (
              <p className="absolute inset-x-6 bottom-6 rounded-lg bg-background/90 p-3 text-center text-sm text-muted-foreground">
                {cameraError}
              </p>
            )}
          </div>
        )}
        {stage === "crop" && shot && quad && (
          <CornerEditor source={shot} quad={quad} onChange={setQuad} />
        )}
        {stage === "review" && preview && (
          <img src={preview} alt="Prévia da página digitalizada" className="max-h-full max-w-full object-contain" />
        )}
      </div>

      {stage === "review" && (
        <div className="flex justify-center gap-2 border-t border-border px-4 pt-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => reFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-center gap-3 px-4 py-4">
        {stage === "camera" && (
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent">
              <ImageIcon className="h-4 w-4" />
              Galeria
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              onClick={takeShot}
              disabled={!!cameraError}
              aria-label="Tirar foto do documento"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-40"
            >
              <Camera className="h-7 w-7" />
            </button>
          </>
        )}
        {stage === "crop" && (
          <>
            <button
              type="button"
              onClick={() => setStage("camera")}
              className="inline-flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" /> Refazer
            </button>
            <button
              type="button"
              onClick={() => void confirmCrop()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> {busy ? "Processando…" : "Confirmar recorte"}
            </button>
          </>
        )}
        {stage === "review" && (
          <>
            <button
              type="button"
              onClick={() => setStage("crop")}
              className="inline-flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" /> Recortar
            </button>
            <button
              type="button"
              onClick={rotate}
              aria-label="Girar página"
              className="rounded-full border border-input p-2 text-foreground transition-colors hover:bg-accent"
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void confirmPage()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> Adicionar página
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

function CornerEditor({
  source,
  quad,
  onChange,
}: {
  source: HTMLCanvasElement;
  quad: Quad;
  onChange: (quad: Quad) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [url] = useState(() => source.toDataURL("image/jpeg", 0.8));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const sx = size.w / source.width;
  const sy = size.h / source.height;

  const move = (clientX: number, clientY: number) => {
    const index = dragging.current;
    const el = wrapRef.current;
    if (index === null || !el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(source.width, Math.max(0, (clientX - rect.left) / sx));
    const y = Math.min(source.height, Math.max(0, (clientY - rect.top) / sy));
    const next = [...quad] as Quad;
    next[index] = { x, y } as Point;
    onChange(next);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        ref={wrapRef}
        className="relative"
        style={{ maxHeight: "100%", maxWidth: "100%", aspectRatio: `${source.width} / ${source.height}`, width: "min(100%, 900px)" }}
        onPointerMove={(e) => dragging.current !== null && move(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
      >
        <img src={url} alt="Foto capturada" className="h-full w-full object-fill rounded-lg" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <polygon
            points={quad.map((p) => `${p.x * sx},${p.y * sy}`).join(" ")}
            className="fill-primary/15 stroke-primary"
            strokeWidth={2}
          />
        </svg>
        {quad.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ajustar canto ${i + 1}`}
            onPointerDown={(e) => {
              e.preventDefault();
              dragging.current = i;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-primary bg-background/80 shadow"
            style={{ left: p.x * sx, top: p.y * sy }}
          />
        ))}
      </div>
    </div>
  );
}
