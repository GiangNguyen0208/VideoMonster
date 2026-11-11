import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Job, SetupView } from "@/lib/api";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";

const job = (id: string, status: Job["status"], error: string | null = null): Job => ({
  id,
  kind: "setup_probe",
  status,
  started_at: 1,
  finished_at: status === "running" ? null : 2,
  error,
});

function view(over: Partial<SetupView> = {}): SetupView {
  return {
    tier: "zero_key",
    tier_label: "Zero-key",
    tier_explanation: "Free, local tools only.",
    runtimes: { ffmpeg: true, remotion: true, hyperframes: false },
    works_now: [{ capability: "tts", configured: 1, total: 19, providers: ["piper"] }],
    video_types: [
      {
        pipeline: "animated-explainer",
        stability: "production",
        state: "locked",
        missing_required: ["image_generation"],
        missing_enhancements: [],
      },
      {
        pipeline: "cinematic",
        stability: "production",
        state: "limited",
        missing_required: [],
        missing_enhancements: ["video_generation"],
      },
      {
        pipeline: "clip-factory",
        stability: "beta",
        state: "ready",
        missing_required: [],
        missing_enhancements: [],
      },
    ],
    suggested_offers: [
      {
        env_var: "FAL_KEY",
        providers: ["fal"],
        capabilities: ["image_generation", "video_generation"],
        new_capabilities: ["image_generation", "video_generation"],
        tools: ["fal_image"],
        unlocks_video_types: ["animated-explainer"],
        improves_video_types: ["cinematic"],
        install_instructions: "Set FAL_KEY. Create a key at https://fal.ai/dashboard/keys.",
        signup_url: "https://fal.ai/dashboard/keys",
      },
    ],
    offers: [],
    hardware: [],
    warnings: ["hyperframes: npx not found"],
    keys: { FAL_KEY: { set: false, hint: null, source: null } },
    checked_at: Date.now() / 1000,
    rechecking: null,
    ...over,
  };
}

const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

/** A tiny fake Studio server with a probe that takes one poll to finish. */
function fakeServer(opts: { failFirst?: boolean } = {}) {
  let current = view();
  current.offers = current.suggested_offers;
  let probeRuns = 0;
  const jobs = new Map<string, Job>();
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let ready = false;

  const startProbe = () => {
    const id = `j${++probeRuns}`;
    jobs.set(id, job(id, "running"));
    return jobs.get(id)!;
  };

  const fetchMock = vi.fn(
    mockFetch([
      ["/api/v1/session", SESSION],
      ["/api/projects", []],
      [
        "/api/v1/setup",
        () => {
          if (!ready) {
            const running = [...jobs.values()].find((j) => j.status === "running");
            return Response.json(
              { status: "checking", job: running ?? startProbe() },
              { status: 202 },
            );
          }
          return Response.json(current);
        },
      ],
      [
        /^\/api\/v1\/jobs\//,
        (url: string) => {
          const id = url.split("/").pop()!;
          const j = jobs.get(id)!;
          if (j.status === "running") {
            const failed = opts.failFirst && id === "j1";
            jobs.set(
              id,
              job(
                id,
                failed ? "failed" : "succeeded",
                failed ? "capability check failed: boom" : null,
              ),
            );
            if (!failed) ready = true;
          }
          return Response.json(jobs.get(id));
        },
      ],
      [
        "/api/v1/setup/recheck",
        (url: string, init?: RequestInit) => {
          calls.push({ method: init?.method ?? "GET", url });
          const started = startProbe();
          return Response.json({ status: "checking", job: started }, { status: 202 });
        },
      ],
      [
        "/api/v1/setup/env",
        (url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as { key: string; value: string };
          calls.push({ method: init?.method ?? "GET", url, body });
          const status = {
            set: Boolean(body.value),
            hint: body.value ? "••••1234" : null,
            source: body.value ? "env_file" : null,
          };
          current = {
            ...current,
            keys: { ...current.keys, [body.key]: status as SetupView["keys"][string] },
          };
          return Response.json({ key: body.key, ...status });
        },
      ],
    ]),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls, setTier: (v: Partial<SetupView>) => (current = { ...current, ...v }) };
}

describe("Setup page", () => {
  it("shows a checking state, then the tier, tools, video types and warnings", async () => {
    fakeServer();
    renderRoute("/setup");
    expect(await screen.findByText("Checking your tools…")).toBeInTheDocument();
    expect(await screen.findByText("Zero-key", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/^Free, local tools only: narration with Piper/)).toBeInTheDocument();
    expect(screen.getByText("Voice-over")).toBeInTheDocument();
    expect(screen.getByText("hyperframes: npx not found")).toBeInTheDocument();

    const types = screen.getByRole("region", { name: "Video types on this machine" });
    const row = (label: string) => within(types).getByText(label).closest("li")!;
    expect(within(row("Explain a topic")).getByText("Locked")).toBeInTheDocument();
    expect(within(row("Explain a topic")).getByText("needs AI images")).toBeInTheDocument();
    expect(within(row("Explain a topic")).getByRole("link", { name: "Unlock" })).toHaveAttribute(
      "href",
      "#key-FAL_KEY",
    );
    expect(
      within(row("Trailer or teaser")).getByText("better with AI video clips"),
    ).toBeInTheDocument();
    expect(within(row("Long video → clips")).getByText("Ready")).toBeInTheDocument();
  });

  it("explains each unlock card in plain words with a sign-up link", async () => {
    fakeServer();
    renderRoute("/setup");
    const card = (
      await screen.findByText("Add AI images & AI video clips", {}, { timeout: 3000 })
    ).closest("#key-FAL_KEY") as HTMLElement;
    expect(within(card).getByText("Unlocks: Explain a topic")).toBeInTheDocument();
    expect(within(card).getByText("Better: Trailer or teaser")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Get a key ↗" })).toHaveAttribute(
      "href",
      "https://fal.ai/dashboard/keys",
    );
  });

  it("saves a key masked, never shows it again, and re-checks", async () => {
    const server = fakeServer();
    renderRoute("/setup");
    const input = await screen.findByLabelText("FAL_KEY", {}, { timeout: 3000 });
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "  secret-value-1234 ");
    await userEvent.click(screen.getByRole("button", { name: "Save and check" }));

    await waitFor(() =>
      expect(server.calls.map((c) => c.method + " " + c.url)).toEqual([
        "PUT /api/v1/setup/env",
        "POST /api/v1/setup/recheck",
      ]),
    );
    expect(server.calls[0]!.body).toEqual({ key: "FAL_KEY", value: "secret-value-1234" });
    expect(await screen.findByText(/saved ••••1234/)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(document.body.textContent).not.toContain("secret-value-1234");
  });

  it("reports a failed check and retries", async () => {
    fakeServer({ failFirst: true });
    renderRoute("/setup");
    expect(
      await screen.findByText("The capability check failed", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("capability check failed: boom")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Zero-key", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe("Home unlock nudge", () => {
  it("shows on zero-key machines and can be dismissed", async () => {
    fakeServer();
    renderRoute("/");
    expect(
      await screen.findByText("You're on free, local tools", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("One key adds AI images & AI video clips.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("You're on free, local tools")).not.toBeInTheDocument();
    expect(localStorage.getItem("studio.unlockMoreDismissed")).toBe("1");
  });

  it("is hidden once a paid tier is configured", async () => {
    const server = fakeServer();
    server.setTier({ tier: "starter", tier_label: "Starter" });
    renderRoute("/setup");
    await screen.findByText("Starter", {}, { timeout: 3000 });
    renderRoute("/");
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText("You're on free, local tools")).not.toBeInTheDocument();
  });
});
