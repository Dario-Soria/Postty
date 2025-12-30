"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";

type Props = {
  onBack: () => void;
  imageFile: File;
  style: string;
  textIntent: string;
};

export function DirectGenerateScreen({ onBack, imageFile, style, textIntent }: Props) {
  const [progress, setProgress] = React.useState(5);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    // Progress animation
    const t = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return Math.min(90, p + Math.floor(Math.random() * 5) + 1);
      });
    }, 500);

    async function generate() {
      try {
        // Convert image to base64
        const buffer = await imageFile.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const productImageBase64 = `data:${imageFile.type};base64,${base64}`;

        const response = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productImageBase64,
            textPrompt: textIntent || "Imagen promocional",
            style,
            useCase: "Promoción",
            aspectRatio: "1:1",
            skipText: !textIntent,
            language: "es",
            textContent: textIntent ? {
              headline: textIntent.toUpperCase().slice(0, 40),
            } : undefined,
          }),
        });

        const data = await response.json();

        if (cancelled) return;

        if (!data.success) {
          throw new Error(data.error || "Error al generar");
        }

        setProgress(100);
        setGeneratedImage(data.finalImage);
        setIsGenerating(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error desconocido");
        setIsGenerating(false);
      } finally {
        window.clearInterval(t);
      }
    }

    generate();

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [imageFile, style, textIntent]);

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `postty-${style}-${Date.now()}.png`;
    link.click();
  };

  const handleRetry = () => {
    setError(null);
    setProgress(5);
    setIsGenerating(true);
    setGeneratedImage(null);
    // Trigger re-render to restart useEffect
    window.location.reload();
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 min-h-0">
        <div className="max-w-[860px] mx-auto">
          <h1 className="text-[36px] sm:text-[46px] font-black tracking-tight">
            {isGenerating ? "Generando..." : error ? "Error" : "¡Lista!"}
          </h1>
          <p className="mt-1 text-lg sm:text-xl font-medium tracking-tight text-slate-900/80">
            {isGenerating ? "Esto puede tardar unos segundos" : error ? "Algo salió mal" : "Tu imagen está lista"}
          </p>

          <GlassCard className="mt-5 sm:mt-6 p-5 sm:p-6">
            {isGenerating && (
              <div className="text-center py-12">
                <div className="w-full bg-slate-200 rounded-full h-3 mb-4">
                  <div
                    className="bg-gradient-to-r from-sky-400 to-emerald-400 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-2xl font-bold text-slate-900">{progress}%</p>
                <p className="mt-2 text-slate-600">Creando tu imagen con IA...</p>
                <p className="mt-1 text-sm text-slate-500">Estilo: {style}</p>
              </div>
            )}

            {error && (
              <div className="text-center py-12">
                <p className="text-red-500 font-semibold text-lg">{error}</p>
                <button
                  onClick={handleRetry}
                  className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition"
                >
                  Reintentar
                </button>
              </div>
            )}

            {generatedImage && !error && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden bg-slate-100">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full h-auto"
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleDownload}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition"
                  >
                    💾 Descargar
                  </button>
                  <button
                    onClick={onBack}
                    className="flex-1 py-3 px-4 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition"
                  >
                    🆕 Crear otra
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

