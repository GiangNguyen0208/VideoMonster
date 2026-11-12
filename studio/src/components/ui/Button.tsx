import type { VariantProps } from "class-variance-authority";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/utils/cn";
import { buttonVariants } from "./buttonVariants";

type Look = VariantProps<typeof buttonVariants>;

interface Decor {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

function Content({
  loading,
  leftIcon,
  rightIcon,
  children,
}: Decor & { loading?: boolean; children?: ReactNode }) {
  return (
    <>
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leftIcon && (
          <span className="inline-flex shrink-0" aria-hidden>
            {leftIcon}
          </span>
        )
      )}
      {children}
      {!loading && rightIcon && (
        <span className="inline-flex shrink-0" aria-hidden>
          {rightIcon}
        </span>
      )}
    </>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Look, Decor {
  /** Shows a spinner and blocks clicks. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    loading = false,
    leftIcon,
    rightIcon,
    className,
    type = "button",
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      <Content loading={loading} leftIcon={leftIcon} rightIcon={rightIcon}>
        {children}
      </Content>
    </button>
  );
});

/** In-app link styled as a button. */
export function ButtonLink({
  variant,
  size,
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: LinkProps & Look & Decor) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...props}>
      <Content leftIcon={leftIcon} rightIcon={rightIcon}>
        {children}
      </Content>
    </Link>
  );
}

/** Plain `<a>` (downloads, other origins) styled as a button. */
export function ButtonAnchor({
  variant,
  size,
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & Look & Decor) {
  return (
    <a className={cn(buttonVariants({ variant, size }), className)} {...props}>
      <Content leftIcon={leftIcon} rightIcon={rightIcon}>
        {children}
      </Content>
    </a>
  );
}
