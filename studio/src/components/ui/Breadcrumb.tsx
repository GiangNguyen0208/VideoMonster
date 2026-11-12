import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "@/i18n";

/** "Library / Explain a topic / Title" trail; the last item is the current page. */
export function Breadcrumb({ items }: { items: { label: ReactNode; to?: string }[] }) {
  const t = useT();
  return (
    <nav aria-label={t.app.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-text-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-text-3">
                /
              </span>
            )}
            {it.to ? (
              <Link to={it.to} className="hover:text-text">
                {it.label}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? "page" : undefined}
                className="text-text"
              >
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
