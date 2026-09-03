import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side auth guard for routes with ssr: false.
 * Redirects to /auth if not logged in (or to /docs if already logged in and requireGuest=true).
 * Returns `ready` so the component can avoid rendering until auth is confirmed.
 */
function isPasswordRecoveryCallback(): boolean {
  // Supabase appends #type=recovery (hash) or ?type=recovery (query) to the redirect URL
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || query.get("type") === "recovery";
}

export function useAuthGuard(options: { requireGuest?: boolean } = {}) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Never redirect away from /auth when arriving via a password recovery link
    if (options.requireGuest && isPasswordRecoveryCallback()) {
      setReady(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (options.requireGuest) {
        if (data.user) {
          void navigate({ to: "/docs" });
        } else {
          setReady(true);
        }
      } else {
        if (!data.user) {
          void navigate({ to: "/auth" });
        } else {
          setReady(true);
        }
      }
    });
  }, [navigate, options.requireGuest]);

  return { ready };
}
