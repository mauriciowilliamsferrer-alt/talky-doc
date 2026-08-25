import { createFileRoute } from "@tanstack/react-router";
import pkg from "../../package.json";
import type { Lang } from "./health";

const DEFAULT_LANG: Lang = "pt";
const GATEWAY_BASE = "https://ai.gateway.lovable.dev";
const manifest = pkg as { name: string; version?: string };

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

type Check = { ok: boolean; detail: string };

/** Verifica se o gateway de IA responde (sem custo de síntese). */
async function checkGatewayReachable(): Promise<Check> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(GATEWAY_BASE, { method: "HEAD", signal: controller.signal });
    return { ok: true, detail: "reachable" };
  } catch {
    return { ok: false, detail: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/readiness")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const lang = resolveLanguage(request);

        const apiKey = process.env["LOVABLE_API_KEY"];
        const checks: Record<string, Check> = {
          ttsApiKey: apiKey
            ? { ok: true, detail: "configured" }
            : { ok: false, detail: "LOVABLE_API_KEY ausente" },
          aiGateway: await checkGatewayReachable(),
        };

        const ready = Object.values(checks).every((c) => c.ok);

        return Response.json(
          {
            status: ready ? "ready" : "not_ready",
            service: manifest.name,
            version: manifest.version ?? "0.0.0",
            checks,
            language: lang,
            checkedAt: new Date().toISOString(),
          },
          {
            status: ready ? 200 : 503,
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
