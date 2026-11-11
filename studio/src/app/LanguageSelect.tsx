import { LOCALES, setLocale, useLocale, useT, type Locale } from "@/i18n";
import { cn } from "@/utils/cn";

/** Studio language picker; the choice is saved and shared across tabs. */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label={t.app.language}
      className={cn(
        "rounded-control border border-border bg-surface text-sm text-text-2 hover:text-text",
        compact ? "h-8 px-1.5" : "h-10 px-2",
      )}
    >
      {LOCALES.map((l) => (
        <option key={l.id} value={l.id}>
          {compact ? l.id.toUpperCase() : l.label}
        </option>
      ))}
    </select>
  );
}
