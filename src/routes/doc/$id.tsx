import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileText,
  GripVertical,
  Headphones,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCw,
  Share2,
  Trash2,
} from "lucide-react";
import {
  getDocument,
  addPages,
  deletePage,
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

  const handleDeletePage = async (page: ScanPage) => {
    setMenuPageId(null);
    if (!confirm("Excluir esta página?")) return;
    try {
      await deletePage(page);
      setPages((prev) => prev.filter((p) => p.id !== page.id));
      toast.success("Página removida.");
    } catch {
      toast.error("Não foi possível excluir a página.");
    }
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
      try {
        const startAt = pages.length;
        await addPages(id, [{ blob: page.blob, width: page.width, height: page.height }], startAt);
        URL.revokeObjectURL(page.previewUrl);
        await load();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Falha ao adicionar página.");
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
      const a = document.createElement("a");
      a.href = p.url;
      a.download = `${safeFileName(docName)}-pagina-${i + 1}.jpg`;
      a.click();
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

      <main className="flex-1 px-4 py-4">
        {pages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">Sem páginas neste documento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
                className={`group relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted shadow-sm transition-opacity ${
                  dragOver === i ? "border-primary opacity-60" : "border-border"
                }`}
              >
                <img
                  src={page.url}
                  alt={`Página ${i + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />

                {/* Drag handle */}
                <div className="absolute left-1.5 top-1.5 cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
                  <span className="rounded-full bg-black/60 p-1 text-white">
                    <GripVertical className="h-3 w-3" />
                  </span>
                </div>

                {/* Page options */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuPageId(menuPageId === page.id ? null : page.id);
                  }}
                  aria-label={`Opções página ${i + 1}`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {menuPageId === page.id && (
                  <div className="absolute right-1.5 top-8 z-20 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                    <button
                      type="button"
                      onClick={() => void handleRotatePage(page)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent"
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
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent"
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePage(page)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                )}

                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add page FAB */}
      <div className="sticky bottom-6 flex justify-center px-4 pb-4 safe-bottom">
        <button
          type="button"
          onClick={() => setCapturing(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Adicionar página
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
