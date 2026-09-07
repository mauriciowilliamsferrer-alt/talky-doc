import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { id: Lang; label: string }[] = [
  { id: "pt", label: "PT" },
  { id: "en", label: "EN" },
];

const LANGUAGE_NAMES: Record<Lang, string> = {
  pt: "Português",
  en: "English",
};

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-secondary p-1"
      role="group"
      aria-label={t.langLabel}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          aria-label={LANGUAGE_NAMES[o.id]}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150",
            lang === o.id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
