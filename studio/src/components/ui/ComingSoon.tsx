import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { cn } from "@/utils/cn";
import { Badge } from "./Badge";

/**
 * A designed element that has no data or backend yet (backlog `E-n` in
 * STATUS.md). The content is shown dimmed and `inert`: it cannot be focused
 * or clicked, and a "Coming soon" badge says why. Never put invented numbers
 * inside; use "—".
 */
export function ComingSoon({
  children,
  className,
  badge = true,
  inline = false,
}: {
  children: ReactNode;
  className?: string;
  /** Hide the badge when a parent already shows one. */
  badge?: boolean;
  /** Small controls (buttons): the badge sits beside them instead of on top. */
  inline?: boolean;
}) {
  const t = useT();
  return (
    <div
      aria-disabled="true"
      className={cn(inline ? "flex flex-wrap items-center gap-2" : "relative", className)}
    >
      <div inert className="pointer-events-none h-full opacity-50 select-none">
        {children}
      </div>
      {badge && (
        <Badge size="sm" tone="neutral" className={inline ? undefined : "absolute top-2 right-2"}>
          {t.common.comingSoon}
        </Badge>
      )}
    </div>
  );
}
