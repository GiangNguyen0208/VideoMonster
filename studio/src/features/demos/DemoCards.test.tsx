import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Demo, Job } from "@/types/api";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";

const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

const demo = (over: Partial<Demo> = {}): Demo => ({
  name: "world-in-numbers",
  title: "World in numbers",
  description: "Global scale story",
  rendered: false,
  video_url: null,
  job: null,
  ...over,
});

const job = (status: Job["status"], progress: number, output: Job["output"] = null): Job => ({
  id: "j1",
  kind: "demo_render:world-in-numbers",
  status,
  started_at: 1,
  finished_at: status === "running" ? null : 2,
  error: null,
  progress,
  output,
});

describe("Home demos", () => {
  it("renders a demo from the browser, shows progress, then plays it", async () => {
    let polls = 0;
    const url = "/media/demos/renders/world-in-numbers.mp4";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        mockFetch([
          ["/api/v1/session", SESSION],
          ["/api/projects", []],
          ["/api/v1/setup", { tier: "starter", suggested_offers: [] }],
          ["/api/v1/demos", { demos: [demo()] }],
          [
            "/api/v1/demos/world-in-numbers/render",
            () => Response.json({ job: job("running", 0.4) }, { status: 202 }),
          ],
          [
            "/api/v1/jobs/j1",
            () =>
              Response.json(
                ++polls < 2 ? job("running", 0.4) : job("succeeded", 1, { video_url: url }),
              ),
          ],
        ]),
      ),
    );
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(await screen.findByRole("button", { name: "Render" }));
    const bar = await screen.findByRole("progressbar", { name: /Rendering World in numbers/ });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    await waitFor(
      () =>
        expect(screen.getByLabelText("World in numbers demo video")).toHaveAttribute("src", url),
      { timeout: 4000 },
    );
    expect(screen.getByRole("button", { name: "Render again" })).toBeEnabled();
  });

  it("shows already-rendered demos as players", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        mockFetch([
          ["/api/projects", []],
          ["/api/v1/setup", { tier: "starter", suggested_offers: [] }],
          [
            "/api/v1/demos",
            { demos: [demo({ rendered: true, video_url: "/media/demos/renders/x.mp4" })] },
          ],
        ]),
      ),
    );
    renderRoute("/");
    expect(await screen.findByLabelText("World in numbers demo video")).toBeInTheDocument();
  });
});
