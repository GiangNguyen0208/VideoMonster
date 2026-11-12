import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { selectableClass } from "./controlClass";

/**
 * An option shown as a card (goal, style, tone, budget mode). A toggle
 * button: `aria-pressed` carries the selection, like `ChipGroup`.
 */
export function SelectableCard({
  selected,
  badge,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; badge?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "relative flex w-full flex-col items-start gap-1 rounded-card border p-4 text-left transition active:scale-[0.995]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        selectableClass(selected),
        className,
      )}
      {...props}
    >
      {badge && <span className="absolute -top-2.5 right-3">{badge}</span>}
      {children}
    </button>
  );
}

/** Compact single-choice control ("15 s · 30 s · 60 s"). */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("grid auto-cols-fr grid-flow-col gap-2", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 rounded-control border px-3 text-sm font-medium transition",
              selectableClass(selected),
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
