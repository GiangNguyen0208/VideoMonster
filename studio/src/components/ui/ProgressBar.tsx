import { cn } from "@/utils/cn";
import type { Tone } from "./Badge";

const FILL: Record<Tone, string> = {
  neutral: "bg-text-3",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-info",
};

/** Thin progress bar; `value` is 0..1. */
export function ProgressBar({
  value,
  label,
  tone = "accent",
  className,
}: {
  value: number;
  /** Accessible name, e.g. "3 of 8 steps". */
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
