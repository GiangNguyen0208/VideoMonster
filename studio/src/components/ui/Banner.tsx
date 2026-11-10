import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "./Badge";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-surface-2",
  accent: "border-accent/40 bg-accent-dim",
  success: "border-success/40 bg-success-dim",
  danger: "border-danger/40 bg-danger-dim",
  info: "border-info/40 bg-info-dim",
};

/** One prominent message + optional action — "Waiting for you: …" style. */
export function Banner({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3",
        TONES[tone],
      )}
    >
      <div>
        <p className="font-medium text-text">{title}</p>
        {children && <div className="mt-0.5 text-sm text-text-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}
