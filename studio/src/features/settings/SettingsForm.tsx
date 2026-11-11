import { useState } from "react";
import {
  Button,
  Card,
  ComingSoon,
  ErrorText,
  Field,
  InfoBox,
  MoneyInput,
  SelectableCard,
  Select as SelectInput,
  Spinner,
} from "@/components/ui";
import { StickyActionBar } from "@/components/layout/StickyActionBar";
import { useT } from "@/i18n";
import { useSaveSettings, useSettings } from "@/hooks/api";
import { ApiError } from "@/services";
import type { SettingsView, StudioSettings } from "@/types/api";
import { fieldErrors } from "@/utils/errors";
import { Terminal } from "@/components/icons";
import { fmtMoney, fmtResolution } from "@/utils/format";

/** Spending limits, review policy and output defaults (writes config.yaml). */
export function SettingsForm() {
  const view = useSettings();
  const t = useT();
  if (view.isPending) return <Spinner label={t.settings.loading} />;
  if (view.isError || !view.data) {
    return <p className="text-sm text-danger">{t.settings.loadError}</p>;
  }
  return <Form view={view.data} />;
}

function Form({ view }: { view: SettingsView }) {
  const t = useT();
  const L = t.settings;
  const save = useSaveSettings();
  const [v, setV] = useState<StudioSettings>(view.settings);
  const [saved, setSaved] = useState(false);
  const bad = fieldErrors(save.error);
  const set = <S extends keyof StudioSettings>(section: S, patch: Partial<StudioSettings[S]>) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  };
  const money = (n: number) =>
    Number.isFinite(n) && n >= 0 && n <= 10000 ? null : L.errors.amount;
  const clientErrors = {
    "budget.total_usd": money(v.budget.total_usd),
    "budget.single_action_approval_usd": money(v.budget.single_action_approval_usd),
  };
  const errorFor = (key: keyof typeof clientErrors | string) =>
    (clientErrors as Record<string, string | null>)[key] ??
    (bad.has(key) ? L.errors.invalid : null);
  const hasClientErrors = Object.values(clientErrors).some(Boolean);
  const dirty = JSON.stringify(v) !== JSON.stringify(view.settings);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasClientErrors) return;
        save.mutate(v, { onSuccess: () => setSaved(true) });
      }}
      noValidate
    >
      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">{L.spending.title}</h2>
          <p className="text-sm text-text-2">{L.spending.intro}</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{L.spending.mode}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["observe", "warn", "cap"] as const).map((m) => (
              <SelectableCard
                key={m}
                selected={v.budget.mode === m}
                aria-label={t.cost.modes[m]!.title}
                aria-describedby={`mode-${m}`}
                onClick={() => set("budget", { mode: m })}
              >
                <span className="font-medium">{t.cost.modes[m]!.title}</span>
                <span id={`mode-${m}`} className="text-xs text-text-2">
                  {t.cost.modes[m]!.body}
                </span>
              </SelectableCard>
            ))}
          </div>
        </fieldset>
        <MoneyField
          label={L.spending.total}
          hint={L.spending.totalHint}
          value={v.budget.total_usd}
          error={errorFor("budget.total_usd")}
          onChange={(total_usd) => set("budget", { total_usd })}
        />
        <MoneyField
          label={L.spending.singleAction(fmtMoney(v.budget.single_action_approval_usd))}
          hint={L.spending.singleActionHint}
          value={v.budget.single_action_approval_usd}
          error={errorFor("budget.single_action_approval_usd")}
          onChange={(single_action_approval_usd) => set("budget", { single_action_approval_usd })}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-accent"
            checked={v.budget.require_approval_for_new_paid_tool}
            onChange={(e) =>
              set("budget", { require_approval_for_new_paid_tool: e.target.checked })
            }
          />
          {L.spending.newTool}
        </label>
      </Card>

      <Card className="space-y-5">
        <div>
          <h2 className="font-semibold">{L.defaults.title}</h2>
          <p className="text-sm text-text-2">{L.defaults.intro}</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{L.defaults.review}</legend>
          <div className="space-y-2">
            {(["guided", "manual_all", "auto_noncreative"] as const).map((p) => (
              <SelectableCard
                key={p}
                selected={v.checkpoint.policy === p}
                onClick={() => set("checkpoint", { policy: p })}
                className="py-3"
              >
                <span className="font-medium">{L.defaults.policies[p]}</span>
              </SelectableCard>
            ))}
          </div>
        </fieldset>
        <Select
          label={L.defaults.resolution}
          engineTerm="output.default_resolution"
          value={v.output.default_resolution}
          error={errorFor("output.default_resolution")}
          onChange={(default_resolution) => set("output", { default_resolution })}
          options={view.choices.resolutions.map((r) => ({
            value: r,
            label: `${fmtResolution(r)}${L.defaults.shapes[r] ? ` — ${L.defaults.shapes[r]}` : ""}`,
          }))}
        />
        <Select
          label={L.defaults.fps}
          engineTerm="output.default_fps"
          value={String(v.output.default_fps)}
          error={errorFor("output.default_fps")}
          onChange={(fps) => set("output", { default_fps: Number(fps) })}
          options={view.choices.fps.map((f) => ({
            value: String(f),
            label: L.defaults.fpsValue(f),
          }))}
        />
      </Card>

      <InfoBox icon={<Terminal className="size-4" />}>
        <span className="font-mono text-xs">{L.keyMapping}</span>
      </InfoBox>
      <p className="text-xs text-text-3">{L.footnote}</p>

      <StickyActionBar>
        <div aria-live="polite" className="text-sm">
          {saved && !dirty && (
            <p role="status" className="text-success">
              {L.saved}
            </p>
          )}
          {save.isError && bad.size === 0 && (
            <ErrorText>
              {save.error instanceof ApiError && save.error.status === 403
                ? L.errors.locked
                : L.errors.save}
            </ErrorText>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ComingSoon inline>
            <Button variant="ghost">{L.restoreDefaults}</Button>
          </ComingSoon>
          <Button
            variant="secondary"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setV(view.settings);
              setSaved(false);
              save.reset();
            }}
          >
            {L.discard}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={save.isPending || !dirty || hasClientErrors}
          >
            {save.isPending ? L.saving : L.save}
          </Button>
        </div>
      </StickyActionBar>
    </form>
  );
}

function MoneyField({
  label,
  hint,
  value,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  error: string | null;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <MoneyInput
          id={id}
          type="number"
          min={0}
          step={0.5}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)}
        />
      )}
    </Field>
  );
}

function Select({
  label,
  engineTerm,
  value,
  error,
  options,
  onChange,
}: {
  label: string;
  engineTerm: string;
  value: string;
  error: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Field
      label={
        <span
          title={engineTerm}
          className="cursor-help underline decoration-dotted underline-offset-4"
        >
          {label}
        </span>
      }
      error={error}
    >
      {({ id, describedBy }) => (
        <SelectInput
          id={id}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  );
}
