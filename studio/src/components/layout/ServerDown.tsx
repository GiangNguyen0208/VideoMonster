import { Banner } from "@/components/ui";
import { useT } from "@/i18n";

export function ServerDown() {
  const t = useT();
  return (
    <Banner tone="danger" title={t.errors.serverDownTitle}>
      {t.errors.serverDownBefore} <code className="font-mono">make studio-open</code>
      {t.errors.serverDownAfter}
    </Banner>
  );
}
