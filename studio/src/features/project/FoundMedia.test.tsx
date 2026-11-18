import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setLocale } from "@/i18n";
import { FoundMedia } from "./FoundMedia";

describe("FoundMedia", () => {
  it("lists snapshot images from a project without pipeline state", () => {
    render(<FoundMedia projectId="p" snapshots={[{ path: "renders/a.png" }]} />);
    expect(screen.getByRole("region", { name: "Files found in this project" })).toBeVisible();
    expect(screen.getByRole("img", { name: "renders/a.png" })).toHaveAttribute(
      "src",
      expect.stringContaining("/thumb/p/"),
    );
  });

  it("renders nothing without snapshots", () => {
    const { container } = render(<FoundMedia projectId="p" snapshots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks Vietnamese", () => {
    setLocale("vi");
    render(<FoundMedia projectId="p" snapshots={[{ path: "a.png" }]} />);
    expect(screen.getByText("Tệp tìm thấy trong dự án")).toBeInTheDocument();
  });
});
