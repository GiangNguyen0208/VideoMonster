import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { useT } from "@/i18n";

/** Phase 0 stand-in for pages that later phases fill in. */
export function PagePlaceholder({
  title,
  intro,
  phase,
  children,
}: {
  title: string;
  intro: ReactNode;
  phase: number;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-text-2">{intro}</p>
      </header>
      {children ?? (
        <EmptyState title={t.errors.comingSoon}>{t.errors.arrivesInPhase(phase)}</EmptyState>
      )}
    </section>
  );
}
