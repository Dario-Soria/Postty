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

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type ToastState =
  | null
  | {
      message: string;
      kind?: "error" | "info";
      until: number;
    };

export default function V2Page() {
  const [step, setStep] = React.useState<Step>(1);
  const [toast, setToast] = React.useState<ToastState>(null);

  // Flow state from Screen 4 -> Screen 5
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productPrompt, setProductPrompt] = React.useState<string>("");
  const [imageAnalysis, setImageAnalysis] = React.useState<ImageAnalyzerResult | null>(null);
  // New: Style and text intent
  const [selectedStyle, setSelectedStyle] = React.useState<string>("elegante");
  const [textIntent, setTextIntent] = React.useState<string>("");

  // Cosmetic placeholders (until auth/integrations are wired)
  const userName = "Juan";
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

  const content = React.useMemo(() => {
    if (step === 1) {
      return <WelcomeScreen onContinue={() => setStep(2)} />;
    }
    if (step === 2) {
      return (
        <LinkInstagramScreen
          userName={userName}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
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


