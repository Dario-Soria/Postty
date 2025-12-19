"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { IconChevronRight } from "./ui/Icons";
import { TopBar } from "./ui/TopBar";

export function ReadyScreen({
  instagramHandle,
  onBack,
  onContinue,
}: {
  instagramHandle: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar
        onBack={onBack}
        leftSlot={
          <div className="rounded-full bg-white/55 border border-white/65 backdrop-blur-xl px-4 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <span className="text-base font-semibold tracking-tight">{instagramHandle}</span>
          </div>
        }
      />

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[720px]">
          <h1 className="text-[72px] sm:text-[110px] leading-[0.9] font-black tracking-tight">
            ¿Listo
            <br />
            para
            <br />
            crear?
          </h1>

          <div className="mt-10 sm:mt-14">
            <button type="button" onClick={onContinue} className="w-full text-left">
              <GlassCard className="p-8 sm:p-10">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="text-[44px] sm:text-[56px] leading-[0.95] font-black tracking-tight">
                      Crear
                      <br />
                      Post
                    </p>
                  </div>
                  <div className="h-14 w-14 rounded-full bg-white/60 border border-white/70 flex items-center justify-center shadow-[0_14px_40px_rgba(0,0,0,0.08)]">
                    <IconChevronRight className="text-slate-900" />
                  </div>
                </div>
              </GlassCard>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


