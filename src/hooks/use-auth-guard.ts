import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side auth guard for routes with ssr: false.
 * Redirects to /auth if not logged in (or to /docs if already logged in and requireGuest=true).
 * Returns `ready` so the component can avoid rendering until auth is confirmed.
 */
export function useAuthGuard(options: { requireGuest?: boolean } = {}) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (options.requireGuest) {
        // Auth page: redirect away if already logged in
        if (data.user) {
          void navigate({ to: "/docs" });
        } else {
          setReady(true);
        }
      } else {
        // Protected page: redirect to login if not logged in
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
