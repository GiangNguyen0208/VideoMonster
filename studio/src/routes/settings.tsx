import { LanguageSelect } from "@/app/LanguageSelect";
import { Card } from "@/components/ui";
import { useT } from "@/i18n";

export function SettingsPage() {
  const t = useT();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.settings.title}</h1>
        <p className="mt-1 text-text-2">{t.settings.intro}</p>
      </header>
      <Card className="max-w-xl space-y-2">
        <h2 className="font-semibold">{t.app.language}</h2>
        <p className="text-sm text-text-2">{t.settings.languageHint}</p>
        <LanguageSelect />
      </Card>
    </section>
  );
}
