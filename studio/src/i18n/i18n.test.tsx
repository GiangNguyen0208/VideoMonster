import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi as mock } from "vitest";
import type { IntakeInput } from "@/lib/api";
import { fmtAgo } from "@/lib/format";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";
import { en } from "./en";
import { CATALOGS, detectLocale, getLocale, LOCALE_KEY, msg, setLocale } from "./index";
import { vi } from "./vi";

/** Every nested key path; arrays count as leaves. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

function leaves(value: unknown): unknown[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).flatMap(leaves);
  }
  return Array.isArray(value) ? value : [value];
}

describe("catalogs", () => {
  it("vi has exactly the keys en has, including label maps", () => {
    expect(keyPaths(vi).sort()).toEqual(keyPaths(en).sort());
  });

  it("has no empty strings and matching example counts", () => {
    for (const catalog of Object.values(CATALOGS)) {
      for (const leaf of leaves(catalog)) {
        if (typeof leaf === "string") expect(leaf.trim()).not.toBe("");
        else expect(typeof leaf).toBe("function");
      }
    }
    for (const id of Object.keys(en.goals)) {
      expect(vi.goals[id]!.examples).toHaveLength(en.goals[id]!.examples.length);
    }
  });

  it("formatters with parameters work in both languages", () => {
    for (const catalog of Object.values(CATALOGS)) {
      expect(catalog.status.waiting("Script")).toContain("script");
      expect(catalog.library.card.steps(2, 5)).toContain("2/5");
      expect(catalog.home.waitingBanner(3)).toContain("3");
    }
  });
});

describe("locale store", () => {
  it("defaults to the browser language and remembers the choice", () => {
    expect(getLocale()).toBe("en");
    setLocale("vi");
    expect(localStorage.getItem(LOCALE_KEY)).toBe("vi");
    expect(document.documentElement.lang).toBe("vi");
    expect(detectLocale()).toBe("vi");
    expect(msg().time.justNow).toBe("vừa xong");
    expect(fmtAgo(Date.now() / 1000 - 600)).toBe("10 phút trước");
  });

  it("picks Vietnamese for a Vietnamese browser", () => {
    mock.spyOn(navigator, "languages", "get").mockReturnValue(["vi-VN", "en"]);
    expect(detectLocale()).toBe("vi");
    mock.restoreAllMocks();
  });
});

const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

describe("Studio in Vietnamese", () => {
  it("switches the whole shell from the header picker", async () => {
    mock.stubGlobal("fetch", mock.fn(mockFetch([["/api/projects", []]])));
    const user = userEvent.setup();
    renderRoute("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("Library");

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "vi");
    const navVi = screen.getByRole("navigation", { name: "Điều hướng chính" });
    for (const label of ["Trang chủ", "Video mới", "Thư viện", "Thiết lập", "Cài đặt"]) {
      expect(navVi).toHaveTextContent(label);
    }
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Làm video với OpenMontage",
    );
    expect(await screen.findByText("Chưa có video nào")).toBeInTheDocument();
  });

  it("runs the wizard in Vietnamese and still writes an English-tone intake", async () => {
    setLocale("vi");
    const created: IntakeInput[] = [];
    mock.stubGlobal(
      "fetch",
      mock.fn(
        mockFetch([
          ["/api/v1/session", SESSION],
          [
            "/api/v1/pipelines",
            {
              pipelines: [
                {
                  name: "screen-demo",
                  description: "",
                  category: null,
                  stability: "production",
                  stages: [],
                  reference_input: false,
                  compatible_playbooks: { recommended: [], also_works: [], custom_allowed: false },
                  production_modes: [],
                  budget_default_usd: 2,
                  default_checkpoint_policy: "guided",
                  availability: { state: "ready", missing_required: [], missing_enhancements: [] },
                },
              ],
              checked: true,
              defaults: { mode: "warn", total_usd: 10, checkpoint_policy: "guided" },
            },
          ],
          ["/api/v1/styles", { styles: [] }],
          ["/api/v1/setup", { tier: "zero_key", video_types: [], keys: {}, rechecking: null }],
          [
            "/api/v1/projects",
            (_url: string, init?: RequestInit) => {
              created.push(JSON.parse(String(init?.body)) as IntakeInput);
              return Response.json({ detail: "stop here" }, { status: 500 });
            },
          ],
        ]),
      ),
    );
    const user = userEvent.setup();
    renderRoute("/new");
    await user.click(await screen.findByRole("button", { name: /Demo ứng dụng \/ terminal/ }));
    expect(
      await screen.findByRole("heading", { name: "Thêm footage của bạn" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(await screen.findByText("Thêm ít nhất một file")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Terminal hoạt hình/ }));
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(
      await screen.findByRole("heading", { name: "Kể thêm cho chúng tôi" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(await screen.findByText("Hãy cho biết video nói về điều gì")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cài CLI của chúng tôi và chạy lệnh đầu tiên" }),
    );
    const tones = screen.getByRole("group", { name: "Giọng điệu" });
    expect(within(tones).getByRole("button", { name: "Rõ ràng" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(await screen.findByText("Miễn phí — chạy trên máy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(await screen.findByRole("heading", { name: "Xem lại & tạo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tạo video" }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.brief.tone).toBe("Clear, Professional");
    expect(created[0]!.language).toBe("vi");
    expect(created[0]!.brief.topic).toBe("Cài CLI của chúng tôi và chạy lệnh đầu tiên");
  });

  it("follows a language change made in another tab", () => {
    mock.stubGlobal("fetch", mock.fn(mockFetch([["/api/projects", []]])));
    renderRoute("/settings");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
    act(() => {
      localStorage.setItem(LOCALE_KEY, "vi");
      window.dispatchEvent(new StorageEvent("storage", { key: LOCALE_KEY, newValue: "vi" }));
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cài đặt");
  });
});
