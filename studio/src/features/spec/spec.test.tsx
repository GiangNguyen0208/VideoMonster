import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/i18n";
import { mockFetch } from "@/test/fakes";
import type {
  BoardState,
  BriefInput,
  RequirementsView,
  SpecDecisionInput,
  SpecFlow as Flow,
} from "@/types/api";
import { defaultPicks, missingRequired, pickedCost } from "./spec";
import { SpecFlow } from "./SpecFlow";

const PID = "bees-1234";
const TOKEN = "a".repeat(64);
const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

const brief: RequirementsView["brief"] = {
  summary: "Video 12 giây về ong thụ phấn.",
  request: "Làm video về ong",
  language: "vi",
  constraints: {
    duration_seconds: 12,
    aspect_ratio: "16:9",
    budget_cap_usd: 5,
    must_include: ["thụ phấn"],
    avoid: [],
  },
  goals: [
    { id: "g1", text: "Người xem hiểu ong thụ phấn", success_check: "Lời đọc nhắc thụ phấn" },
  ],
  non_goals: [{ id: "n1", text: "Không số liệu" }],
  scenarios: [
    { id: "sc1", viewer: "người lướt feed", situation: "3 giây đầu", outcome: "hiểu chủ đề" },
  ],
  assumptions: ["Giọng đọc trung tính"],
  open_questions: [{ id: "q1", question: "Giọng nam hay nữ?", default_answer: "trung tính" }],
  improvements: [
    {
      id: "i1",
      title: "Thêm nhạc nền",
      benefit: "Ấm hơn",
      cost_delta_usd: 0.1,
      risk: "low",
      recommended: true,
      rationale: "Rẻ",
    },
    {
      id: "i2",
      title: "Thêm cảnh phụ",
      benefit: "Dài hơn",
      cost_delta_usd: 0.5,
      risk: "medium",
      recommended: false,
      rationale: "Tốn hơn",
    },
  ],
  approval: { status: "pending" },
};

const INPUTS: BriefInput[] = [
  {
    id: "in_lang",
    label: "Ngôn ngữ lời đọc",
    kind: "choice",
    required: true,
    options: ["en", "vi"],
    binds: "language",
  },
  {
    id: "in_subs",
    label: "Phụ đề",
    kind: "boolean",
    required: false,
    default_answer: "true",
    binds: "subtitles",
  },
  {
    id: "in_vfile",
    label: "Bản thu của bạn",
    kind: "file",
    accept: "audio",
    required: false,
    required_if: { input: "in_vsrc", equals: "upload" },
    binds: "voice_file",
  },
  {
    id: "in_vsrc",
    label: "Nguồn giọng",
    kind: "choice",
    required: false,
    options: ["gemini", "upload"],
    default_answer: "gemini",
    binds: "voice_source",
  },
];

const flow: Flow = {
  steps: [
    { id: "requirements", state: "pending" },
    { id: "spec", state: "locked" },
    { id: "render", state: "locked" },
    { id: "result", state: "pending" },
  ],
  current: "requirements",
  gate: { stage: "requirements", token: TOKEN },
  gemini_key: true,
  spec_hash: null,
  estimated_cost_usd: null,
};

function serve(reject?: { status: number; code: string }, withInputs = false) {
  const posted: SpecDecisionInput[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      mockFetch([
        ["/api/v1/session", SESSION],
        [`/api/v1/projects/${PID}/spec-flow`, flow],
        [
          `/api/v1/projects/${PID}/requirements`,
          {
            brief: withInputs ? { ...brief, inputs: INPUTS } : brief,
            state: "pending",
            errors: [],
            token: TOKEN,
          },
        ],
        [`/api/v1/projects/${PID}/inputs`, { files: [], references: [], started: false }],
        ["/api/v1/music", { tracks: [] }],
        [`/api/v1/projects/${PID}/decisions`, { decisions: [] }],
        [
          `/api/v1/projects/${PID}/requirements/decision`,
          (_u: string, init?: RequestInit) => {
            posted.push(JSON.parse(String(init?.body)) as SpecDecisionInput);
            return reject
              ? Response.json({ detail: "no", code: reject.code }, { status: reject.status })
              : Response.json({ id: "d1" }, { status: 201 });
          },
        ],
      ]),
    ),
  );
  return posted;
}

function renderFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const state = { project_id: PID, media: { renders: [] } } as unknown as BoardState;
  return render(
    <QueryClientProvider client={client}>
      <SpecFlow state={state} />
    </QueryClientProvider>,
  );
}

beforeEach(() => setLocale("vi"));
afterEach(() => {
  vi.unstubAllGlobals();
  setLocale("en");
});

describe("spec helpers", () => {
  it("pre-picks the recommended improvements and sums their cost", () => {
    expect(defaultPicks(brief)).toEqual(["i1"]);
    expect(pickedCost(brief, ["i1", "i2"])).toBeCloseTo(0.6);
  });
});

describe("Spec flow in Vietnamese", () => {
  it("shows gate 1 with the recommended pick ticked and sends picks + default answers", async () => {
    const posted = serve();
    renderFlow();
    expect(
      await screen.findByText(/Bước 1 · Kiểm tra agent hiểu đúng yêu cầu/),
    ).toBeInTheDocument();
    expect(screen.getByText("Đề xuất")).toBeInTheDocument();
    const [music, extra] = screen.getAllByRole("checkbox");
    expect(music).toBeChecked();
    expect(extra).not.toBeChecked();
    // later steps stay closed until the earlier one is approved
    expect(screen.queryByRole("button", { name: "Kế hoạch" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Duyệt yêu cầu" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      action: "approve",
      token: TOKEN,
      selected_improvements: ["i1"],
      answers: { q1: "trung tính" },
    });
  });

  it("translates a stale-gate error into Vietnamese", async () => {
    serve({ status: 409, code: "requirements_changed" });
    renderFlow();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt yêu cầu" }));
    expect(
      await screen.findByText("Bản yêu cầu đã đổi trong lúc bạn đọc. Hãy xem bản mới."),
    ).toBeInTheDocument();
  });

  it("blocks approval until the creator fills the required input, then sends every answer", async () => {
    const posted = serve(undefined, true);
    renderFlow();
    const approve = await screen.findByRole("button", { name: "Duyệt yêu cầu" });
    expect(screen.getByText("Chúng tôi cần bạn cung cấp")).toBeInTheDocument();
    expect(approve).toBeDisabled();
    expect(screen.getByText("Cần điền trước: Ngôn ngữ lời đọc")).toBeInTheDocument();
    // the recording only appears once "upload" is chosen as the voice source
    expect(screen.queryByLabelText(/Bản thu của bạn/)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/Ngôn ngữ lời đọc/), "vi");
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.answers).toMatchObject({
      q1: "trung tính",
      in_lang: "vi",
      in_subs: "true",
      in_vsrc: "gemini",
    });
  });

  it("requires the recording only when the creator uploads their own voice", async () => {
    serve(undefined, true);
    renderFlow();
    await screen.findByRole("button", { name: "Duyệt yêu cầu" });
    await userEvent.selectOptions(screen.getByLabelText(/Ngôn ngữ lời đọc/), "en");
    await userEvent.selectOptions(screen.getByLabelText(/Nguồn giọng/), "upload");
    expect(await screen.findByLabelText(/Bản thu của bạn/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt yêu cầu" })).toBeDisabled();
    expect(screen.getByText("Cần điền trước: Bản thu của bạn")).toBeInTheDocument();
  });
});

describe("required inputs", () => {
  it("counts a default as an answer and honours required_if", () => {
    const b = { ...brief, inputs: INPUTS };
    expect(missingRequired(b, {}).map((i) => i.id)).toEqual(["in_lang"]);
    expect(missingRequired(b, { in_lang: "en", in_vsrc: "upload" }).map((i) => i.id)).toEqual([
      "in_vfile",
    ]);
    expect(
      missingRequired(b, { in_lang: "en", in_vsrc: "upload", in_vfile: "inputs/v.mp3" }),
    ).toEqual([]);
  });
});
