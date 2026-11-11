import { ApiError } from "@/services/http";
import { MUSIC_TARGET, UploadQueue, type Sender } from "./uploadQueue";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

describe("UploadQueue", () => {
  it("uploads one file at a time per target, to the right URL, and reports progress", async () => {
    const urls: string[] = [];
    const send: Sender = async (url, f, onProgress) => {
      urls.push(url);
      onProgress(f.size / 2);
    };
    const q = new UploadQueue(send);
    q.enqueue("demo", [file("a.mp4"), file("b.mp4")]);
    q.enqueue(MUSIC_TARGET, [file("song.mp3")]);
    await vi.waitFor(() => expect(q.getSnapshot().every((it) => it.state === "done")).toBe(true));
    expect(urls).toEqual([
      "/api/v1/projects/demo/uploads?name=a.mp4&kind=footage",
      "/api/v1/music?name=song.mp3",
      "/api/v1/projects/demo/uploads?name=b.mp4&kind=footage",
    ]);
  });

  it("keeps the server error code, and drops a cancelled upload", async () => {
    const send: Sender = (url, _f, _p, signal) =>
      url.includes("big")
        ? Promise.reject(new ApiError(413, "too big", url, "too_large"))
        : new Promise((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          );
    const q = new UploadQueue(send);
    q.enqueue("p", [file("big.mov")]);
    await vi.waitFor(() => expect(q.getSnapshot()[0]?.error).toBe("too_large"));
    q.enqueue("p", [file("slow.mov")]);
    const slow = await vi.waitFor(() => {
      const it = q.getSnapshot().find((u) => u.name === "slow.mov");
      expect(it?.state).toBe("uploading");
      return it!;
    });
    q.cancel(slow.id);
    await vi.waitFor(() => expect(q.getSnapshot().map((u) => u.name)).toEqual(["big.mov"]));
  });
});
