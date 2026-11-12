import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Bottom bar that stays in view (wizard Back/Next, settings Save). */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}
