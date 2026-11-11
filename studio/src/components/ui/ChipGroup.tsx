import { cn } from "@/utils/cn";

/** A row of toggle chips. Single-select unless `multiple`. */
export function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  multiple = false,
  hideLabel = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | T[];
  onChange: (next: T | T[]) => void;
  multiple?: boolean;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
}) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  const toggle = (v: T) => {
    if (!multiple) return onChange(v);
    const list = Array.isArray(value) ? value : [];
    onChange(selected(v) ? list.filter((x) => x !== v) : [...list, v]);
  };
  return (
    <fieldset className="space-y-1.5">
      <legend className={cn("mb-1.5 text-sm font-medium", hideLabel && "sr-only")}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected(o.value)}
            onClick={() => toggle(o.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition active:scale-[0.98]",
              selected(o.value)
                ? "border-accent bg-accent-dim text-accent"
                : "border-border bg-surface-high text-text-2 hover:border-text-3/40 hover:text-text",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
