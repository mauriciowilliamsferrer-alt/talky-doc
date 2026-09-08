import { createFileRoute } from "@tanstack/react-router";

const VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
]);

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: { text?: unknown; voice?: unknown };
        try {
          payload = (await request.json()) as typeof payload;
        } catch {
          return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
        }

        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        const voice =
          typeof payload.voice === "string" && VOICES.has(payload.voice) ? payload.voice : "alloy";

        if (!text) {
          return Response.json({ error: "Nenhum texto para narrar." }, { status: 400 });
        }
        if (text.length > 4000) {
          return Response.json({ error: "Bloco de texto grande demais." }, { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json(
            {
              error: "Serviço de narração indisponível. Configure LOVABLE_API_KEY no servidor.",
              code: "tts_not_configured",
            },
            { status: 503 },
          );
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text,
            voice,
            response_format: "mp3",
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          console.error(`TTS failed [${upstream.status}]: ${detail}`);
          const message =
            upstream.status === 402
              ? "Créditos de narração esgotados. Adicione créditos para continuar."
              : upstream.status === 429
                ? "Muitas requisições em sequência. Aguarde alguns segundos e tente de novo."
                : "Não foi possível gerar o áudio agora. Tente novamente em instantes.";
          return Response.json({ error: message }, { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    },
  },
});
