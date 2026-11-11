import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Divided list in a bordered box (files, tracks, renders, decisions). */
export function ListBox({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn(
        "divide-y divide-border-soft rounded-card border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** Quiet note box (agent self-review, reference insights, hints). */
export function InfoBox({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-control border border-border-soft bg-surface-2 px-4 py-3 text-sm text-text-2",
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="mt-0.5 shrink-0 text-text-3">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Progressive disclosure ("Advanced", "All providers"). */
export function Collapsible({
  label,
  meta,
  defaultOpen,
  className,
  children,
}: {
  label: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rounded-card border border-border-soft bg-surface px-4 py-3", className)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-text-2 group-open:mb-4">
        <span>{label}</span>
        {meta && <span className="text-xs text-text-3">{meta}</span>}
      </summary>
      <div className="space-y-5">{children}</div>
    </details>
  );
}

/** One figure with a label ("$0.35 this month"). */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-border bg-surface p-4",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-dim text-accent"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xl font-semibold text-text">{value}</p>
        <p className="text-xs text-text-2">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-text-3">{hint}</p>}
      </div>
    </div>
  );
}

/** Label/value rows (production recipe, render facts). */
export function KeyValueList({
  items,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border-soft text-sm", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-text-2">{it.label}</dt>
          <dd className="text-right font-mono text-text">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Cream "paper" for scripts and screenplay excerpts (Courier Prime). */
export function Screenplay({
  title,
  meta,
  className,
  children,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card bg-cream px-6 py-5 font-screenplay text-[15px] leading-relaxed text-cream-ink shadow-elev-md",
        className,
      )}
    >
      {(title || meta) && (
        <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-cream-ink/15 pb-2">
          {title && <p className="font-bold tracking-wider uppercase">{title}</p>}
          {meta && <p className="text-xs tracking-wide uppercase opacity-60">{meta}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
