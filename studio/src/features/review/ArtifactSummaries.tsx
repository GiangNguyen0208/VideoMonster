import { Card, Eyebrow, Fact } from "@/components/ui";
import { titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import type { ArtifactSummary } from "./artifacts";

/** Key facts of the artifacts a step produced, shown above the decision. */
export function ArtifactSummaries({ summaries }: { summaries: ArtifactSummary[] }) {
  const t = useT();
  if (!summaries.length) return null;
  return (
    <div className="space-y-3">
      {summaries.map((s) => (
        <Card
          key={s.name}
          role="group"
          aria-label={t.review.artifact.listLabel(titleCase(s.name))}
          className="space-y-3 bg-surface-2 text-sm"
        >
          <Eyebrow>{titleCase(s.name)}</Eyebrow>
          {s.lead && <p className="text-text">{s.lead}</p>}
          {s.facts.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {s.facts.map((f) => (
                <Fact key={f.label} label={f.label}>
                  <span className="font-medium">{f.value}</span>
                </Fact>
              ))}
            </dl>
          )}
          {s.items.length > 0 && (
            <ul className="space-y-1.5">
              {s.items.map((it, i) => (
                <li key={i} className="text-text-2">
                  <span className="text-text">{it.title}</span>
                  {it.detail && <span> — {it.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
