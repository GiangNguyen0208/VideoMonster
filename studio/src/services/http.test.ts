import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, resetSession, TOKEN_HEADER } from "./http";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const session = (token: string) => ({
  token,
  version: "0.1.0",
  user: { id: "local", display_name: "Local user" },
  features: {},
});

describe("api client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetSession();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  const headersOf = (call: number) => new Headers(fetchMock.mock.calls[call]?.[1]?.headers);

  it("sends GET requests without fetching a token", async () => {
    fetchMock.mockResolvedValueOnce(json([{ project_id: "film" }]));
    await expect(api("/api/projects")).resolves.toEqual([{ project_id: "film" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0).has(TOKEN_HEADER)).toBe(false);
  });

  it("adds the session token and JSON body to writes", async () => {
    fetchMock.mockResolvedValueOnce(json(session("t1"))).mockResolvedValueOnce(json({ ok: true }));
    await api("/api/v1/projects", { json: { title: "Hi" } });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/v1/projects");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ title: "Hi" }));
    expect(headersOf(1).get(TOKEN_HEADER)).toBe("t1");
    expect(headersOf(1).get("Content-Type")).toBe("application/json");
  });

  it("reuses the cached session across writes", async () => {
    fetchMock
      .mockResolvedValueOnce(json(session("t1")))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    await api("/api/v1/a", { method: "DELETE" });
    await api("/api/v1/b", { method: "DELETE" });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/session",
      "/api/v1/a",
      "/api/v1/b",
    ]);
  });

  it("refreshes the token once after a 403 (server restarted)", async () => {
    fetchMock
      .mockResolvedValueOnce(json(session("old")))
      .mockResolvedValueOnce(json({ detail: "missing or invalid studio token" }, 403))
      .mockResolvedValueOnce(json(session("new")))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(api("/api/v1/x", { json: {} })).resolves.toEqual({ ok: true });
    expect(headersOf(3).get(TOKEN_HEADER)).toBe("new");
  });

  it("throws ApiError carrying status and server detail", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "unknown project: x" }, 404));
    const err = await api("/api/project/x/state").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, detail: "unknown project: x" });
  });
});
