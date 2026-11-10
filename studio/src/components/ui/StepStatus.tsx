import { useT } from "@/i18n";
import { Badge } from "./Badge";
import { STEP_TONES, type StepState } from "./stepLabels";

export function StepStatus({ state }: { state: StepState }) {
  const t = useT();
  return <Badge tone={STEP_TONES[state]}>{t.steps.state[state]}</Badge>;
}
