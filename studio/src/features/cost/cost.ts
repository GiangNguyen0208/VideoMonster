import type { ProjectCost } from "@/types/api";

/** Bar widths in percent of the budget (or of what was used, without one). */
export function costBar(cost: ProjectCost) {
  const snap = cost.snapshot!;
  const used = snap.total_spent_usd + snap.total_reserved_usd;
  const scale = Math.max(cost.budget_total_usd ?? 0, used) || 1;
  return {
    spent: (snap.total_spent_usd / scale) * 100,
    reserved: (snap.total_reserved_usd / scale) * 100,
    over: cost.budget_total_usd != null && used > cost.budget_total_usd,
  };
}
