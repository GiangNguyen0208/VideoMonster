import { useId, type ReactNode } from "react";

export { ChipGroup } from "@/components/ui";

export const inputClass =
  "w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-text-3 aria-invalid:border-danger";

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-text-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Collapsed "Advanced" section — progressive disclosure for expert options. */
export function Advanced({ children, label }: { children: ReactNode; label: string }) {
  return (
    <details className="group rounded-card border border-border-soft bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-text-2 group-open:mb-4">
        {label}
      </summary>
      <div className="space-y-5">{children}</div>
    </details>
  );
}
