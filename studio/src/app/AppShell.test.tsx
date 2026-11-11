import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/i18n";
import { THEME_KEY } from "@/lib/theme";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";

describe("AppShell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(mockFetch([["/api/projects", []]])));
  });

  it("renders the main navigation", () => {
    renderRoute("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const label of ["Home", "New video", "Library", "Setup", "Settings"]) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it.each([
    ["/library", "Library"],
    ["/setup", "Setup"],
    ["/settings", "Settings"],
  ])("deep link %s renders its page", async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("shows a 404 page for unknown routes", async () => {
    renderRoute("/nope");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("toggles the theme and stores it under the shared Backlot key", async () => {
    renderRoute("/");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("explains how to start the server when Backlot is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 502 })),
    );
    renderRoute("/");
    expect(await screen.findByText("Can't reach the Backlot server")).toBeInTheDocument();
  });

  it("shows connection, month spend, the New video call to action and a placeholder account menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        mockFetch([
          [
            "/api/v1/session",
            {
              token: "t",
              version: "9.9.9",
              user: { id: "local", display_name: "You" },
              features: {},
            },
          ],
          [
            /\/api\/v1\/cost\/summary/,
            { since: "2026-11-01T00:00:00Z", spent_usd: 0.35, projects: 2 },
          ],
          ["/api/projects", []],
        ]),
      ),
    );
    renderRoute("/");
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(await screen.findByText("This month: $0.35")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a new video" })).toBeInTheDocument();
    expect(screen.getByText("Account — Coming soon").closest("[inert]")).not.toBeNull();
    expect(await screen.findByText("v9.9.9")).toBeInTheDocument();
  });

  it("speaks Vietnamese in the shell controls and says when the server is offline", async () => {
    setLocale("vi");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 502 })),
    );
    renderRoute("/");
    expect(await screen.findByText("Mất kết nối máy chủ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyển sang giao diện sáng" })).toBeInTheDocument();
  });
});
