/**
 * Typed fetch wrapper for the Backlot read API and the Studio v1 write API.
 *
 * Non-GET requests carry the per-server session token (X-Studio-Token) that
 * backlot/studio_api.py checks before routing. The token rotates when the
 * server restarts, so a 403 on a write refreshes it once and retries.
 */

import type { Session } from "@/types/api";

export type { Session };

export const TOKEN_HEADER = "X-Studio-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  /** Stable machine code for errors the UI translates (e.g. "stale_checkpoint"). */
  readonly code: string | null;

  constructor(status: number, detail: unknown, url: string, code: string | null = null) {
    super(typeof detail === "string" ? detail : `${status} ${url}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

let sessionPromise: Promise<Session> | null = null;

export function getSession(): Promise<Session> {
  sessionPromise ??= request<Session>("/api/v1/session").catch((err: unknown) => {
    sessionPromise = null;
    throw err;
  });
  return sessionPromise;
}

export function resetSession(): void {
  sessionPromise = null;
}

/** Response text as JSON when it parses, else the raw text (null when empty). */
export function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Build an `ApiError` from a failed response body (`{detail, code}` or anything else). */
export function toApiError(status: number, body: unknown, url: string): ApiError {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const detail = obj && "detail" in obj ? obj.detail : body;
  const code = obj && typeof obj.code === "string" ? obj.code : null;
  return new ApiError(status, detail, url, code);
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const body = parseBody(await res.text());
  if (!res.ok) throw toApiError(res.status, body, url);
  return body as T;
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
}

export async function api<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const method = (rest.method ?? (json === undefined ? "GET" : "POST")).toUpperCase();
  const needsToken = !SAFE_METHODS.has(method);

  const send = async (): Promise<T> => {
    const h = new Headers(headers);
    if (json !== undefined) h.set("Content-Type", "application/json");
    if (needsToken) h.set(TOKEN_HEADER, (await getSession()).token);
    return request<T>(url, {
      ...rest,
      method,
      headers: h,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  };

  try {
    return await send();
  } catch (err) {
    if (needsToken && err instanceof ApiError && err.status === 403) {
      resetSession();
      return send();
    }
    throw err;
  }
}
