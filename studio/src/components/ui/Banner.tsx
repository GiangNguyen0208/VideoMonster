import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { Tone } from "./Badge";

const banner = cva(
  "flex flex-col items-start justify-between gap-4 rounded-card border p-4 sm:flex-row sm:items-center sm:p-5",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-2",
        accent:
          "border-accent/40 bg-gradient-to-r from-accent-dim via-surface to-surface-2 shadow-glow",
        success: "border-success/40 bg-success-dim",
        danger: "border-danger/30 bg-danger-dim",
        info: "border-info/30 bg-info-dim",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/** One prominent message + optional action — "Waiting for you: …" style. */
export function Banner({
  tone = "neutral",
  title,
  icon,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(banner({ tone }), className)}>
      <div className="flex items-start gap-3.5">
        {icon && (
          <span aria-hidden className="mt-0.5 shrink-0">
            {icon}
          </span>
        )}
        <div>
          <p className="font-medium text-text">{title}</p>
          {children && <div className="mt-0.5 text-sm text-text-2">{children}</div>}
        </div>
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  );
}
