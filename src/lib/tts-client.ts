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
    throw new Error(message);
  }

  return res.blob();
}

export async function synthesizeChunks(
  chunks: string[],
  voice: string,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const parts: Blob[] = [];
  for (let i = 0; i < chunks.length; i++) {
    parts.push(await synthesizeChunk(chunks[i] as string, voice, signal));
    onProgress(i + 1, chunks.length);
  }
  return new Blob(parts, { type: "audio/mpeg" });
}
