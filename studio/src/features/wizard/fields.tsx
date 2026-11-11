import type { ReactNode } from "react";
import { Collapsible } from "@/components/ui";

/** Collapsed "Advanced" section — progressive disclosure for expert options. */
export function Advanced({ children, label }: { children: ReactNode; label: string }) {
  return <Collapsible label={label}>{children}</Collapsible>;
}
