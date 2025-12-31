"use client";

import * as React from "react";
import { WelcomeScreen } from "./_components/WelcomeScreen";
import { LinkInstagramScreen } from "./_components/LinkInstagramScreen";
import { ReadyScreen } from "./_components/ReadyScreen";
import { ProductPostScreen } from "./_components/ProductPostScreen";
import { V2Chat } from "./_components/V2Chat";
import { AnalyzingScreen, type ImageAnalyzerResult } from "./_components/AnalyzingScreen";
import { DirectGenerateScreen } from "./_components/DirectGenerateScreen";
import { ConversationalChat } from "./_components/ConversationalChat";
import { Toast } from "./_components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type ToastState =
  | null
  | {
      message: string;
      kind?: "error" | "info";
      until: number;
    };

export default function V2Page() {
  const { user, loading } = useAuth();
  const [step, setStep] = React.useState<Step>(1);
  const [toast, setToast] = React.useState<ToastState>(null);

  // Flow state from Screen 4 -> Screen 5
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productPrompt, setProductPrompt] = React.useState<string>("");
  const [imageAnalysis, setImageAnalysis] = React.useState<ImageAnalyzerResult | null>(null);
  // New: Style and text intent
  const [selectedStyle, setSelectedStyle] = React.useState<string>("elegante");
  const [textIntent, setTextIntent] = React.useState<string>("");

  // Instagram connection state
  const [instagramConnected, setInstagramConnected] = React.useState(false);
  const [instagramData, setInstagramData] = React.useState<{
    username: string;
    id: string;
    accessToken: string;
  } | null>(null);

  // Use authenticated user's name, fallback to first name or "Usuario"
  const userName = user?.displayName?.split(" ")[0] || "Usuario";
  const instagramHandle = instagramData?.username || "No conectado";

  // Check for Instagram OAuth callback on mount
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const igConnected = urlParams.get('instagram_connected');
    const data = urlParams.get('data');
    const error = urlParams.get('error');

    if (error) {
      showToast(`Error: ${decodeURIComponent(error)}`, 'error', 5000);
      // Clean URL
      window.history.replaceState({}, '', '/v2');
      return;
    }

    if (igConnected === 'true' && data) {
      try {
        const parsedData = JSON.parse(decodeURIComponent(data));
        setInstagramConnected(true);
        setInstagramData({
          username: parsedData.instagram.username,
          id: parsedData.instagram.id,
          accessToken: parsedData.accessToken,
        });
        // Save to localStorage for persistence
        localStorage.setItem('instagram_data', JSON.stringify(parsedData));
        showToast(`¡Conectado a @${parsedData.instagram.username}!`, 'info');
        // Clean URL and go to step 3
        window.history.replaceState({}, '', '/v2');
        setStep(3);
      } catch (e) {
        console.error('Error parsing Instagram data:', e);
      }
    } else {
      // Check localStorage for existing connection
      const savedData = localStorage.getItem('instagram_data');
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          setInstagramConnected(true);
          setInstagramData({
            username: parsedData.instagram.username,
            id: parsedData.instagram.id,
            accessToken: parsedData.accessToken,
          });
        } catch (e) {
          localStorage.removeItem('instagram_data');
        }
      }
    }
  }, []);

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

  // Skip login screen if user is already authenticated
  React.useEffect(() => {
    if (!loading && user && step === 1) {
      setStep(2);
    }
  }, [user, loading, step]);

  const content = React.useMemo(() => {
    if (step === 1) {
      return <WelcomeScreen onContinue={() => setStep(2)} showToast={showToast} />;
    }
    if (step === 2) {
      return (
        <LinkInstagramScreen
          userName={userName}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
          instagramConnected={instagramConnected}
          instagramUsername={instagramData?.username}
        />
      );
    }
    if (step === 3) {
      return (
        <ReadyScreen
          instagramHandle={instagramHandle}
          onBack={() => setStep(2)}
          onContinue={() => setStep(4)}
        />
      );
    }
    if (step === 4) {
      return (
        <ProductPostScreen
          title="Tu nuevo Post"
          subtitle="Subí tu foto y creá contenido"
          onBack={() => setStep(3)}
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
            setStep(5);
          }}
        />
      );
    }
    if (step === 5) {
      // Skip to generation directly (no OpenAI)
      if (!productImageFile) {
        return null;
      }
      setTimeout(() => setStep(6), 100);
      return (
        <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            <p className="mt-4 text-lg font-medium text-slate-700">Preparando...</p>
          </div>
        </div>
      );
    }

    // Step 6: Conversational chat with Gemini
    return (
      <ConversationalChat
        onBack={() => setStep(4)}
        imageFile={productImageFile!}
        initialText={textIntent}
      />
    );
  }, [instagramHandle, productImageFile, productPrompt, showToast, step, userName, selectedStyle, textIntent]);

  return (
    <div className="min-h-[100dvh] w-full bg-[radial-gradient(1200px_circle_at_20%_-10%,#FCE3C8,transparent_60%),radial-gradient(1000px_circle_at_90%_0%,#EAD5FF,transparent_55%),radial-gradient(900px_circle_at_35%_95%,#BFE7FF,transparent_55%),linear-gradient(180deg,#FCE3C8_0%,#EAD5FF_45%,#BFE7FF_100%)] text-slate-900">
      <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 py-5 sm:py-10">
        {content}
      </div>
      <Toast open={!!toast} kind={toast?.kind} message={toast?.message ?? ""} />
    </div>
  );
}


