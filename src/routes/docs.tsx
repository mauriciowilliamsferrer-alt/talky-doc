import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Headphones,
  Loader2,
  LogOut,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { listDocuments, renameDocument, deleteDocument, getDocument, type ScanDocument } from "@/lib/scan/docs";
import { buildPdf, shareOrDownload, safeFileName } from "@/lib/scan/export";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/use-auth-guard";


export const Route = createFileRoute("/docs")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meus documentos — DocScan" },
      { name: "description", content: "Sua biblioteca de documentos digitalizados: busque, renomeie, exporte em PDF e organize tudo em um só lugar." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Meus documentos — DocScan" },
      { property: "og:description", content: "Sua biblioteca de documentos digitalizados: busque, renomeie, exporte em PDF e organize tudo em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocsPage,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DocsPage() {
  const navigate = useNavigate();
  const { ready } = useAuthGuard();
  const [docs, setDocs] = useState<ScanDocument[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const load = async (q = search) => {
    setLoading(true);
    try {
      setDocs(await listDocuments(q));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => void load(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const startRename = (doc: ScanDocument) => {
    setMenuId(null);
    setRenamingId(doc.id);
    setRenameVal(doc.name);
    setTimeout(() => renameRef.current?.select(), 50);
  };

  const submitRename = async (id: string) => {
    const val = renameVal.trim();
    if (!val) return;
    try {
      await renameDocument(id, val);
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, name: val } : d)));
    } catch {
      toast.error("Não foi possível renomear.");
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setMenuId(null);
    if (!confirm("Excluir este documento permanentemente?")) return;
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Documento excluído.");
    } catch {
      toast.error("Não foi possível excluir.");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-foreground">DocScan</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Headphones className="h-4 w-4" />
              <span className="hidden sm:inline">Leitor PDF</span>
            </Link>

            <Link
              to="/scan"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Sair"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar documentos…"
            className="w-full rounded-xl border border-input bg-muted/50 py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {search ? "Nenhum resultado" : "Nenhum documento ainda"}
              </p>
              {!search && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Crie seu primeiro documento digitalizando um papel.
                </p>
              )}
            </div>
            {!search && (
              <Link
                to="/scan"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                Digitalizar agora
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li key={doc.id} className="group relative">
                {/* Click area */}
                <Link
                  to="/doc/$id"
                  params={{ id: doc.id }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent/50"
                >
                  {/* Thumbnail */}
                  <div className="flex h-14 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {doc.thumbnail ? (
                      <img
                        src={doc.thumbnail}
                        alt={doc.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    {renamingId === doc.id ? (
                      <input
                        ref={renameRef}
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => void submitRename(doc.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitRename(doc.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onClick={(e) => e.preventDefault()}
                        className="w-full rounded border border-ring bg-background px-2 py-0.5 text-sm font-medium text-foreground outline-none"
                      />
                    ) : (
                      <p className="truncate text-sm font-medium text-foreground">{doc.name}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {doc.pageCount} {doc.pageCount === 1 ? "página" : "páginas"} ·{" "}
                      {formatDate(doc.updated_at)}
                    </p>
                  </div>
                </Link>

                {/* Context menu button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId(menuId === doc.id ? null : doc.id);
                  }}
                  aria-label="Opções"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {/* Dropdown */}
                {menuId === doc.id && (
                  <div
                    className="absolute right-3 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                    onMouseLeave={() => setMenuId(null)}
                  >
                    <button
                      type="button"
                      onClick={() => startRename(doc)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      <Pencil className="h-4 w-4" /> Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(doc.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Close menu on outside click */}
      {menuId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuId(null)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
