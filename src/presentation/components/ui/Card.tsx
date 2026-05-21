"use client";

import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Card({ children, className = "", id }: CardProps) {
  return (
    <div
      id={id}
      className={
        "overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/50 " +
        className
      }
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: string;
  description?: string;
  className?: string;
};

export function CardHeader({
  title,
  description,
  className = "",
}: CardHeaderProps) {
  return (
    <div
      className={
        "border-b border-zinc-200 bg-white px-5 py-4 " + className
      }
    >
      <h2 className="text-base font-semibold tracking-tight text-zinc-900">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-zinc-600">
          {description}
        </p>
      )}
    </div>
  );
}

type CardContentProps = {
  children: ReactNode;
  className?: string;
};

export function CardContent({ children, className = "" }: CardContentProps) {
  return <div className={"p-5 " + className}>{children}</div>;
}
