import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Headphones, Loader2, ScanLine, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AudioPlayer } from "@/components/AudioPlayer";
import { chunkForTTS, estimateMinutes, extractPdfText, MAX_PDF_BYTES } from "@/lib/pdf-text";
import { synthesizeChunks, VOICES } from "@/lib/tts-client";
import { cn } from "@/lib/utils";
import { useI18n, type Lang } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

const SITE_URL = "https://talky-doc.lovable.app";

const COPY = {
  pt: {
    title: "Leitor de PDF em Voz Alta | Ouça seus documentos",
    description:
      "Envie um PDF e ouça o conteúdo narrado com voz natural no navegador: controles de reprodução, escolha de voz, velocidade e download em MP3.",
    ogTitle: "Leitor de PDF em Voz Alta",
    ogDescription:
      "Transforme qualquer PDF com texto em narração natural e baixe o áudio em MP3.",
  },
  en: {
    title: "PDF Voice Reader | Listen to your documents",
    description:
      "Upload a PDF and listen to it narrated with a natural voice in your browser: playback controls, voice picker, speed and MP3 download.",
    ogTitle: "PDF Voice Reader",
    ogDescription: "Turn any text-based PDF into natural narration and download the MP3.",
  },
} as const;

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { lang?: Lang } => {
    const lang = search["lang"];
    return lang === "pt" || lang === "en" ? { lang } : {};
  },
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ deps }) => ({ lang: deps.lang ?? ("pt" as Lang) }),
  head: ({ loaderData }) => {
    const lang: Lang = loaderData?.lang ?? "pt";
    const copy = COPY[lang];
    const url = lang === "pt" ? `${SITE_URL}/` : `${SITE_URL}/?lang=en`;

    return {
      meta: [
        { title: copy.title },
        { name: "description", content: copy.description },
        { property: "og:title", content: copy.ogTitle },
        { property: "og:description", content: copy.ogDescription },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:locale", content: lang === "pt" ? "pt_BR" : "en_US" },
        {
          property: "og:locale:alternate",
          content: lang === "pt" ? "en_US" : "pt_BR",
        },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "pt-BR", href: `${SITE_URL}/` },
        { rel: "alternate", hrefLang: "en", href: `${SITE_URL}/?lang=en` },
        { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/` },
      ],
    };
  },
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
  const { t, lang, setLang } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  // URL search param wins on first load, then the URL follows the toggle.
  const appliedUrlLang = useRef(false);
  useEffect(() => {
    if (!appliedUrlLang.current) {
      appliedUrlLang.current = true;
      if (search.lang && search.lang !== lang) {
        setLang(search.lang);
        return;
      }
    }
    if (search.lang !== lang) {
      void navigate({ search: lang === "pt" ? {} : { lang }, replace: true });
    }
  }, [search.lang, lang, setLang, navigate]);

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
        toast.error(t.invalidFile, { description: t.invalidFileDesc });
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        toast.error(t.tooLarge, {
          description: t.tooLargeDesc(MAX_PDF_BYTES / 1024 / 1024),
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
          toast.error(t.noText, { description: t.noTextDesc });
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
        toast.error(t.readFail, { description: t.readFailDesc });
        setStatus("idle");
      }
    },
    [resetAudio, t],
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
      toast.success(t.ready);
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      console.error(error);
      toast.error(t.error, {
        description: error instanceof Error ? error.message : t.errorDesc,
      });
      setStatus("idle");
    } finally {
      abortRef.current = null;
    }
  }, [doc, voice, resetAudio, t]);

  const busy = status !== "idle";

  return (
    <main className="paper-grain min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
        <header className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ScanLine className="size-3.5" />
              DocScan
            </Link>
            <LanguageToggle />
          </div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Headphones className="size-3.5" /> {t.badge}
          </p>
          <h1 className="display-xl text-balance">{t.heroTitle}</h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            {t.heroSubtitle}
          </p>
        </header>

        {/* DocScan promo banner */}
        <Link
          to="/docs"
          className="glass mb-8 flex items-center gap-4 rounded-2xl p-4 transition-transform duration-200 ease-out hover:scale-[1.01] active:scale-[0.99]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ScanLine className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {lang === "pt" ? "🆕 Novo: DocScan" : "🆕 New: DocScan"}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {lang === "pt"
                ? "Digitalize documentos com a câmera e exporte em PDF — sem anúncios."
                : "Scan documents with your camera and export as PDF — no ads."}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-primary">
            {lang === "pt" ? "Experimentar →" : "Try it →"}
          </span>
        </Link>

        <section
          aria-label={t.uploadAria}
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
          <p className="display-md">{t.dropTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.dropHint(MAX_PDF_BYTES / 1024 / 1024)}
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
                {t.readingPage(extractProgress.done, extractProgress.total)}
              </>
            ) : (
              <>{t.chooseFile}</>
            )}
          </button>
        </section>

        {doc && (
          <section className="mt-6 space-y-6" aria-label={t.docAria}>
            <div className="glass rounded-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{doc.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t.pages(doc.pages)} · {t.minutes(doc.minutes)} · {t.blocks(doc.chunks.length)}
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
                  aria-label={t.removeDoc}
                  className="rounded-full p-2 text-muted-foreground transition-transform duration-200 ease-out active:scale-90 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-5">
                <label htmlFor="voice" className="text-sm font-medium">
                  {t.voiceLabel}
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
                      <span className="block text-xs text-muted-foreground">{t.voiceNotes[v.id] ?? v.note}</span>
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
                    {t.generating(audioProgress.done, audioProgress.total)}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    {audioUrl ? t.regenerate : t.generate}
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
                    aria-label={t.progressAria}
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
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>

            {audioUrl && <AudioPlayer src={audioUrl} fileName={doc.title} />}

            <details className="glass rounded-3xl p-6">
              <summary className="cursor-pointer text-sm font-semibold">{t.extractedText}</summary>
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
