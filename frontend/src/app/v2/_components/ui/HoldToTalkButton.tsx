"use client";

import * as React from "react";
import { IconMic } from "./Icons";

export function HoldToTalkButton({
  isRecording,
  isTranscribing,
  disabled,
  bind,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  disabled?: boolean;
  bind: {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
  };
}) {
  return (
    <button
      type="button"
      aria-label="Hold to talk"
      disabled={disabled || isTranscribing}
      {...bind}
      className={[
        "h-14 w-14 rounded-full border flex items-center justify-center shrink-0 transition-all duration-150",
        "shadow-[0_12px_35px_rgba(0,0,0,0.10)] disabled:opacity-60",
        isRecording
          ? "bg-rose-500/90 border-rose-400 text-white"
          : "bg-white/60 border-white/70 text-slate-900",
      ].join(" ")}
    >
      {isTranscribing ? (
        <span
          className="h-5 w-5 rounded-full border-2 border-slate-900/40 border-t-slate-900/80 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <IconMic />
      )}
    </button>
  );
}


