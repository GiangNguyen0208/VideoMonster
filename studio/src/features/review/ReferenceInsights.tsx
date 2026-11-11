import { titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import type { ReferenceInsights as Insights } from "./review";

/** Shown at the first review point of a "make something like this" project. */
export function ReferenceInsights({ insights }: { insights: Insights }) {
  const t = useT();
  const L = t.review.reference;
  const facts = [
    insights.scenes != null ? L.scenes(insights.scenes) : null,
    insights.avgSceneSeconds != null
      ? L.pacing(`${Math.round(insights.avgSceneSeconds * 10) / 10} s`)
      : null,
    insights.tone ? L.tone(insights.tone) : null,
    insights.closestStyle ? L.closestStyle(titleCase(insights.closestStyle)) : null,
  ].filter(Boolean);

  return (
    <section
      aria-labelledby="ref-insights-h"
      className="space-y-3 rounded-control border border-border-soft bg-surface-2 px-4 py-3 text-sm"
    >
      <h3 id="ref-insights-h" className="font-medium">
        {L.heading}
      </h3>
      {(insights.title || insights.url) && (
        <p className="break-all text-text-3">{insights.title ?? insights.url}</p>
      )}
      {insights.summary && <p className="text-text-2">{insights.summary}</p>}
      {facts.length > 0 && <p className="text-text-3">{facts.join(" · ")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {insights.keep.length > 0 && <List title={L.keep} items={insights.keep} />}
        {insights.ownTake.length > 0 && <List title={L.ownTake} items={insights.ownTake} />}
      </div>
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-2">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
