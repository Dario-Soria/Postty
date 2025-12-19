"use client";

import * as React from "react";

export function Toast({
  open,
  message,
  kind = "info",
}: {
  open: boolean;
  message: string;
  kind?: "error" | "info";
}) {
  return (
    <div
      aria-live="polite"
      className={[
        "pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2 transition-all duration-200",
        open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
      ].join(" ")}
    >
      <div
        className={[
          "rounded-full px-4 py-2 text-sm font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl border",
          kind === "error"
            ? "bg-white/75 border-white/70 text-rose-700"
            : "bg-white/70 border-white/60 text-slate-800",
        ].join(" ")}
      >
        {message}
      </div>
    </div>
  );
}


