import { describe, expect, it } from "vitest";
import { setLocale } from "@/i18n";
import { fmtBytes, fmtMoney } from "./format";

describe("locale-aware formatting", () => {
  it("formats USD and sizes in English", () => {
    setLocale("en");
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
    expect(fmtMoney(0)).toBe("$0.00");
    expect(fmtMoney(0.0042)).toBe("$0.0042");
    expect(fmtMoney(null)).toBe("—");
    expect(fmtBytes(1.5 * 1024 ** 2)).toBe("1.5 MB");
  });

  it("formats USD and sizes in Vietnamese", () => {
    setLocale("vi");
    // vi-VN: "." groups thousands, "," marks decimals; the currency stays USD.
    expect(fmtMoney(1234.5).replace(/\s/g, " ")).toBe("1.234,50 US$");
    expect(fmtBytes(1.5 * 1024 ** 2)).toBe("1,5 MB");
  });
});
