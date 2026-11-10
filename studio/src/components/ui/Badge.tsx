import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "success" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-text-2",
  accent: "bg-accent-dim text-accent",
  success: "bg-success-dim text-success",
  danger: "bg-danger-dim text-danger",
  info: "bg-info-dim text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
