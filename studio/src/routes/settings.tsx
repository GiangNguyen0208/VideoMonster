import { LanguageSelect } from "@/app/LanguageSelect";
import { Card, InfoBox } from "@/components/ui";
import { Info } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { useT } from "@/i18n";

export function SettingsPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.settings.title} description={t.settings.intro} />
      <Card className="grid gap-4 sm:grid-cols-2 sm:items-center">
        <div className="space-y-2">
          <h2 className="font-semibold">{t.app.language}</h2>
          <LanguageSelect />
        </div>
        <InfoBox icon={<Info className="size-4" />}>{t.settings.languageHint}</InfoBox>
      </Card>
      <SettingsForm />
    </div>
  );
}
