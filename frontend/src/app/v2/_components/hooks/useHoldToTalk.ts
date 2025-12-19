"use client";

import * as React from "react";

type HoldToTalkOptions = {
  onTranscript: (text: string) => void;
  onMessage: (msg: string, kind?: "error" | "info") => void;
  disabled?: boolean;
};

type RecordingMode = "mediarecorder" | "wav" | null;

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

export function useHoldToTalk({ onTranscript, onMessage, disabled }: HoldToTalkOptions) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recorderChunksRef = React.useRef<BlobPart[]>([]);
  const recorderMimeRef = React.useRef<string | null>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const scriptNodeRef = React.useRef<ScriptProcessorNode | null>(null);
  const audioSamplesRef = React.useRef<Float32Array[]>([]);
  const recordingModeRef = React.useRef<RecordingMode>(null);

  const pointerDownRef = React.useRef(false);
  const pressStartMsRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      void stopCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCapture() {
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

    // WAV fallback
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

  async function stopCapture(): Promise<Blob | null> {
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

  async function transcribe(blob: Blob) {
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
      form.set("audio", blob, `voice.${ext}`);
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
      if (transcript) onTranscript(transcript);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || isRecording || isTranscribing) return;
    pointerDownRef.current = true;
    pressStartMsRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    try {
      await startCapture();
      if (!pointerDownRef.current) {
        await stopCapture();
        onMessage("keep the button pressed while talking", "info");
        return;
      }
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start microphone.";
      onMessage(msg, "error");
      pointerDownRef.current = false;
      setIsRecording(false);
      await stopCapture();
    }
  }

  async function onPointerUp() {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    const startedAt = pressStartMsRef.current;
    pressStartMsRef.current = null;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const heldMs = startedAt != null ? now - startedAt : 0;

    const MIN_HOLD_MS = 650;
    const isTooShort = heldMs > 0 && heldMs < MIN_HOLD_MS;

    if (!isRecording) {
      await stopCapture();
      if (isTooShort || heldMs === 0) onMessage("keep the button pressed while talking", "info");
      return;
    }

    setIsRecording(false);
    try {
      const blob = await stopCapture();
      const MIN_AUDIO_BYTES = 2048;
      if (isTooShort || !blob || blob.size < MIN_AUDIO_BYTES) {
        onMessage("keep the button pressed while talking", "info");
        return;
      }
      await transcribe(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not stop microphone.";
      onMessage(msg, "error");
      setIsTranscribing(false);
    }
  }

  return {
    isRecording,
    isTranscribing,
    bind: {
      onPointerDown,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onPointerLeave: onPointerUp,
    },
  };
}


