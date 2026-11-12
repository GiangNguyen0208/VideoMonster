import { msg } from "@/i18n";
import { cn } from "@/utils/cn";

export function Spinner({
  label = msg().common.loading,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-text-2", className)}>
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
