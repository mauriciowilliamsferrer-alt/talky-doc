import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ScanIcon } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/docs" });
  },
  component: AuthPage,
});

type Mode = "login" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Listen for auth changes (e.g. magic link callback)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void navigate({ to: "/docs" });
      }
    });
    return () => sub.subscription.unsubscribe();
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        toast.success("Confirme seu e-mail para ativar a conta.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Link de redefinição enviado para seu e-mail.");
        setMode("login");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) {
        toast.error(result.error.message || "Falha ao entrar com Google");
        return;
      }
      if (result.redirected) return;
      void navigate({ to: "/docs" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao entrar com Google");
    } finally {
      setBusy(false);
    }
  };

  const labels: Record<Mode, string> = {
    login: "Entrar",
    signup: "Criar conta",
    forgot: "Redefinir senha",
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
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
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                placeholder="seu@email.com"
              />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
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

          {mode !== "forgot" && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                onClick={() => void handleGoogle()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-background py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
                  <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.700-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
                  <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
                  <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
                </svg>
                Continuar com Google
              </button>
            </>
          )}

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
