import { BRAND } from "@/content/brand";
import { ComingSoon } from "@/components/ui";
import { useSession } from "@/hooks/api";
import { useT } from "@/i18n";

export function Footer() {
  const t = useT();
  const version = useSession().data?.version;
  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-text-2">
        <p>
          <span className="font-medium text-text">{BRAND.full}</span>
          {version && <span className="ml-2 font-mono">{t.app.footer.version(version)}</span>}
          <span className="ml-2">· {t.app.footer.local}</span>
        </p>
        <ComingSoon badge={false}>
          <span title={t.common.comingSoon}>
            {t.app.footer.shortcuts} — {t.common.comingSoon}
          </span>
        </ComingSoon>
      </div>
    </footer>
  );
}
