"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "rounded-md border border-transparent bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#111827] shadow-sm hover:bg-[#caa42f] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "rounded-md px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-50",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={variantClasses[variant] + (className ? " " + className : "")}
      {...props}
    >
      {children}
    </button>
  );
}
