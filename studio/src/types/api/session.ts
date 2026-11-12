/** `GET /api/v1/session`: per-server write token and build facts. */
export interface Session {
  token: string;
  version: string;
  user: { id: string; display_name: string };
  features: Record<string, boolean>;
}
