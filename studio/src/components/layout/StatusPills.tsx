import { Badge } from "@/components/ui";
import { useMonthSpend, useSession } from "@/hooks/api";
import { useT } from "@/i18n";
import { fmtMoney } from "@/utils/format";

/** Whether this tab reaches Backlot (the session call answers). */
export function ConnectionPill() {
  const t = useT();
  const session = useSession();
  if (session.isPending) return null;
  const ok = session.isSuccess;
  return (
    <Badge
      tone={ok ? "success" : "danger"}
      dot
      pulse={ok}
      title={t.app.connection}
      className="hidden xl:inline-flex"
    >
      {ok ? t.app.connected : t.app.offline}
    </Badge>
  );
}

/** Spend across all projects since the start of this month. */
export function SpendPill() {
  const t = useT();
  const spend = useMonthSpend().data;
  if (!spend) return null;
  return (
    <Badge tone="neutral" className="hidden font-mono 2xl:inline-flex">
      {t.app.monthSpend(fmtMoney(spend.spent_usd))}
    </Badge>
  );
}
