"use client";

import * as React from "react";

export function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-[28px] bg-white/55 backdrop-blur-2xl border border-white/65 shadow-[0_18px_55px_rgba(0,0,0,0.10)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}


