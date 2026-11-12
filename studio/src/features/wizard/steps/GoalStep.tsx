import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Link2, Lock } from "@/components/icons";
import { Badge, ChipGroup, ComingSoon, Screenplay } from "@/components/ui";
import { capabilityLabel } from "@/content/labels";
import {
  GOAL_CATEGORIES,
  GOALS,
  goalText,
  LIKE_THIS_GOAL_ID,
  PLATFORMS,
  type Goal,
  type GoalCategory,
} from "@/content/goals";
import { useT } from "@/i18n";
import type { PipelineInfo } from "@/types/api";
import { cn } from "@/utils/cn";

/** Gradient "poster" per category — art without bitmap assets. */
const ART: Record<GoalCategory, string> = {
  visual: "from-accent/35 via-surface-high to-info/25",
  story: "from-danger/30 via-surface-high to-accent/25",
  footage: "from-success/30 via-surface-high to-info/20",
  tech: "from-info/35 via-surface-high to-success/20",
};

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
  const [category, setCategory] = useState<GoalCategory | "all">("all");
  const available = GOALS.filter((g) => pipelines.size === 0 || pipelines.has(g.pipeline_type));
  const goals = available.filter((g) => category === "all" || g.category === category);
  const count = (c: GoalCategory | "all") =>
    c === "all" ? available.length : available.filter((g) => g.category === c).length;
  const C = t.wizard.categories;

  return (
    <div className="space-y-6">
      {!checked && (
        <p className="text-sm text-text-2" role="status">
          {t.wizard.checkingMachine}
        </p>
      )}
      <ChipGroup
        label={C.label}
        value={category}
        onChange={(v) => setCategory(v as GoalCategory | "all")}
        options={(["all", ...GOAL_CATEGORIES] as const).map((c) => ({
          value: c,
          label: `${C[c]} (${count(c)})`,
        }))}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => {
          const info = pipelines.get(goal.pipeline_type);
          return (
            <li key={goal.id}>
              <GoalCard
                goal={goal}
                info={info}
                selected={selected === goal.id}
                locked={info?.availability?.state === "locked"}
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
          "flex w-full flex-wrap items-center justify-between gap-4 rounded-card border-2 border-dashed p-5 text-left transition",
          selected === LIKE_THIS_GOAL_ID
            ? "border-accent bg-accent-dim"
            : "border-accent/30 bg-surface-lowest hover:border-accent/60",
        )}
      >
        <span className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-dim text-accent"
          >
            <Link2 className="size-5" />
          </span>
          <span>
            <span className="block font-semibold">{t.wizard.likeThis.title}</span>
            <span className="mt-1 block max-w-2xl text-sm text-text-2">
              {t.wizard.likeThis.body}
            </span>
          </span>
        </span>
        <ArrowRight aria-hidden className="size-5 text-accent" />
      </button>

      <ComingSoon>
        <section className="space-y-3 rounded-card border border-border bg-surface p-5">
          <h2 className="font-semibold">{t.wizard.scriptPreview}</h2>
          <Screenplay meta="—">
            <div aria-hidden className="space-y-2.5">
              <div className="h-3 w-1/3 rounded bg-cream-ink/15" />
              <div className="h-3 w-full rounded bg-cream-ink/10" />
              <div className="h-3 w-5/6 rounded bg-cream-ink/10" />
              <div className="mx-auto h-3 w-1/4 rounded bg-cream-ink/15" />
              <div className="mx-auto h-3 w-2/3 rounded bg-cream-ink/10" />
            </div>
          </Screenplay>
        </section>
      </ComingSoon>
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
  const platform = PLATFORMS.find((p) => p.id === goal.preset.platform);

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "relative flex h-28 items-center justify-center rounded-control bg-gradient-to-br text-5xl",
          ART[goal.category],
        )}
      >
        {goal.icon}
        <span className="absolute top-2 left-2 flex gap-1.5">
          {availability?.state === "ready" && (
            <Badge tone="success" dot>
              {L.state.ready}
            </Badge>
          )}
          {availability?.state === "limited" && (
            <Badge tone="info" dot>
              {L.state.limited}
            </Badge>
          )}
          {locked && (
            <Badge tone="danger">
              <Lock className="size-3" />
              {L.state.locked}
            </Badge>
          )}
        </span>
        {info?.stability === "beta" && (
          <Badge className="absolute top-2 right-2">{t.common.beta}</Badge>
        )}
      </span>
      <span className="mt-4 block font-semibold text-text">{text.title}</span>
      <span className="mt-1 block text-sm text-text-2">{text.promise}</span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        <Badge size="sm">{t.wizard.goalCard.about(goal.preset.duration_seconds)}</Badge>
        {platform && (
          <Badge size="sm">
            {t.wizard.brief.platforms[platform.id]} · {platform.aspect}
          </Badge>
        )}
      </span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3 text-xs text-text-2">
        {availability?.state === "limited" && (
          <span>
            {L.betterWith(availability.missing_enhancements.map(capabilityLabel).join(", "))}
          </span>
        )}
        {locked && availability && (
          <span>{L.needs(availability.missing_required.map(capabilityLabel).join(", "))}</span>
        )}
        {goal.footage && !goal.footage.optional && <span>{t.wizard.usesOwnFiles}</span>}
        {!locked && (
          <span className="ml-auto font-medium text-text">
            {selected ? t.wizard.goalCard.selected : t.wizard.goalCard.choose}
          </span>
        )}
      </span>
    </>
  );

  const frame = "flex h-full w-full flex-col rounded-card border p-3 pb-4 text-left transition";
  if (locked) {
    return (
      <div className={cn(frame, "border-border bg-surface opacity-80")}>
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
        frame,
        "active:scale-[0.995]",
        selected
          ? "border-accent bg-surface-low shadow-glow ring-1 ring-accent/30"
          : "border-border bg-surface hover:border-accent/40 hover:bg-surface-bright",
      )}
    >
      {selected && (
        <Badge tone="accent" size="sm" className="absolute -mt-5 ml-auto self-end">
          <CheckCircle2 className="size-3" />
          {t.wizard.goalCard.selected}
        </Badge>
      )}
      {body}
    </button>
  );
}
