"use client";

import * as React from "react";

type Variant = "primary" | "secondary" | "instagram";

export function GradientButton({
  children,
  onClick,
  disabled,
  className,
  type = "button",
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  variant?: Variant;
}) {
  const base =
    "inline-flex items-center justify-center gap-3 rounded-[999px] px-6 py-4 text-base sm:text-lg font-semibold tracking-tight transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const styles: Record<Variant, string> = {
    primary:
      "bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_12px_35px_rgba(56,189,248,0.35)] hover:shadow-[0_16px_45px_rgba(56,189,248,0.45)] hover:-translate-y-[1px]",
    instagram:
      "bg-gradient-to-r from-fuchsia-500 via-rose-400 to-amber-300 text-white shadow-[0_12px_35px_rgba(244,114,182,0.35)] hover:shadow-[0_16px_45px_rgba(244,114,182,0.45)] hover:-translate-y-[1px]",
    secondary:
      "bg-white/70 text-slate-900 border border-white/70 shadow-[0_10px_25px_rgba(0,0,0,0.08)] hover:bg-white/80 hover:-translate-y-[1px]",
  };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[base, styles[variant], className ?? ""].join(" ")}
    >
      {children}
    </button>
  );
}


