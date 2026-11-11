import { ApiError } from "@/lib/api";

/** "budget.total_usd" for each field FastAPI rejected (loc = body.section.key). */
export function fieldErrors(error: unknown): Set<string> {
  if (!(error instanceof ApiError) || error.status !== 422 || !Array.isArray(error.detail)) {
    return new Set();
  }
  return new Set(
    (error.detail as { loc?: unknown[] }[])
      .map((d) => (Array.isArray(d.loc) ? d.loc.slice(1, 3).join(".") : ""))
      .filter(Boolean),
  );
}
