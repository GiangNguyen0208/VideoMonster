import { mediaURL } from "@/lib/format";

/** `/media` URL that the browser saves instead of playing. */
export function downloadURL(projectId: string, path: string): string {
  return `${mediaURL(projectId, path)}?download=1`;
}
