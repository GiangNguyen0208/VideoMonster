import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { Info } from "@/components/icons";
import { Card, controlClass, Field, InfoBox } from "@/components/ui";
import { goalById, LIKE_THIS_GOAL_ID, PLATFORMS, toneLabel } from "@/content/goals";
import { videoTypeLabel } from "@/content/labels";
import { useLocale, useT } from "@/i18n";
import { useMusic } from "@/hooks/api";
import type { StyleInfo } from "@/types/api";
import { fmtBytes, fmtMoney } from "@/utils/format";
import {
  deriveTitle,
  goalTitle,
  skipsFootage,
  splitList,
  type StagedFile,
  type StepKey,
  type WizardValues,
} from "../wizard";

/** Last step — every choice in plain words, with a way back to change it. */
export function ReviewStep({
  styles,
  freeOnly,
  staged,
  onEdit,
}: {
  styles: StyleInfo[];
  freeOnly: boolean;
  staged: StagedFile[];
  onEdit: (step: StepKey) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const L = t.wizard.review;
  const { register, watch } = useFormContext<WizardValues>();
  const v = watch();
  const style = styles.find((s) => s.name === v.style_playbook);
  const mustInclude = splitList(v.must_include);
  const avoid = splitList(v.avoid);
  const platform = PLATFORMS.find((p) => p.id === v.platform);
  const footage = goalById(v.goal)?.footage;
  const tracks = useMusic().data ?? [];
  const track = tracks.find((tr) => tr.name === v.music_track);
  const languages = splitList(v.target_languages);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Field label={L.title} hint={L.titleHint}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              placeholder={deriveTitle(v.topic)}
              className={controlClass}
              {...register("title")}
            />
          )}
        </Field>

        <dl className="divide-y divide-border-soft rounded-card border border-border bg-surface shadow-elev-sm">
          <Row label={L.rows.what} onEdit={() => onEdit("goal")}>
            {goalTitle(v)}
            {v.goal === LIKE_THIS_GOAL_ID && <> · {videoTypeLabel(v.pipeline_type)}</>}
          </Row>
          {footage && (
            <Row label={L.rows.footage} onEdit={() => onEdit("footage")}>
              {skipsFootage(v) ? (
                L.synthetic
              ) : (
                <>
                  {L.footageFiles(
                    staged.length,
                    fmtBytes(staged.reduce((sum, f) => sum + f.file.size, 0)),
                  )}
                  <span className="block truncate text-text-2">
                    {staged.map((f) => f.file.name).join(", ")}
                  </span>
                </>
              )}
              {languages.length > 0 && (
                <span className="block">{L.languages(languages.join(", "))}</span>
              )}
            </Row>
          )}
          {v.goal === LIKE_THIS_GOAL_ID && (
            <Row label={L.rows.likeThis} onEdit={() => onEdit("brief")}>
              <span className="break-all">{v.reference_url}</span>
              {v.reference_notes && <span className="block text-text-2">{v.reference_notes}</span>}
            </Row>
          )}
          <Row label={L.rows.about} onEdit={() => onEdit("brief")}>
            {v.topic}
            {v.audience && <span className="block text-text-2">{L.forAudience(v.audience)}</span>}
          </Row>
          <Row label={L.rows.format} onEdit={() => onEdit("brief")}>
            {platform && t.wizard.brief.platforms[platform.id]} · {platform?.aspect} ·{" "}
            {t.wizard.brief.seconds(v.duration_seconds)}
            {v.tone.length > 0 && <> · {v.tone.map(toneLabel).join(", ")}</>}
          </Row>
          {(mustInclude.length > 0 || avoid.length > 0 || v.language !== locale) && (
            <Row label={L.rows.details} onEdit={() => onEdit("brief")}>
              {mustInclude.length > 0 && (
                <span className="block">{L.include(mustInclude.join(", "))}</span>
              )}
              {avoid.length > 0 && <span className="block">{L.avoid(avoid.join(", "))}</span>}
              {v.language !== locale && <span className="block">{L.language(v.language)}</span>}
            </Row>
          )}
          <Row label={L.rows.style} onEdit={() => onEdit("look")}>
            {style ? style.title : L.agentSuggests}
          </Row>
          <Row label={L.rows.music} onEdit={() => onEdit("look")}>
            {track ? track.title : v.music_track || L.musicAgent}
          </Row>
          <Row label={L.rows.budget} onEdit={() => onEdit("look")}>
            {freeOnly ? L.free : L.upTo(fmtMoney(v.cap_usd))}
          </Row>
          <Row label={L.rows.reviewPoints} onEdit={() => onEdit("look")}>
            {v.checkpoint_policy === "manual_all" ? L.everyStep : L.keySteps}
            {v.render_runtime_preference && L.prefers(v.render_runtime_preference)}
          </Row>
        </dl>

        <p className="text-sm text-text-2">{L.footnote}</p>
      </div>
      <aside className="space-y-4">
        <Card className="space-y-3">
          <h2 className="font-semibold">{L.costTitle}</h2>
          <p className="font-mono text-lg">{freeOnly ? fmtMoney(0) : fmtMoney(v.cap_usd)}</p>
          <p className="text-sm text-text-2">
            {freeOnly ? L.costFree : L.costCap(fmtMoney(v.cap_usd))}
          </p>
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">{L.policyTitle}</h2>
          <p className="text-sm text-text-2">
            {v.checkpoint_policy === "manual_all" ? L.policyAll : L.policyKey}
          </p>
        </Card>
        <InfoBox icon={<Info className="size-4" />}>{L.agentNote}</InfoBox>
      </aside>
    </div>
  );
}

function Row({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: ReactNode;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-28 shrink-0 text-sm text-text-2">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
      <button
        type="button"
        onClick={onEdit}
        className="text-sm text-accent underline"
        aria-label={t.wizard.review.changeRow(label)}
      >
        {t.common.change}
      </button>
    </div>
  );
}
