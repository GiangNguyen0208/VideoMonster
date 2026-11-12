import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { goalById, LIKE_THIS_GOAL_ID, type Goal } from "@/content/goals";
import { fileIssue } from "@/features/uploads/media";
import { enqueueUploads } from "@/features/uploads/uploadStore";
import { useCreateProject, usePipelines, useSetup, useStyles, useUploadLimits } from "@/hooks/api";
import type { PipelineInfo } from "@/types/api";
import { projectPath } from "@/utils/routes";
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

/**
 * Wizard state and actions: the form, the URL-driven step, goal switching
 * (which resets goal-specific answers), footage staging and project creation.
 */
export function useWizard() {
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
        navigate(projectPath(project_id));
      },
    });
  });

  return {
    form,
    pipelines,
    styles,
    create,
    byName,
    freeOnly,
    goal,
    pipelineType,
    steps,
    step,
    index,
    goTo,
    pickGoal,
    pickLikeThis,
    next,
    submit,
    staged,
    setStaged,
    footageError,
    setFootageError,
  };
}
