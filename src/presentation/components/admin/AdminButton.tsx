"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type AdminButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link";
type AdminButtonSize = "sm" | "md";

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-md border text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white";

const variantClasses: Record<AdminButtonVariant, string> = {
  primary:
    "border-transparent bg-[#D4AF37] text-[#111827] shadow-sm hover:bg-[#caa42f] disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "border-zinc-300 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60",
  link:
    "border-transparent bg-transparent text-[#D4AF37] underline-offset-4 hover:underline disabled:opacity-60 disabled:cursor-not-allowed",
};

const sizeClasses: Record<AdminButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2",
};

/**
 * AdminButton is the primary call-to-action button for admin surfaces.
 * It is purely presentational and can wrap any existing click handlers.
 */
export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  {
    variant = "primary",
    size = "md",
    leftIcon,
    rightIcon,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        "focus:ring-[#D4AF37]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {leftIcon && <span className="mr-2 inline-flex items-center">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && (
        <span className="ml-2 inline-flex items-center">{rightIcon}</span>
      )}
    </button>
  );
});
