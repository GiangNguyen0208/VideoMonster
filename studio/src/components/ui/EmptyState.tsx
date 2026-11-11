import type { ReactNode } from "react";

export function EmptyState({
  title,
  icon,
  children,
  action,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface-lowest/60 px-6 py-12 text-center">
      {icon && (
        <span aria-hidden className="text-text-3 [&_svg]:size-10">
          {icon}
        </span>
      )}
      <p className="text-lg font-semibold text-text">{title}</p>
      {children && <div className="max-w-md text-sm text-text-2">{children}</div>}
      {action}
    </div>
  );
}
