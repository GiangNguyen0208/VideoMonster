import { ComingSoon, StatCard } from "@/components/ui";
import { Activity, Clock, Film, Wallet } from "@/components/icons";
import { useT } from "@/i18n";
import { useMonthSpend } from "@/hooks/api";
import type { ProjectSummary } from "@/types/api";
import { fmtMoney } from "@/utils/format";
import { statusFilterOf } from "./filters";

/** Four numbers computed from the project list and the month's spend. */
export function LibraryStats({ projects }: { projects: ProjectSummary[] }) {
  const t = useT();
  const L = t.library.stats;
  const month = useMonthSpend().data;
  const count = (s: ReturnType<typeof statusFilterOf>) =>
    projects.filter((p) => statusFilterOf(p) === s).length;
  const live = projects.filter((p) => p.live).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Wallet className="size-5" />}
        label={L.monthSpend}
        value={month ? fmtMoney(month.spent_usd) : "—"}
        hint={month ? L.acrossVideos(month.projects) : undefined}
      />
      <StatCard
        icon={<Film className="size-5" />}
        label={L.videos}
        value={projects.length}
        hint={L.breakdown(count("done"), count("active"))}
      />
      <StatCard
        icon={<Activity className="size-5" />}
        label={L.waiting}
        value={count("waiting")}
        hint={L.live(live)}
      />
      <ComingSoon className="h-full">
        <StatCard
          icon={<Clock className="size-5" />}
          label={L.rendered}
          value="—"
          className="h-full"
        />
      </ComingSoon>
    </div>
  );
}
