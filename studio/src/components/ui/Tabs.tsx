import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  /** Small count or note after the label (e.g. number of scenes). */
  badge?: ReactNode;
}

/** Accessible tabs (WAI-ARIA pattern: arrow keys move between tabs). */
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = items.find((t) => t.id === value) ?? items[0];

  const onKeyDown = (e: KeyboardEvent) => {
    const index = items.findIndex((t) => t.id === active?.id);
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = items[(index + delta + items.length) % items.length];
    if (next) {
      onChange(next.id);
      refs.current[next.id]?.focus();
    }
  };

  return (
    <div>
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {items.map((tab) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition",
                selected
                  ? "border-accent font-semibold text-text"
                  : "border-transparent text-text-2 hover:text-text",
              )}
            >
              {tab.label}
              {tab.badge != null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 font-mono text-[11px]",
                    selected ? "bg-accent-dim text-accent" : "bg-surface-2 text-text-3",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          className="pt-4"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
