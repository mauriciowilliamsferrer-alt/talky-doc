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
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body?.error) message = body.error;
      code = body?.code;
    } catch {
      /* resposta sem corpo JSON */
    }
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = res.status;
    if (code) error.code = code;
    throw error;
  }

  return res.blob();
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Gera um bloco, com backoff em caso de rate limit (429) ou falha temporária. */
async function synthesizeWithRetry(text: string, voice: string, signal?: AbortSignal) {
  const delays = [1500, 4000, 9000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await synthesizeChunk(text, voice, signal);
    } catch (error) {
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code;
      const retryable =
        code !== "tts_not_configured" &&
        (status === 429 || status === 500 || status === 502 || status === 503);
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
  const CONCURRENCY = 3;
  const parts: Blob[] = new Array<Blob>(chunks.length).fill(new Blob());
  let done = 0;

  for (let start = 0; start < chunks.length; start += CONCURRENCY) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = chunks.slice(start, start + CONCURRENCY);
    const results = await Promise.all(
      batch.map((chunk, i) => synthesizeWithRetry(chunk, voice, signal).then((blob) => ({ blob, index: start + i }))),
    );
    for (const { blob, index } of results) {
      parts[index] = blob;
      done++;
      onProgress(done, chunks.length);
    }
  }

  return new Blob(parts, { type: "audio/mpeg" });
}

