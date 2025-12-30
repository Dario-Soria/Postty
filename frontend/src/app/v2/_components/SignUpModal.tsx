"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { GradientButton } from "./ui/GradientButton";
import { signUpWithEmail, signInWithGoogle, validatePassword, isGmailAddress } from "@/lib/firebase/auth";
import { createUserProfile } from "@/lib/firebase/firestore";

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (message: string, kind?: "error" | "info") => void;
}

export function SignUpModal({ isOpen, onClose, onSuccess, showToast }: SignUpModalProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [gmailDetected, setGmailDetected] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const passwordValidation = validatePassword(password);
  const passwordsMatch = password === confirmPassword;

  // Gmail detection with debounce
  React.useEffect(() => {
    if (!email) {
      setGmailDetected(false);
      return;
    }

    const timer = setTimeout(() => {
      if (isGmailAddress(email)) {
        setGmailDetected(true);
        // Start countdown
        setCountdown(3);
      } else {
        setGmailDetected(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [email]);

  // Countdown timer for Gmail redirect
  React.useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) {
        handleGoogleSignIn();
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      await createUserProfile(result.user, "google");
      showToast("¡Bienvenido!", "info");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      if (error.code === "auth/popup-closed-by-user") {
        showToast("Inicio de sesión cancelado", "info");
      } else {
        showToast("Error al iniciar sesión con Google", "error");
      }
    } finally {
      setLoading(false);
      setCountdown(null);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordValidation.isValid) {
      showToast("La contraseña no cumple los requisitos", "error");
      return;
    }

    if (!passwordsMatch) {
      showToast("Las contraseñas no coinciden", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithEmail(email, password, displayName || undefined);
      await createUserProfile(result.user, "email");
      showToast("¡Cuenta creada! Revisa tu email para verificar", "info");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error signing up:", error);
      if (error.code === "auth/email-already-in-use") {
        // Email already exists - try to sign in with the provided credentials
        // If successful and email not verified, they'll see the verification screen
        showToast("Cuenta existente. Iniciando sesión...", "info");
        try {
          const { signInWithEmail } = await import("@/lib/firebase/auth");
          const userCredential = await signInWithEmail(email, password);
          
          // Ensure Firestore profile exists (in case it was never created or failed)
          try {
            await createUserProfile(userCredential.user, "email");
          } catch (profileError) {
            console.error("Error creating/updating profile:", profileError);
            // Continue anyway - profile creation is not critical for verification
          }
          
          // Check if email is verified
          if (!userCredential.user.emailVerified) {
            // Wait a moment for auth state to propagate, then close modal
            // The page will automatically show the verification screen
            await new Promise(resolve => setTimeout(resolve, 100));
            onClose();
            showToast("Por favor verifica tu email para continuar", "info");
            // Don't call onSuccess() - let the page.tsx verification check handle it
          } else {
            onClose();
            showToast("¡Bienvenido de nuevo!", "info");
            onSuccess();
          }
        } catch (signInError: any) {
          console.error("Error signing in existing user:", signInError);
          if (signInError.code === "auth/wrong-password") {
            showToast("Este email ya está registrado con otra contraseña", "error");
          } else {
            showToast("Este email ya está registrado. Usa 'Iniciar sesión'", "error");
          }
        }
      } else if (error.code === "auth/invalid-email") {
        showToast("Email inválido", "error");
      } else if (error.code === "auth/weak-password") {
        showToast("Contraseña muy débil", "error");
      } else {
        showToast("Error al crear la cuenta", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelGmailRedirect = () => {
    setCountdown(null);
    setGmailDetected(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[480px]">
        <GlassCard className="p-6 sm:p-8">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-900/60 hover:text-slate-900 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            Crear cuenta
          </h2>
          <p className="mt-2 text-base text-slate-700">
            Registrate para comenzar a usar Postty
          </p>

          {/* Gmail detection overlay */}
          {gmailDetected && countdown !== null && (
            <div className="mt-6 p-4 rounded-2xl bg-sky-100/80 border border-sky-200/80">
              <p className="text-sm font-medium text-sky-900">
                ¡Detectamos que usas Gmail! Te redirigiremos a Google en {countdown}...
              </p>
              <button
                type="button"
                onClick={handleCancelGmailRedirect}
                className="mt-2 text-sm font-semibold text-sky-700 hover:text-sky-900"
              >
                Cancelar y usar contraseña
              </button>
            </div>
          )}

          <form onSubmit={handleEmailSignUp} className="mt-6 space-y-4">
            {/* Display Name */}
            <div>
              <input
                type="text"
                placeholder="Nombre (opcional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50"
              />
            </div>

            {/* Email */}
            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
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

            {/* Confirm Password */}
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repetir contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
                className="w-full h-14 rounded-full bg-white/55 border border-white/70 px-6 pr-14 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_12px_35px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900 transition-colors"
                aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showConfirmPassword ? (
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
            
            {/* Password match indicator */}
            {confirmPassword && (
              <div className="px-2">
                <div className="flex items-center gap-2 text-sm">
                  {passwordsMatch ? (
                    <>
                      <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-emerald-600">Las contraseñas coinciden</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-rose-600">Las contraseñas no coinciden</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Password validation checks */}
            {password && (
              <div className="space-y-1.5 px-2">
                <ValidationItem
                  isValid={passwordValidation.checks.minLength}
                  text="Mínimo 8 caracteres"
                />
                <ValidationItem
                  isValid={passwordValidation.checks.hasUppercase}
                  text="Una letra mayúscula"
                />
                <ValidationItem
                  isValid={passwordValidation.checks.hasNumber}
                  text="Un número"
                />
                <ValidationItem
                  isValid={passwordValidation.checks.hasSpecialChar}
                  text="Un carácter especial (!@#$%...)"
                />
              </div>
            )}

            {/* Submit button */}
            <div className="pt-2">
              <GradientButton
                type="submit"
                disabled={loading || !passwordValidation.isValid || !passwordsMatch || !email || !confirmPassword || countdown !== null}
                className="w-full"
              >
                {loading ? "Creando cuenta..." : "Crear cuenta"}
              </GradientButton>
            </div>
          </form>

          {/* Divider */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-slate-900/10" />
            <span className="text-sm text-slate-600">o continúa con</span>
            <div className="flex-1 h-px bg-slate-900/10" />
          </div>

          {/* Google sign in */}
          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-14 rounded-full bg-white/70 border border-white/70 shadow-[0_12px_35px_rgba(0,0,0,0.08)] hover:shadow-[0_16px_45px_rgba(0,0,0,0.10)] transition-all duration-200 hover:-translate-y-[1px] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-base font-semibold text-slate-900">
                Continuar con Google
              </span>
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function ValidationItem({ isValid, text }: { isValid: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {isValid ? (
        <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <span className={isValid ? "text-slate-900" : "text-slate-500"}>{text}</span>
    </div>
  );
}

