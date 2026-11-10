import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
      <p className="text-lg font-medium text-text">{title}</p>
      {children && <div className="max-w-md text-sm text-text-2">{children}</div>}
      {action}
    </div>
  );
}
