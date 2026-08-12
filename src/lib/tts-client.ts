export type TtsVoice = {
  id: string;
  name: string;
  note: string;
};

export const VOICES: TtsVoice[] = [
  { id: "alloy", name: "Alloy", note: "Neutra e equilibrada" },
  { id: "ash", name: "Ash", note: "Grave e calma" },
  { id: "coral", name: "Coral", note: "Clara e expressiva" },
  { id: "sage", name: "Sage", note: "Suave e pausada" },
  { id: "verse", name: "Verse", note: "Narrativa, tom de audiolivro" },
  { id: "onyx", name: "Onyx", note: "Profunda e firme" },
];

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export async function synthesizeChunk(text: string, voice: string, signal?: AbortSignal) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
    signal: signal ?? null,
  });

  if (!res.ok) {
    let message = "Não foi possível gerar o áudio agora. Tente novamente em instantes.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* resposta sem corpo JSON */
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return res.blob();
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/** Gera um bloco, com backoff em caso de rate limit (429) ou falha temporária. */
async function synthesizeWithRetry(text: string, voice: string, signal?: AbortSignal) {
  const delays = [1500, 4000, 9000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await synthesizeChunk(text, voice, signal);
    } catch (error) {
      const status = (error as { status?: number }).status;
      const retryable = status === 429 || status === 500 || status === 502 || status === 503;
      if (!retryable || attempt >= delays.length || signal?.aborted) throw error;
      await sleep(delays[attempt]!, signal);
    }
  }
}

export async function synthesizeChunks(
  chunks: string[],
  voice: string,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const parts: Blob[] = [];
  for (let i = 0; i < chunks.length; i++) {
    parts.push(await synthesizeWithRetry(chunks[i] as string, voice, signal));
    onProgress(i + 1, chunks.length);
  }
  return new Blob(parts, { type: "audio/mpeg" });
}

