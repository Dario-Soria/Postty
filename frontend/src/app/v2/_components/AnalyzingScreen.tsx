"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";

export type ImageAnalyzerUseCase = { use_case: string; question: string };
export type ImageAnalyzerResult = { use_cases: ImageAnalyzerUseCase[] };

export function AnalyzingScreen({
  onBack,
  imageFile,
  onDone,
}: {
  onBack: () => void;
  imageFile: File;
  onDone: (result: ImageAnalyzerResult) => void;
}) {
  const [progress, setProgress] = React.useState(8);
  const [error, setError] = React.useState<string | null>(null);
  const [runKey, setRunKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    // Smoothly increment until ~90%, then wait for API.
    const t = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const bump = 2 + Math.floor(Math.random() * 4); // 2..5
        return Math.min(90, p + bump);
      });
    }, 240);

    async function run() {
      try {
        setError(null);
        const form = new FormData();
        form.set("image", imageFile);
        const res = await fetch("/api/image-analyzer", { method: "POST", body: form });
        const data: any = await res.json().catch(() => null);
        if (!res.ok || data?.status !== "success") {
          const is429 = res.status === 429;
          const msgFromApi =
            typeof data?.message === "string" && data.message.trim().length > 0 ? data.message.trim() : null;
          const msg = is429
            ? "We’re temporarily rate-limited. Please retry in a moment."
            : msgFromApi || `Image analysis failed (HTTP ${res.status}).`;
          throw new Error(msg);
        }
        const useCases = Array.isArray(data?.use_cases) ? data.use_cases : null;
        if (!useCases || useCases.length !== 3) {
          throw new Error("Image analysis returned an invalid result.");
        }

        if (cancelled) return;
        setProgress(100);
        // Small UX delay so the user sees completion.
        setTimeout(() => {
          if (cancelled) return;
          onDone({ use_cases: useCases as ImageAnalyzerUseCase[] });
        }, 450);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Unknown error occurred";
        setError(msg);
      } finally {
        window.clearInterval(t);
      }
    }

    void run();
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [imageFile, onDone, runKey]);

  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  const displayError =
    error && error.trim().startsWith("{")
      ? "We’re temporarily rate-limited. Please retry in a moment."
      : error;

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="w-full max-w-[860px]">
          <h1 className="text-[36px] sm:text-[46px] font-black tracking-tight">Analyzing image</h1>
          <p className="mt-1 text-lg sm:text-xl font-medium tracking-tight text-slate-900/80">
            Generating post ideas
          </p>

          <GlassCard className="mt-5 sm:mt-6 p-5 sm:p-6">
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[420px]">
                <div className="rounded-[32px] bg-white/55 border border-white/70 shadow-[0_16px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                  <div className="relative h-[420px]">
                    {/* Rising fill */}
                    <div
                      className="absolute inset-x-0 bottom-0 bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 transition-all duration-300"
                      style={{ height: `${pct}%` }}
                    />
                    {/* Content */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center px-8">
                        <p className="text-sm uppercase tracking-wide text-slate-700/70 font-semibold">Progress</p>
                        <p className="mt-2 text-4xl font-black tracking-tight text-slate-900">{pct}%</p>
                        {displayError ? (
                          <div className="mt-5">
                            <p className="text-sm text-rose-700 font-semibold">Error</p>
                            <p className="mt-1 text-xs text-rose-700/90">{displayError}</p>
                            <div className="mt-4 flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setProgress(8);
                                  setError(null);
                                  setRunKey((k) => k + 1);
                                }}
                                className="rounded-full px-5 py-2 bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 border border-white/40 shadow-[0_0_18px_rgba(56,189,248,0.6)] hover:shadow-[0_0_26px_rgba(56,189,248,0.9)] transition-all duration-200 text-sm font-semibold"
                              >
                                Retry
                              </button>
                              <button
                                type="button"
                                onClick={onBack}
                                className="rounded-full px-5 py-2 bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200 text-sm font-semibold"
                              >
                                Go back
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-700/70">
                            Hold tight — this usually takes a few seconds.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-5 text-xs text-slate-700/65">
                We’re analyzing the image to recommend the best post format.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}


