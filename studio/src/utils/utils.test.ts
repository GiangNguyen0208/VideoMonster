import { ApiError } from "@/services/http";
import { errorText, fieldErrors } from "./errors";
import { fmtFacts, fmtLength, fmtResolution } from "./format";
import { newVideoPath, projectPath } from "./routes";

describe("format helpers", () => {
  it("formats resolutions from numbers or WxH text", () => {
    expect(fmtResolution(1920, 1080)).toBe("1920×1080");
    expect(fmtResolution("1080x1920")).toBe("1080×1920");
    expect(fmtResolution(null, 1080)).toBe("");
  });

  it("joins known facts only", () => {
    expect(fmtFacts(["1080×1920", null, "", false, "30 fps"])).toBe("1080×1920 · 30 fps");
  });

  it("writes minimum lengths", () => {
    expect(fmtLength(30)).toBe("30 s");
    expect(fmtLength(300)).toBe("5 min");
  });
});

describe("route helpers", () => {
  it("encodes project ids", () => {
    expect(projectPath("a b/c")).toBe("/p/a%20b%2Fc");
    expect(newVideoPath()).toBe("/new");
    expect(newVideoPath("brief")).toBe("/new?step=brief");
  });
});

describe("error helpers", () => {
  it("prefers the translated code, then the server detail, then the JS message", () => {
    const coded = new ApiError(409, "stale", "/x", "stale_checkpoint");
    expect(errorText(coded, { stale_checkpoint: "Changed" })).toBe("Changed");
    expect(errorText(coded)).toBe("stale");
    expect(errorText(new Error("network"))).toBe("network");
    expect(errorText(null)).toBeUndefined();
  });

  it("collects FastAPI 422 field locations", () => {
    const err = new ApiError(422, [{ loc: ["body", "budget", "total_usd"] }], "/s");
    expect([...fieldErrors(err)]).toEqual(["budget.total_usd"]);
    expect(fieldErrors(new ApiError(500, "x", "/s")).size).toBe(0);
  });
});
