import type { ElementType, ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Small uppercase label above a value or block ("History", "Scene plan"). */
export function Eyebrow({
  as: Tag = "p",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("text-xs font-medium tracking-wide text-text-3 uppercase", className)}>
      {children}
    </Tag>
  );
}
