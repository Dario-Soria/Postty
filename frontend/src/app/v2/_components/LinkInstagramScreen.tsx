"use client";

import * as React from "react";
import { GradientButton } from "./ui/GradientButton";
import { IconInstagram } from "./ui/Icons";
import { TopBar } from "./ui/TopBar";

export function LinkInstagramScreen({
  userName,
  onBack,
  onContinue,
  instagramConnected,
  instagramUsername,
}: {
  userName: string;
  onBack: () => void;
  onContinue: () => void;
  instagramConnected?: boolean;
  instagramUsername?: string;
}) {
  const [isConnecting, setIsConnecting] = React.useState(false);

  const handleConnectInstagram = () => {
    setIsConnecting(true);
    // Redirect to Instagram OAuth
    window.location.href = '/api/auth/instagram';
  };

  // If already connected, show success state
  if (instagramConnected && instagramUsername) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
        <TopBar onBack={onBack} />

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[680px]">
            <h1 className="text-[54px] sm:text-[84px] leading-[0.95] font-black tracking-tight">
              ¡Conectado!
            </h1>
            <p className="mt-6 text-[28px] sm:text-[40px] leading-[1.05] font-medium tracking-tight">
              Tu cuenta <span className="text-pink-600">@{instagramUsername}</span> está vinculada.
            </p>

            <div className="mt-12">
              <GradientButton variant="instagram" onClick={onContinue} className="w-full sm:w-auto px-10">
                <span className="text-xl sm:text-2xl font-semibold">Continuar</span>
              </GradientButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[680px]">
          <h1 className="text-[54px] sm:text-[84px] leading-[0.95] font-black tracking-tight">
            ¡Bienvenido, {userName}!
          </h1>
          <p className="mt-6 text-[28px] sm:text-[40px] leading-[1.05] font-medium tracking-tight">
            Vincula tu cuenta de Instagram para empezar.
          </p>
          <p className="mt-4 text-lg text-slate-600">
            Necesitás una cuenta de Instagram Business o Creator conectada a una página de Facebook.
          </p>

          <div className="mt-12 space-y-4">
            <GradientButton 
              variant="instagram" 
              onClick={handleConnectInstagram} 
              className="w-full sm:w-auto px-10"
              disabled={isConnecting}
            >
              <IconInstagram className="text-white" />
              <span className="text-xl sm:text-2xl font-semibold">
                {isConnecting ? "Conectando..." : "Vincular cuenta"}
              </span>
            </GradientButton>

            {/* Skip option for testing */}
            <button
              onClick={onContinue}
              className="block text-slate-500 hover:text-slate-700 text-sm underline"
            >
              Saltar por ahora (modo demo)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


