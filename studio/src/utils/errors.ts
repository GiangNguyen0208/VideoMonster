import { ApiError } from "@/services/http";

/**
 * Message for a failed request: the translated text for its stable `code`
 * when the caller has one, else the server's `detail`, else the JS error.
 */
export function errorText(
  error: unknown,
  codes?: Partial<Record<string, string>>,
): string | undefined {
  if (error instanceof ApiError) {
    return (error.code && codes?.[error.code]) || String(error.detail);
  }
  return error instanceof Error ? error.message : undefined;
}

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
