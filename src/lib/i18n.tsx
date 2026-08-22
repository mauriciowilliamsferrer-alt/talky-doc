import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "pt" | "en";

const STORAGE_KEY = "pdf-voice-lang";

export const dict = {
  pt: {
    langLabel: "Idioma",
    badge: "PDF em voz alta",
    heroTitle: "Ouça qualquer PDF com voz natural.",
    heroSubtitle:
      "Envie um documento com texto selecionável, escolha a voz e ouça no navegador — com controles completos e download em MP3.",
    uploadAria: "Enviar PDF",
    dropTitle: "Arraste seu PDF aqui",
    dropHint: (mb: number) => `Somente PDFs com texto selecionável · até ${mb}MB`,
    chooseFile: "Escolher arquivo",
    readingPage: (done: number, total: number) =>
      `Lendo página ${done}${total ? ` de ${total}` : ""}…`,
    invalidFile: "Arquivo inválido",
    invalidFileDesc: "Envie um arquivo no formato PDF.",
    tooLarge: "Arquivo muito grande",
    tooLargeDesc: (mb: number) => `O limite é de ${mb}MB por PDF.`,
    noText: "Nenhum texto legível encontrado",
    noTextDesc:
      "Este PDF parece ser digitalizado (somente imagem). Nesta versão não há suporte a OCR.",
    readFail: "Não foi possível ler o PDF",
    readFailDesc: "O arquivo pode estar corrompido ou protegido por senha.",
    docAria: "Documento carregado",
    pages: (n: number) => `${n} página${n > 1 ? "s" : ""}`,
    minutes: (n: number) => `~${n} min de narração`,
    blocks: (n: number) => `${n} bloco${n > 1 ? "s" : ""}`,
    removeDoc: "Remover documento",
    voiceLabel: "Voz da narração",
    generate: "Gerar narração",
    regenerate: "Gerar novamente",
    generating: (done: number, total: number) => `Gerando áudio · bloco ${done} de ${total}`,
    progressAria: "Progresso da geração de áudio",
    cancel: "Cancelar geração",
    ready: "Narração pronta",
    error: "Erro na narração",
    errorDesc: "Tente novamente em instantes.",
    extractedText: "Texto extraído",
    playerAria: "Player de narração",
    play: "Reproduzir narração",
    pause: "Pausar narração",
    back15: "Retroceder 15 segundos",
    fwd15: "Avançar 15 segundos",
    seekAria: "Posição da narração",
    speedAria: "Velocidade de reprodução",
    download: "Baixar MP3",
    voiceNotes: {
      alloy: "Neutra e equilibrada",
      ash: "Grave e calma",
      coral: "Clara e expressiva",
      sage: "Suave e pausada",
      verse: "Narrativa, tom de audiolivro",
      onyx: "Profunda e firme",
    } as Record<string, string>,
  },
  en: {
    langLabel: "Language",
    badge: "PDF out loud",
    heroTitle: "Listen to any PDF with a natural voice.",
    heroSubtitle:
      "Upload a document with selectable text, pick a voice and listen right in your browser — full controls and MP3 download included.",
    uploadAria: "Upload PDF",
    dropTitle: "Drop your PDF here",
    dropHint: (mb: number) => `Text-based PDFs only · up to ${mb}MB`,
    chooseFile: "Choose file",
    readingPage: (done: number, total: number) =>
      `Reading page ${done}${total ? ` of ${total}` : ""}…`,
    invalidFile: "Invalid file",
    invalidFileDesc: "Please upload a PDF file.",
    tooLarge: "File too large",
    tooLargeDesc: (mb: number) => `The limit is ${mb}MB per PDF.`,
    noText: "No readable text found",
    noTextDesc: "This PDF looks scanned (image only). OCR isn't supported in this version.",
    readFail: "Couldn't read the PDF",
    readFailDesc: "The file may be corrupted or password protected.",
    docAria: "Loaded document",
    pages: (n: number) => `${n} page${n > 1 ? "s" : ""}`,
    minutes: (n: number) => `~${n} min of narration`,
    blocks: (n: number) => `${n} block${n > 1 ? "s" : ""}`,
    removeDoc: "Remove document",
    voiceLabel: "Narration voice",
    generate: "Generate narration",
    regenerate: "Generate again",
    generating: (done: number, total: number) => `Generating audio · block ${done} of ${total}`,
    progressAria: "Audio generation progress",
    cancel: "Cancel generation",
    ready: "Narration ready",
    error: "Narration error",
    errorDesc: "Please try again in a moment.",
    extractedText: "Extracted text",
    playerAria: "Narration player",
    play: "Play narration",
    pause: "Pause narration",
    back15: "Rewind 15 seconds",
    fwd15: "Forward 15 seconds",
    seekAria: "Narration position",
    speedAria: "Playback speed",
    download: "Download MP3",
    voiceNotes: {
      alloy: "Neutral and balanced",
      ash: "Deep and calm",
      coral: "Bright and expressive",
      sage: "Soft and unhurried",
      verse: "Narrative, audiobook tone",
      onyx: "Deep and steady",
    } as Record<string, string>,
  },
} as const;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (typeof dict)["pt"] };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") {
      setLangState(stored);
    } else if (typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("pt")) {
      setLangState("en");
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: dict[lang] as (typeof dict)["pt"] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
