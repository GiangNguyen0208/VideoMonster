import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui";
import { useT } from "@/i18n";

export function NotFoundPage() {
  const t = useT();
  return (
    <EmptyState
      title={t.errors.notFoundTitle}
      action={
        <Link to="/" className="text-accent underline">
          {t.errors.backHome}
        </Link>
      }
    >
      {t.errors.notFoundBody}
    </EmptyState>
  );
}
