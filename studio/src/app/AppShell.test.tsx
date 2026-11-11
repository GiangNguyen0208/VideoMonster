import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  ])("deep link %s renders its page", (path, heading) => {
    renderRoute(path);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("shows a 404 page for unknown routes", () => {
    renderRoute("/nope");
    expect(screen.getByText("Page not found")).toBeInTheDocument();
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
});
