import { useCallback, useEffect, useRef, useState } from "react";

/** Copy text to the clipboard; false when the browser refuses (no permission, http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** `[copied, copy]`: `copied` stays true for `resetMs` after a successful copy. */
export function useCopied(resetMs = 2000): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      setCopied(ok);
      clearTimeout(timer.current);
      if (ok) timer.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );
  return [copied, copy];
}
