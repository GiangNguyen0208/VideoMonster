import { useEffect, useRef, type ReactNode } from "react";
import { msg } from "@/i18n";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Render as a right-side drawer instead of a centered modal. */
  side?: boolean;
}

/** Native <dialog> modal: focus trap, Esc-to-close and backdrop come for free. */
export function Dialog({ open, onClose, title, children, footer, side = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "border border-border bg-surface p-0 text-text backdrop:bg-backdrop",
        side
          ? "m-0 ml-auto h-dvh max-h-dvh w-full max-w-md rounded-none"
          : "m-auto w-full max-w-lg rounded-card",
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={msg().common.close}
              className="rounded-control px-2 text-xl leading-none text-text-2 hover:text-text"
            >
              ×
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

export function Drawer(props: Omit<DialogProps, "side">) {
  return <Dialog {...props} side />;
}
