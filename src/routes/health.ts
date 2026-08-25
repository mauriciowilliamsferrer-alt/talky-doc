import { createFileRoute } from "@tanstack/react-router";
import pkg from "../../package.json";

export type Lang = "pt" | "en";

const DEFAULT_LANG: Lang = "pt";

function resolveLanguage(request: Request): Lang {
  const url = new URL(request.url);
  const queryLang = url.searchParams.get("lang");
  if (queryLang === "pt" || queryLang === "en") return queryLang;

  const accept = request.headers.get("accept-language") ?? "";
  const primary = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  if (primary.startsWith("en")) return "en";
  if (primary.startsWith("pt")) return "pt";
  return DEFAULT_LANG;
}

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const lang = resolveLanguage(request);

        const isProd = import.meta.env.PROD;
        const isDev = import.meta.env.DEV;

        return Response.json(
          {
            status: "ok",
            service: pkg.name,
            version: pkg.version,
            build: {
              environment: process.env["NODE_ENV"] ?? (isProd ? "production" : isDev ? "development" : "unknown"),
              production: isProd,
            },
            language: lang,
            checkedAt: new Date().toISOString(),
          },
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
