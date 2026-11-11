import { Controller, useFormContext } from "react-hook-form";
import {
  DURATIONS,
  goalById,
  goalText,
  LIKE_THIS_GOAL_ID,
  PLATFORMS,
  TONES,
  toneLabel,
} from "@/content/goals";
import type { ReactNode } from "react";
import { Wand2 } from "@/components/icons";
import {
  Badge,
  ButtonLink,
  Card,
  ChipGroup,
  ComingSoon,
  controlClass,
  Field,
  Screenplay,
} from "@/components/ui";
import { videoTypeLabel } from "@/content/labels";
import { useT } from "@/i18n";
import type { PipelineInfo } from "@/types/api";
import { newVideoPath } from "@/utils/routes";
import { Advanced } from "../fields";
import { NumberedCard } from "../NumberedCard";
import { errorText, type WizardValues } from "../wizard";

/** Step 2 — what the video is about. Fields adapt to the chosen goal. */
export function BriefStep({ pipelines }: { pipelines: Map<string, PipelineInfo> }) {
  const t = useT();
  const L = t.wizard.brief;
  const R = t.wizard.likeThis;
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<WizardValues>();
  const goalId = watch("goal");
  const pipelineType = watch("pipeline_type");
  const duration = watch("duration_seconds");
  const goal = goalById(goalId);
  const examples = goal ? goalText(goal).examples : [];
  const likeThis = goalId === LIKE_THIS_GOAL_ID;
  // Footage goals choose their mode on the footage step.
  const modes = goal?.footage?.optional
    ? []
    : (pipelines.get(pipelineType)?.production_modes ?? []);
  const referenceTypes = [...pipelines.values()].filter(
    (p) => p.reference_input && p.availability?.state !== "locked",
  );

  let n = 0;
  const block = (children: ReactNode) => <NumberedCard n={++n}>{children}</NumberedCard>;

  return (
    <div className="space-y-6">
      {goal && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm">
          <span aria-hidden className="text-xl">
            {goal.icon}
          </span>
          <span className="text-text-2">{t.wizard.chosenGoal}:</span>
          <span className="font-medium">{goalText(goal).title}</span>
          <Badge size="sm">{t.wizard.goalCard.about(goal.preset.duration_seconds)}</Badge>
          <ButtonLink to={newVideoPath()} variant="ghost" size="sm" className="ml-auto">
            {t.wizard.changeGoal}
          </ButtonLink>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {likeThis && (
            <div className="space-y-5 rounded-card border border-accent/30 bg-surface p-5">
              <Field
                label={R.link}
                hint={R.linkHint}
                error={errorText(errors.reference_url?.message)}
              >
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors.reference_url)}
                    className={controlClass}
                    {...register("reference_url")}
                  />
                )}
              </Field>
              <Field label={R.keep} hint={R.keepHint}>
                {({ id }) => (
                  <textarea
                    id={id}
                    rows={2}
                    className={controlClass}
                    placeholder={R.keepPlaceholder}
                    {...register("reference_notes")}
                  />
                )}
              </Field>
              <Field label={R.kind}>
                {({ id }) => (
                  <select id={id} className={controlClass} {...register("pipeline_type")}>
                    {referenceTypes.map((p) => (
                      <option key={p.name} value={p.name}>
                        {videoTypeLabel(p.name)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          )}

          {block(
            <>
              <Field
                label={likeThis ? L.topicLikeThis : L.topic}
                error={errorText(errors.topic?.message)}
              >
                {({ id, describedBy }) => (
                  <textarea
                    id={id}
                    rows={3}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors.topic)}
                    className={controlClass}
                    placeholder={examples[0] ?? L.topicPlaceholder}
                    {...register("topic")}
                  />
                )}
              </Field>
              {examples.length > 0 && (
                <div className="-mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-text-3">{L.try}</span>
                  {examples.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setValue("topic", ex, { shouldValidate: true })}
                      className="rounded-full border border-border-soft px-3 py-1 text-text-2 hover:text-text"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </>,
          )}

          {modes.length > 0 &&
            block(
              <Controller
                control={control}
                name="production_mode"
                render={({ field }) => (
                  <ChipGroup
                    label={L.productionMode}
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    options={[
                      { value: "", label: L.agentChooses },
                      ...modes.map((m) => ({
                        value: m.name,
                        label: L.productionModes[m.name] ?? m.description,
                      })),
                    ]}
                  />
                )}
              />,
            )}

          {block(
            <Field label={L.audience} hint={L.audienceHint}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  className={controlClass}
                  {...register("audience")}
                />
              )}
            </Field>,
          )}

          {block(
            <Controller
              control={control}
              name="platform"
              render={({ field }) => (
                <ChipGroup
                  label={L.platform}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  options={PLATFORMS.map((p) => ({
                    value: p.id,
                    label: `${L.platforms[p.id]} (${p.aspect})`,
                  }))}
                />
              )}
            />,
          )}

          {block(
            <div className="space-y-2">
              <Controller
                control={control}
                name="duration_seconds"
                render={({ field }) => (
                  <ChipGroup
                    label={L.length}
                    value={DURATIONS.includes(field.value) ? field.value : -1}
                    onChange={(v) =>
                      field.onChange(
                        v !== -1 ? v : DURATIONS.includes(field.value) ? 45 : field.value,
                      )
                    }
                    options={[
                      ...DURATIONS.map((d) => ({ value: d, label: L.seconds(d) })),
                      { value: -1, label: L.custom },
                    ]}
                  />
                )}
              />
              {!DURATIONS.includes(duration) && (
                <Field
                  label={L.lengthInSeconds}
                  error={errorText(errors.duration_seconds?.message)}
                >
                  {({ id, describedBy }) => (
                    <input
                      id={id}
                      type="number"
                      min={5}
                      max={3600}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(errors.duration_seconds)}
                      className={`${controlClass} max-w-40`}
                      {...register("duration_seconds", { valueAsNumber: true })}
                    />
                  )}
                </Field>
              )}
            </div>,
          )}

          {block(
            <Controller
              control={control}
              name="tone"
              render={({ field }) => (
                <ChipGroup
                  label={L.tone}
                  multiple
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  options={[...new Set([...TONES, ...field.value])].map((id) => ({
                    value: id,
                    label: toneLabel(id),
                  }))}
                />
              )}
            />,
          )}

          <Advanced label={t.common.advanced}>
            <Field label={L.mustInclude} hint={L.listHint}>
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  rows={2}
                  aria-describedby={describedBy}
                  className={controlClass}
                  {...register("must_include")}
                />
              )}
            </Field>
            <Field label={L.avoid} hint={L.listHint}>
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  rows={2}
                  aria-describedby={describedBy}
                  className={controlClass}
                  {...register("avoid")}
                />
              )}
            </Field>
            <Field label={L.language} hint={L.languageHint}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  className={`${controlClass} max-w-40`}
                  {...register("language")}
                />
              )}
            </Field>
          </Advanced>
        </div>

        <aside className="space-y-4">
          <ComingSoon>
            <Card className="space-y-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <Wand2 className="size-4 text-accent" aria-hidden />
                {t.wizard.assistant.title}
              </h2>
              <p className="text-sm text-text-2">{t.wizard.assistant.body}</p>
            </Card>
          </ComingSoon>
          <ComingSoon>
            <Screenplay title={t.wizard.assistant.draft} meta="—">
              <div aria-hidden className="space-y-2.5">
                <div className="h-3 w-1/3 rounded bg-cream-ink/15" />
                <div className="h-3 w-full rounded bg-cream-ink/10" />
                <div className="h-3 w-5/6 rounded bg-cream-ink/10" />
                <div className="h-3 w-1/3 rounded bg-cream-ink/15" />
                <div className="h-3 w-full rounded bg-cream-ink/10" />
              </div>
            </Screenplay>
          </ComingSoon>
        </aside>
      </div>
    </div>
  );
}
