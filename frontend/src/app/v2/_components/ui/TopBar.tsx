"use client";

import * as React from "react";
import { IconBack } from "./Icons";

export function TopBar({
  onBack,
  leftSlot,
}: {
  onBack?: () => void;
  leftSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 sm:mb-8">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="h-11 w-11 rounded-full bg-white/50 border border-white/60 backdrop-blur-xl flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
          >
            <IconBack className="text-slate-900" />
          </button>
        ) : null}
        {leftSlot}
      </div>
    </div>
  );
}


