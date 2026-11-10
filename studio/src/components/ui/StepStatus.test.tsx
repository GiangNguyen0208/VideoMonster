import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepStatus } from "./StepStatus";
import { STEP_TONES, stepLabel, type StepState } from "./stepLabels";

describe("StepStatus", () => {
  it.each(Object.keys(STEP_TONES) as StepState[])("shows plain words for %s", (state) => {
    render(<StepStatus state={state} />);
    expect(screen.getByText(stepLabel(state))).toBeInTheDocument();
    expect(screen.queryByText(state)).not.toBeInTheDocument();
  });
});
