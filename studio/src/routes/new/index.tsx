import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Spinner } from "@/components/ui";
import { goalById, LIKE_THIS_GOAL_ID, type Goal } from "@/content/goals";
import { fileIssue } from "@/features/uploads/media";
import { enqueueUploads } from "@/features/uploads/uploadStore";
import {
  ApiError,
  useCreateProject,
  usePipelines,
  useSetup,
  useStyles,
  useUploadLimits,
  type PipelineInfo,
} from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { ServerDown } from "../ServerDown";
import { BriefStep } from "./BriefStep";
import { FootageStep } from "./FootageStep";
import { GoalStep } from "./GoalStep";
import { LookStep } from "./LookStep";
import { ReviewStep } from "./ReviewStep";
import {
  footageProblem,
  initialValues,
  presetFor,
  skipsFootage,
  STEP_FIELDS,
  stepsFor,
  toIntake,
  wizardSchema,
  type StagedFile,
  type StepKey,
  type WizardValues,
} from "./wizard";

const FALLBACK_BUDGET_USD = 2;

export function NewVideoPage() {
  const t = useT();
  const pipelines = usePipelines();
  const styles = useStyles();
  const { view: setup } = useSetup();
  const create = useCreateProject();
  const limits = useUploadLimits().data;
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [footageError, setFootageError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: initialValues(),
    mode: "onTouched",
  });
  const goal = useWatch({ control: form.control, name: "goal" });
  const pipelineType = useWatch({ control: form.control, name: "pipeline_type" });

  const byName = useMemo(
    () => new Map((pipelines.data?.pipelines ?? []).map((p) => [p.name, p])),
    [pipelines.data],
  );
  const freeOnly = setup?.tier === "zero_key";

  const steps = stepsFor(goal);
  const requested = params.get("step") as StepKey | null;
  const step: StepKey = goal && requested && steps.includes(requested) ? requested : "goal";
  const index = steps.indexOf(step);
  const goTo = (key: StepKey) => {
    setParams(key === "goal" ? {} : { step: key });
    window.scrollTo?.({ top: 0 });
  };

  const budgetFor = (info: PipelineInfo | undefined) =>
    info?.budget_default_usd ?? pipelines.data?.defaults.total_usd ?? FALLBACK_BUDGET_USD;

  const pickGoal = (g: Goal) => {
    if (form.getValues("goal") !== g.id) {
      setStaged([]);
      setFootageError(null);
      form.reset({
        ...form.getValues(),
        ...presetFor(g),
        production_mode: "",
        style_playbook: "",
        cap_usd: budgetFor(byName.get(g.pipeline_type)),
        checkpoint_policy: "guided",
        target_languages: "",
      });
    }
    goTo(stepsFor(g.id)[1]!);
  };

  const pickLikeThis = () => {
    if (form.getValues("goal") !== LIKE_THIS_GOAL_ID) {
      setStaged([]);
      const open = [...byName.values()].filter(
        (p) => p.reference_input && p.availability?.state !== "locked",
      );
      const first = open.find((p) => p.name === "animated-explainer") ?? open[0];
      form.reset({
        ...form.getValues(),
        goal: LIKE_THIS_GOAL_ID,
        pipeline_type: first?.name ?? "",
        production_mode: "",
        style_playbook: "",
        cap_usd: budgetFor(first),
      });
    }
    goTo("brief");
  };

  const next = async () => {
    if (step === "review") return;
    if (step === "footage") {
      const problem = footageProblem(form.getValues(), staged, limits);
      setFootageError(problem);
      if (problem) return;
    }
    const ok = await form.trigger(STEP_FIELDS[step]);
    if (ok) goTo(steps[index + 1]!);
  };

  const submit = form.handleSubmit((values) => {
    const intake = toIntake(freeOnly ? { ...values, cap_usd: 0 } : values);
    const accept = goalById(values.goal)?.footage?.accept ?? [];
    const files = skipsFootage(values)
      ? []
      : staged.filter((f) => !fileIssue(f.file, accept, limits)).map((f) => f.file);
    create.mutate(intake, {
      onSuccess: ({ project_id }) => {
        // Uploads keep running after navigation; the project page shows them.
        if (files.length) enqueueUploads(project_id, files);
        navigate(`/p/${encodeURIComponent(project_id)}`);
      },
    });
  });

  if (pipelines.isPending || styles.isPending) return <Spinner label={t.wizard.loadingTypes} />;
  if (pipelines.isError || styles.isError) return <ServerDown />;

  const current = t.wizard.steps[step];
  const createError =
    create.error instanceof ApiError
      ? create.error.status === 409
        ? t.wizard.lockedError
        : String(create.error.detail)
      : create.error?.message;

  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-4">
        <ol className="flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label={t.wizard.stepsLabel}>
          {steps.map((key, i) => (
            <li
              key={key}
              aria-current={key === step ? "step" : undefined}
              className={cn(key === step ? "font-medium text-accent" : "text-text-3")}
            >
              {i + 1}. {t.wizard.steps[key].title}
            </li>
          ))}
        </ol>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{current.title}</h1>
          <p className="mt-1 text-text-2">{current.intro}</p>
        </div>
      </header>

      <FormProvider {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "review") void submit(e);
            else void next();
          }}
          className="space-y-8"
          noValidate
        >
          {step === "goal" && (
            <GoalStep
              pipelines={byName}
              checked={Boolean(pipelines.data?.checked)}
              selected={goal}
              onPick={pickGoal}
              onPickLikeThis={pickLikeThis}
            />
          )}
          {step === "footage" && (
            <FootageStep
              staged={staged}
              onChange={(update) => {
                setStaged(update);
                setFootageError(null);
              }}
              problem={footageError}
            />
          )}
          {step === "brief" && <BriefStep pipelines={byName} />}
          {step === "look" && (
            <LookStep info={byName.get(pipelineType)} styles={styles.data} freeOnly={freeOnly} />
          )}
          {step === "review" && (
            <ReviewStep styles={styles.data} freeOnly={freeOnly} staged={staged} onEdit={goTo} />
          )}

          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}

          {step !== "goal" && (
            <div className="flex justify-between gap-3 border-t border-border-soft pt-6">
              <Button variant="ghost" onClick={() => goTo(steps[index - 1]!)}>
                {t.common.back}
              </Button>
              <Button type="submit" variant="primary" disabled={create.isPending}>
                {step === "review"
                  ? create.isPending
                    ? t.wizard.creating
                    : t.wizard.create
                  : t.common.next}
              </Button>
            </div>
          )}
        </form>
      </FormProvider>
    </section>
  );
}
