/** Shared look of text inputs, textareas and selects. */
export const controlClass =
  "w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-text transition placeholder:text-text-3 hover:border-text-3/40 focus-visible:border-accent aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60";

/** Selected vs. idle look of option cards and pills (goal cards, chips, tabs-as-pills). */
export function selectableClass(selected: boolean): string {
  return selected
    ? "border-accent bg-accent-dim text-text ring-1 ring-accent/30"
    : "border-border bg-surface text-text hover:border-accent/50 hover:bg-surface-bright";
}
