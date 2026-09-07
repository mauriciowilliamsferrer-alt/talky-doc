import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, LogOut, User } from "lucide-react";
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setEmail(user.email ?? "");
      setProvider(user.app_metadata?.provider ?? "email");
      setMemberSince(
        user.created_at
          ? new Date(user.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "",
      );

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

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) throw new Error("Sessão expirada.");
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(publicUrl);
      await supabase.from("profiles").upsert({ id: user.id, avatar_url: publicUrl });
      toast.success("Foto atualizada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  };

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
            {/* Avatar upload */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border border-border bg-secondary transition-opacity hover:opacity-80 disabled:opacity-60"
                aria-label="Alterar foto de perfil"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                ) : (
                  <User className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground" />
                )}
                <span className="absolute inset-0 flex items-end justify-center bg-black/30 pb-1.5 opacity-0 transition-opacity hover:opacity-100">
                  {uploadingAvatar ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <Camera className="h-4 w-4 text-white" />
                  )}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAvatarUpload(f);
                  e.target.value = "";
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayName || "Sem nome"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
                <p className="mt-0.5 text-xs text-muted-foreground capitalize">{provider}</p>
              </div>
            </div>

            {/* Account info */}
            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">Informações da conta</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">E-mail</span>
                <span className="text-foreground font-medium truncate max-w-[60%] text-right">{email}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Login via</span>
                <span className="text-foreground font-medium capitalize">{provider}</span>
              </div>
              {memberSince && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Membro desde</span>
                  <span className="text-foreground font-medium">{memberSince}</span>
                </div>
              )}
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
