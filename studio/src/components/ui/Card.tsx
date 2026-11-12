import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

const card = cva("relative rounded-card transition duration-150", {
  variants: {
    variant: {
      default: "border border-border bg-surface shadow-elev-sm",
      /** Clickable cards (goals, projects, demos). */
      interactive:
        "border border-border bg-surface shadow-elev-sm hover:border-accent/40 hover:bg-surface-bright hover:shadow-elev-md",
      /** The selected option or the step that needs the user. */
      active: "border-2 border-accent bg-surface-low shadow-glow ring-1 ring-accent/30",
      /** Drop zones and "add something" areas. */
      dashed: "border-2 border-dashed border-border bg-surface-lowest/60 hover:border-accent/60",
    },
    padding: { none: "", sm: "p-3 sm:p-4", md: "p-5", lg: "p-6 sm:p-8" },
  },
  defaultVariants: { variant: "default", padding: "md" },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant, padding, className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(card({ variant, padding }), className)} {...props} />;
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold tracking-tight text-text", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm leading-relaxed text-text-2", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-5 flex items-center justify-between gap-3 border-t border-border-soft pt-4 text-sm text-text-2",
        className,
      )}
      {...props}
    />
  );
}
