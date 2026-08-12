import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Headphones, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AudioPlayer } from "@/components/AudioPlayer";
import { chunkForTTS, estimateMinutes, extractPdfText, MAX_PDF_BYTES } from "@/lib/pdf-text";
import { synthesizeChunks, VOICES } from "@/lib/tts-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Leitor de PDF em Voz Alta | Ouça seus documentos" },
      {
        name: "description",
        content:
          "Envie um PDF e ouça o conteúdo narrado com voz natural no navegador: controles de reprodução, escolha de voz, velocidade e download em MP3.",
      },
      { property: "og:title", content: "Leitor de PDF em Voz Alta" },
      {
        property: "og:description",
        content: "Transforme qualquer PDF com texto em narração natural e baixe o áudio em MP3.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Doc = {
  title: string;
  pages: number;
  text: string;
  chunks: string[];
  minutes: number;
};

const MAX_CHUNKS = 40;

function Index() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [voice, setVoice] = useState(VOICES[0]!.id);
  const [status, setStatus] = useState<"idle" | "extracting" | "generating">("idle");
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });
  const [audioProgress, setAudioProgress] = useState({ done: 0, total: 0 });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resetAudio = useCallback(() => {
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Arquivo inválido", { description: "Envie um arquivo no formato PDF." });
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        toast.error("Arquivo muito grande", {
          description: `O limite é de ${MAX_PDF_BYTES / 1024 / 1024}MB por PDF.`,
        });
        return;
      }

      resetAudio();
      setDoc(null);
      setStatus("extracting");
      setExtractProgress({ done: 0, total: 0 });

      try {
        const result = await extractPdfText(file, (done, total) =>
          setExtractProgress({ done, total }),
        );

        if (result.charCount < 40) {
          toast.error("Nenhum texto legível encontrado", {
            description:
              "Este PDF parece ser digitalizado (somente imagem). Nesta versão não há suporte a OCR.",
          });
          setStatus("idle");
          return;
        }

        const chunks = chunkForTTS(result.text).slice(0, MAX_CHUNKS);
        setDoc({
          title: result.title,
          pages: result.pages.length,
          text: result.text,
          chunks,
          minutes: estimateMinutes(chunks.join(" ").length),
        });
        setStatus("idle");
      } catch (error) {
        console.error(error);
        toast.error("Não foi possível ler o PDF", {
          description: "O arquivo pode estar corrompido ou protegido por senha.",
        });
        setStatus("idle");
      }
    },
    [resetAudio],
  );

  const generate = useCallback(async () => {
    if (!doc) return;
    resetAudio();
    setStatus("generating");
    setAudioProgress({ done: 0, total: doc.chunks.length });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const blob = await synthesizeChunks(
        doc.chunks,
        voice,
        (done, total) => setAudioProgress({ done, total }),
        controller.signal,
      );
      setAudioUrl(URL.createObjectURL(blob));
      setStatus("idle");
      toast.success("Narração pronta");
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      console.error(error);
      toast.error("Erro na narração", {
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
      setStatus("idle");
    } finally {
      abortRef.current = null;
    }
  }, [doc, voice, resetAudio]);

  const busy = status !== "idle";

  return (
    <main className="paper-grain min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
        <header className="mb-10">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Headphones className="size-3.5" /> PDF em voz alta
          </p>
          <h1 className="display-xl text-balance">Ouça qualquer PDF com voz natural.</h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Envie um documento com texto selecionável, escolha a voz e ouça no navegador — com
            controles completos e download em MP3.
          </p>
        </header>

        <section
          aria-label="Enviar PDF"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "glass rounded-3xl p-8 text-center transition-transform duration-300 ease-out",
            dragging && "scale-[1.01] border-primary/60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Upload className="size-5" />
          </div>
          <p className="display-md">Arraste seu PDF aqui</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Somente PDFs com texto selecionável · até {MAX_PDF_BYTES / 1024 / 1024}MB
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 ease-out active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {status === "extracting" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Lendo página {extractProgress.done}
                {extractProgress.total ? ` de ${extractProgress.total}` : ""}…
              </>
            ) : (
              <>Escolher arquivo</>
            )}
          </button>
        </section>

        {doc && (
          <section className="mt-6 space-y-6" aria-label="Documento carregado">
            <div className="glass rounded-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{doc.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {doc.pages} página{doc.pages > 1 ? "s" : ""} · ~{doc.minutes} min de narração ·{" "}
                      {doc.chunks.length} bloco{doc.chunks.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    resetAudio();
                    setDoc(null);
                  }}
                  aria-label="Remover documento"
                  className="rounded-full p-2 text-muted-foreground transition-transform duration-200 ease-out active:scale-90 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-5">
                <label htmlFor="voice" className="text-sm font-medium">
                  Voz da narração
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" id="voice" role="radiogroup">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={voice === v.id}
                      onClick={() => setVoice(v.id)}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition-transform duration-200 ease-out active:scale-[0.97]",
                        voice === v.id
                          ? "border-primary bg-accent"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <span className="block text-sm font-semibold">{v.name}</span>
                      <span className="block text-xs text-muted-foreground">{v.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void generate()}
                disabled={busy}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform duration-200 ease-out active:scale-[0.98] disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {status === "generating" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Gerando áudio · bloco {audioProgress.done} de {audioProgress.total}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    {audioUrl ? "Gerar novamente" : "Gerar narração"}
                  </>
                )}
              </button>

              {status === "generating" && (
                <div className="mt-3">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={audioProgress.total}
                    aria-valuenow={audioProgress.done}
                    aria-label="Progresso da geração de áudio"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                      style={{
                        width: `${audioProgress.total ? (audioProgress.done / audioProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-4"
                  >
                    Cancelar geração
                  </button>
                </div>
              )}
            </div>

            {audioUrl && <AudioPlayer src={audioUrl} fileName={doc.title} />}

            <details className="glass rounded-3xl p-6">
              <summary className="cursor-pointer text-sm font-semibold">Texto extraído</summary>
              <div className="mt-4 max-h-80 overflow-y-auto pr-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {doc.text}
              </div>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
