import { EmptyState } from "@/components/ui";
import { useT } from "@/i18n";
import type { ToolEvent } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmtClock } from "@/utils/format";
import { activityLines } from "./adapters";

const TONE_DOT = {
  neutral: "bg-text-3",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-info",
} as const;

export function ActivityView({ events }: { events: ToolEvent[] }) {
  const t = useT();
  const lines = activityLines(events);
  if (!lines.length) {
    return <EmptyState title={t.activity.emptyTitle}>{t.activity.emptyBody}</EmptyState>;
  }
  return (
    <ol aria-label={t.activity.listLabel} className="space-y-1.5">
      {lines.map((line, i) => (
        <li key={`${line.ts}-${i}`} className="flex items-baseline gap-3 text-sm">
          <span className="w-20 shrink-0 font-mono text-xs text-text-3">{fmtClock(line.ts)}</span>
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[line.tone])} />
          <span className={line.tone === "danger" ? "text-danger" : "text-text-2"}>
            {line.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
