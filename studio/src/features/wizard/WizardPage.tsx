import { FormProvider } from "react-hook-form";
import { ServerDown } from "@/components/layout/ServerDown";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { StickyActionBar } from "@/components/layout/StickyActionBar";
import { Button, ComingSoon, ErrorText, Spinner, Stepper } from "@/components/ui";
import { useT } from "@/i18n";
import { ApiError } from "@/services/http";
import { errorText } from "@/utils/errors";
import { BriefStep } from "./steps/BriefStep";
import { FootageStep } from "./steps/FootageStep";
import { GoalStep } from "./steps/GoalStep";
import { LookStep } from "./steps/LookStep";
import { ReviewStep } from "./steps/ReviewStep";
import { useWizard } from "./useWizard";

/** New-video wizard: goal → (footage) → brief → look → review, then create. */
export function WizardPage() {
  const t = useT();
  const {
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
  } = useWizard();

  if (pipelines.isPending || styles.isPending) return <Spinner label={t.wizard.loadingTypes} />;
  if (pipelines.isError || styles.isError) return <ServerDown />;

  const current = t.wizard.steps[step];
  const createError =
    create.error instanceof ApiError && create.error.status === 409
      ? t.wizard.lockedError
      : errorText(create.error);

  const stepItems = steps.map((key, i) => ({
    key,
    title: t.wizard.steps[key].title,
    sub:
      i < index
        ? t.wizard.stepState.done
        : i === index
          ? t.wizard.stepState.current
          : t.wizard.stepState.next,
  }));
  const nextKey = steps[index + 1];

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <Stepper label={t.wizard.stepsLabel} steps={stepItems} current={index} />
      <PageHeader
        eyebrow={`${t.wizard.eyebrow} · ${t.wizard.stepOf(index + 1, steps.length)}`}
        title={current.title}
        description={current.intro}
      />

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

          {createError && <ErrorText>{createError}</ErrorText>}

          {step !== "goal" && (
            <StickyActionBar>
              <Button
                variant="ghost"
                leftIcon={<ArrowLeft className="size-4" />}
                onClick={() => goTo(steps[index - 1]!)}
              >
                {t.common.back}
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <ComingSoon badge={false}>
                  <span className="text-sm text-text-2" title={t.common.comingSoon}>
                    {t.wizard.saveDraft} · {t.common.comingSoon}
                  </span>
                </ComingSoon>
                {nextKey && (
                  <span className="hidden text-sm text-text-2 md:inline">
                    {t.wizard.nextUp(t.wizard.steps[nextKey].title)}
                  </span>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  loading={create.isPending}
                  rightIcon={step === "review" ? undefined : <ArrowRight className="size-4" />}
                >
                  {step === "review"
                    ? create.isPending
                      ? t.wizard.creating
                      : t.wizard.create
                    : t.common.next}
                </Button>
              </div>
            </StickyActionBar>
          )}
        </form>
      </FormProvider>
    </section>
  );
}
