"use client";

import * as React from "react";
import { Button, Spinner } from "@nextui-org/react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";
import { IconSend } from "./ui/Icons";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: {
    uploaded_image_url?: string;
    caption?: string;
    prompt?: string;
    base_prompt?: string;
    used_reference_image?: boolean;
    published_post_id?: string;
    published_at?: string;
    recommended_prompt?: string;
    ui_intent?: "inspiration";
    inspiration_suggestions?: Array<{ title: string; prompt: string }>;
    upload_choice?: true;
    references_choice?: true;
    preview_image_url?: string;
    image_path?: string;
    batch_id?: string;
    batch_index?: number;
    batch_total?: number;
    show_dislike_all?: boolean;
    caption_language?: string;
    caption_prompt_used?: string;
    style_profile?: unknown;
    candidates?: Array<{
      candidate_id: string;
      preview_data_url: string;
      generated_image_path: string;
      refined_prompt?: string | null;
      pixabay?: { id: number; pageURL: string; tags: string; query: string } | null;
      used_reference_image_edit?: boolean;
      published_post_id?: string;
      published_at?: string;
      caption_language?: string;
      caption_prompt_used?: string;
    }>;
  };
};

type ChatState = {
  language?: string | null;
  imageStyle?: string | null;
  useCase?: string | null;
};

type QuickReply = {
  id: string;
  label: string;
  value: string;
  kind: "send" | "other_style" | "other_use_case";
  activityHint?: "warming" | "inspiration";
};

type PendingOther = null | "style" | "useCase" | "instructions";

type StyleProfile = {
  palette_hex: string[];
  typography: { headline: string; body: string; accent?: string; weights?: string[] };
  composition: { layout_motifs: string[]; negative_space: string; text_block_placement: string[] };
  imagery_style: { medium: string; lighting: string; texture_grain: string; color_grading: string };
  brand_cues: { logo_usage: string; iconography: string[] };
  do: string[];
  dont: string[];
};

type InspirationWizard =
  | null
  | {
      step: 1 | 2 | 3;
      business?: string;
      audience?: string;
      goal?: string;
    };

export function V2Chat({
  onBack,
  initialPrompt,
  initialImageFile,
  initialAnalysis,
}: {
  onBack: () => void;
  initialPrompt: string;
  initialImageFile: File | null;
  initialAnalysis: null | { use_cases: Array<{ use_case: string; question: string }> };
}) {
  // In V2 we do NOT show the initial greeting card; we start with an empty chat.
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [text, setText] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [referenceImageFile, setReferenceImageFile] = React.useState<File | null>(null);
  const [referenceStyleFiles, setReferenceStyleFiles] = React.useState<File[]>([]);
  const [styleProfile, setStyleProfile] = React.useState<StyleProfile | null>(null);
  const [pendingReferenceGate, setPendingReferenceGate] = React.useState<null | {
    actionPrompt: string;
    requestedCandidates: 1 | 3;
    usedReferenceImage: boolean;
    effectiveReferenceImageFile: File | null;
    baseImagePath?: string;
  }>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [activity, setActivity] = React.useState<null | "warming" | "inspiration" | "generating">(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const [micError, setMicError] = React.useState<string | null>(null);
  const [chatState, setChatState] = React.useState<ChatState>({});
  const [pendingOther, setPendingOther] = React.useState<PendingOther>(null);
  const [pendingUseCaseGate, setPendingUseCaseGate] = React.useState<null | {
    useCases: Array<{ use_case: string; question: string }>;
    selectedUseCase?: string;
    selectedQuestion?: string;
    stage: "pick" | "answer";
  }>(null);
  const [pendingAnalyzerAnswer, setPendingAnalyzerAnswer] = React.useState<string | null>(null);
  const [referenceIntake, setReferenceIntake] = React.useState<null | { decided: boolean; skipped: boolean }>(null);
  const [referencePreviews, setReferencePreviews] = React.useState<Array<{ key: string; url: string }>>([]);
  const [isGeneratingImages, setIsGeneratingImages] = React.useState(false);
  const [genProgress, setGenProgress] = React.useState(8);
  const [genError, setGenError] = React.useState<string | null>(null);
  const [genStage, setGenStage] = React.useState<string>("Preparing…");
  const [genPhase, setGenPhase] = React.useState<1 | 2 | 3>(1);
  const [editMenuFor, setEditMenuFor] = React.useState<string | null>(null);
  const [pendingInspiration, setPendingInspiration] = React.useState<{
    recommendedPrompt: string;
    extraInstructions?: string;
  } | null>(null);
  const [pendingSuggestionPrompt, setPendingSuggestionPrompt] = React.useState<string | null>(null);
  const [inspirationWizard, setInspirationWizard] = React.useState<InspirationWizard>(null);
  const [publishingIds, setPublishingIds] = React.useState<Record<string, boolean>>({});
  const [regeneratingIds, setRegeneratingIds] = React.useState<Record<string, boolean>>({});
  const [pendingRegenerate, setPendingRegenerate] = React.useState<{
    messageId: string;
    basePrompt: string;
    needsReferenceImage: boolean;
    referenceImageUrl?: string;
    candidateId?: string;
    baseImagePath?: string;
    replaceCandidate?: boolean;
    replaceMessageCandidates?: boolean;
    numCandidates?: 1 | 3;
  } | null>(null);

  const [pendingCaptionEdit, setPendingCaptionEdit] = React.useState<null | {
    messageId: string;
    basePrompt: string;
    language?: string | null;
  }>(null);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const referencesInputRef = React.useRef<HTMLInputElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recorderChunksRef = React.useRef<BlobPart[]>([]);
  const recorderMimeRef = React.useRef<string | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const scriptNodeRef = React.useRef<ScriptProcessorNode | null>(null);
  const audioSamplesRef = React.useRef<Float32Array[]>([]);
  const recordingModeRef = React.useRef<"mediarecorder" | "wav" | null>(null);
  const pointerDownRef = React.useRef(false);
  const micPressStartMsRef = React.useRef<number | null>(null);
  const micErrorTimerRef = React.useRef<number | null>(null);
  const seededRef = React.useRef(false);
  const [seedPreviewUrl, setSeedPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Use the image provided from Screen 4 (or any later attached image) for the summary card.
    const file = initialImageFile ?? imageFile;
    if (!file) {
      setSeedPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSeedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [initialImageFile, imageFile]);

  React.useEffect(() => {
    // Seed the initial use-case picker from Gemini analysis (Step 5).
    if (!initialAnalysis || !Array.isArray(initialAnalysis.use_cases) || initialAnalysis.use_cases.length !== 3) return;
    setPendingUseCaseGate({
      useCases: initialAnalysis.use_cases.slice(0, 3),
      stage: "pick",
    });
    // Only seed the picker once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    // Create/revoke object URLs for reference thumbnails.
    const next: Array<{ key: string; url: string }> = [];
    for (const f of referenceStyleFiles) {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      next.push({ key, url: URL.createObjectURL(f) });
    }
    setReferencePreviews(next);
    return () => {
      for (const p of next) {
        try {
          URL.revokeObjectURL(p.url);
        } catch {
          // ignore
        }
      }
    };
  }, [referenceStyleFiles]);

  async function generateThreeImagesNow(params: { userAnswer: string }) {
    const effectiveImage = initialImageFile ?? imageFile ?? referenceImageFile;
    if (!effectiveImage) throw new Error("Missing uploaded image.");

    // 1) Build a generation-ready prompt from the analyzer answer (+ selected use case).
    setGenStage("Preparing prompt…");
    setGenProgress((p) => Math.max(p, 10));
    const useCase = (chatState.useCase || "").trim();
    const userAnswer = params.userAnswer.trim();
    const base = [
      useCase ? `Use case: ${useCase}` : "",
      `User brief: ${userAnswer}`,
      "",
      "Create a square (1:1) Instagram feed post composition.",
      "Do not mention pixel dimensions.",
    ]
      .filter(Boolean)
      .join("\n");

    // 2) Optional: extract style profile from reference images and append strict constraints.
    let profile: StyleProfile | null = null;
    if (referenceStyleFiles.length > 0) {
      setGenStage("Analyzing reference images…");
      setGenProgress((p) => Math.max(p, 18));
      const form = new FormData();
      for (const f of referenceStyleFiles) form.append("references", f);
      form.set("language", (chatState.language || "en").toLowerCase().startsWith("es") ? "es" : "en");
      const r = await fetch("/api/style-profile", { method: "POST", body: form });
      const data: any = await r.json();
      if (data?.status === "success" && data?.style_profile && typeof data.style_profile === "object") {
        profile = data.style_profile as StyleProfile;
      }
    }

    const finalPrompt = profile ? `${base}\n\n${styleProfileToPrompt(profile, chatState.language)}` : base;
    // Generation phase UI: deterministic 1/3 → 2/3 → 3/3
    setGenPhase(1);
    setGenStage("Generating 1/3");
    setGenProgress((p) => Math.max(p, 22));

    // 3) Call the existing endpoint for 3 candidates.
    const form = new FormData();
    form.set("image", effectiveImage as File);
    form.set("prompt", finalPrompt);
    form.set("preview_only", "true");
    form.set("num_candidates", "1");

    const res = await fetch("/api/generate-with-image", { method: "POST", body: form });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      const data: any = await res.json().catch(() => null);
      const msg =
        typeof data?.message === "string" && data.message.trim().length > 0
          ? data.message.trim()
          : `Generation failed (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    const candidates: any[] = [];

    if (ct.includes("application/x-ndjson")) {
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body.");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          let parsed: any;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          if (parsed?.type === "error") {
            const msg =
              typeof parsed?.message === "string" && parsed.message.trim().length > 0
                ? parsed.message.trim()
                : "Generation failed.";
            throw new Error(msg);
          }
          if (parsed?.type === "candidate" && parsed?.candidate) {
            candidates.push(parsed.candidate);
            const n = candidates.length;
            if (n === 1) {
              setGenPhase(2);
              setGenStage("Generating 2/3");
              setGenProgress(33);
            } else if (n === 2) {
              setGenPhase(3);
              setGenStage("Generating 3/3");
              setGenProgress(66);
            } else {
              // Keep at 99% while waiting for final completion / formatting.
              setGenPhase(3);
              setGenStage("Generating 3/3");
              setGenProgress(99);
            }
          }
        }
      }
    } else {
      // In JSON mode we don't get partial candidates; keep deterministic phase timer running.
      const data: any = await res.json().catch(() => null);
      if (Array.isArray(data?.candidates)) {
        candidates.push(...data.candidates);
      } else if (data?.candidate) {
        candidates.push(data.candidate);
      }
    }

    if (candidates.length === 0) throw new Error("No images were generated.");

    const applyCandidateToMessage = (candidate: any) => {
      const candidateImage = candidate?.image ?? null;
      const previewUrl =
        typeof candidateImage?.preview_data_url === "string"
          ? candidateImage.preview_data_url
          : candidate?.preview_data_url;
      const imagePath =
        typeof candidateImage?.generated_image_path === "string"
          ? candidateImage.generated_image_path
          : candidate?.generated_image_path;

      const captionObj = candidate?.caption ?? null;
      const captionText =
        typeof captionObj?.text === "string"
          ? captionObj.text
          : typeof candidate?.caption_text === "string"
            ? candidate.caption_text
            : typeof candidate?.caption === "string"
              ? candidate.caption
              : "Done.";
      const captionLanguage = typeof captionObj?.language === "string" ? captionObj.language : null;
      const captionPromptUsed = typeof captionObj?.prompt_used === "string" ? captionObj.prompt_used : null;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: captionText || "Done.",
          meta: {
            preview_image_url: previewUrl,
            image_path: imagePath,
            caption: captionText,
            caption_language: captionLanguage ?? undefined,
            caption_prompt_used: captionPromptUsed ?? undefined,
            base_prompt: finalPrompt,
            prompt: finalPrompt,
            used_reference_image: true,
            style_profile: profile ?? undefined,
          } as any,
        },
      ]);
    };

    // Append the 3 results to the chat (each with its caption).
    for (const c of candidates.slice(0, 3)) applyCandidateToMessage(c);
  }

  React.useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages.length]);

  React.useEffect(() => {
    return () => {
      stopMicCapture().catch(() => {});
      if (micErrorTimerRef.current != null) {
        window.clearTimeout(micErrorTimerRef.current);
        micErrorTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (seededRef.current) return;
    const p = initialPrompt?.trim() ?? "";
    if (!p && !initialImageFile) return;
    seededRef.current = true;

    if (initialImageFile) {
      setImageFile(initialImageFile);
      setReferenceImageFile(initialImageFile);
    }
    if (p) {
      // Let state settle before sending the first message.
      setTimeout(() => {
        setActivity("warming");
        void seedFromPrompt(p);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialImageFile]);

  async function seedFromPrompt(prompt: string) {
    const rawUserText = prompt.trim();
    if (!rawUserText || isSending) return;

    // Do NOT append the prompt as a user bubble; it's already shown in the context card.
    setIsSending(true);
    try {
      const usedReferenceImage = !!imageFile;

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: rawUserText,
          state: chatState,
          history: [],
          has_reference_image: usedReferenceImage,
          mode: "new",
        }),
      });

      const chatData: any = await chatRes.json();
      if (chatData?.status !== "success") {
        const rawMessage: string =
          typeof chatData?.message === "string" && chatData.message.trim().length > 0
            ? chatData.message
            : "Something went wrong.";
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: rawMessage }]);
        return;
      }

      if (chatData?.state && typeof chatData.state === "object") {
        setChatState(chatData.state as ChatState);
      }

      // The next message should be the style slot/question bubble (or whatever the orchestrator returns).
      if (typeof chatData?.reply === "string" && chatData.reply.trim().length > 0) {
        const next = (chatData.state ?? chatState) as ChatState;
        const quickReplies =
          chatData?.decision === "ask_missing" ? slotQuickReplies(next) : [];

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: chatData.reply,
            meta: {
              ...(quickReplies.length ? ({ quickReplies } as any) : {}),
              ...(typeof chatData?.recommendedPrompt === "string" && chatData.recommendedPrompt.trim().length > 0
                ? ({
                    recommended_prompt: chatData.recommendedPrompt.trim(),
                    ui_intent: chatData?.uiIntent === "inspiration" ? "inspiration" : undefined,
                  } as any)
                : {}),
            } as any,
          } as any,
        ]);
      }

      setActivity(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error occurred";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: message }]);
      setActivity(null);
    } finally {
      setIsSending(false);
    }
  }

  function setMicErrorAutoClear(message: string | null) {
    if (micErrorTimerRef.current != null) {
      window.clearTimeout(micErrorTimerRef.current);
      micErrorTimerRef.current = null;
    }
    setMicError(message);
    if (message) {
      micErrorTimerRef.current = window.setTimeout(() => {
        setMicError(null);
        micErrorTimerRef.current = null;
      }, 3500);
    }
  }

  function supportsMediaRecorder(): boolean {
    return typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined";
  }

  function pickBestMimeType(): string | null {
    const MR: any = (window as any).MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== "function") return null;
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const c of candidates) {
      try {
        if (MR.isTypeSupported(c)) return c;
      } catch {
        // ignore
      }
    }
    return null;
  }

  function stopTracks(stream: MediaStream | null) {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
  }

  function floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const pcm16 = floatTo16BitPCM(samples);
    const buffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + pcm16.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, pcm16.length * 2, true);

    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) {
      view.setInt16(offset, pcm16[i], true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function startMicCapture() {
    setMicErrorAutoClear(null);
    setIsTranscribing(false);

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Microphone not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;

    if (supportsMediaRecorder()) {
      const mimeType = pickBestMimeType();
      recorderMimeRef.current = mimeType;
      recorderChunksRef.current = [];

      const MediaRecorderCtor: any = (window as any).MediaRecorder;
      const recorder = new MediaRecorderCtor(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recordingModeRef.current = "mediarecorder";

      recorder.addEventListener("dataavailable", (e: any) => {
        if (e?.data && e.data.size > 0) recorderChunksRef.current.push(e.data);
      });

      recorder.start();
      return;
    }

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptNodeRef.current = processor;
    audioSamplesRef.current = [];
    recordingModeRef.current = "wav";

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      audioSamplesRef.current.push(new Float32Array(input));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }

  async function stopMicCapture(): Promise<Blob | null> {
    const mode = recordingModeRef.current;

    if (mode === "mediarecorder") {
      const recorder = recorderRef.current;
      const stream = micStreamRef.current;
      recorderRef.current = null;
      recordingModeRef.current = null;

      if (!recorder) {
        stopTracks(stream);
        micStreamRef.current = null;
        return null;
      }

      const stopped = new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
      });

      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // ignore
      }

      await stopped;
      stopTracks(stream);
      micStreamRef.current = null;

      const mime = recorderMimeRef.current || "audio/webm";
      const blob = new Blob(recorderChunksRef.current, { type: mime });
      recorderChunksRef.current = [];
      recorderMimeRef.current = null;
      return blob.size > 0 ? blob : null;
    }

    if (mode === "wav") {
      const stream = micStreamRef.current;
      const audioContext = audioContextRef.current;
      const processor = scriptNodeRef.current;

      recordingModeRef.current = null;
      scriptNodeRef.current = null;
      audioContextRef.current = null;
      micStreamRef.current = null;

      try {
        processor?.disconnect();
      } catch {
        // ignore
      }
      try {
        await audioContext?.close();
      } catch {
        // ignore
      }
      stopTracks(stream);

      const chunks = audioSamplesRef.current;
      audioSamplesRef.current = [];
      const sr = audioContext?.sampleRate || 44100;
      if (!chunks.length) return null;

      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return encodeWav(merged, sr);
    }

    stopTracks(micStreamRef.current);
    micStreamRef.current = null;
    return null;
  }

  async function transcribeAudio(blob: Blob) {
    setIsTranscribing(true);
    try {
      const form = new FormData();
      const ext =
        blob.type.includes("wav")
          ? "wav"
          : blob.type.includes("mp4")
            ? "mp4"
            : blob.type.includes("mpeg")
              ? "mp3"
              : blob.type.includes("ogg")
                ? "ogg"
                : "webm";
      const filename = `voice.${ext}`;
      form.set("audio", blob, filename);

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data: any = await res.json();

      if (data?.status !== "success") {
        const msg =
          typeof data?.message === "string" && data.message.trim().length > 0
            ? data.message
            : "Transcription failed.";
        throw new Error(msg);
      }

      const transcript = typeof data?.text === "string" ? data.text.trim() : "";
      if (!transcript) return;

      setText((prev) => {
        const p = prev.trim();
        if (!p) return transcript;
        return `${p} ${transcript}`.trim();
      });
      setMicErrorAutoClear(null);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function onMicPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (isSending || isRecording || isTranscribing) return;
    pointerDownRef.current = true;
    micPressStartMsRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    setMicErrorAutoClear(null);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    try {
      await startMicCapture();
      if (!pointerDownRef.current) {
        await stopMicCapture();
        setMicErrorAutoClear("Please press and hold while talking.");
        return;
      }
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start microphone.";
      setMicErrorAutoClear(msg);
      pointerDownRef.current = false;
      setIsRecording(false);
      await stopMicCapture();
    }
  }

  async function onMicPointerUp() {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    const startedAt = micPressStartMsRef.current;
    micPressStartMsRef.current = null;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const heldMs = startedAt != null ? now - startedAt : 0;

    const MIN_HOLD_MS = 650;
    const isTooShort = heldMs > 0 && heldMs < MIN_HOLD_MS;

    if (!isRecording) {
      await stopMicCapture();
      if (isTooShort || heldMs === 0) setMicErrorAutoClear("Please press and hold while talking.");
      return;
    }
    setIsRecording(false);

    try {
      const blob = await stopMicCapture();
      const MIN_AUDIO_BYTES = 2048;
      if (isTooShort || !blob || blob.size < MIN_AUDIO_BYTES) {
        setMicErrorAutoClear("Please press and hold while talking.");
        return;
      }
      await transcribeAudio(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not stop microphone.";
      setMicErrorAutoClear(msg);
      setIsTranscribing(false);
    }
  }

  function activityLabel(a: typeof activity): string {
    const l = (chatState.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    if (a === "inspiration") return l === "es" ? "Buscando inspiración..." : "Getting inspiration...";
    if (a === "warming") return l === "es" ? "Calentando motores..." : "Warming engines...";
    if (a === "generating") return l === "es" ? "Generando imagen..." : "Generating image...";
    return "";
  }

  function ActivityDots() {
    return (
      <span className="inline-flex items-center gap-1 ml-2">
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-500/70 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-500/70 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-500/70 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </span>
    );
  }

  function t(lang: string | null | undefined, key: string): string {
    const l = (lang || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const dict: Record<string, Record<string, string>> = {
      en: {
        createNewPost: "Create new post",
        getInspiration: "Get inspiration",
        other: "Other",
        askOtherStyle: "What image style would you like?",
        askOtherUseCase: "What is the use case?",
        addImage: "Add reference image",
        addInstructions: "Add instructions",
        generate: "Generate",
        recommendedPrompt: "Recommended prompt",
        askInstructions: "What custom instructions would you like to add before generating?",
        instructionsSaved: "Got it. When you're ready, press Generate.",
        thinking: "Thinking...",
        qBusiness: "What kind of business is this for? (e.g. coffee shop, gym, e-commerce store)",
        qAudience: "Who is your target audience? (e.g. runners, busy parents, students)",
        qGoal: "What’s the goal of the post? (e.g. sell a product, get leads, build awareness)",
        pickOne: "Pick one of these ideas to continue:",
        askUploadImage: "Do you want to upload a reference image?",
        yes: "Yes",
        no: "No",
      },
      es: {
        createNewPost: "Crear nueva publicación",
        getInspiration: "Ideas e inspiración",
        other: "Otro",
        askOtherStyle: "¿Qué estilo de imagen te gustaría?",
        askOtherUseCase: "¿Cuál es el uso/objetivo de la pieza?",
        addImage: "Agregar imagen de referencia",
        addInstructions: "Agregar instrucciones",
        generate: "Generar",
        recommendedPrompt: "Prompt recomendado",
        askInstructions: "¿Qué instrucciones personalizadas quieres agregar antes de generar?",
        instructionsSaved: "Perfecto. Cuando quieras, presiona Generar.",
        thinking: "Pensando...",
        qBusiness: "¿Para qué tipo de negocio es? (ej.: cafetería, gimnasio, tienda online)",
        qAudience: "¿Quién es tu público objetivo? (ej.: corredores, padres ocupados, estudiantes)",
        qGoal: "¿Cuál es el objetivo del post? (ej.: vender, captar leads, awareness)",
        pickOne: "Elige una de estas ideas para continuar:",
        askUploadImage: "¿Quieres subir una imagen de referencia?",
        yes: "Sí",
        no: "No",
      },
    };
    return dict[l]?.[key] ?? dict.en[key] ?? key;
  }

  function renderSuggestionPicker(suggestions: Array<{ title: string; prompt: string }>) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-600 font-semibold">
          {t(chatState.language, "pickOne")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {suggestions.slice(0, 4).map((s, idx) => (
            <button
              key={`${s.title}-${idx}`}
              type="button"
              disabled={isSending}
              onClick={() => {
                setPendingSuggestionPrompt(s.prompt);
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: "user", content: s.title },
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: t(chatState.language, "askUploadImage"),
                    meta: { upload_choice: true },
                  },
                ]);
              }}
              className="text-left rounded-2xl bg-white/60 border border-white/60 backdrop-blur-xl px-4 py-3 shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60"
            >
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-xs text-slate-600 line-clamp-3">{s.prompt}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderUseCasePicker() {
    if (!pendingUseCaseGate || pendingUseCaseGate.stage !== "pick") return null;
    return (
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {pendingUseCaseGate.useCases.map((u, idx) => (
            <button
              key={`${u.use_case}-${idx}`}
              type="button"
              disabled={isSending}
              onClick={() => {
                const chosen = u.use_case;
                const q = u.question;
                setChatState((prev) => ({ ...(prev as any), useCase: chosen }));

                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: "user", content: chosen },
                  { id: crypto.randomUUID(), role: "assistant", content: q },
                ]);
                setPendingUseCaseGate({
                  useCases: pendingUseCaseGate.useCases,
                  selectedUseCase: chosen,
                  selectedQuestion: q,
                  stage: "answer",
                });
              }}
              className="text-left rounded-2xl bg-white/70 border border-white/70 backdrop-blur-xl px-4 py-3 shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60"
            >
              <p className="text-sm font-semibold">{u.use_case}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderReferenceIntake() {
    if (!referenceIntake) return null;

    const selected = referenceStyleFiles;
    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] md:max-w-[75%] rounded-2xl bg-white/65 border border-white/60 backdrop-blur-xl px-4 py-3 shadow-md">
          <p className="text-sm md:text-base whitespace-pre-wrap">
            Do you have reference images? (colors, typography, composition, style)
          </p>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isSending}
              onClick={() => referencesInputRef.current?.click()}
              className="rounded-full px-4 py-2 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)] disabled:opacity-60"
            >
              Add reference
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={() => {
                setReferenceStyleFiles([]);
                setReferenceIntake({ decided: true, skipped: true });
              }}
              className="rounded-full px-4 py-2 font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200 disabled:opacity-60"
            >
              Skip
            </button>
          </div>

          {selected.length ? (
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {referencePreviews.map((p, idx) => (
                <div
                  key={p.key}
                  className="relative rounded-xl overflow-hidden border border-white/60 bg-white/40 aspect-square"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`Reference ${idx + 1}`} className="w-full h-full object-contain" />
                  <button
                    type="button"
                    aria-label="Remove reference"
                    onClick={() => {
                      setReferenceStyleFiles((prev) => {
                        const next = prev.filter((f) => `${f.name}:${f.size}:${f.lastModified}` !== p.key);
                        // If user removed all refs and they haven't explicitly skipped, revert to undecided state.
                        if (next.length === 0) {
                          setReferenceIntake((ri) => (ri && !ri.skipped ? { decided: false, skipped: false } : ri));
                        }
                        return next;
                      });
                    }}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/80 border border-white/70 shadow-sm flex items-center justify-center text-slate-900/80 hover:bg-white"
                  >
                    <span className="text-sm leading-none font-bold">×</span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderUploadChoice() {
    if (!pendingSuggestionPrompt) return null;
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          radius="full"
          isDisabled={isSending}
          onPress={() => fileInputRef.current?.click()}
          className="rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
        >
          {t(chatState.language, "yes")}
        </Button>
        <Button
          size="sm"
          radius="full"
          isDisabled={isSending}
          onPress={() => {
            const p = pendingSuggestionPrompt;
            setPendingSuggestionPrompt(null);
            setActivity("warming");
            void handleSendMessage(p);
          }}
          className="rounded-full px-4 font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
        >
          {t(chatState.language, "no")}
        </Button>
      </div>
    );
  }

  function styleProfileToPrompt(profile: StyleProfile, language: string | null | undefined): string {
    const l = (language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const palette = (profile.palette_hex || []).slice(0, 8).join(", ");
    const motifs = (profile.composition?.layout_motifs || []).slice(0, 8).join("; ");
    const placements = (profile.composition?.text_block_placement || []).slice(0, 6).join("; ");
    const icons = (profile.brand_cues?.iconography || []).slice(0, 8).join("; ");
    const doList = (profile.do || []).slice(0, 8).join("; ");
    const dontList = (profile.dont || []).slice(0, 8).join("; ");

    if (l === "es") {
      return [
        "RESTRICCIONES_DE_ESTILO (OBLIGATORIO):",
        `- Paleta_hex: ${palette || "(no disponible)"}`,
        `- Tipografía_titular: ${profile.typography?.headline || "(no disponible)"}`,
        `- Tipografía_cuerpo: ${profile.typography?.body || "(no disponible)"}`,
        `- Composición_motivos: ${motifs || "(no disponible)"}`,
        `- Ubicación_texto: ${placements || "(no disponible)"}`,
        `- Estilo_imagen: ${profile.imagery_style?.medium || ""}; luz: ${profile.imagery_style?.lighting || ""}; color_grading: ${profile.imagery_style?.color_grading || ""}`,
        `- Iconografía: ${icons || "(no disponible)"}`,
        `- DO: ${doList || "(no disponible)"}`,
        `- DON'T: ${dontList || "(no disponible)"}`,
        "Nota: No uses fondos/literales de las referencias, solo replica el estilo.",
      ].join("\n");
    }

    return [
      "STYLE_CONSTRAINTS (REQUIRED):",
      `- Palette_hex: ${palette || "(n/a)"}`,
      `- Headline_typography: ${profile.typography?.headline || "(n/a)"}`,
      `- Body_typography: ${profile.typography?.body || "(n/a)"}`,
      `- Composition_motifs: ${motifs || "(n/a)"}`,
      `- Text_block_placement: ${placements || "(n/a)"}`,
      `- Imagery_style: ${profile.imagery_style?.medium || ""}; lighting: ${profile.imagery_style?.lighting || ""}; color_grading: ${profile.imagery_style?.color_grading || ""}`,
      `- Iconography: ${icons || "(n/a)"}`,
      `- DO: ${doList || "(n/a)"}`,
      `- DON'T: ${dontList || "(n/a)"}`,
      "Note: Do NOT use the reference images as literal backgrounds; replicate style only.",
    ].join("\n");
  }

  async function runReferenceGateAndGenerate() {
    if (!pendingReferenceGate) return;
    if (isSending) return;

    setIsSending(true);
    setActivity("generating");

    try {
      let profile: StyleProfile | null = null;
      if (referenceStyleFiles.length > 0) {
        const form = new FormData();
        for (const f of referenceStyleFiles) form.append("references", f);
        form.set("language", (chatState.language || "en").toLowerCase().startsWith("es") ? "es" : "en");
        const r = await fetch("/api/style-profile", { method: "POST", body: form });
        const data: any = await r.json();
        if (data?.status === "success" && data?.style_profile && typeof data.style_profile === "object") {
          profile = data.style_profile as StyleProfile;
        }
      }

      setStyleProfile(profile);

      const finalPrompt =
        profile
          ? `${pendingReferenceGate.actionPrompt}\n\n${styleProfileToPrompt(profile, chatState.language)}`
          : pendingReferenceGate.actionPrompt;

      const res = await (pendingReferenceGate.effectiveReferenceImageFile
        ? (() => {
            const form = new FormData();
            form.set("image", pendingReferenceGate.effectiveReferenceImageFile as File);
            form.set("prompt", finalPrompt);
            form.set("preview_only", "true");
            form.set("num_candidates", String(pendingReferenceGate.requestedCandidates));
            if (pendingReferenceGate.baseImagePath) form.set("base_image_path", pendingReferenceGate.baseImagePath);
            return fetch("/api/generate-with-image", { method: "POST", body: form });
          })()
        : fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: finalPrompt,
              preview_only: true,
              num_candidates: pendingReferenceGate.requestedCandidates,
            }),
          }));

      const ct = res.headers?.get("content-type") || "";

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: pendingReferenceGate.requestedCandidates === 3 ? "Generating the three images..." : "Generating your image...",
        },
      ]);

      const generationBasePrompt = finalPrompt;

      const applyCandidateToMessage = (candidate: any) => {
        const candidateImage = candidate?.image ?? null;
        const previewUrl =
          typeof candidateImage?.preview_data_url === "string"
            ? candidateImage.preview_data_url
            : candidate?.preview_data_url;
        const imagePath =
          typeof candidateImage?.generated_image_path === "string"
            ? candidateImage.generated_image_path
            : candidate?.generated_image_path;

        const captionObj = candidate?.caption ?? null;
        const captionText =
          typeof captionObj?.text === "string"
            ? captionObj.text
            : typeof candidate?.caption_text === "string"
              ? candidate.caption_text
              : typeof candidate?.caption === "string"
                ? candidate.caption
                : "";
        const captionLanguage =
          typeof captionObj?.language === "string" ? captionObj.language : null;
        const captionPromptUsed =
          typeof captionObj?.prompt_used === "string" ? captionObj.prompt_used : null;

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: captionText || "Done.",
            meta: {
              preview_image_url: previewUrl,
              image_path: imagePath,
              caption: captionText,
              caption_language: captionLanguage ?? undefined,
              caption_prompt_used: captionPromptUsed ?? undefined,
              base_prompt: generationBasePrompt,
              prompt: generationBasePrompt,
              used_reference_image: pendingReferenceGate.usedReferenceImage,
              style_profile: profile ?? undefined,
            } as any,
          },
        ]);
      };

      if (ct.includes("application/x-ndjson")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body.");
        const decoder = new TextDecoder();
        let buffer = "";
        let sawCandidate = false;
        let sawError = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;
            let parsed: any;
            try {
              parsed = JSON.parse(line);
            } catch {
              continue;
            }
            if (parsed?.type === "error") {
              sawError = true;
              const msg =
                typeof parsed?.message === "string" && parsed.message.trim().length > 0
                  ? parsed.message.trim()
                  : "Generation failed.";
              setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: msg }]);
              try {
                await reader.cancel();
              } catch {
                // ignore
              }
              return;
            }
            if (parsed?.type === "candidate" && parsed?.candidate) {
              const cand = parsed.candidate;
              applyCandidateToMessage(cand);
              sawCandidate = true;
            }
          }
        }
        if (!sawCandidate && !sawError && !res.ok) {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: `Generation failed (HTTP ${res.status}).` },
          ]);
        }
      } else {
        const data: any = await res.json().catch(() => null);
        if (!res.ok || data?.status === "error") {
          const msg =
            typeof data?.message === "string" && data.message.trim().length > 0
              ? data.message.trim()
              : `Generation failed (HTTP ${res.status}).`;
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: msg }]);
          return;
        }
        if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
          for (const c of data.candidates) applyCandidateToMessage(c);
        }
      }

      setReferenceStyleFiles([]);
      setPendingReferenceGate(null);
      setImageFile(null);
    } finally {
      setActivity(null);
      setIsSending(false);
    }
  }

  function renderReferencesChoice() {
    if (!pendingReferenceGate) return null;
    const l = (chatState.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const title = l === "es" ? "¿Tienes imágenes de referencia?" : "Do you have reference images?";
    const desc =
      l === "es"
        ? "Sube todas las que quieras. Postty copiará colores, tipografía, composición y estilo. O puedes saltar."
        : "Upload as many as you want. Postty will match colors, typography, composition, and style. Or you can skip.";
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-slate-600">{desc}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            radius="full"
            isDisabled={isSending}
            onPress={() => referencesInputRef.current?.click()}
            className="rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
          >
            {l === "es" ? "Elegir referencias" : "Choose references"}
          </Button>
          <span className="text-xs text-slate-600">
            {referenceStyleFiles.length ? `${referenceStyleFiles.length} selected` : l === "es" ? "Ninguna seleccionada" : "None selected"}
          </span>
          {referenceStyleFiles.length ? (
            <button
              className="text-xs text-slate-600 underline underline-offset-4 ml-auto"
              type="button"
              onClick={() => setReferenceStyleFiles([])}
            >
              {l === "es" ? "Quitar" : "Clear"}
            </button>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            radius="full"
            isDisabled={isSending}
            onPress={() => {
              setReferenceStyleFiles([]);
              void runReferenceGateAndGenerate();
            }}
            className="rounded-full px-4 font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
          >
            {l === "es" ? "Saltar" : "Skip"}
          </Button>
          <Button
            size="sm"
            radius="full"
            isDisabled={isSending}
            onPress={() => void runReferenceGateAndGenerate()}
            className="rounded-full px-4 font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
          >
            {l === "es" ? "Continuar" : "Continue"}
          </Button>
        </div>
      </div>
    );
  }

  function initialQuickReplies(): QuickReply[] {
    return [
      {
        id: "qr-new",
        label: t(chatState.language, "createNewPost"),
        value: "I want to create a new Instagram post for my business.",
        kind: "send",
        activityHint: "warming",
      },
      {
        id: "qr-inspo",
        label: t(chatState.language, "getInspiration"),
        value: "",
        kind: "send",
        activityHint: "inspiration",
      },
    ];
  }

  function beginInspirationWizard() {
    setPendingInspiration(null);
    setPendingSuggestionPrompt(null);
    setInspirationWizard({ step: 1 });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: t(chatState.language, "getInspiration"),
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: t(chatState.language, "qBusiness"),
      },
    ]);
  }

  function renderQuickReplies(replies: QuickReply[]) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {replies.map((r) => (
          <Button
            key={r.id}
            size="sm"
            radius="full"
            isDisabled={isSending}
            onPress={() => {
              if (r.kind === "send") {
                if (r.activityHint) setActivity(r.activityHint);
                if (r.id === "qr-new") {
                  // Start a fresh flow so we don't skip style/use-case from previous runs.
                  setChatState({ language: chatState.language ?? null, imageStyle: null, useCase: null } as any);
                  setPendingOther(null);
                  setPendingInspiration(null);
                  setPendingSuggestionPrompt(null);
                  setPendingReferenceGate(null);
                  setReferenceStyleFiles([]);
                  setStyleProfile(null);
                  setPendingRegenerate(null);
                }
                if (r.activityHint === "inspiration" && !r.value) {
                  beginInspirationWizard();
                  return;
                }
                void handleSendMessage(r.value);
                return;
              }
              if (r.kind === "other_style") {
                setPendingOther("style");
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: t(chatState.language, "askOtherStyle"),
                  },
                ]);
                return;
              }
              if (r.kind === "other_use_case") {
                setPendingOther("useCase");
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: t(chatState.language, "askOtherUseCase"),
                  },
                ]);
              }
            }}
            className={
              r.activityHint === "warming"
                ? "rounded-full px-4 font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                : r.activityHint === "inspiration"
                  ? "rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
                  : "rounded-full px-4 font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
            }
          >
            {r.label}
          </Button>
        ))}
      </div>
    );
  }

  function slotQuickReplies(state: ChatState): QuickReply[] {
    const l = (state.language || "en").toLowerCase().startsWith("es") ? "es" : "en";

    const styleOptions =
      l === "es"
        ? [
            { label: "Cartoon", value: "cartoon" },
            { label: "Cinematográfico", value: "cinematic" },
            { label: "Acuarela", value: "watercolor" },
            { label: "Minimalista", value: "minimalist" },
            { label: "Hiperrealista", value: "hyper-realistic" },
          ]
        : [
            { label: "Cartoon", value: "cartoon" },
            { label: "Cinematic", value: "cinematic" },
            { label: "Watercolor", value: "watercolor" },
            { label: "Minimalist", value: "minimalist" },
            { label: "Hyper-realistic", value: "hyper-realistic" },
          ];

    const useCaseOptions =
      l === "es"
        ? [
            { label: "Gráfico promocional", value: "promotional graphic" },
            { label: "Producto (showcase)", value: "product showcase" },
            { label: "Inspiracional", value: "inspirational post" },
            { label: "Tarjeta de cita", value: "quote card" },
            { label: "Anuncio de evento", value: "event announcement" },
          ]
        : [
            { label: "Promotional graphic", value: "promotional graphic" },
            { label: "Product showcase", value: "product showcase" },
            { label: "Inspirational post", value: "inspirational post" },
            { label: "Quote card", value: "quote card" },
            { label: "Event announcement", value: "event announcement" },
          ];

    const replies: QuickReply[] = [];

    if (state.imageStyle == null) {
      for (const opt of styleOptions) {
        replies.push({
          id: `qr-style-${opt.value}`,
          label: opt.label,
          value: l === "es" ? `Estilo de imagen: ${opt.value}` : `Image style: ${opt.value}`,
          kind: "send",
        });
      }
      replies.push({
        id: "qr-style-other",
        label: t(state.language, "other"),
        value: "",
        kind: "other_style",
      });
    } else if (state.useCase == null) {
      for (const opt of useCaseOptions) {
        replies.push({
          id: `qr-usecase-${opt.value.replace(/\s+/g, "-")}`,
          label: opt.label,
          value: l === "es" ? `Uso: ${opt.value}` : `Use case: ${opt.value}`,
          kind: "send",
        });
      }
      replies.push({
        id: "qr-usecase-other",
        label: t(state.language, "other"),
        value: "",
        kind: "other_use_case",
      });
    }

    return replies;
  }

  async function handleSendMessage(overrideText?: string) {
    const rawUserText = (overrideText ?? text).trim();
    if (!rawUserText || isSending) return;

    // If the user is answering the Gemini analyzer question, capture it and show reference intake before continuing.
    if (pendingUseCaseGate?.stage === "answer") {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: rawUserText }]);
      setText("");
      setPendingUseCaseGate(null);
      setPendingAnalyzerAnswer(rawUserText);
      setReferenceIntake({ decided: false, skipped: false });
      return;
    }

    // If references were requested and we're waiting for "Generate", the user should not type; ignore.
    if (referenceIntake && referenceIntake.decided && pendingAnalyzerAnswer && !overrideText) {
      return;
    }

    if (pendingCaptionEdit) {
      const { messageId } = pendingCaptionEdit;
      setIsSending(true);
      try {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: rawUserText }]);
        setText("");

        const newCaption = rawUserText.trim();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              content: newCaption || m.content,
              meta: {
                ...(m.meta ?? {}),
                caption: newCaption,
                caption_language: (m.meta as any)?.caption_language,
                caption_prompt_used: (m.meta as any)?.caption_prompt_used,
              },
            };
          })
        );

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: "Caption updated." },
        ]);
      } finally {
        setIsSending(false);
        setPendingCaptionEdit(null);
      }
      return;
    }

    if (pendingOther === "instructions" && pendingInspiration) {
      setPendingInspiration((p) => (p ? { ...p, extraInstructions: rawUserText } : p));
      setPendingOther(null);
      setText("");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: t(chatState.language, "instructionsSaved") },
      ]);
      return;
    }

    if (inspirationWizard && pendingOther == null) {
      const answer = rawUserText;
      const step = inspirationWizard.step;

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: answer }]);
      setText("");

      if (step === 1) {
        setInspirationWizard({ step: 2, business: answer });
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: t(chatState.language, "qAudience") },
        ]);
        return;
      }

      if (step === 2) {
        setInspirationWizard({ step: 3, business: inspirationWizard.business, audience: answer });
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: t(chatState.language, "qGoal") },
        ]);
        return;
      }

      const business = inspirationWizard.business ?? "";
      const audience = inspirationWizard.audience ?? "";
      const goal = answer;
      setInspirationWizard(null);

      const composed =
        `I want Instagram post ideas and inspiration.\n` +
        `Business: ${business}\n` +
        `Audience: ${audience}\n` +
        `Goal: ${goal}\n\n` +
        `Please provide EXACTLY 4 post ideas. For each, include a short title and a generation-ready image prompt for a square Instagram feed post.`;

      setActivity("inspiration");
      setIsSending(true);
      try {
        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: composed,
            state: chatState,
            history: messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-16)
              .map((m) => ({ role: m.role, content: m.content })),
            has_reference_image: !!imageFile,
            mode: "new",
          }),
        });

        const chatData: any = await chatRes.json();
        if (chatData?.status !== "success") {
          const rawMessage: string =
            typeof chatData?.message === "string" && chatData.message.trim().length > 0
              ? chatData.message
              : "Something went wrong.";
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: rawMessage }]);
          return;
        }

        if (chatData?.state && typeof chatData.state === "object") {
          setChatState(chatData.state as ChatState);
        }

        if (typeof chatData?.reply === "string" && chatData.reply.trim().length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: chatData.reply,
              meta: {
                ...(Array.isArray(chatData?.inspirationSuggestions) && chatData.inspirationSuggestions.length > 0
                  ? ({
                      ui_intent: chatData?.uiIntent === "inspiration" ? "inspiration" : undefined,
                      inspiration_suggestions: chatData.inspirationSuggestions as Array<{ title: string; prompt: string }>,
                    } as any)
                  : {}),
              } as any,
            },
          ]);
        }
      } finally {
        setIsSending(false);
        setActivity(null);
      }

      return;
    }

    const userText =
      pendingOther === "style"
        ? `${(chatState.language || "en").toLowerCase().startsWith("es") ? "Estilo de imagen" : "Image style"}: ${rawUserText}`
        : pendingOther === "useCase"
          ? `${(chatState.language || "en").toLowerCase().startsWith("es") ? "Uso" : "Use case"}: ${rawUserText}`
          : rawUserText;
    if (!userText || isSending) return;

    const isRegenerating = pendingRegenerate != null;
    const regen = pendingRegenerate;
    const regenKey = isRegenerating ? `${regen?.messageId ?? "unknown"}` : null;

    const effectiveReferenceImageFile =
      imageFile ??
      (isRegenerating && regen?.needsReferenceImage ? referenceImageFile : null);

    if (isRegenerating && regen?.needsReferenceImage && !effectiveReferenceImageFile) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "To regenerate this image, please attach the reference image using the + button, then send your modification message.",
        },
      ]);
      fileInputRef.current?.click();
      return;
    }

    const basePrompt = isRegenerating && regen ? regen.basePrompt : userText;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: isRegenerating ? `Regenerate: ${rawUserText}` : rawUserText,
    };
    const historyForChat = [...messages, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setText("");
    setPendingOther(null);

    if (isRegenerating && regen) {
      setRegeneratingIds((p) => ({ ...p, [regenKey as string]: true }));
    }

    setIsSending(true);
    try {
      const usedReferenceImage = isRegenerating ? !!regen?.needsReferenceImage : !!effectiveReferenceImageFile;

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          state: chatState,
          history: historyForChat,
          has_reference_image: usedReferenceImage,
          mode: isRegenerating ? "regenerate" : "new",
          base_prompt: isRegenerating ? basePrompt : undefined,
        }),
      });

      const chatData: any = await chatRes.json();
      if (chatData?.status !== "success") {
        const rawMessage: string =
          typeof chatData?.message === "string" && chatData.message.trim().length > 0
            ? chatData.message
            : "Something went wrong.";
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: rawMessage },
        ]);
        return;
      }

      if (chatData?.state && typeof chatData.state === "object") {
        setChatState(chatData.state as ChatState);
      }

      const action = chatData?.action;
      const isGeneratingAction = action?.type === "generate" && typeof action?.prompt === "string";

      if (!isGeneratingAction && typeof chatData?.reply === "string" && chatData.reply.trim().length > 0) {
        const next = (chatData.state ?? chatState) as ChatState;
        const quickReplies =
          chatData?.decision === "ask_missing" ? slotQuickReplies(next) : [];

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: chatData.reply,
            meta: {
              ...(quickReplies.length ? ({ quickReplies } as any) : {}),
              ...(typeof chatData?.recommendedPrompt === "string" && chatData.recommendedPrompt.trim().length > 0
                ? ({
                    recommended_prompt: chatData.recommendedPrompt.trim(),
                    ui_intent: chatData?.uiIntent === "inspiration" ? "inspiration" : undefined,
                  } as any)
                : {}),
            } as any,
          } as any,
        ]);
      }

      if (chatData?.uiIntent === "inspiration" && typeof chatData?.recommendedPrompt === "string") {
        const rp = chatData.recommendedPrompt.trim();
        if (rp) setPendingInspiration({ recommendedPrompt: rp });
      }

      if (!(chatData?.action?.type === "generate")) {
        setActivity(null);
      }

      if (isGeneratingAction) {
        // Always generate 1 image for now
        const requestedCandidates = 1;

        if (!isRegenerating) {
          // If the user already decided references (from the pre-generate intake), skip the extra "do you have references?" roundtrip.
          // We'll proceed directly into the reference gate and run generation.
          if (referenceIntake?.decided) {
            const usedReferenceImage = !!effectiveReferenceImageFile;
            setActivity("generating");
            setStyleProfile(null);
            setPendingReferenceGate({
              actionPrompt: action.prompt,
              requestedCandidates: 1,
              usedReferenceImage,
              effectiveReferenceImageFile: effectiveReferenceImageFile ?? null,
            });
            // If they skipped, ensure we don't send any refs to style-profile.
            if (referenceIntake.skipped) setReferenceStyleFiles([]);
            setReferenceIntake(null);
            setTimeout(() => {
              void runReferenceGateAndGenerate();
            }, 0);
            return;
          }

          setActivity(null);
          setStyleProfile(null);
          setReferenceStyleFiles([]);
          setPendingReferenceGate({
            actionPrompt: action.prompt,
            requestedCandidates: 1,
            usedReferenceImage,
            effectiveReferenceImageFile: effectiveReferenceImageFile ?? null,
          });
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                (chatState.language || "en").toLowerCase().startsWith("es")
                  ? "Antes de generar: ¿tienes imágenes de referencia para respetar colores, tipografía, composición y estilo?"
                  : "Before generating: do you have reference images so I can match colors, typography, composition, and style?",
              meta: { references_choice: true } as any,
            },
          ]);
          return;
        }

        setActivity("generating");

        if (!isRegenerating) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: requestedCandidates === 3 ? "Generating the three images..." : "Generating your image...",
            },
          ]);
        }

        const res = await (effectiveReferenceImageFile
          ? (() => {
              const form = new FormData();
              form.set("image", effectiveReferenceImageFile);
              const promptToUse =
                styleProfile ? `${action.prompt}\n\n${styleProfileToPrompt(styleProfile, chatState.language)}` : action.prompt;
              form.set("prompt", promptToUse);
              form.set("preview_only", "true");
              form.set("num_candidates", String(requestedCandidates));
              if (isRegenerating && regen?.baseImagePath) {
                form.set("base_image_path", regen.baseImagePath);
              }
              return fetch("/api/generate-with-image", { method: "POST", body: form });
            })()
          : fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt:
                  styleProfile ? `${action.prompt}\n\n${styleProfileToPrompt(styleProfile, chatState.language)}` : action.prompt,
                preview_only: true,
                num_candidates: requestedCandidates,
              }),
            }));

        const ct = res.headers?.get("content-type") || "";

        const generationBasePrompt =
          isRegenerating && regen
            ? regen.basePrompt
            : styleProfile
              ? `${action.prompt}\n\n${styleProfileToPrompt(styleProfile, chatState.language)}`
              : action.prompt;

        const applyCandidateToMessage = (candidate: any) => {
          const candidateImage = candidate?.image ?? null;
          const previewUrl =
            typeof candidateImage?.preview_data_url === "string"
              ? candidateImage.preview_data_url
              : candidate?.preview_data_url;
          const imagePath =
            typeof candidateImage?.generated_image_path === "string"
              ? candidateImage.generated_image_path
              : candidate?.generated_image_path;

          const captionObj = candidate?.caption ?? null;
          const captionText =
            typeof captionObj?.text === "string"
              ? captionObj.text
              : typeof candidate?.caption_text === "string"
                ? candidate.caption_text
                : typeof candidate?.caption === "string"
                  ? candidate.caption
                  : "";
          const captionLanguage =
            typeof captionObj?.language === "string" ? captionObj.language : null;
          const captionPromptUsed =
            typeof captionObj?.prompt_used === "string" ? captionObj.prompt_used : null;

          if (isRegenerating && regen?.messageId) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== regen.messageId) return m;
                return {
                  ...m,
                  content: captionText && captionText.trim() ? captionText : m.content,
                  meta: {
                    ...(m.meta ?? {}),
                    preview_image_url: previewUrl,
                    image_path: imagePath,
                    caption: captionText,
                    caption_language: captionLanguage ?? (m.meta as any)?.caption_language,
                    caption_prompt_used: captionPromptUsed ?? (m.meta as any)?.caption_prompt_used,
                    base_prompt: generationBasePrompt,
                    prompt: generationBasePrompt,
                    used_reference_image: usedReferenceImage,
                    style_profile: (m.meta as any)?.style_profile ?? (styleProfile as any) ?? undefined,
                  },
                };
              })
            );
            return;
          }

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: captionText || "Listo.",
              meta: {
                preview_image_url: previewUrl,
                image_path: imagePath,
                caption: captionText,
                caption_language: captionLanguage ?? undefined,
                caption_prompt_used: captionPromptUsed ?? undefined,
                base_prompt: generationBasePrompt,
                prompt: generationBasePrompt,
                used_reference_image: usedReferenceImage,
                show_dislike_all: !!candidate.__show_dislike_all,
                style_profile: styleProfile ?? undefined,
              },
            },
          ]);
        };

        if (ct.includes("application/x-ndjson")) {
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body.");
          const decoder = new TextDecoder();
          let buffer = "";
          let sawCandidate = false;
          let sawError = false;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 1);
              if (!line) continue;
              let parsed: any;
              try {
                parsed = JSON.parse(line);
              } catch {
                continue;
              }
              if (parsed?.type === "error") {
                sawError = true;
                const msg =
                  typeof parsed?.message === "string" && parsed.message.trim().length > 0
                    ? parsed.message.trim()
                    : "Generation failed.";
                setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: msg }]);
                try {
                  await reader.cancel();
                } catch {
                  // ignore
                }
                setImageFile(null);
                setPendingRegenerate(null);
                setActivity(null);
                return;
              }
              if (parsed?.type === "candidate" && parsed?.candidate) {
                const cand = parsed.candidate;
                const idx = typeof parsed.index === "number" ? parsed.index : null;
                const total = typeof parsed.total === "number" ? parsed.total : null;
                if (idx != null && total != null && idx === total && total > 1) {
                  cand.__show_dislike_all = true;
                }
                applyCandidateToMessage(cand);
                sawCandidate = true;
              }
            }
          }

          if (!sawCandidate && !sawError && !res.ok) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "assistant", content: `Generation failed (HTTP ${res.status}).` },
            ]);
          }
          setImageFile(null);
          setPendingRegenerate(null);
          setActivity(null);
          return;
        }

        const data: any = await res.json();
        if (data?.status !== "success") {
          const rawMessage: string =
            typeof data?.message === "string" && data.message.trim().length > 0
              ? data.message
              : typeof data?.error === "string"
                ? data.error
                : "Something went wrong.";
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: rawMessage }]);
          setActivity(null);
          return;
        }

        if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
          for (const c of data.candidates) applyCandidateToMessage(c);
        }

        setImageFile(null);
        setPendingRegenerate(null);
        setActivity(null);
        return;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error occurred";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: message },
      ]);
    } finally {
      setIsSending(false);
      if (isRegenerating && regen) {
        setRegeneratingIds((p) => ({ ...p, [regenKey as string]: false }));
      }
    }
  }

  async function handlePublish(
    messageId: string,
    publishKey: string,
    params: { image_url?: string; image_path?: string; caption?: string },
    opts?: { candidateId?: string; collapseCandidates?: boolean }
  ) {
    const caption = params.caption;
    if (!caption) return;
    if (!params.image_url && !params.image_path) return;

    setPublishingIds((p) => ({ ...p, [publishKey]: true }));
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          ...(params.image_path ? { image_path: params.image_path } : {}),
          ...(params.image_url ? { image_url: params.image_url } : {}),
        }),
      });
      const data = await res.json();
      if (data?.status !== "success") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data?.message || "Publishing failed.",
          },
        ]);
        return;
      }

      const publishedId: string | undefined =
        typeof data?.instagram_response?.id === "string" ? data.instagram_response.id : undefined;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const nextMeta: any = { ...(m.meta ?? {}) };
          if (opts?.candidateId && Array.isArray(nextMeta?.candidates)) {
            const updatedCandidates = (nextMeta.candidates as any[]).map((c) =>
              c?.candidate_id === opts.candidateId
                ? {
                    ...c,
                    published_post_id: publishedId,
                    published_at: new Date().toISOString(),
                  }
                : c
            );
            nextMeta.candidates = opts.collapseCandidates
              ? updatedCandidates.filter((c) => c?.candidate_id === opts.candidateId)
              : updatedCandidates;
          }
          return {
            ...m,
            meta: {
              ...nextMeta,
              published_post_id: publishedId,
              published_at: new Date().toISOString(),
            },
          };
        })
      );

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Published to Instagram. ID: ${data?.instagram_response?.id ?? "(no id)"}`,
        },
      ]);
    } finally {
      setPublishingIds((p) => ({ ...p, [publishKey]: false }));
    }
  }

  function beginRegenerate(
    messageId: string,
    basePrompt: string,
    usedReferenceImage: boolean,
    opts?: { candidateId?: string; numCandidates?: 1 | 3; baseImagePath?: string }
  ) {
    setPendingRegenerate({
      messageId,
      basePrompt,
      needsReferenceImage: usedReferenceImage,
      candidateId: opts?.candidateId,
      baseImagePath: opts?.baseImagePath,
      replaceCandidate: !!opts?.candidateId,
      numCandidates: opts?.numCandidates ?? 1,
    });

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Tell me what you want to change, and I’ll regenerate it. " +
          "For example: “change the background to a beach at sunset, keep the product centered, add warmer tones.”",
      },
    ]);
  }

  function beginCaptionEdit(messageId: string, basePrompt: string, language?: string | null) {
    setPendingCaptionEdit({ messageId, basePrompt, language: language ?? null });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Write the new caption you want (the image will not change).",
      },
    ]);
  }

  function beginDislikeAll(messageId: string, basePrompt: string, usedReferenceImage: boolean) {
    setPendingRegenerate({
      messageId,
      basePrompt,
      needsReferenceImage: usedReferenceImage,
      replaceCandidate: false,
      replaceMessageCandidates: true,
      numCandidates: 3,
    });

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "What would you like to change or add?",
      },
    ]);
  }

  return (
    isGeneratingImages ? (
      <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
        <TopBar onBack={onBack} />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="w-full max-w-[860px]">
            <h1 className="text-[36px] sm:text-[46px] font-black tracking-tight">Generating images</h1>
            <p className="mt-1 text-lg sm:text-xl font-medium tracking-tight text-slate-900/80">
              This may take a few seconds
            </p>

            <GlassCard className="mt-5 sm:mt-6 p-5 sm:p-6">
              <div className="flex flex-col items-center">
                <div className="w-full max-w-[420px]">
                  <div className="rounded-[32px] bg-white/55 border border-white/70 shadow-[0_16px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                    <div className="relative h-[420px]">
                      <div
                        className="absolute inset-x-0 bottom-0 bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 transition-all duration-300"
                        style={{ height: `${Math.min(100, Math.max(0, Math.round(genProgress)))}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center px-8">
                          <p className="text-sm uppercase tracking-wide text-slate-700/70 font-semibold">Progress</p>
                          <p className="mt-2 text-4xl font-black tracking-tight text-slate-900">
                            {Math.min(100, Math.max(0, Math.round(genProgress)))}%
                          </p>
                          {genError ? (
                            <div className="mt-5">
                              <p className="text-sm text-rose-700 font-semibold">Error</p>
                              <p className="mt-1 text-xs text-rose-700/90">{genError}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsGeneratingImages(false);
                                  setGenError(null);
                                }}
                                className="mt-4 rounded-full px-5 py-2 bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200 text-sm font-semibold"
                              >
                                Back to chat
                              </button>
                            </div>
                          ) : (
                            <p className="mt-4 text-sm text-slate-700/70">
                              {genStage} <ActivityDots />
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-5 text-xs text-slate-700/65">We’re generating images based on your photo and references.</p>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    ) : (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1">
        <div className="mx-auto w-full max-w-[980px]">
          <div className="h-[min(900px,100dvh-9.5rem)] bg-white/45 backdrop-blur-2xl border border-white/65 rounded-[28px] shadow-[0_18px_55px_rgba(0,0,0,0.10)] overflow-hidden flex flex-col">
            <header className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/55">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold tracking-tight">Postty</p>
                  <p className="text-xs text-slate-700/70">
                    Chat → style → references → generate
                  </p>
                </div>
              </div>
            </header>

            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-4">
              {/* V2: Show the originating prompt (and optional photo) first */}
              {(initialPrompt?.trim() || seedPreviewUrl) ? (
                initialPrompt?.trim() ? (
                  <div className="rounded-2xl bg-white/65 border border-white/60 backdrop-blur-xl shadow-md overflow-hidden">
                    <div className="p-4 sm:p-5">
                      <div className={seedPreviewUrl ? "flex flex-col sm:flex-row gap-4" : ""}>
                        {seedPreviewUrl ? (
                          <div className="shrink-0">
                            <div className="w-full sm:w-[220px] aspect-square rounded-2xl overflow-hidden border border-white/60 bg-white/40">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={seedPreviewUrl}
                                alt="Uploaded"
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="flex-1">
                          <p className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold">Prompt</p>
                          <p className="mt-2 text-sm sm:text-base text-slate-900 whitespace-pre-wrap">
                            {initialPrompt?.trim() || ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Image-only header card (no empty prompt space; do not crop the thumbnail).
                  <div className="flex justify-center">
                    <div className="rounded-2xl bg-white/65 border border-white/60 backdrop-blur-xl shadow-md overflow-hidden p-4">
                      <div className="w-[220px] aspect-square rounded-2xl overflow-hidden border border-white/60 bg-white/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={seedPreviewUrl as string}
                          alt="Uploaded"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                )
              ) : null}

              {/* Gemini analysis onboarding: use-case picker */}
              {pendingUseCaseGate?.stage === "pick" ? (
                <div className="flex justify-start">
                  <div className="max-w-[92%] md:max-w-[75%] rounded-2xl bg-white/65 border border-white/60 backdrop-blur-xl px-4 py-3 shadow-md">
                    <p className="text-sm md:text-base whitespace-pre-wrap">
                      We have detected these possible use cases, please select one
                    </p>
                    {renderUseCasePicker()}
                  </div>
                </div>
              ) : null}

              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[92%] md:max-w-[75%] rounded-2xl bg-white/75 border border-white/70 backdrop-blur-xl px-4 py-3 shadow-md"
                        : "max-w-[92%] md:max-w-[75%] rounded-2xl bg-white/65 border border-white/60 backdrop-blur-xl px-4 py-3 shadow-md"
                    }
                  >
                    <p className="text-sm md:text-base whitespace-pre-wrap">{m.content}</p>

                    {m.role === "assistant" && (m as any)?.meta?.quickReplies
                      ? renderQuickReplies((m as any).meta.quickReplies as QuickReply[])
                      : null}

                    {m.role === "assistant" &&
                    m.meta?.ui_intent === "inspiration" &&
                    Array.isArray(m.meta?.inspiration_suggestions) &&
                    m.meta.inspiration_suggestions.length > 0
                      ? renderSuggestionPicker(m.meta.inspiration_suggestions)
                      : null}

                    {m.role === "assistant" && m.meta?.upload_choice ? renderUploadChoice() : null}

                    {m.role === "assistant" && (m as any)?.meta?.references_choice ? renderReferencesChoice() : null}

                    {m.role === "assistant" && m.meta?.preview_image_url ? (
                      <div className="mt-3 space-y-3">
                        <div className="relative rounded-2xl overflow-hidden border border-white/60 bg-white/50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.meta.preview_image_url} alt="Generated" className="w-full h-auto" />
                          <button
                            type="button"
                            aria-label="Discard"
                            onClick={() => {
                              setEditMenuFor((cur) => (cur === m.id ? null : cur));
                              setMessages((prev) => prev.filter((x) => x.id !== m.id));
                            }}
                            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/80 border border-white/70 shadow-sm flex items-center justify-center text-slate-900/80 hover:bg-white"
                          >
                            <span className="text-lg leading-none font-bold">×</span>
                          </button>
                        </div>

                        {publishingIds[m.id] ? (
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Spinner size="sm" />
                            <span>Publishing to Instagram...</span>
                          </div>
                        ) : null}

                        {regeneratingIds[m.id] ? (
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Spinner size="sm" />
                            <span>Regenerating...</span>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              radius="full"
                              isDisabled={!!publishingIds[m.id] || !!regeneratingIds[m.id]}
                              onPress={() => setEditMenuFor((cur) => (cur === m.id ? null : m.id))}
                              className="h-10 w-[140px] justify-center rounded-full font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              radius="full"
                              isLoading={!!publishingIds[m.id]}
                              isDisabled={!!publishingIds[m.id] || !!regeneratingIds[m.id] || !!m.meta?.published_at}
                              onPress={() =>
                                handlePublish(
                                  m.id,
                                  m.id,
                                  { image_path: m.meta?.image_path, caption: m.meta?.caption },
                                  { collapseCandidates: false }
                                )
                              }
                              className="h-10 w-[140px] justify-center rounded-full font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                            >
                              Post
                            </Button>
                          </div>

                          {editMenuFor === m.id ? (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                radius="full"
                                isDisabled={!!publishingIds[m.id] || !!regeneratingIds[m.id]}
                                onPress={() => {
                                  setEditMenuFor(null);
                                  beginRegenerate(
                                    m.id,
                                    (m.meta?.base_prompt ?? m.meta?.prompt ?? "") as string,
                                    !!m.meta?.used_reference_image,
                                    {
                                      numCandidates: 1,
                                      baseImagePath: typeof m.meta?.image_path === "string" ? m.meta.image_path : undefined,
                                    }
                                  );
                                }}
                                className="h-9 w-[140px] justify-center rounded-full font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
                              >
                                Edit image
                              </Button>
                              <Button
                                size="sm"
                                radius="full"
                                isDisabled={!!publishingIds[m.id] || !!regeneratingIds[m.id] || !m.meta?.base_prompt}
                                onPress={() => {
                                  setEditMenuFor(null);
                                  beginCaptionEdit(
                                    m.id,
                                    (m.meta?.base_prompt ?? m.meta?.prompt ?? "") as string,
                                    (m.meta as any)?.caption_language ?? null
                                  );
                                }}
                                className="h-9 w-[140px] justify-center rounded-full font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
                              >
                                Edit caption
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {m.meta?.show_dislike_all ? (
                          <div className="flex items-center justify-start">
                            <Button
                              size="sm"
                              radius="full"
                              isDisabled={isSending}
                              onPress={() =>
                                beginDislikeAll(
                                  m.id,
                                  (m.meta?.base_prompt ?? m.meta?.prompt ?? "") as string,
                                  !!m.meta?.used_reference_image
                                )
                              }
                              className="rounded-full px-4 font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
                            >
                              I don’t like any of those
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {m.role === "assistant" && m.meta?.uploaded_image_url ? (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-2xl overflow-hidden border border-white/60 bg-white/50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.meta.uploaded_image_url} alt="Generated" className="w-full h-auto" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            radius="full"
                            className="rounded-full px-4 font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                            isLoading={!!publishingIds[m.id]}
                            isDisabled={!!publishingIds[m.id] || !!m.meta?.published_at}
                            onPress={() =>
                              handlePublish(m.id, m.id, {
                                image_url: m.meta?.uploaded_image_url,
                                caption: m.meta?.caption,
                              })
                            }
                          >
                            {m.meta?.published_at ? "Published" : "Publish"}
                          </Button>
                          <Button
                            size="sm"
                            radius="full"
                            className="rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
                            isDisabled={!!publishingIds[m.id]}
                            onPress={() =>
                              beginRegenerate(
                                m.id,
                                (m.meta?.base_prompt ?? m.meta?.prompt ?? "") as string,
                                !!m.meta?.used_reference_image,
                                {
                                  baseImagePath:
                                    typeof m.meta?.image_path === "string" ? m.meta.image_path : undefined,
                                }
                              )
                            }
                          >
                            Regenerate
                          </Button>
                        </div>
                        {m.meta?.published_at ? (
                          <p className="text-xs text-slate-700/70">
                            Published{m.meta?.published_post_id ? ` · ID: ${m.meta.published_post_id}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {m.role === "assistant" &&
                    Array.isArray(m.meta?.candidates) &&
                    (m.meta?.candidates?.length ?? 0) > 0 ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {(m.meta.candidates || []).map((c) => {
                            const k = `${m.id}:${c.candidate_id}`;
                            const isPublishing = !!publishingIds[k];
                            const isRegenerating = !!regeneratingIds[k];
                            const isPublished = !!c.published_at || !!m.meta?.published_at;
                            return (
                              <div
                                key={c.candidate_id}
                                className="rounded-2xl overflow-hidden border border-white/60 bg-white/50"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={c.preview_data_url} alt="Candidate" className="w-full h-auto" />
                                <div className="p-3 space-y-3">
                                  {isPublishing ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-700">
                                      <Spinner size="sm" />
                                      <span>Publishing...</span>
                                    </div>
                                  ) : null}

                                  {isRegenerating ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-700">
                                      <Spinner size="sm" />
                                      <span>Regenerating...</span>
                                    </div>
                                  ) : null}

                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      radius="full"
                                      isDisabled={isPublishing || isRegenerating}
                                      onPress={() =>
                                        beginRegenerate(
                                          m.id,
                                          (m.meta?.base_prompt ?? m.meta?.prompt ?? "") as string,
                                          !!m.meta?.used_reference_image,
                                          {
                                            candidateId: c.candidate_id,
                                            numCandidates: 1,
                                            baseImagePath:
                                              typeof c.generated_image_path === "string"
                                                ? c.generated_image_path
                                                : undefined,
                                          }
                                        )
                                      }
                                      className="rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
                                    >
                                      Regenerate
                                    </Button>

                                    <Button
                                      size="sm"
                                      radius="full"
                                      isLoading={isPublishing}
                                      isDisabled={isPublishing || isRegenerating || isPublished}
                                      onPress={() =>
                                        handlePublish(
                                          m.id,
                                          k,
                                          { image_path: c.generated_image_path, caption: m.meta?.caption },
                                          { candidateId: c.candidate_id, collapseCandidates: true }
                                        )
                                      }
                                      className="rounded-full px-3 font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                                    >
                                      Publish
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-start">
                          <Button
                            size="sm"
                            radius="full"
                            isDisabled={isSending}
                            onPress={() =>
                              beginDislikeAll(
                                m.id,
                                (m.meta?.base_prompt ?? m.meta?.prompt ?? "") as string,
                                !!m.meta?.used_reference_image
                              )
                            }
                            className="rounded-full px-4 font-semibold bg-white/70 border border-white/70 shadow-[0_0_14px_rgba(148,163,184,0.25)] hover:shadow-[0_0_22px_rgba(148,163,184,0.45)] transition-all duration-200"
                          >
                            I don’t like any of those
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {renderReferenceIntake()}

              {isSending && !(pendingRegenerate && regeneratingIds[pendingRegenerate.messageId]) ? (
                <div className="flex justify-start">
                  <div className="max-w-[92%] md:max-w-[75%] rounded-2xl bg-white/65 border border-white/60 backdrop-blur-xl px-4 py-3 shadow-md">
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <p className="text-sm md:text-base">
                        {activity ? activityLabel(activity) : t(chatState.language, "thinking")}
                        <ActivityDots />
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="px-5 sm:px-7 pb-5 pt-4 border-t border-white/55 bg-white/60 backdrop-blur-2xl">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <div className="flex-1">
                  <div className="flex items-stretch gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setImageFile(f);
                        if (f) setReferenceImageFile(f);
                        if (f && pendingSuggestionPrompt) {
                          const p = pendingSuggestionPrompt;
                          setPendingSuggestionPrompt(null);
                          setTimeout(() => {
                            setActivity("warming");
                            void handleSendMessage(p);
                          }, 0);
                        }
                      }}
                    />

                    <input
                      ref={referencesInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setReferenceStyleFiles((prev) => {
                          const byKey = new Map<string, File>();
                          for (const f of prev) byKey.set(`${f.name}:${f.size}:${f.lastModified}`, f);
                          for (const f of files) byKey.set(`${f.name}:${f.size}:${f.lastModified}`, f);
                          return Array.from(byKey.values());
                        });
                        // allow reselecting the same file later
                        e.currentTarget.value = "";
                        // As soon as references exist, we consider the intake decision made.
                        setReferenceIntake((prev) => {
                          if (!prev) return prev;
                          return { decided: true, skipped: false };
                        });
                      }}
                    />
                    <div className="flex-1">
                      <textarea
                        className="w-full h-[112px] resize-none rounded-2xl bg-white/80 border border-white/75 px-5 py-4 text-sm md:text-base shadow-[0_0_18px_rgba(148,163,184,0.35)] focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all duration-200"
                        placeholder={
                          pendingRegenerate
                            ? "Describe what to change for the regeneration..."
                            : pendingUseCaseGate?.stage === "pick"
                              ? "Select a use case above..."
                              : pendingUseCaseGate?.stage === "answer"
                                ? "Answer the question above..."
                                : referenceIntake && !referenceIntake.decided
                                  ? "Add reference images above or skip..."
                                  : "Type your message..."
                        }
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSendMessage();
                          }
                        }}
                        disabled={
                          isSending ||
                          isTranscribing ||
                          pendingUseCaseGate?.stage === "pick" ||
                          (!!referenceIntake && !referenceIntake.decided)
                        }
                      />
                      {micError ? (
                        <p className="mt-2 text-xs text-rose-700">{micError}</p>
                      ) : null}
                    </div>

                    {/* Right-side action stack (mic on top, send/generate below) */}
                    <div className="flex flex-col items-end justify-end gap-2">
                      <button
                        type="button"
                        aria-label="Hold to talk"
                        title={micError ? micError : "Hold to talk"}
                        disabled={isSending || isTranscribing}
                        onPointerDown={onMicPointerDown}
                        onPointerUp={onMicPointerUp}
                        onPointerCancel={onMicPointerUp}
                        onPointerLeave={onMicPointerUp}
                        className={[
                          "h-[52px] w-[120px] shrink-0 flex items-center justify-center rounded-full border shadow-[0_0_18px_rgba(148,163,184,0.35)] transition-all duration-200 disabled:opacity-60",
                          isRecording
                            ? "bg-rose-500/90 border-rose-400 text-white shadow-[0_0_22px_rgba(244,63,94,0.65)]"
                            : "bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 border-white/40 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]",
                        ].join(" ")}
                      >
                        {isTranscribing ? (
                          <Spinner size="sm" />
                        ) : (
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.1A5 5 0 0 0 17 11Z" />
                          </svg>
                        )}
                      </button>

                      {pendingRegenerate ? (
                        <Button
                          radius="full"
                          size="lg"
                          variant="flat"
                          onPress={() => setPendingRegenerate(null)}
                          isDisabled={isSending}
                          className="h-[52px] w-[120px] justify-center rounded-full px-0 text-sm md:text-base font-semibold bg-white/75 border border-white/70 shadow-[0_0_15px_rgba(148,163,184,0.25)]"
                        >
                          Cancel
                        </Button>
                      ) : null}

                      <Button
                        radius="full"
                        size="lg"
                        onPress={() => {
                          // If we have an analyzer answer and references are decided, treat this as "Generate" and start generation.
                          if (referenceIntake?.decided && pendingAnalyzerAnswer) {
                            const answer = pendingAnalyzerAnswer;
                            setIsGeneratingImages(true);
                            setGenError(null);
                        setGenProgress(8);
                        setGenPhase(1);
                        setGenStage("Generating 1/3");
                        // Smoothly move progress while request runs, with deterministic caps.
                            const t = window.setInterval(() => {
                              setGenProgress((p) => {
                            const phase = genPhase;
                            const cap = phase === 1 ? 33 : phase === 2 ? 66 : 99;
                            if (p >= cap) return cap;
                            const inc = phase === 1 ? 2.0 : phase === 2 ? 1.6 : 1.0;
                            const next = Math.min(cap, p + inc);
                            // Advance phase when we hit the cap (only for JSON mode; NDJSON will also update phase).
                            if (next >= cap) {
                              if (phase === 1) {
                                setGenPhase(2);
                                setGenStage("Generating 2/3");
                              } else if (phase === 2) {
                                setGenPhase(3);
                                setGenStage("Generating 3/3");
                              }
                            }
                            return next;
                              });
                            }, 260);
                            (async () => {
                              try {
                                await generateThreeImagesNow({ userAnswer: answer });
                                setGenProgress(100);
                                setReferenceIntake(null);
                                setPendingAnalyzerAnswer(null);
                                setEditMenuFor(null);
                                setGenStage("Done");
                                // small delay so user sees 100%
                                setTimeout(() => setIsGeneratingImages(false), 400);
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : "Unknown error occurred";
                                setGenError(msg);
                              } finally {
                                window.clearInterval(t);
                              }
                            })();
                            return;
                          }
                          void handleSendMessage();
                        }}
                        isLoading={isSending}
                        isDisabled={pendingUseCaseGate?.stage === "pick" || (!!referenceIntake && !referenceIntake.decided)}
                        className="h-[52px] w-[120px] justify-center rounded-full text-sm md:text-base font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconSend className="text-slate-900" />
                          <span>{referenceIntake?.decided ? "Generate" : "Send"}</span>
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>

              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>)
  );
}


