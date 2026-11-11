import { useId, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/** A titled page region (`<section aria-labelledby>`), with optional intro and action. */
export function Section({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-lg font-semibold tracking-tight text-text">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-text-2">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
