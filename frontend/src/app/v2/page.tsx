"use client";

import * as React from "react";
import { WelcomeScreen } from "./_components/WelcomeScreen";
import { AgentSelectionScreen } from "./_components/AgentSelectionScreen";
import { AgentChat } from "./_components/AgentChat";
import { LinkInstagramScreen } from "./_components/LinkInstagramScreen";
import { ReadyScreen } from "./_components/ReadyScreen";
import { ProductPostScreen } from "./_components/ProductPostScreen";
import { V2Chat } from "./_components/V2Chat";
import { AnalyzingScreen, type ImageAnalyzerResult } from "./_components/AnalyzingScreen";
import { DirectGenerateScreen } from "./_components/DirectGenerateScreen";
import { ConversationalChat } from "./_components/ConversationalChat";
import { Toast } from "./_components/ui/Toast";
import { UserProfileMenu } from "./_components/ui/UserProfileMenu";
import { EmailVerificationScreen } from "./_components/EmailVerificationScreen";
import { useAuth } from "@/contexts/AuthContext";
import { reloadUser } from "@/lib/firebase/auth";
import { updateUserProfile } from "@/lib/firebase/firestore";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type ToastState =
  | null
  | {
      message: string;
      kind?: "error" | "info";
      until: number;
    };

export default function V2Page() {
  const { user, userProfile, loading: authLoading, signOut } = useAuth();
  const [step, setStep] = React.useState<Step>(1);
  const [toast, setToast] = React.useState<ToastState>(null);
  const [profileTimeout, setProfileTimeout] = React.useState(false);

  // Agent selection state
  const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);

  // Flow state from Screen 4 -> Screen 5
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productPrompt, setProductPrompt] = React.useState<string>("");
  const [imageAnalysis, setImageAnalysis] = React.useState<ImageAnalyzerResult | null>(null);
  // New: Style and text intent
  const [selectedStyle, setSelectedStyle] = React.useState<string>("elegante");
  const [textIntent, setTextIntent] = React.useState<string>("");

  // Extract user's name from Firebase Auth (Google) or profile
  const userName = React.useMemo(() => {
    if (user?.displayName) {
      // If user has a display name (from Google), use first name
      return user.displayName.split(' ')[0];
    }
    if (userProfile?.displayName) {
      // Or use profile display name
      return userProfile.displayName.split(' ')[0];
    }
    if (user?.email) {
      // Fallback: use email username (before @)
      return user.email.split('@')[0];
    }
    return "Usuario";
  }, [user, userProfile]);

  const instagramHandle = "Nua.Skins";

  const showToast = React.useCallback((message: string, kind: "error" | "info" = "info", ms = 2500) => {
    const until = Date.now() + ms;
    setToast({ message, kind, until });
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const delay = Math.max(0, toast.until - Date.now());
    const t = window.setTimeout(() => setToast(null), delay);
    return () => window.clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    // Safety: if we somehow reach analyzing without an image, bounce back.
    if (step === 5 && !productImageFile) setStep(4);
  }, [productImageFile, step]);

  // Profile loading timeout - proceed after 3 seconds if profile doesn't load
  React.useEffect(() => {
    if (!userProfile && user && !authLoading) {
      const timer = setTimeout(() => {
        console.warn("Profile loading timeout - proceeding without profile");
        setProfileTimeout(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else if (userProfile) {
      // Reset timeout if profile loads
      setProfileTimeout(false);
    }
  }, [userProfile, user, authLoading]);

  // Handle step transitions based on auth state
  React.useEffect(() => {
    if (authLoading) return;
    
    // If user logs out, go back to step 1
    if (!user && step > 1) {
      setStep(1);
    }
    
    // If user just logged in and is on step 1, check if they should move to step 2
    if (user && step === 1) {
      const isGoogleUser = user.providerData.some(
        provider => provider.providerId === 'google.com'
      );
      const isVerified = user.emailVerified || isGoogleUser;
      
      if (isVerified) {
        setStep(2);
      }
    }
  }, [authLoading, user, step]);

  const handleSignOut = React.useCallback(async () => {
    try {
      await signOut();
      setStep(1);
      showToast("Sesión cerrada", "info");
    } catch (error) {
      console.error("Error signing out:", error);
      showToast("Error al cerrar sesión", "error");
    }
  }, [signOut, showToast]);

  const content = React.useMemo(() => {
    // Show loading spinner while checking auth
    if (authLoading) {
      return (
        <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            <p className="mt-4 text-lg font-medium text-slate-700">Cargando...</p>
          </div>
        </div>
      );
    }

    // If not authenticated, show welcome screen
    if (!user) {
      return <WelcomeScreen onContinue={() => setStep(2)} showToast={showToast} />;
    }

    // Check if user signed in with email/password (not Google OAuth)
    // We can determine this from the Firebase user's providerData
    const isEmailPasswordUser = user.providerData.some(
      provider => provider.providerId === 'password'
    );
    const isGoogleUser = user.providerData.some(
      provider => provider.providerId === 'google.com'
    );

    // Check email verification for email/password users BEFORE allowing any access
    // Google OAuth users skip this check (their email is already verified by Google)
    if (isEmailPasswordUser && !isGoogleUser && user.emailVerified === false) {
      return (
        <EmailVerificationScreen
          onVerified={async () => {
            await reloadUser();
            // Update Firestore profile with verified status if it exists
            if (user?.uid && userProfile) {
              try {
                await updateUserProfile(user.uid, { emailVerified: true });
              } catch (error) {
                console.error("Error updating profile:", error);
              }
            }
            // The useEffect will handle moving to step 2 after reload
          }}
          onSignOut={handleSignOut}
          showToast={showToast}
        />
      );
    }

    // Step 7: Agent Chat - Allow this BEFORE profile check so agents can work
    if (step === 7 && selectedAgent) {
      const agentNames: Record<string, string> = {
        "product-showcase": "Product Showcase",
        "agent-2": "Agent 2",
        "agent-3": "Agent 3",
        "agent-4": "Agent 4",
      };

      return (
        <AgentChat
          agentId={selectedAgent}
          agentName={agentNames[selectedAgent] || "Agent"}
          onBack={() => {
            setSelectedAgent(null);
            setStep(2);
          }}
          showToast={showToast}
        />
      );
    }

    // Wait for userProfile to load for verified users before proceeding
    // Google users can proceed without profile (it loads in background)
    // After 3 seconds timeout, proceed anyway to prevent infinite loading
    const shouldWaitForProfile = !isGoogleUser && !userProfile && !profileTimeout;
    
    if (shouldWaitForProfile) {
      return (
        <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            <p className="mt-4 text-lg font-medium text-slate-700">Cargando perfil...</p>
          </div>
        </div>
      );
    }

    // If user is verified and still on step 1, the useEffect will handle moving to step 2
    // Show a loading state briefly
    if (step === 1) {
      return (
        <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            <p className="mt-4 text-lg font-medium text-slate-700">Preparando...</p>
          </div>
        </div>
      );
    }

    // Step 2: Agent Selection (NEW - replaced Instagram linking)
    if (step === 2) {
      return (
        <AgentSelectionScreen
          userName={userName}
          onBack={handleSignOut}
          onAgentSelect={(agentId) => {
            setSelectedAgent(agentId);
            setStep(7); // Go to agent chat
          }}
          showToast={showToast}
        />
      );
    }

    // OLD FLOW (kept for backwards compatibility - not currently accessible)
    if (step === 3) {
      return (
        <LinkInstagramScreen
          userName={userName}
          onBack={() => setStep(2)}
          onContinue={() => setStep(4)}
        />
      );
    }
    if (step === 4) {
      return (
        <ReadyScreen
          instagramHandle={instagramHandle}
          onBack={() => setStep(3)}
          onContinue={() => setStep(5)}
        />
      );
    }
    if (step === 5) {
      return (
        <ProductPostScreen
          title="Tu nuevo Post"
          subtitle="Subí tu foto y creá contenido"
          onBack={() => setStep(4)}
          imageFile={productImageFile}
          setImageFile={setProductImageFile}
          prompt={productPrompt}
          setPrompt={setProductPrompt}
          showToast={showToast}
          selectedStyle={selectedStyle}
          setSelectedStyle={setSelectedStyle}
          textIntent={textIntent}
          setTextIntent={setTextIntent}
          onContinue={() => {
            setImageAnalysis(null);
            setStep(6);
          }}
        />
      );
    }
    if (step === 6) {
      // Skip to generation directly (no OpenAI)
      if (!productImageFile) {
        return null;
      }
      setTimeout(() => setStep(7), 100);
      return (
        <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            <p className="mt-4 text-lg font-medium text-slate-700">Preparando...</p>
          </div>
        </div>
      );
    }

    // Default fallback
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-slate-700">Cargando...</p>
        </div>
      </div>
    );
  }, [authLoading, handleSignOut, instagramHandle, productImageFile, productPrompt, selectedAgent, selectedStyle, showToast, step, textIntent, user, userName, userProfile, profileTimeout]);

  return (
    <div className="min-h-[100dvh] w-full bg-[radial-gradient(1200px_circle_at_20%_-10%,#FCE3C8,transparent_60%),radial-gradient(1000px_circle_at_90%_0%,#EAD5FF,transparent_55%),radial-gradient(900px_circle_at_35%_95%,#BFE7FF,transparent_55%),linear-gradient(180deg,#FCE3C8_0%,#EAD5FF_45%,#BFE7FF_100%)] text-slate-900">
      {/* User Profile Menu - Show when authenticated and not on welcome screen */}
      {user && step > 1 && (
        <div className="fixed top-5 right-5 sm:top-10 sm:right-10 z-40">
          <UserProfileMenu onSignOut={handleSignOut} />
        </div>
      )}

      <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 py-5 sm:py-10">
        {content}
      </div>
      <Toast open={!!toast} kind={toast?.kind} message={toast?.message ?? ""} />
    </div>
  );
}


