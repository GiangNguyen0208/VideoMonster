import { cn } from "./cn";

describe("cn", () => {
  it("skips falsy parts", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets a later class override a conflicting earlier one, including theme scales", () => {
    expect(cn("rounded-control px-3", "rounded-card")).toBe("px-3 rounded-card");
    expect(cn("text-text-2", "text-danger")).toBe("text-danger");
    expect(cn("text-sm text-text-2")).toBe("text-sm text-text-2");
    expect(cn("shadow-glow", "shadow-md")).toBe("shadow-md");
  });
});
