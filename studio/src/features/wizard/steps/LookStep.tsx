import { Controller, useFormContext } from "react-hook-form";
import { Lock } from "@/components/icons";
import {
  Badge,
  Card,
  ChipGroup,
  ComingSoon,
  controlClass,
  Field,
  InfoBox,
  KeyValueList,
  selectableClass,
} from "@/components/ui";
import { RUNTIME_LABELS } from "@/content/labels";
import { MusicPicker } from "@/features/music/MusicPicker";
import { useT } from "@/i18n";
import type { PipelineInfo, StyleInfo } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmtMoney } from "@/utils/format";
import { Advanced } from "../fields";
import { NumberedCard } from "../NumberedCard";
import { errorText, stylesFor, type WizardValues } from "../wizard";

/** Step 3 — look and budget, with expert options tucked under Advanced. */
export function LookStep({
  info,
  styles,
  freeOnly,
}: {
  info: PipelineInfo | undefined;
  styles: StyleInfo[];
  freeOnly: boolean;
}) {
  const t = useT();
  const L = t.wizard.look;
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<WizardValues>();
  const recommended = new Set(info?.compatible_playbooks.recommended ?? []);
  const options = stylesFor(info, styles);

  const values = watch();
  const chosenStyle = options.find((o) => o.name === values.style_playbook);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <NumberedCard n={1}>
          <Controller
            control={control}
            name="style_playbook"
            render={({ field }) => (
              <fieldset>
                <legend className="font-semibold">{L.sections.style}</legend>
                <p className="mb-3 text-sm text-text-2">{L.sections.styleBody}</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <StyleCard
                    selected={field.value === ""}
                    onSelect={() => field.onChange("")}
                    title={L.agentChooses}
                    text={L.agentChoosesBody}
                  />
                  {options.map((s) => (
                    <StyleCard
                      key={s.name}
                      selected={field.value === s.name}
                      onSelect={() => field.onChange(s.name)}
                      title={s.title}
                      text={s.best_for ?? s.mood ?? ""}
                      palette={s.palette}
                      tag={recommended.has(s.name) ? L.recommended : s.custom ? L.yours : undefined}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          />
        </NumberedCard>

        <NumberedCard n={2} title={L.sections.music}>
          <Controller
            control={control}
            name="music_track"
            render={({ field }) => (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t.music.heading}</p>
                <p className="text-xs text-text-2">{t.music.hint}</p>
                <MusicPicker value={field.value} onChange={field.onChange} />
              </div>
            )}
          />
          <ComingSoon>
            <div className="space-y-2 rounded-control border border-border-soft bg-surface-2 p-3">
              <p className="text-sm font-medium">{L.balance}</p>
              <div
                aria-hidden
                className="h-1.5 rounded-full bg-gradient-to-r from-accent to-info"
              />
              <p className="text-sm text-text-2">{L.aiMusic}</p>
            </div>
          </ComingSoon>
        </NumberedCard>

        <NumberedCard n={3} title={L.sections.budget}>
          {freeOnly ? (
            <div className="rounded-card border border-success/40 bg-success-dim px-4 py-3">
              <p className="font-medium">{L.freeTitle}</p>
              <p className="text-sm text-text-2">{L.freeBody}</p>
            </div>
          ) : (
            <Field label={L.budget} hint={L.budgetHint} error={errorText(errors.cap_usd?.message)}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  max={1000}
                  step={0.5}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors.cap_usd)}
                  className={`${controlClass} max-w-40`}
                  {...register("cap_usd", { valueAsNumber: true })}
                />
              )}
            </Field>
          )}
          <InfoBox icon={<Lock className="size-4" />}>{L.safeBudget}</InfoBox>
        </NumberedCard>

        <Advanced label={t.common.advanced}>
          <Controller
            control={control}
            name="render_runtime_preference"
            render={({ field }) => (
              <div className="space-y-1">
                <ChipGroup
                  label={L.engine}
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  options={[
                    { value: "", label: L.noPreference },
                    { value: "remotion", label: "Remotion" },
                    { value: "hyperframes", label: "HyperFrames" },
                  ]}
                />
                <p className="text-xs text-text-2">{L.engineHint}</p>
              </div>
            )}
          />
          <Controller
            control={control}
            name="composition_mode_preference"
            render={({ field }) => (
              <ChipGroup
                label={L.look}
                value={field.value}
                onChange={(v) => field.onChange(v)}
                options={[
                  { value: "", label: L.noPreference },
                  { value: "templated", label: L.lookStandard },
                  { value: "atelier", label: L.lookCustom },
                ]}
              />
            )}
          />
          <Controller
            control={control}
            name="checkpoint_policy"
            render={({ field }) => (
              <ChipGroup
                label={L.reviewPoints}
                value={field.value}
                onChange={(v) => field.onChange(v)}
                options={[
                  { value: "guided", label: L.reviewGuided },
                  { value: "manual_all", label: L.reviewAll },
                ]}
              />
            )}
          />
        </Advanced>
      </div>

      <aside className="space-y-4">
        <ComingSoon>
          <Card className="space-y-3">
            <h2 className="font-semibold">{L.preview}</h2>
            <div
              aria-hidden
              className="mx-auto aspect-[9/16] w-44 rounded-card border border-border bg-gradient-to-b from-surface-high to-surface-lowest"
            />
          </Card>
        </ComingSoon>
        <Card>
          <h2 className="mb-2 font-semibold">{L.recipe}</h2>
          <KeyValueList
            items={[
              { label: L.recipeRows.style, value: chosenStyle?.title ?? L.agentChooses },
              { label: L.recipeRows.music, value: values.music_track || L.noMusic },
              {
                label: L.recipeRows.engine,
                value: values.render_runtime_preference
                  ? RUNTIME_LABELS[values.render_runtime_preference]
                  : L.noPreference,
              },
              {
                label: L.recipeRows.reviews,
                value: values.checkpoint_policy === "manual_all" ? L.reviewAll : L.reviewGuided,
              },
              {
                label: L.recipeRows.budget,
                value: freeOnly ? L.recipeFree : fmtMoney(values.cap_usd),
              },
            ]}
          />
        </Card>
      </aside>
    </div>
  );
}

function StyleCard({
  selected,
  onSelect,
  title,
  text,
  palette,
  tag,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  text: string;
  palette?: string[];
  tag?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "h-full rounded-card border p-4 text-left transition active:scale-[0.995]",
        selectableClass(selected),
      )}
    >
      {palette && palette.length > 0 && (
        <span className="mb-3 flex h-6 overflow-hidden rounded-control" aria-hidden>
          {palette.map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </span>
      )}
      <span className="flex items-center justify-between gap-2 font-medium">
        {title}
        {tag && (
          <Badge tone="accent" size="sm">
            {tag}
          </Badge>
        )}
      </span>
      <span className="mt-1 block text-sm text-text-2">{text}</span>
    </button>
  );
}
