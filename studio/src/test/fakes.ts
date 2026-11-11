/** Minimal EventSource stand-in (jsdom has none). Tests can push messages. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  close() {
    this.closed = true;
  }
}

export type Handler = (url: string, init?: RequestInit) => Response;
type Route = [RegExp | string, unknown | Handler];

/** fetch mock answering by URL; unknown URLs return 404 JSON. */
export function mockFetch(routes: Route[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, body] of routes) {
      const hit = typeof pattern === "string" ? url === pattern : pattern.test(url);
      if (!hit) continue;
      return typeof body === "function" ? (body as Handler)(url, init) : Response.json(body);
    }
    return Response.json({ detail: `no mock for ${url}` }, { status: 404 });
  };
}
