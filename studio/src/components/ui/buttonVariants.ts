import { cva } from "class-variance-authority";

/** Button look, shared by `Button`, `ButtonLink` and `ButtonAnchor`. */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap select-none",
    "transition duration-150 ease-out active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "border border-accent/20 bg-accent font-semibold text-on-accent shadow-elev-sm hover:bg-accent-hover hover:shadow-glow active:bg-accent-active",
        secondary:
          "border border-border bg-surface-high text-text hover:border-text-3/40 hover:bg-surface-highest",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
        danger:
          "border border-danger/30 bg-danger-dim text-danger hover:border-danger hover:bg-danger hover:text-white",
      },
      size: {
        sm: "h-8 rounded-control px-3 text-xs",
        md: "h-10 rounded-control px-4 text-sm",
        lg: "h-12 rounded-card px-6 text-base",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
