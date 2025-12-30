"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { IconGoogle } from "./ui/Icons";
import { SignUpModal } from "./SignUpModal";
import { signInWithGoogle, signInWithEmail } from "@/lib/firebase/auth";
import { createUserProfile } from "@/lib/firebase/firestore";

interface WelcomeScreenProps {
  onContinue: () => void;
  showToast: (message: string, kind?: "error" | "info") => void;
}

export function WelcomeScreen({ onContinue, showToast }: WelcomeScreenProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [showSignUpModal, setShowSignUpModal] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(() => {
    // Load saved preference from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rememberMe') === 'true';
    }
    return true; // Default to true
  });

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle(rememberMe);
      
      // Try to create/update profile, but don't block if it fails
      try {
        await createUserProfile(result.user, "google");
      } catch (profileError) {
        console.error("Error creating/updating Google profile:", profileError);
        // Continue anyway - Google users don't need profile to proceed
      }
      
      showToast("¡Bienvenido!", "info");
      onContinue();
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      if (error.code === "auth/popup-closed-by-user") {
        showToast("Inicio de sesión cancelado", "info");
      } else {
        showToast("Error al iniciar sesión con Google", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      showToast("Por favor completa todos los campos", "error");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmail(email, password, rememberMe);
      
      // Ensure Firestore profile exists (create if it doesn't)
      try {
        await createUserProfile(userCredential.user, "email");
      } catch (profileError) {
        console.error("Error creating/updating profile:", profileError);
        // Continue anyway - profile will be created by AuthContext if it fails here
      }
      
      showToast("¡Bienvenido!", "info");
      onContinue();
    } catch (error: any) {
      console.error("Error signing in:", error);
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        showToast("Email o contraseña incorrectos", "error");
      } else if (error.code === "auth/invalid-email") {
        showToast("Email inválido", "error");
      } else if (error.code === "auth/too-many-requests") {
        showToast("Demasiados intentos. Intenta más tarde", "error");
      } else {
        showToast("Error al iniciar sesión", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  // Save rememberMe preference to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rememberMe', rememberMe.toString());
    }
  }, [rememberMe]);

  return (
    <>
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
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <input
                type="email"
                aria-label="Email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  aria-label="Contraseña"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 pr-14 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900 transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {/* Remember Me Checkbox */}
              <div className="flex items-center gap-2 px-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 focus:ring-2 cursor-pointer disabled:opacity-50"
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm font-medium text-slate-700 cursor-pointer select-none"
                >
                  Recuérdame
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-center text-base font-semibold text-slate-900 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Iniciando sesión..." : "Iniciar sesión"}
              </button>
            </form>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowSignUpModal(true)}
                disabled={loading}
                className="w-full text-center text-base font-semibold text-sky-600 hover:text-sky-700 transition-colors disabled:opacity-50"
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
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="h-16 w-16 rounded-full bg-white/70 border border-white/70 shadow-[0_16px_45px_rgba(0,0,0,0.10)] backdrop-blur-xl hover:shadow-[0_20px_55px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
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

      <SignUpModal
        isOpen={showSignUpModal}
        onClose={() => setShowSignUpModal(false)}
        onSuccess={onContinue}
        showToast={showToast}
      />
    </>
  );
}


