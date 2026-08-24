import { useRouterState, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function RootShell({ children }: { children: ReactNode }) {
  const search = useRouterState({
    select: (s) => s.location.search as { lang?: string },
  });
  const htmlLang = search?.lang === "en" ? "en" : "pt-BR";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
