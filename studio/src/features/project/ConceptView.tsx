import { Badge } from "@/components/ui";
import { RUNTIME_LABELS, titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import { fmtDuration, fmtMoney } from "@/utils/format";
import { asArray, asRecord, asText } from "./adapters";
import { Field } from "./Section";

/** Proposal: concept options (selected one highlighted), plan and cost estimate. */
export function ConceptView({ proposal }: { proposal: unknown }) {
  const t = useT();
  const L = t.project.concept;
  const p = asRecord(proposal);
  if (!p) return null;
  const selectedId = asText(asRecord(p.selected_concept)?.concept_id);
  const concepts = asArray(p.concept_options)
    .map(asRecord)
    .filter((c): c is Record<string, unknown> => Boolean(c));
  const plan = asRecord(p.production_plan);
  const cost = asRecord(p.cost_estimate);
  const runtime = asText(plan?.render_runtime);
  const mode = asText(plan?.composition_mode);
  const approval = asText(asRecord(p.approval)?.status);

  return (
    <div className="space-y-6">
      {concepts.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">{L.heading}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {concepts.map((c, i) => {
              const id = asText(c.id);
              const chosen = id !== null && id === selectedId;
              return (
                <article
                  key={id ?? i}
                  className={
                    chosen
                      ? "rounded-card border border-accent/60 bg-accent-dim p-4"
                      : "rounded-card border border-border bg-surface p-4"
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold">{asText(c.title) ?? L.concept(i + 1)}</h4>
                    {chosen && <Badge tone="accent">{L.chosen}</Badge>}
                  </div>
                  {asText(c.hook) && <p className="mt-1 text-text-2">“{asText(c.hook)}”</p>}
                  <p className="mt-2 text-sm text-text-3">
                    {[
                      asText(c.visual_approach),
                      typeof c.target_duration_seconds === "number"
                        ? fmtDuration(c.target_duration_seconds)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {asText(c.why_this_works) && (
                    <p className="mt-2 text-sm text-text-2">{asText(c.why_this_works)}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      <dl className="grid gap-4 sm:grid-cols-3">
        {cost && typeof cost.total_estimated_usd === "number" && (
          <Field label={L.estimatedCost}>{fmtMoney(cost.total_estimated_usd)}</Field>
        )}
        {runtime && <Field label={L.engine}>{RUNTIME_LABELS[runtime] ?? runtime}</Field>}
        {mode && <Field label={L.look}>{mode === "atelier" ? L.lookCustom : L.lookStandard}</Field>}
        {approval && <Field label={L.planApproval}>{titleCase(approval)}</Field>}
      </dl>
    </div>
  );
}
