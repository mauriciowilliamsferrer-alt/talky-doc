import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Headphones, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { CaptureFlow, type CapturedPage } from "@/components/scan/CaptureFlow";
import { createDocument } from "@/lib/scan/docs";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export const Route = createFileRoute("/scan")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Digitalizar documento — DocScan" },
      { name: "description", content: "Capture páginas pela câmera, ajuste o recorte, aplique filtros e salve tudo como um documento multipágina." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Digitalizar documento — DocScan" },
      { property: "og:description", content: "Capture páginas pela câmera, ajuste o recorte, aplique filtros e salve tudo como um documento multipágina." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const { ready } = useAuthGuard();
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docName, setDocName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const handlePage = useCallback((page: CapturedPage) => {
    setPages((prev) => [...prev, page]);
  }, []);

  const removePage = (id: string) => {
    setPages((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleSave = async () => {
    if (pages.length === 0) {
      toast.error("Adicione pelo menos uma página antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const name = docName.trim() || `Documento ${new Date().toLocaleDateString("pt-BR")}`;
      const newPages = pages.map((p) => ({ blob: p.blob, width: p.width, height: p.height }));
      const id = await createDocument(name, newPages);
      // revoke object URLs
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      toast.success("Documento salvo com sucesso!");
      void navigate({ to: "/doc/$id", params: { id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar o documento.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => void navigate({ to: "/docs" })}
          aria-label="Voltar"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <input
          ref={nameRef}
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          placeholder={`Documento ${new Date().toLocaleDateString("pt-BR")}`}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Nome do documento"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || pages.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <Link
          to="/"
          aria-label="Leitor PDF"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Headphones className="h-4 w-4" />
        </Link>
      </header>

      {/* Page thumbnails */}
      <main className="flex-1 px-4 py-4">
        {pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Nenhuma página ainda</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Toque no botão abaixo para capturar a primeira página.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pages.map((page, i) => (
              <div key={page.id} className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
                <img
                  src={page.previewUrl}
                  alt={`Página ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => removePage(page.id)}
                    aria-label={`Remover página ${i + 1}`}
                    className="rounded-full bg-destructive p-2 text-white shadow-lg transition-transform active:scale-90"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add page FAB */}
      <div className="sticky bottom-6 flex justify-center px-4 pb-4">
        <button
          type="button"
          onClick={() => setCapturing(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          {pages.length === 0 ? "Capturar página" : "Adicionar página"}
        </button>
      </div>

      {/* Camera overlay */}
      {capturing && (
        <CaptureFlow
          onPage={(page) => {
            handlePage(page);
            setCapturing(false);
          }}
          onClose={() => setCapturing(false)}
        />
      )}
    </div>
  );
}
