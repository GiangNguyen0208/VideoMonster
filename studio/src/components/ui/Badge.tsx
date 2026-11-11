import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

/** Status colour. `accent` is amber — "waiting for you". */
export type Tone = "neutral" | "accent" | "success" | "danger" | "info";

const badge = cva("inline-flex items-center border font-medium whitespace-nowrap select-none", {
  variants: {
    tone: {
      neutral: "border-border bg-surface-high text-text-2",
      accent: "border-accent/30 bg-accent-dim text-accent",
      success: "border-success/30 bg-success-dim text-success",
      danger: "border-danger/30 bg-danger-dim text-danger",
      info: "border-info/30 bg-info-dim text-info",
    },
    size: {
      sm: "gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
      md: "gap-1.5 rounded-full px-2.5 py-0.5 text-xs",
    },
  },
  defaultVariants: { tone: "neutral", size: "md" },
});

const DOT: Record<Tone, string> = {
  neutral: "bg-text-3",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-info",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: "sm" | "md";
  /** Leading status dot; `pulse` animates it (live / waiting). */
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({
  tone = "neutral",
  size,
  dot,
  pulse,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badge({ tone, size }), className)} {...props}>
      {(dot || pulse) && (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", DOT[tone], pulse && "animate-pulse")}
        />
      )}
      {children}
    </span>
  );
}
