import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none " +
  "transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.97] " +
  "disabled:opacity-60 disabled:active:scale-100 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-navy text-white shadow-soft hover:bg-navy-dark hover:shadow-lift",
  secondary: "bg-teal text-navy-dark hover:bg-teal-dark hover:text-white",
  outline: "border-2 border-navy text-navy bg-transparent hover:bg-navy hover:text-white",
  ghost: "text-navy hover:bg-navy-soft",
  danger: "bg-danger text-white hover:opacity-90",
  light: "bg-white text-navy shadow-soft hover:bg-soft",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-4 text-sm",
  md: "min-h-11 px-6 text-[0.975rem]",
  lg: "min-h-13 px-8 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function LinkButton({ variant = "primary", size = "md", icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

type AnchorButtonProps = ComponentProps<"a"> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function AnchorButton({ variant = "primary", size = "md", icon, className, children, ...rest }: AnchorButtonProps) {
  return (
    <a className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </a>
  );
}
