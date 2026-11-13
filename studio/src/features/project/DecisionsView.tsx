import { EmptyState, Eyebrow } from "@/components/ui";
import { useT } from "@/i18n";
import { currentDecisions } from "./adapters";

export function DecisionsView({ log }: { log: unknown }) {
  const t = useT();
  const decisions = currentDecisions(log);
  if (!decisions.length) {
    return <EmptyState title={t.decisions.emptyTitle}>{t.decisions.emptyBody}</EmptyState>;
  }
  return (
    <ul className="divide-y divide-border-soft rounded-card border border-border bg-surface">
      {decisions.map((d) => (
        <li key={d.key} className="space-y-1 px-4 py-3">
          <Eyebrow>
            {d.category}
            {d.revisions > 0 && (
              <span className="text-accent">{t.decisions.changed(d.revisions)}</span>
            )}
          </Eyebrow>
          <p>
            <span className="text-text-2">{d.subject}</span>
            {d.subject && " → "}
            <strong className="font-semibold">{d.picked}</strong>
          </p>
          {d.reason && <p className="text-sm text-text-2">{d.reason}</p>}
          {d.alternatives.length > 0 && (
            <p className="text-xs text-text-3">
              {t.decisions.alsoConsidered} {d.alternatives.join(" · ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
