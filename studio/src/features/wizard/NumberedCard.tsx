import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/** A numbered wizard block ("1 · What is the video about?"). */
export function NumberedCard({
  n,
  title,
  children,
}: {
  n: number;
  /** Optional heading; field labels act as the heading when omitted. */
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex gap-4">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-dim text-xs font-semibold text-accent"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {title && <h2 className="font-semibold">{title}</h2>}
        {children}
      </div>
    </Card>
  );
}
