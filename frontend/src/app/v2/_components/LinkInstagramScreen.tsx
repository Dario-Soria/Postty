"use client";

import * as React from "react";
import { GradientButton } from "./ui/GradientButton";
import { IconInstagram } from "./ui/Icons";
import { TopBar } from "./ui/TopBar";

export function LinkInstagramScreen({
  userName,
  onBack,
  onContinue,
}: {
  userName: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[680px]">
          <h1 className="text-[54px] sm:text-[84px] leading-[0.95] font-black tracking-tight">
            ¡Bienvenido, {userName}!
          </h1>
          <p className="mt-6 text-[28px] sm:text-[40px] leading-[1.05] font-medium tracking-tight">
            Vincula tu cuenta de instagram para empezar.
          </p>

          <div className="mt-12">
            <GradientButton variant="instagram" onClick={onContinue} className="w-full sm:w-auto px-10">
              <IconInstagram className="text-white" />
              <span className="text-xl sm:text-2xl font-semibold">Vincular cuenta</span>
            </GradientButton>
          </div>
        </div>
      </div>
    </div>
  );
}


