import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScanIcon } from "lucide-react";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar no DocScan — Scanner de Documentos" },
      { name: "description", content: "Acesse sua conta DocScan para digitalizar, organizar e exportar documentos em PDF direto do navegador." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Entrar no DocScan — Scanner de Documentos" },
      { property: "og:description", content: "Acesse sua conta DocScan para digitalizar, organizar e exportar documentos em PDF direto do navegador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "forgot" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const { ready } = useAuthGuard({ requireGuest: true });
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
      } else if (event === "SIGNED_IN" && mode !== "reset") {
        void navigate({ to: "/docs" });
      }
    });
    return () => sub.subscription.unsubscribe();
    // `mode` is intentionally read only at subscription time for the SIGNED_IN guard;
    // the PASSWORD_RECOVERY branch doesn't depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: "/docs" });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Conta criada com sucesso!");
          void navigate({ to: "/docs" });
        } else if (data.user?.identities?.length === 0) {
          toast.info("Este e-mail já tem uma conta. Entre com sua senha ou use ‘Esqueci minha senha’.");
          setMode("login");
        } else {
          toast.info("Conta registrada. Tente entrar; se não conseguir, use ‘Esqueci minha senha’.");
          setMode("login");
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Link de redefinição enviado para seu e-mail.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        toast.success("Senha atualizada com sucesso!");
        void navigate({ to: "/docs" });
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Erro desconhecido";
      const lower = raw.toLowerCase();
      let msg = raw;
      if (lower.includes("weak") || lower.includes("pwned") || lower.includes("easy to guess")) {
        msg = "Essa senha é muito comum e já apareceu em vazamentos. Escolha uma senha mais forte (8+ caracteres, misture letras, números e símbolos).";
      } else if (lower.includes("invalid login credentials")) {
        msg = "E-mail ou senha incorretos. Se você acabou de criar a conta, confirme o e-mail antes de entrar.";
      } else if (lower.includes("already registered") || lower.includes("user already")) {
        msg = "Já existe uma conta com esse e-mail. Tente entrar ou redefinir a senha.";
      } else if (lower.includes("email not confirmed")) {
        msg = "Confirme o e-mail que enviamos antes de entrar.";
      } else if (lower.includes("rate limit") || lower.includes("too many")) {
        msg = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
      } else if (lower.includes("should be at least")) {
        msg = "A senha precisa ter pelo menos 8 caracteres.";
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const labels: Record<Mode, string> = {
    login: "Entrar",
    signup: "Criar conta",
    forgot: "Redefinir senha",
    reset: "Nova senha",
  };

  if (!ready) return null;

  return (
    <div className="flex min-h-dvh-safe flex-col items-center justify-center bg-background px-4 safe-x safe-top safe-bottom">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ScanIcon className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">DocScan</h1>
          <p className="text-sm text-muted-foreground">Digitalize documentos sem anúncios</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-foreground">{labels[mode]}</h2>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                placeholder="seu@email.com"
              />
            </div>

            {mode !== "forgot" && mode !== "reset" && (
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                />
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres. Evite senhas comuns como “123456” ou “senha123”.
                  </p>
                )}
              </div>
            )}

            {mode === "reset" && (
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-sm font-medium text-foreground">
                  Nova senha
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Aguarde…" : labels[mode]}
            </button>
          </form>

          {/* Mode switchers */}
          <div className="mt-5 flex flex-col items-center gap-1.5 text-sm">
            {mode === "login" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Esqueci minha senha
                </button>
                <p className="text-muted-foreground">
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-medium text-primary hover:underline"
                  >
                    Criar agora
                  </button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p className="text-muted-foreground">
                Já tem conta?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-medium text-primary hover:underline"
                >
                  Entrar
                </button>
              </p>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-muted-foreground hover:text-foreground"
              >
                ← Voltar para o login
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
