"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { IconGoogle } from "./ui/Icons";

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
      <div className="w-full max-w-[520px]">
        <div className="text-center">
          <h1 className="text-[56px] sm:text-[72px] leading-[0.95] font-black tracking-tight">
            Postty
          </h1>
          <p className="mt-6 text-xl sm:text-2xl font-medium tracking-tight">
            Inicia sesión
          </p>
        </div>

        <GlassCard className="mt-8 p-5 sm:p-6">
          <div className="space-y-4">
            <input
              aria-label="Usuario"
              placeholder="Usuario"
              disabled
              className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none"
            />
            <input
              aria-label="Contraseña"
              placeholder="Contraseña"
              disabled
              className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none"
            />
            <button
              type="button"
              disabled
              className="w-full text-center text-base font-semibold text-slate-900/70"
            >
              Registrarme
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm sm:text-base text-slate-900/70">
              Inicia sesión con Google
            </p>
            <div className="mt-4 flex items-center justify-center">
              <button
                type="button"
                aria-label="Inicia sesión con Google"
                onClick={onContinue}
                className="h-16 w-16 rounded-full bg-white/70 border border-white/70 shadow-[0_16px_45px_rgba(0,0,0,0.10)] backdrop-blur-xl hover:shadow-[0_20px_55px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-[1px]"
              >
                <span className="sr-only">Google</span>
                <div className="flex items-center justify-center">
                  <IconGoogle className="h-9 w-9" />
                </div>
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}


