import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setLocale } from "@/i18n";
import {
  ComingSoon,
  CopyButton,
  Field,
  Input,
  ProgressBar,
  ProgressSteps,
  SegmentedControl,
  SelectableCard,
  Stepper,
} from "./index";

describe("Field", () => {
  it("labels the control and describes it with the hint and the error", () => {
    render(
      <Field label="Budget" hint="Per video" error="Too high">
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} />}
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Budget" });
    expect(input).toHaveAccessibleDescription("Per video Too high");
    expect(screen.getByRole("alert")).toHaveTextContent("Too high");
  });
});

describe("SelectableCard and SegmentedControl", () => {
  it("expose the selection with aria-pressed", async () => {
    const onClick = vi.fn();
    render(
      <>
        <SelectableCard selected onClick={onClick}>
          Warn me
        </SelectableCard>
        <SelectableCard selected={false}>Hard limit</SelectableCard>
      </>,
    );
    expect(screen.getByRole("button", { name: "Warn me" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hard limit" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "Warn me" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("segments call back with the picked value", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Length"
        value={30}
        onChange={onChange}
        options={[
          { value: 15, label: "15 s" },
          { value: 30, label: "30 s" },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "Length" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "15 s" }));
    expect(onChange).toHaveBeenCalledWith(15);
  });
});

describe("CopyButton", () => {
  it("copies and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyButton text="Continue Studio project demo" label="Copy the command" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy the command" }));
    expect(writeText).toHaveBeenCalledWith("Continue Studio project demo");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

describe("ComingSoon", () => {
  it("makes its content inert and says why, in the UI language", () => {
    act(() => setLocale("vi"));
    const onClick = vi.fn();
    render(
      <ComingSoon>
        <button onClick={onClick}>Pause</button>
      </ComingSoon>,
    );
    expect(screen.getByText("Sắp có")).toBeInTheDocument();
    expect(screen.getByText("Pause").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Pause").closest("[inert]")).not.toBeNull();
  });
});

describe("progress", () => {
  it("reports a percentage", () => {
    render(<ProgressBar value={0.375} label="3 of 8 steps" />);
    expect(screen.getByRole("progressbar", { name: "3 of 8 steps" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
  });

  it("names every step state for screen readers and marks the current wizard step", () => {
    render(
      <>
        <ProgressSteps
          label="Steps"
          steps={[
            { id: "a", name: "Research", state: "done", status: "Done" },
            { id: "b", name: "Script", state: "waiting", status: "Waiting for you" },
          ]}
        />
        <Stepper
          label="Wizard"
          current={1}
          steps={[
            { key: "g", title: "Goal" },
            { key: "b", title: "Brief" },
          ]}
        />
      </>,
    );
    expect(screen.getByRole("list", { name: "Steps" })).toHaveTextContent("Waiting for you");
    expect(
      screen.getByRole("list", { name: "Wizard" }).querySelector("[aria-current=step]"),
    ).toHaveTextContent("2. Brief");
  });
});
