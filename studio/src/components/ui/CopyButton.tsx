import { useT } from "@/i18n";
import { useCopied } from "@/utils/clipboard";
import { Button, type ButtonProps } from "./Button";

/** Copies `text`; shows "Copied" for two seconds. `label` is the accessible name. */
export function CopyButton({
  text,
  label,
  variant = "ghost",
  size = "sm",
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & { text: string; label: string }) {
  const t = useT();
  const [copied, copy] = useCopied();
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      onClick={() => void copy(text)}
      {...props}
    >
      {copied ? t.common.copied : t.common.copy}
    </Button>
  );
}

/** A command or path shown in monospace, selectable, with a copy button. */
export function CodeBox({ code, copyLabel }: { code: string; copyLabel: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-control border border-border bg-surface-lowest px-3 py-2 font-mono text-sm whitespace-nowrap text-text select-all">
        {code}
      </code>
      <CopyButton text={code} label={copyLabel} variant="secondary" size="md" />
    </div>
  );
}
