import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaThumb } from "./MediaThumb";

describe("MediaThumb", () => {
  it("loads through the thumbnail endpoint", () => {
    render(<MediaThumb projectId="p" path="assets/a.png" width={320} alt="Scene" />);
    expect(screen.getByRole("img", { name: "Scene" })).toHaveAttribute(
      "src",
      "/thumb/p/assets/a.png?w=320",
    );
  });

  it("shows the file name instead of a broken image", () => {
    render(<MediaThumb projectId="p" path="assets/a.png" alt="Scene" />);
    fireEvent.error(screen.getByRole("img", { name: "Scene" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("a.png")).toBeInTheDocument();
  });

  it("shows a given fallback", () => {
    render(<MediaThumb projectId="p" path="a.png" alt="Poster" fallback="No preview" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("No preview")).toBeInTheDocument();
  });
});
