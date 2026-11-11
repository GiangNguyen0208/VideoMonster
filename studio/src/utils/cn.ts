import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom theme scales from index.css so that, e.g.,
// a `rounded-card` className overrides a component's default `rounded-control`.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "control"],
      shadow: ["glow"],
      font: ["screenplay"],
    },
  },
});

/** Join class names, skipping falsy values; later Tailwind classes win over conflicting earlier ones. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return merge(parts.filter(Boolean).join(" "));
}
