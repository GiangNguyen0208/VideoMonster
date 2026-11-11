import { stageLabel, titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import { useProjectCost, type CostStatus } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { costBar } from "./cost";

const STATUS_ORDER: CostStatus[] = ["completed", "failed", "reserved", "estimated", "refunded"];

/** Spent / reserved / remaining against the budget, with breakdowns. */
export function CostPanel({ projectId }: { projectId: string }) {
  const t = useT();
  const L = t.cost;
  const cost = useProjectCost(projectId).data;
  if (!cost?.has_log || !cost.snapshot) return null;
  const snap = cost.snapshot;
  const bar = costBar(cost);

  return (
    <section aria-labelledby="cost-h" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cost-h" className="text-lg font-semibold">
          {L.heading}
        </h2>
        <p className="text-sm text-text-2">
          {cost.budget_total_usd != null
            ? L.ofBudget(fmtMoney(snap.total_spent_usd), fmtMoney(cost.budget_total_usd))
            : L.spentOnly(fmtMoney(snap.total_spent_usd))}
        </p>
      </div>

      <div
        role="img"
        aria-label={L.barLabel(
          fmtMoney(snap.total_spent_usd),
          fmtMoney(snap.total_reserved_usd),
          fmtMoney(snap.budget_remaining_usd),
        )}
        className="flex h-3 overflow-hidden rounded-full bg-surface-3"
      >
        <div className={bar.over ? "bg-danger" : "bg-accent"} style={{ width: `${bar.spent}%` }} />
        <div className="bg-info/60" style={{ width: `${bar.reserved}%` }} />
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Fact dot="bg-accent" label={L.spent} value={fmtMoney(snap.total_spent_usd)} />
        <Fact dot="bg-info/60" label={L.reserved} value={fmtMoney(snap.total_reserved_usd)} />
        <Fact
          dot="bg-surface-3"
          label={L.remaining}
          value={snap.budget_remaining_usd == null ? "—" : fmtMoney(snap.budget_remaining_usd)}
          danger={bar.over}
        />
      </dl>
      {bar.over && (
        <p role="alert" className="text-sm text-danger">
          {L.over}
        </p>
      )}
      <p className="text-sm text-text-2">
        <span className="font-medium">{L.modes[cost.budget_mode]?.title}:</span>{" "}
        {L.modes[cost.budget_mode]?.body}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-medium">{L.byTool}</caption>
          <thead className="text-xs text-text-3">
            <tr>
              <th className="py-1 text-left font-normal">{L.tool}</th>
              <th className="py-1 text-right font-normal">{L.runs}</th>
              <th className="py-1 text-right font-normal">{L.spent}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {cost.by_tool.map((r) => (
              <tr key={r.tool}>
                <td className="py-1.5">{titleCase(r.tool)}</td>
                <td className="py-1.5 text-right text-text-3">{r.count}</td>
                <td className="py-1.5 text-right">
                  {r.free ? (
                    <span className="text-success">{L.free}</span>
                  ) : (
                    <>
                      {fmtMoney(r.spent_usd)}
                      {r.reserved_usd > 0 && (
                        <span className="block text-xs text-text-3">
                          {L.plusReserved(fmtMoney(r.reserved_usd))}
                        </span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-medium">{L.byStep}</caption>
          <tbody className="divide-y divide-border-soft">
            {cost.by_stage.map((r) => (
              <tr key={r.stage ?? "-"}>
                <td className="py-1.5">{r.stage ? stageLabel(r.stage) : L.noStep}</td>
                <td className="py-1.5 text-right">{fmtMoney(r.spent_usd + r.reserved_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-3">
        {STATUS_ORDER.filter((s) => cost.by_status[s]?.count)
          .map((s) => L.statusCount(L.statuses[s] ?? s, cost.by_status[s]!.count))
          .join(" · ")}
      </p>
    </section>
  );
}

function Fact({
  dot,
  label,
  value,
  danger,
}: {
  dot: string;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-text-3">
        <span aria-hidden className={`size-2 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className={danger ? "font-medium text-danger" : "font-medium"}>{value}</dd>
    </div>
  );
}
