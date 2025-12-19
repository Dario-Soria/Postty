"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { IconCamera, IconSend } from "./ui/Icons";
import { TopBar } from "./ui/TopBar";

type Props = {
  title: string;
  subtitle: string;
  onBack: () => void;
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  showToast: (message: string, kind?: "error" | "info", ms?: number) => void;
  onContinue: () => void;
};

function isAllowedImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/png") return true;
  if (type === "image/heic" || type === "image/heif") return true;
  const name = (file.name || "").toLowerCase();
  return (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export function ProductPostScreen({
  title,
  subtitle,
  onBack,
  imageFile,
  setImageFile,
  // prompt/setPrompt kept for now because V2 flow uses it when entering chat,
  // but Screen 4 UI no longer collects text.
  prompt: _prompt,
  setPrompt: _setPrompt,
  showToast,
  onContinue,
}: Props) {
  const [dragOver, setDragOver] = React.useState(false);
  const [isConverting, setIsConverting] = React.useState(false);
  const [showSourcePicker, setShowSourcePicker] = React.useState(false);

  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const convertOpRef = React.useRef(0);
  const isMobileRef = React.useRef(false);

  React.useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  React.useEffect(() => {
    // Keep it simple + robust across iOS Safari & Android Chrome.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const coarse = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    isMobileRef.current = coarse || /android|iphone|ipad|ipod/i.test(ua);
  }, []);

  const isHeicLike = React.useCallback((f: File) => {
    const type = (f.type || "").toLowerCase();
    const name = (f.name || "").toLowerCase();
    return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
  }, []);

  const convertHeicToJpeg = React.useCallback(async (f: File): Promise<File> => {
    // Convert via <img> + canvas (uses the browser's native decode support).
    const objectUrl = URL.createObjectURL(f);
    try {
      const img = new Image();
      // Avoid tainting; object URLs are same-origin.
      img.decoding = "async";
      img.src = objectUrl;
      if (typeof img.decode === "function") {
        await img.decode();
      } else {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image decode failed"));
        });
      }

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error("Invalid image dimensions");

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) reject(new Error("JPEG encode failed"));
            else resolve(b);
          },
          "image/jpeg",
          0.92
        );
      });

      const base = (f.name || "image").replace(/\.(heic|heif)$/i, "");
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: f.lastModified });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const setFileWithValidation = React.useCallback(
    async (f: File | null) => {
      if (!f) return;
      if (!isAllowedImage(f)) {
        setImageFile(null);
        showToast("format not accepted", "error", 2600);
        return;
      }

      // If camera/library returns HEIC/HEIF, convert to JPEG so the rest of the app can treat it consistently.
      const opId = ++convertOpRef.current;
      setIsConverting(false);
      if (isHeicLike(f)) {
        setIsConverting(true);
        try {
          const jpeg = await convertHeicToJpeg(f);
          if (convertOpRef.current !== opId) return; // superseded by a newer selection
          setImageFile(jpeg);
        } catch {
          if (convertOpRef.current !== opId) return;
          setImageFile(null);
          showToast("could not process this photo", "error", 2600);
        } finally {
          if (convertOpRef.current === opId) setIsConverting(false);
        }
        return;
      }

      setImageFile(f);
    },
    [convertHeicToJpeg, isHeicLike, setImageFile, showToast]
  );

  const openGallery = React.useCallback(() => galleryInputRef.current?.click(), []);
  const openCamera = React.useCallback(() => cameraInputRef.current?.click(), []);

  const onTapFrame = React.useCallback(() => {
    if (isMobileRef.current) {
      setShowSourcePicker(true);
      return;
    }
    openGallery();
  }, [openGallery]);

  const canContinue = imageFile != null && !isConverting;

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 min-h-0">
        <div className="max-w-[860px] mx-auto">
          <h1 className="text-[36px] sm:text-[46px] font-black tracking-tight">{title}</h1>
          <p className="mt-1 text-lg sm:text-xl font-medium tracking-tight text-slate-900/80">{subtitle}</p>

          {/* Screen 4: only upload, plus a send/continue button (no mic, no text input). */}
          <GlassCard className="mt-5 sm:mt-6 p-5 sm:p-6 h-[calc(100dvh-240px)] sm:h-[calc(100dvh-260px)] overflow-hidden">
            <div className="h-full flex flex-col gap-4 sm:gap-5">
              <div
                role="button"
                tabIndex={0}
                onClick={onTapFrame}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onTapFrame();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0] || null;
                  if (f) void setFileWithValidation(f);
                }}
                className={[
                  "relative w-full flex-1 min-h-[240px] rounded-[26px] bg-white/45 border-2 border-dashed",
                  dragOver ? "border-slate-900/40 bg-white/60" : "border-slate-900/20",
                  "flex items-center justify-center overflow-hidden cursor-pointer select-none transition-all duration-150",
                ].join(" ")}
              >
                {previewUrl ? (
                  <div className="w-full h-full bg-white/35 flex items-center justify-center p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Uploaded" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="text-center px-8">
                    <div className="flex justify-center text-slate-900/80">
                      <IconCamera />
                    </div>
                    <p className="mt-4 text-2xl sm:text-3xl font-medium tracking-tight text-slate-900/45">
                      Upload your picture
                      <br />
                      and create new content
                    </p>
                  </div>
                )}

                {previewUrl ? (
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      convertOpRef.current += 1; // cancel any in-flight conversion
                      setIsConverting(false);
                      setImageFile(null);
                    }}
                    className={[
                      "absolute top-3 right-3 h-10 w-10 rounded-full",
                      "bg-white/70 border border-white/80 backdrop-blur-xl",
                      "text-slate-900/70 hover:text-slate-900 hover:bg-white/85",
                      "flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.10)]",
                    ].join(" ")}
                  >
                    <span className="text-2xl leading-none -mt-[2px]">×</span>
                  </button>
                ) : null}
              </div>

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  void setFileWithValidation(f);
                  // allow reselect same file later
                  e.currentTarget.value = "";
                }}
              />

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                // Hints to mobile browsers to open camera capture UI.
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  void setFileWithValidation(f);
                  // allow reselect same file later
                  e.currentTarget.value = "";
                }}
              />

              {showSourcePicker ? (
                <div
                  className="fixed inset-0 z-50 flex items-end justify-center"
                  role="dialog"
                  aria-modal="true"
                  onClick={() => setShowSourcePicker(false)}
                >
                  <div className="absolute inset-0 bg-black/30" />
                  <div
                    className="relative w-full max-w-[520px] mx-auto p-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/70 shadow-[0_20px_60px_rgba(0,0,0,0.18)] overflow-hidden">
                      <button
                        type="button"
                        className="w-full py-4 text-lg font-semibold text-slate-900 hover:bg-black/5 transition"
                        onClick={() => {
                          setShowSourcePicker(false);
                          openCamera();
                        }}
                      >
                        Camera
                      </button>
                      <div className="h-px bg-black/10" />
                      <button
                        type="button"
                        className="w-full py-4 text-lg font-semibold text-slate-900 hover:bg-black/5 transition"
                        onClick={() => {
                          setShowSourcePicker(false);
                          openGallery();
                        }}
                      >
                        Pictures
                      </button>
                      <div className="h-px bg-black/10" />
                      <button
                        type="button"
                        className="w-full py-4 text-lg font-semibold text-slate-900/70 hover:bg-black/5 transition"
                        onClick={() => setShowSourcePicker(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  aria-label="Send"
                  disabled={!canContinue}
                  onClick={canContinue ? onContinue : undefined}
                  className={[
                    "h-14 w-14 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200",
                    "shadow-[0_12px_35px_rgba(0,0,0,0.10)] backdrop-blur-xl",
                    canContinue
                      ? "bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 border-white/40 hover:shadow-[0_16px_45px_rgba(56,189,248,0.45)] hover:-translate-y-[1px]"
                      : "bg-white/55 text-slate-900/35 border-white/70",
                  ].join(" ")}
                >
                  <IconSend className={canContinue ? "text-slate-900" : "text-slate-900/35"} />
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}


