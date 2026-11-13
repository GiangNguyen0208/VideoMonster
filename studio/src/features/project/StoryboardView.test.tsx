import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { setLocale } from "@/i18n";
import type { Storyboard } from "@/types/api";
import { StoryboardView } from "./StoryboardView";

const img = (id: string) => ({ id, type: "image", path: `assets/${id}.png`, exists: true });
const board: Storyboard = {
  scenes: [
    {
      id: "sc1",
      visual: img("a"),
      takes: [img("a"), img("b")],
      description: "Opening",
    },
  ],
};

describe("StoryboardView", () => {
  it("switches between takes and marks the active one", async () => {
    const user = userEvent.setup();
    render(<StoryboardView projectId="p" storyboard={board} />);
    const first = screen.getByRole("button", { name: "Take 1" });
    const second = screen.getByRole("button", { name: "Take 2" });
    expect(first).toHaveAttribute("aria-pressed", "true");
    await user.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });

  it("opens an image in a lightbox", async () => {
    const user = userEvent.setup();
    render(<StoryboardView projectId="p" storyboard={board} />);
    await user.click(screen.getByRole("button", { name: "Enlarge image" }));
    expect(await screen.findByRole("dialog", { name: "Scene 1" })).toBeInTheDocument();
  });

  it("labels takes in Vietnamese", () => {
    setLocale("vi");
    render(<StoryboardView projectId="p" storyboard={board} />);
    expect(screen.getByRole("group", { name: "Các bản take của cảnh 1" })).toBeInTheDocument();
  });
});
