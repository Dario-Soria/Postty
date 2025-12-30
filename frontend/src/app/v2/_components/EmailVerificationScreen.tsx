"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { GradientButton } from "./ui/GradientButton";
import { sendVerificationEmail, reloadUser } from "@/lib/firebase/auth";
import { useAuth } from "@/contexts/AuthContext";

interface EmailVerificationScreenProps {
  onVerified: () => void;
  onSignOut: () => void;
  showToast: (message: string, kind?: "error" | "info") => void;
}

export function EmailVerificationScreen({
  onVerified,
  onSignOut,
  showToast,
}: EmailVerificationScreenProps) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  // Cooldown timer
  React.useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResendEmail = async () => {
    if (cooldown > 0) {
      showToast(`Espera ${cooldown} segundos antes de reenviar`, "info");
      return;
    }

    setLoading(true);
    try {
      await sendVerificationEmail();
      showToast("Email de verificación enviado", "info");
      setCooldown(60); // 60 second cooldown
    } catch (error: any) {
      console.error("Error sending verification email:", error);
      
      // Check for specific error codes
      const errorCode = error.code || "";
      const errorMessage = error.message || "";
      
      if (error.message === "Email is already verified") {
        showToast("El email ya está verificado", "info");
        onVerified();
      } else if (errorCode === "auth/too-many-requests" || errorMessage.toLowerCase().includes("too many")) {
        showToast("Demasiados intentos. Espera un momento e intenta de nuevo", "error");
        setCooldown(60); // Force cooldown
      } else {
        showToast("Error al enviar email. Intenta más tarde", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setChecking(true);
    try {
      await reloadUser();
      if (user?.emailVerified) {
        showToast("¡Email verificado!", "info");
        onVerified();
      } else {
        showToast("Aún no has verificado tu email", "info");
      }
    } catch (error) {
      console.error("Error checking verification:", error);
      showToast("Error al verificar", "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
      <div className="w-full max-w-[520px]">
        <div className="text-center">
          <h1 className="text-[48px] sm:text-[64px] leading-[0.95] font-black tracking-tight">
            Verifica tu email
          </h1>
          <p className="mt-6 text-lg sm:text-xl font-medium tracking-tight text-slate-700">
            Te hemos enviado un email de verificación a
          </p>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">
            {user?.email}
          </p>
        </div>

        <GlassCard className="mt-8 p-6 sm:p-8">
          <div className="space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-sky-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>

            {/* Instructions */}
            <div className="text-center space-y-3">
              <p className="text-base font-semibold text-slate-900">
                Por favor, verifica tu email para continuar
              </p>
              <p className="text-base text-slate-700">
                Revisa tu bandeja de entrada y haz clic en el enlace de
                verificación.
              </p>
              <p className="text-sm text-slate-600">
                Si no lo encuentras, revisa tu carpeta de spam.
              </p>
              <div className="pt-2 pb-1">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
                  <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-amber-900">
                    No puedes acceder sin verificar
                  </span>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <GradientButton
                onClick={handleCheckVerification}
                disabled={checking}
                className="w-full"
              >
                {checking ? "Verificando..." : "Ya verifiqué mi email"}
              </GradientButton>

              <button
                type="button"
                onClick={handleResendEmail}
                disabled={loading || cooldown > 0}
                className="w-full text-center text-base font-semibold text-sky-600 hover:text-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? "Enviando..."
                  : cooldown > 0
                  ? `Espera ${cooldown}s para reenviar`
                  : "Reenviar email de verificación"}
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

