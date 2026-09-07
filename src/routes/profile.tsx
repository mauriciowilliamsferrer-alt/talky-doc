import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meu perfil — DocScan" },
      {
        name: "description",
        content: "Gerencie seus dados de perfil no DocScan: nome de exibição, foto, telefone e biografia.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Meu perfil — DocScan" },
      {
        property: "og:description",
        content: "Gerencie seus dados de perfil no DocScan: nome de exibição, foto, telefone e biografia.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { ready } = useAuthGuard();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, phone, bio")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        toast.error("Não foi possível carregar seu perfil.");
      } else if (data) {
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setPhone(data.phone ?? "");
        setBio(data.bio ?? "");
      }
      setLoading(false);
    })();
  }, [ready]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) throw new Error("Sessão expirada.");

      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
      });
      if (error) throw error;
      toast.success("Perfil salvo.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  if (!ready) return null;

  const inputClass =
    "w-full rounded-xl border border-border bg-card px-3 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

  return (
    <div className="flex min-h-dvh-safe flex-col bg-background safe-x">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur safe-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/docs"
              aria-label="Voltar aos documentos"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-base font-semibold text-foreground">Meu perfil</h1>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            aria-label="Sair"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 safe-bottom">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Foto de perfil"
                  className="h-16 w-16 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {displayName || "Sem nome"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="displayName" className="text-sm font-medium text-foreground">
                Nome de exibição
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como você quer ser chamado"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="avatarUrl" className="text-sm font-medium text-foreground">
                Link da foto
              </label>
              <input
                id="avatarUrl"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-foreground">
                Telefone
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 90000-0000"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bio" className="text-sm font-medium text-foreground">
                Sobre você
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="Uma breve descrição"
                className={`${inputClass} resize-none`}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar perfil
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
