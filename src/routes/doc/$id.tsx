import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GripVertical,
  Headphones,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Share2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  getDocument,
  addPages,
  deletePage,
  listDocumentIds,
  reorderPages,
  renameDocument,
  replacePageImage,
  type ScanPage,
} from "@/lib/scan/docs";
import { buildPdf, shareOrDownload, safeFileName } from "@/lib/scan/export";
import { rotateCanvas, loadImageToCanvas, canvasToJpeg } from "@/lib/scan/image";
import { CaptureFlow, type CapturedPage } from "@/components/scan/CaptureFlow";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export const Route = createFileRoute("/doc/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Documento — DocScan" },
      { name: "description", content: "Visualize, reordene, gire páginas e exporte seu documento digitalizado em PDF ou imagem." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Documento — DocScan" },
      { property: "og:description", content: "Visualize, reordene, gire páginas e exporte seu documento digitalizado em PDF ou imagem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { ready } = useAuthGuard();

  const [docName, setDocName] = useState("");
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [menuPageId, setMenuPageId] = useState<string | null>(null);

  const [savingPage, setSavingPage] = useState(false);
  const [lightbox, setLightbox] = useState<{ index: number; zoom: number; rotate: number } | null>(null);
  const [siblings, setSiblings] = useState<{ id: string; name: string }[]>([]);

  // Drag-to-reorder state
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const doc = await getDocument(id);
      if (!doc) {
        toast.error("Documento não encontrado.");
        void navigate({ to: "/docs" });
        return;
      }
      setDocName(doc.name);
      setNameVal(doc.name);
      setPages(doc.pages);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar documento.");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listDocumentIds().then(setSiblings).catch(() => {});
  }, []);

  // ── Name editing ────────────────────────────────────────────────────────────

  const startEditName = () => {
    setEditingName(true);
    setTimeout(() => nameRef.current?.select(), 40);
  };

  const submitName = async () => {
    setEditingName(false);
    const val = nameVal.trim() || docName;
    if (val === docName) return;
    try {
      await renameDocument(id, val);
      setDocName(val);
    } catch {
      toast.error("Não foi possível renomear.");
      setNameVal(docName);
    }
  };

  // ── Delete page ─────────────────────────────────────────────────────────────

  const handleDeletePage = (page: ScanPage) => {
    setMenuPageId(null);
    toast("Excluir esta página?", {
      action: {
        label: "Excluir",
        onClick: () => {
          void (async () => {
            try {
              await deletePage(page);
              setPages((prev) => prev.filter((p) => p.id !== page.id));
              toast.success("Página removida.");
            } catch {
              toast.error("Não foi possível excluir a página.");
            }
          })();
        },
      },
      cancel: { label: "Cancelar", onClick: () => {} },
    });
  };

  // ── Rotate page ─────────────────────────────────────────────────────────────

  const handleRotatePage = async (page: ScanPage) => {
    setMenuPageId(null);
    try {
      const canvas = await loadImageToCanvas(page.url);
      const rotated = rotateCanvas(canvas, 90);
      const blob = await canvasToJpeg(rotated, 0.85);
      await replacePageImage(page, blob, rotated.width, rotated.height);
      // optimistic: replace preview URL with new object URL
      const newUrl = URL.createObjectURL(blob);
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, url: newUrl, width: rotated.width, height: rotated.height } : p,
        ),
      );
      toast.success("Página girada.");
    } catch {
      toast.error("Não foi possível girar a página.");
    }
  };

  // ── Add pages via capture ────────────────────────────────────────────────────

  const handleNewPage = useCallback(
    async (page: CapturedPage) => {
      setSavingPage(true);
      try {
        const startAt = pages.length;
        await addPages(id, [{ blob: page.blob, width: page.width, height: page.height }], startAt);
        URL.revokeObjectURL(page.previewUrl);
        await load();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Falha ao adicionar página.");
      } finally {
        setSavingPage(false);
      }
    },
    [id, pages.length, load],
  );

  // ── Drag-to-reorder ──────────────────────────────────────────────────────────

  const handleDragEnd = async () => {
    const from = dragIdx.current;
    const to = dragOver;
    dragIdx.current = null;
    setDragOver(null);
    if (from === null || to === null || from === to) return;
    const reordered = [...pages];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setPages(reordered);
    try {
      await reorderPages(
        id,
        reordered.map((p) => p.id),
      );
    } catch {
      toast.error("Não foi possível reordenar as páginas.");
      await load();
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  const exportPdf = async () => {
    if (pages.length === 0) return;
    setExporting(true);
    try {
      const blob = await buildPdf(docName, pages);
      await shareOrDownload(blob, `${safeFileName(docName)}.pdf`);
    } catch {
      toast.error("Falha ao exportar PDF.");
    } finally {
      setExporting(false);
    }
  };

  const exportImages = () => {
    pages.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = p.url;
        a.download = `${safeFileName(docName)}-pagina-${i + 1}.jpg`;
        a.click();
      }, i * 300);
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!ready || loading) {
    return (
      <div className="flex min-h-dvh-safe items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh-safe flex-col bg-background safe-x">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur safe-top">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void navigate({ to: "/docs" })}
            aria-label="Voltar"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Prev / Next document */}
          {siblings.length > 1 && (() => {
            const idx = siblings.findIndex((s) => s.id === id);
            const prev = siblings[idx - 1];
            const next = siblings[idx + 1];
            return (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={!prev}
                  onClick={() => prev && void navigate({ to: "/doc/$id", params: { id: prev.id } })}
                  aria-label={prev ? `Documento anterior: ${prev.name}` : "Sem documento anterior"}
                  title={prev?.name}
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {idx + 1}/{siblings.length}
                </span>
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => next && void navigate({ to: "/doc/$id", params: { id: next.id } })}
                  aria-label={next ? `Próximo documento: ${next.name}` : "Sem próximo documento"}
                  title={next?.name}
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })()}

          {/* Editable title */}
          {editingName ? (
            <input
              ref={nameRef}
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={() => void submitName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitName();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setNameVal(docName);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-ring bg-background px-2 py-1 text-sm font-medium text-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startEditName}
              className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
              aria-label="Renomear documento"
            >
              <span className="truncate text-sm font-semibold text-foreground">{docName}</span>
              <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}

          {/* Export menu */}
          <ExportMenu
            onPdf={() => void exportPdf()}
            onImages={exportImages}
            exporting={exporting}
          />
          <Link
            to="/"
            aria-label="Leitor PDF"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Headphones className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-28">
        {pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted shadow-inner">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </span>
            <div>
              <p className="text-base font-medium text-foreground">Documento vazio</p>
              <p className="mt-1 text-sm text-muted-foreground">Adicione a primeira página usando o botão abaixo.</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            {/* Page count hint */}
            <p className="mb-4 text-xs font-medium text-muted-foreground">
              {pages.length} {pages.length === 1 ? "página" : "páginas"} · arraste para reordenar
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {pages.map((page, i) => (
              <div
                key={page.id}
                draggable
                onDragStart={() => (dragIdx.current = i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDrop={() => void handleDragEnd()}
                onDragEnd={() => void handleDragEnd()}
                className={`group relative w-full cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-md ring-0 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl focus-within:ring-2 focus-within:ring-primary/50 ${
                  dragOver === i
                    ? "border-primary/60 scale-[0.97] opacity-60 shadow-none"
                    : "border-border/60"
                }`}
                style={{ aspectRatio: "3/4" }}
              >
                <img
                  src={page.url}
                  alt={`Página ${i + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                  onClick={() => setLightbox({ index: i, zoom: 1, rotate: 0 })}
                />

                {/* Scrim on hover */}
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  aria-hidden="true"
                />

                {/* Drag handle */}
                <div className="absolute left-2 top-2 cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
                  <span className="flex items-center justify-center rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                    <GripVertical className="h-3 w-3 text-white" />
                  </span>
                </div>

                {/* Page options button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuPageId(menuPageId === page.id ? null : page.id);
                  }}
                  aria-label={`Opções página ${i + 1}`}
                  className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-black/50 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {/* Context menu */}
                {menuPageId === page.id && (
                  <div className="absolute right-2 top-10 z-20 min-w-[130px] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <button
                      type="button"
                      onClick={() => void handleRotatePage(page)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      <RotateCw className="h-3.5 w-3.5" /> Girar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuPageId(null);
                        const a = document.createElement("a");
                        a.href = page.url;
                        a.download = `${safeFileName(docName)}-pagina-${i + 1}.jpg`;
                        a.click();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar
                    </button>
                    <div className="my-0.5 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => void handleDeletePage(page)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                )}

                {/* Page number */}
                <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-2.5 pb-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
                    {i + 1}
                  </span>
                </div>
                {/* Always-visible subtle page number for non-hover */}
                <span className="absolute bottom-2 left-2.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/80 transition-opacity duration-200 group-hover:opacity-0">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
          </div>
        )}
      </main>

      {/* Add page FAB */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-center bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-6 pt-8 safe-bottom">
        <button
          type="button"
          onClick={() => setCapturing(true)}
          disabled={savingPage}
          className="inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-4px_oklch(0.55_0.16_42/0.45)] transition-all duration-200 ease-out hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-4px_oklch(0.55_0.16_42/0.55)] active:scale-95 active:translate-y-0 disabled:opacity-70 disabled:shadow-none"
        >
          {savingPage ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Salvando página…</>
          ) : (
            <><Plus className="h-5 w-5" /> Adicionar página</>
          )}
        </button>
      </div>

      {/* Camera overlay */}
      {capturing && (
        <CaptureFlow
          onPage={(page) => {
            setCapturing(false);
            void handleNewPage(page);
          }}
          onClose={() => setCapturing(false)}
        />
      )}

      {/* Close page menu on outside click */}
      {menuPageId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuPageId(null)}
          aria-hidden="true"
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <PageLightbox
          pages={pages}
          index={lightbox.index}
          zoom={lightbox.zoom}
          rotate={lightbox.rotate}
          onClose={() => setLightbox(null)}
          onChange={(index, zoom, rotate) => setLightbox({ index, zoom, rotate })}
        />
      )}
    </div>
  );
}

// ── Page Lightbox ──────────────────────────────────────────────────────────────

const LIGHTBOX_STEP = 0.1;
const LIGHTBOX_MIN_ZOOM = 0.5;
const LIGHTBOX_MAX_ZOOM = 5;
const clampZoom = (v: number) =>
  Math.round(Math.min(Math.max(v, LIGHTBOX_MIN_ZOOM), LIGHTBOX_MAX_ZOOM) * 100) / 100;

function PageLightbox({
  pages,
  index,
  zoom,
  rotate,
  onClose,
  onChange,
}: {
  pages: ScanPage[];
  index: number;
  zoom: number;
  rotate: number;
  onClose: () => void;
  onChange: (index: number, zoom: number, rotate: number) => void;
}) {
  const page = pages[index]!;
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── stateRef so event handlers registered once always read live values ──
  const stateRef = useRef({ index, zoom, rotate, pages, onClose, onChange });
  useEffect(() => {
    stateRef.current = { index, zoom, rotate, pages, onClose, onChange };
  });

  // ── keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.key === "Escape") { s.onClose(); return; }
      if (e.key === "ArrowRight" && s.index < s.pages.length - 1) s.onChange(s.index + 1, 1, 0);
      if (e.key === "ArrowLeft"  && s.index > 0)                   s.onChange(s.index - 1, 1, 0);
      if (e.key === "+" || e.key === "=") s.onChange(s.index, clampZoom(s.zoom + LIGHTBOX_STEP), s.rotate);
      if (e.key === "-")                  s.onChange(s.index, clampZoom(s.zoom - LIGHTBOX_STEP), s.rotate);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── wheel zoom — keeps scroll position centred on cursor ────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const next = clampZoom(s.zoom + (e.deltaY < 0 ? LIGHTBOX_STEP : -LIGHTBOX_STEP));
      if (next === s.zoom) return;

      // Re-center scroll so the point under the cursor stays fixed
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left; // cursor x relative to container
      const cy = e.clientY - rect.top;
      const scrollRatio = next / s.zoom;
      const newScrollLeft = (el.scrollLeft + cx) * scrollRatio - cx;
      const newScrollTop  = (el.scrollTop  + cy) * scrollRatio - cy;

      s.onChange(s.index, next, s.rotate);

      // Apply scroll after React re-renders the new image size
      requestAnimationFrame(() => {
        el.scrollLeft = newScrollLeft;
        el.scrollTop  = newScrollTop;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── pointer drag to pan ──────────────────────────────────────────────────
  const dragStart = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = scrollRef.current;
    if (!el) return;
    dragStart.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = dragStart.current.sl - (e.clientX - dragStart.current.x);
    el.scrollTop  = dragStart.current.st - (e.clientY - dragStart.current.y);
  };
  const onPointerUp = () => { dragStart.current = null; };

  // ── reset scroll when navigating to a new page ──────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) { el.scrollLeft = 0; el.scrollTop = 0; }
  }, [index]);

  const clampedZoom = clampZoom(zoom);

  // Image dimensions: at zoom=1 we fill the container; zoom scales from there.
  // We let the scroll container handle overflow — no CSS transform on the image.
  const imgStyle: React.CSSProperties =
    clampedZoom <= 1
      ? {
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
          transform: `rotate(${rotate}deg)`,
          transition: "transform 0.2s ease",
          cursor: "default",
        }
      : {
          // Size the image relative to the scrollable container so it actually
          // overflows and the browser scroll bars + our drag handler take over.
          width: `${clampedZoom * 100}%`,
          height: "auto",
          minWidth: `${clampedZoom * 100}%`,
          transform: `rotate(${rotate}deg)`,
          transition: "transform 0.2s ease",
          cursor: dragStart.current ? "grabbing" : "grab",
        };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 safe-top safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-label={`Página ${index + 1} de ${pages.length}`}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-medium text-white/80">
          Página {index + 1} de {pages.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(index, clampedZoom, rotate - 90)}
            aria-label="Girar anti-horário"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onChange(index, clampedZoom, rotate + 90)}
            aria-label="Girar horário"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => onChange(index, clampZoom(clampedZoom - LIGHTBOX_STEP), rotate)}
            aria-label="Diminuir zoom"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="number"
            min={Math.round(LIGHTBOX_MIN_ZOOM * 100)}
            max={Math.round(LIGHTBOX_MAX_ZOOM * 100)}
            step={10}
            value={Math.round(clampedZoom * 100)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v) && v > 0) onChange(index, clampZoom(v / 100), rotate);
            }}
            aria-label="Zoom em porcentagem"
            className="w-14 rounded-md bg-white/10 px-1.5 py-0.5 text-center text-xs font-mono text-white outline-none focus:bg-white/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs text-white/40">%</span>
          <button
            type="button"
            onClick={() => onChange(index, clampZoom(clampedZoom + LIGHTBOX_STEP), rotate)}
            aria-label="Aumentar zoom"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onChange(index, 1, 0)}
            aria-label="Resetar visualização"
            className="rounded-full px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            100%
          </button>
          <div className="mx-1 h-4 w-px bg-white/20" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Scrollable image area ────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="relative flex flex-1 items-center justify-center overflow-auto"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Prevent text selection while dragging
        style={{ userSelect: "none" }}
      >
        {/* Prev */}
        {index > 0 && (
          <button
            type="button"
            onClick={() => onChange(index - 1, 1, 0)}
            aria-label="Página anterior"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/80"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <img
          src={page.url}
          alt={`Página ${index + 1}`}
          draggable={false}
          style={imgStyle}
          className="select-none object-contain"
        />

        {/* Next */}
        {index < pages.length - 1 && (
          <button
            type="button"
            onClick={() => onChange(index + 1, 1, 0)}
            aria-label="Próxima página"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/80"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ── Thumbnail strip ──────────────────────────────────────────────── */}
      {pages.length > 1 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(i, 1, 0)}
              className={`h-14 w-10 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                i === index
                  ? "border-primary opacity-100"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img src={p.url} alt={`Página ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Export Menu component ───────────────────────────────────────────────────────

function ExportMenu({
  onPdf,
  onImages,
  exporting,
}: {
  onPdf: () => void;
  onImages: () => void;
  exporting: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting}
        className="inline-flex items-center gap-2 rounded-full border border-input px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Exportar</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onPdf();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-accent"
            >
              <FileText className="h-4 w-4" /> PDF
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onImages();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Imagens (JPG)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
