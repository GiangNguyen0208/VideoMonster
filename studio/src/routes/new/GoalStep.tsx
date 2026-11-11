import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";
import { capabilityLabel } from "@/content/labels";
import { GOALS, goalText, LIKE_THIS_GOAL_ID, type Goal } from "@/content/goals";
import { useT } from "@/i18n";
import type { PipelineInfo } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Step 1 — goal cards with honest lock state, plus "make something like this". */
export function GoalStep({
  pipelines,
  checked,
  selected,
  onPick,
  onPickLikeThis,
}: {
  pipelines: Map<string, PipelineInfo>;
  checked: boolean;
  selected: string;
  onPick: (goal: Goal) => void;
  onPickLikeThis: () => void;
}) {
  const t = useT();
  const goals = GOALS.filter((g) => pipelines.size === 0 || pipelines.has(g.pipeline_type));
  return (
    <div className="space-y-6">
      {!checked && (
        <p className="text-sm text-text-3" role="status">
          {t.wizard.checkingMachine}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => {
          const info = pipelines.get(goal.pipeline_type);
          const state = info?.availability?.state;
          const locked = state === "locked";
          return (
            <li key={goal.id}>
              <GoalCard
                goal={goal}
                info={info}
                selected={selected === goal.id}
                locked={locked}
                onPick={() => onPick(goal)}
              />
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onPickLikeThis}
        aria-pressed={selected === LIKE_THIS_GOAL_ID}
        className={cn(
          "w-full rounded-card border border-dashed p-5 text-left transition",
          selected === LIKE_THIS_GOAL_ID
            ? "border-accent bg-accent-dim"
            : "border-border bg-surface hover:border-accent/60",
        )}
      >
        <span className="font-semibold">🔗 {t.wizard.likeThis.title}</span>
        <span className="mt-1 block text-sm text-text-2">{t.wizard.likeThis.body}</span>
      </button>
    </div>
  );
}

function GoalCard({
  goal,
  info,
  selected,
  locked,
  onPick,
}: {
  goal: Goal;
  info: PipelineInfo | undefined;
  selected: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  const t = useT();
  const L = t.setup;
  const text = goalText(goal);
  const availability = info?.availability;
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-semibold">
          <span aria-hidden className="mr-2">
            {goal.icon}
          </span>
          {text.title}
        </span>
        {info?.stability === "beta" && <Badge>{t.common.beta}</Badge>}
      </span>
      <span className="mt-1 block text-sm text-text-2">{text.promise}</span>
      <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-3">
        {availability?.state === "ready" && <Badge tone="success">{L.state.ready}</Badge>}
        {availability?.state === "limited" && (
          <>
            <Badge tone="info">{L.state.limited}</Badge>
            {L.betterWith(availability.missing_enhancements.map(capabilityLabel).join(", "))}
          </>
        )}
        {locked && availability && (
          <>
            <Badge>{L.state.locked}</Badge>
            {L.needs(availability.missing_required.map(capabilityLabel).join(", "))}
          </>
        )}
        {goal.footage && !goal.footage.optional && <span>{t.wizard.usesOwnFiles}</span>}
      </span>
    </>
  );

  if (locked) {
    return (
      <div className="h-full rounded-card border border-border bg-surface p-5 opacity-80">
        {body}
        <Link to="/setup" className="mt-3 inline-block text-sm text-accent underline">
          {t.wizard.unlockInSetup}
        </Link>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "h-full w-full rounded-card border p-5 text-left transition",
        selected
          ? "border-accent bg-accent-dim"
          : "border-border bg-surface hover:border-accent/60",
      )}
    >
      {body}
    </button>
  );
}
