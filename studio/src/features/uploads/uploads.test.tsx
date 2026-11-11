import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setLocale } from "@/i18n";
import type { BoardState, IntakeInput, PipelineInfo, ProjectInputs } from "@/lib/api";
import boardFixture from "@/test/fixtures/board-state.json";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";
import { __testing, enqueueUploads } from "./uploadStore";

const PID = "talk-ab12";
const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};
const LIMITS = {
  max_bytes: 10 * 1024 * 1024,
  extensions: {
    video: [".mov", ".mp4"],
    audio: [".mp3", ".wav"],
    image: [".png"],
    subtitle: [".srt"],
  },
};
const KICKOFF = {
  project_id: PID,
  request: `Continue Studio project ${PID}`,
  agents: [{ id: "claude", label: "Claude Code", command: "claude", note: "" }],
  started: false,
};

function pipeline(name: string): PipelineInfo {
  return {
    name,
    description: "",
    category: null,
    stability: "production",
    stages: [{ name: "idea", gated: true }],
    reference_input: false,
    compatible_playbooks: { recommended: [], also_works: [], custom_allowed: false },
    production_modes: [],
    budget_default_usd: 2,
    default_checkpoint_policy: "guided",
    availability: { state: "ready", missing_required: [], missing_enhancements: [] },
  };
}

function emptyBoard(): BoardState {
  const s = JSON.parse(JSON.stringify(boardFixture)) as BoardState;
  s.project_id = PID;
  s.title = "My talk";
  s.has_pipeline_state = false;
  for (const stage of s.stages) stage.status = "pending";
  s.media.renders = [];
  s.events = [];
  return s;
}

const file = (name: string, size: number, type: string) =>
  new File([new Uint8Array(size)], name, { type });

interface Server {
  created: IntakeInput[];
  deleted: string[];
  refs: unknown[];
  inputs: ProjectInputs;
}

function serve(inputs: Partial<ProjectInputs> = {}): Server {
  const server: Server = {
    created: [],
    deleted: [],
    refs: [],
    inputs: { files: [], references: [], started: false, ...inputs },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      mockFetch([
        ["/api/v1/session", SESSION],
        ["/api/v1/uploads/limits", LIMITS],
        [
          "/api/v1/pipelines",
          {
            pipelines: ["talking-head", "clip-factory", "localization-dub"].map(pipeline),
            checked: true,
            defaults: { mode: "warn", total_usd: 10, checkpoint_policy: "guided" },
          },
        ],
        ["/api/v1/styles", { styles: [] }],
        ["/api/v1/music", { tracks: [] }],
        ["/api/v1/setup", { tier: "zero_key", video_types: [], keys: {}, rechecking: null }],
        [
          "/api/v1/projects",
          (_url: string, init?: RequestInit) => {
            server.created.push(JSON.parse(String(init?.body)) as IntakeInput);
            return Response.json({ project_id: PID, kickoff: KICKOFF }, { status: 201 });
          },
        ],
        [`/api/project/${PID}/state`, emptyBoard()],
        [`/api/v1/projects/${PID}/kickoff`, KICKOFF],
        [`/api/v1/projects/${PID}/inputs`, () => Response.json(server.inputs)],
        [
          new RegExp(`^/api/v1/projects/${PID}/uploads/(.+)$`),
          (url: string) => {
            server.deleted.push(decodeURIComponent(url.split("/").pop()!));
            if (server.inputs.started) {
              return Response.json({ detail: "no", code: "already_started" }, { status: 409 });
            }
            server.inputs.files = [];
            return new Response(null, { status: 204 });
          },
        ],
        [
          `/api/v1/projects/${PID}/references`,
          (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as { url: string; notes: string };
            if (server.inputs.references.some((r) => r.url === body.url)) {
              return Response.json({ detail: "dup", code: "duplicate_reference" }, { status: 409 });
            }
            server.refs.push(body);
            const ref = {
              id: "r1",
              url: body.url,
              notes: body.notes || null,
              added_at: "",
              source: "studio",
            };
            server.inputs.references.push(ref);
            return Response.json(ref, { status: 201 });
          },
        ],
      ]),
    ),
  );
  return server;
}

/** Network sender stand-in: resolves when the test calls `finish`. */
function fakeSender() {
  const calls: { url: string; size: number; finish: (fail?: string) => void }[] = [];
  __testing.setSender(
    (url, blob, onProgress) =>
      new Promise((resolve, reject) => {
        onProgress(blob.size / 2);
        calls.push({
          url,
          size: blob.size,
          finish: (fail) => {
            if (fail) {
              reject(Object.assign(new Error(fail), { name: "ApiError" }));
            } else {
              onProgress(blob.size);
              resolve({});
            }
          },
        });
      }),
  );
  return calls;
}

describe("Footage step in the wizard", () => {
  it("checks files, then uploads them to the new project with progress", async () => {
    const server = serve();
    const sends = fakeSender();
    const user = userEvent.setup({ applyAccept: false });
    renderRoute("/new");

    await user.click(await screen.findByRole("button", { name: /Polish my talking video/ }));
    expect(await screen.findByRole("heading", { name: "Add your footage" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Add at least one file")).toBeInTheDocument();

    const input = screen.getByLabelText("choose files");
    await user.upload(input, [
      file("talk.mov", 2048, "video/quicktime"),
      file("notes.exe", 10, ""),
    ]);
    expect(screen.getByText("talk.mov")).toBeInTheDocument();
    const bad = screen.getByText("notes.exe").closest("li")!;
    expect(within(bad).getByRole("alert")).toHaveTextContent("This file type isn't supported.");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Remove the files marked in red first")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove notes.exe" }));

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(await screen.findByLabelText("What is the video about?"), "My conference talk");
    await user.click(screen.getByRole("button", { name: "Next" }));
    // Wait for each step before pressing Next again: every step has a Next
    // button, so an early click would land on the previous one.
    expect(await screen.findByRole("heading", { name: "Look & budget" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Review & create" })).toBeInTheDocument();
    expect(screen.getByText(/1 file · 2 KB/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create video" }));

    await waitFor(() => expect(server.created).toHaveLength(1));
    expect(server.created[0]!.pipeline_type).toBe("talking-head");
    // Navigated to the project; the upload keeps running there.
    const panel = await screen.findByRole("region", { name: "Footage & links" });
    await waitFor(() => expect(sends).toHaveLength(1));
    expect(sends[0]!.url).toBe(`/api/v1/projects/${PID}/uploads?name=talk.mov&kind=footage`);
    expect(within(panel).getByText("Uploading · 50%")).toBeInTheDocument();
    expect(within(panel).getByRole("progressbar", { name: "Uploading talk.mov" })).toBeVisible();
    expect(screen.getByText(/still uploading/)).toBeInTheDocument();

    server.inputs.files = [
      {
        path: "inputs/talk.mov",
        name: "talk.mov",
        kind: "footage",
        media: "video",
        size: 2048,
        duration_s: 754,
        width: 1920,
        height: 1080,
        codec: "h264",
        uploaded_at: "",
      },
    ];
    act(() => sends[0]!.finish());
    expect(await within(panel).findByText("2 KB · 12:34 · 1920×1080")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).queryByText(/Uploading/)).toBeNull());
    expect(screen.queryByText(/still uploading/)).toBeNull();
    // The whole wizard plus the project page: slower than most tests when the
    // suite runs in parallel.
  }, 15_000);

  it("asks for target languages when dubbing", async () => {
    serve();
    const user = userEvent.setup({ applyAccept: false });
    renderRoute("/new");
    await user.click(await screen.findByRole("button", { name: /Translate or dub/ }));
    await user.upload(
      await screen.findByLabelText("choose files"),
      file("launch.mp4", 100, "video/mp4"),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Name at least one language")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Translate into"), "Vietnamese, Spanish");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Tell us about it" })).toBeInTheDocument();
  });
});

describe("Footage & links panel", () => {
  const talk = {
    path: "inputs/talk.mov",
    name: "talk.mov",
    kind: "footage" as const,
    media: "video" as const,
    size: 5 * 1024 * 1024,
    duration_s: 61,
    width: null,
    height: null,
    codec: null,
    uploaded_at: "",
  };

  it("removes files before the agent starts and adds reference links", async () => {
    const server = serve({ files: [talk] });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Footage & links" });
    expect(within(panel).getByText("5 MB · 1:01")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Preview" }));
    expect(panel.querySelector("video")).toHaveAttribute("src", `/media/${PID}/inputs/talk.mov`);

    await user.click(within(panel).getByRole("button", { name: "Remove talk.mov" }));
    await waitFor(() => expect(server.deleted).toEqual(["talk.mov"]));
    expect(await within(panel).findByText("No files yet.")).toBeInTheDocument();

    await user.type(within(panel).getByLabelText("Link"), "https://youtu.be/abc");
    await user.type(within(panel).getByLabelText("What to take from it (optional)"), "pacing");
    await user.click(within(panel).getByRole("button", { name: "Add link" }));
    await waitFor(() =>
      expect(server.refs).toEqual([{ url: "https://youtu.be/abc", notes: "pacing" }]),
    );
    expect(await within(panel).findByRole("link", { name: "https://youtu.be/abc" })).toBeVisible();
    expect(within(panel).getByLabelText("Link")).toHaveValue("");
  });

  it("locks removal once the agent started, in Vietnamese", async () => {
    setLocale("vi");
    serve({
      files: [talk],
      references: [
        { id: "r1", url: "https://youtu.be/abc", notes: null, added_at: "", source: "wizard" },
      ],
      started: true,
    });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Footage & link" });
    expect(within(panel).getByText(/Agent đã bắt đầu nên không thể xoá/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Xoá talk.mov" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Xoá https/ })).toBeNull();

    await user.type(within(panel).getByLabelText("Link"), "https://youtu.be/abc");
    await user.click(within(panel).getByRole("button", { name: "Thêm link" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Link này đã có trong danh sách.",
    );
  });

  it("shows a failed upload with its translated reason", async () => {
    serve();
    __testing.setSender(async () => {
      const { ApiError } = await import("@/lib/api");
      throw new ApiError(413, "too big", "/x", "too_large");
    });
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Footage & links" });
    act(() => enqueueUploads(PID, [file("huge.mp4", 10, "video/mp4")]));
    expect(await within(panel).findByText(/Too large — the limit is 10 MB per file/)).toBeVisible();
    expect(within(panel).getByText(/Failed/)).toBeInTheDocument();
  });
});
