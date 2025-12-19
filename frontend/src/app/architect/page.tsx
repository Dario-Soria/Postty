"use client";

import * as React from "react";
import { Button, Spinner } from "@nextui-org/react";

type Role = "user" | "assistant";

type ArchitectState = "chatting" | "awaiting_references" | "generating_options" | "refining";

type PosttyOption = {
  option_id: number;
  creative_angle: string;
  scenario: 1 | 2 | 3 | 4;
  format: "instagram_reel" | "instagram_feed_post";
  visual_description: string;
  text_overlay: { text: string; position: "top" | "center" | "middle-top"; animation: string };
  copywriting: { hook: string; body: string; cta: string };
  hashtags: string[];
  audio_suggestion: string;
};

type PosttyV10Payload = {
  state: ArchitectState;
  selected_option_id: number | null;
  chat_response: string;
  content_options: PosttyOption[];
};

type ApiResponse =
  | { status: "success"; payload: PosttyV10Payload; is_ready?: boolean; needs_references?: boolean; style_profile?: unknown }
  | { status: "error"; message: string };

type ChatMsg = { id: string; role: Role; content: string };

type OptionPreview = {
  preview_data_url: string;
  generated_image_path: string;
  caption?: string;
  recipe?: unknown;
};

type StyleProfile = {
  palette_hex: string[];
  typography: { headline: string; body: string; accent?: string; weights?: string[] };
  composition: { layout_motifs: string[]; negative_space: string; text_block_placement: string[] };
  imagery_style: { medium: string; lighting: string; texture_grain: string; color_grading: string };
  brand_cues: { logo_usage: string; iconography: string[] };
  do: string[];
  dont: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isCandidateEnvelope(v: unknown): v is { type: string; candidate?: Record<string, unknown> } {
  if (!isRecord(v)) return false;
  return typeof v.type === "string";
}

function getCandidatesArray(v: unknown): unknown[] {
  if (!isRecord(v)) return [];
  const arr = (v as Record<string, unknown>).candidates;
  return Array.isArray(arr) ? arr : [];
}

function getStringField(v: unknown, key: string): string | null {
  if (!isRecord(v)) return null;
  const val = (v as Record<string, unknown>)[key];
  return typeof val === "string" ? val : null;
}

function extractCandidatePreview(c: unknown): OptionPreview | null {
  // New shape: candidate.image.preview_data_url
  if (isRecord(c)) {
    const img = (c as Record<string, unknown>).image;
    if (isRecord(img)) {
      const p = getStringField(img, "preview_data_url");
      const gp = getStringField(img, "generated_image_path");
      if (p && gp) {
        const capObj = (c as Record<string, unknown>).caption;
        const captionText =
          isRecord(capObj)
            ? getStringField(capObj, "text")
            : getStringField(c, "caption_text") ?? getStringField(c, "caption");
        const recipe = (c as Record<string, unknown>).recipe;
        return { preview_data_url: p, generated_image_path: gp, caption: captionText ?? undefined, recipe };
      }
    }
  }
  // Legacy shape: candidate.preview_data_url
  const p = getStringField(c, "preview_data_url");
  const gp = getStringField(c, "generated_image_path");
  if (p && gp) {
    return {
      preview_data_url: p,
      generated_image_path: gp,
      caption: getStringField(c, "caption_text") ?? getStringField(c, "caption") ?? undefined,
      recipe: isRecord(c) ? (c as Record<string, unknown>).recipe : undefined,
    };
  }
  return null;
}

async function readNdjsonCandidates(res: Response): Promise<OptionPreview[]> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/x-ndjson")) {
    // Fallback to non-stream responses (should be rare)
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const maybeMsg = isRecord(data) ? getStringField(data, "message") : null;
      throw new Error(maybeMsg ?? `Generation failed (HTTP ${res.status}).`);
    }
    if (isRecord(data) && getStringField(data, "status") === "error") {
      const msg = getStringField(data, "message") ?? "Generation failed.";
      throw new Error(msg);
    }
    const candidates = getCandidatesArray(data);
    return candidates
      .map((c) => extractCandidatePreview(c))
      .filter((x): x is OptionPreview => x != null);
  }

  const reader = res.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = "";
  const out: OptionPreview[] = [];
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (isCandidateEnvelope(parsed) && parsed.type === "error") {
        sawError = true;
        const msg = isRecord(parsed) ? getStringField(parsed, "message") : null;
        throw new Error(msg ?? "Generation failed.");
      }
      if (isCandidateEnvelope(parsed) && parsed.type === "candidate" && isRecord(parsed.candidate)) {
        const p = extractCandidatePreview(parsed.candidate);
        if (p) out.push(p);
      }
    }
  }

  if (!out.length && !sawError && !res.ok) {
    throw new Error(`Generation failed (HTTP ${res.status}).`);
  }

  return out;
}

export default function ArchitectPage() {
  const [messages, setMessages] = React.useState<ChatMsg[]>([
    {
      id: "a-welcome",
      role: "assistant",
      content:
        "Hola, soy Postty.\n\nSube una foto o escribe tu idea. Haré 1–3 preguntas y cuando esté listo podrás generar 3 opciones.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [referenceFiles, setReferenceFiles] = React.useState<File[]>([]);
  const [state, setState] = React.useState<ArchitectState>("chatting");
  const [isReady, setIsReady] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [options, setOptions] = React.useState<PosttyOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = React.useState<number | null>(null);
  const [refineText, setRefineText] = React.useState("");
  const [styleProfile, setStyleProfile] = React.useState<StyleProfile | null>(null);

  const [previews, setPreviews] = React.useState<Record<number, OptionPreview | null>>({});
  const [previewLoading, setPreviewLoading] = React.useState<Record<number, boolean>>({});

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const referencesInputRef = React.useRef<HTMLInputElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages.length]);

  function historyForApi(): Array<{ role: Role; content: string }> {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-18)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function callArchitect(params: {
    mode: "chatting" | "generate_3" | "refine";
    message: string;
    selected_option_id?: number | null;
    last_content_options?: PosttyOption[] | null;
    skip_references?: boolean;
  }): Promise<ApiResponse> {
    // When we have local files, use multipart.
    if (imageFile || referenceFiles.length > 0) {
      const form = new FormData();
      if (imageFile) form.set("image", imageFile);
      form.set("message", params.message);
      form.set("mode", params.mode);
      form.set("history", JSON.stringify(historyForApi()));
      form.set("has_photo", imageFile ? "true" : "false");
      if (params.selected_option_id != null) form.set("selected_option_id", String(params.selected_option_id));
      if (params.last_content_options) form.set("last_content_options", JSON.stringify(params.last_content_options));
      if (params.skip_references) form.set("skip_references", "true");
      if (styleProfile) form.set("style_profile", JSON.stringify(styleProfile));
      for (const rf of referenceFiles) form.append("references", rf);
      const res = await fetch("/api/postty-architect", { method: "POST", body: form });
      return (await res.json()) as ApiResponse;
    }

    const res = await fetch("/api/postty-architect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: params.message,
        history: historyForApi(),
        mode: params.mode,
        selected_option_id: params.selected_option_id ?? null,
        last_content_options: params.last_content_options ?? null,
        has_photo: false,
        skip_references: !!params.skip_references,
        style_profile: styleProfile,
      }),
    });
    return (await res.json()) as ApiResponse;
  }

  function styleProfileToPrompt(profile: StyleProfile): string {
    const palette = (profile.palette_hex || []).slice(0, 8).join(", ");
    const motifs = (profile.composition?.layout_motifs || []).slice(0, 8).join("; ");
    const placements = (profile.composition?.text_block_placement || []).slice(0, 6).join("; ");
    const icons = (profile.brand_cues?.iconography || []).slice(0, 8).join("; ");
    const doList = (profile.do || []).slice(0, 8).join("; ");
    const dontList = (profile.dont || []).slice(0, 8).join("; ");
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

  async function generatePreviewForOption(opt: PosttyOption): Promise<OptionPreview | null> {
    // Use existing generation endpoints. We request preview_only + 1 candidate.
    const styledPrompt =
      styleProfile ? `${opt.visual_description}\n\n${styleProfileToPrompt(styleProfile)}` : opt.visual_description;
    if (imageFile) {
      const form = new FormData();
      form.set("image", imageFile);
      form.set("prompt", styledPrompt);
      form.set("preview_only", "true");
      form.set("num_candidates", "1");
      const res = await fetch("/api/generate-with-image", { method: "POST", body: form });
      const candidates = await readNdjsonCandidates(res);
      return candidates[0] ?? null;
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: styledPrompt, preview_only: true, num_candidates: 1 }),
    });
    const candidates = await readNdjsonCandidates(res);
    return candidates[0] ?? null;
  }

  async function fetchPreviewsForOptions(opts: PosttyOption[]) {
    // Small parallelism (3). Track loading state per card.
    const ids = opts.map((o) => o.option_id);
    setPreviewLoading((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });

    try {
      const results = await Promise.all(
        opts.map(async (o) => {
          try {
            const p = await generatePreviewForOption(o);
            return { id: o.option_id, preview: p };
          } catch {
            return { id: o.option_id, preview: null };
          }
        })
      );
      setPreviews((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.preview;
        return next;
      });
    } finally {
      setPreviewLoading((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = false;
        return next;
      });
    }
  }

  async function onSend() {
    const text = input.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
      setInput("");

      const data = await callArchitect({ mode: "chatting", message: text });
      if (data.status !== "success") {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
        return;
      }

      setState(data.payload.state);
      setIsReady(!!data.is_ready);
      setOptions(data.payload.content_options || []);
      setSelectedOptionId(data.payload.selected_option_id ?? null);
      if (data.style_profile && isRecord(data.style_profile)) setStyleProfile(data.style_profile as StyleProfile);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.payload.chat_response }]);
    } finally {
      setIsSending(false);
    }
  }

  async function onGenerate3() {
    if (isSending) return;
    setIsSending(true);
    try {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: "Generar Post" },
      ]);

      const data = await callArchitect({
        mode: "generate_3",
        message: "Generar Post",
        last_content_options: options.length ? options : null,
      });
      if (data.status !== "success") {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
        return;
      }

      setState(data.payload.state);
      setIsReady(!!data.is_ready);
      setOptions(data.payload.content_options || []);
      setSelectedOptionId(data.payload.selected_option_id ?? null);
      if (data.style_profile && isRecord(data.style_profile)) setStyleProfile(data.style_profile as StyleProfile);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: data.payload.chat_response },
      ]);

      // Kick off previews for the 3 options.
      if (data.payload.state === "generating_options" && (data.payload.content_options?.length ?? 0) === 3) {
        await fetchPreviewsForOptions(data.payload.content_options);
      }
    } finally {
      setIsSending(false);
    }
  }

  async function onSkipReferences() {
    if (isSending) return;
    setIsSending(true);
    try {
      setReferenceFiles([]);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: "Saltar referencias" }]);
      const data = await callArchitect({
        mode: "generate_3",
        message: "Generar Post",
        last_content_options: options.length ? options : null,
        skip_references: true,
      });
      if (data.status !== "success") {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
        return;
      }
      setState(data.payload.state);
      setIsReady(!!data.is_ready);
      setOptions(data.payload.content_options || []);
      setSelectedOptionId(data.payload.selected_option_id ?? null);
      if (data.style_profile && isRecord(data.style_profile)) setStyleProfile(data.style_profile as StyleProfile);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.payload.chat_response }]);
      if (data.payload.state === "generating_options" && (data.payload.content_options?.length ?? 0) === 3) {
        await fetchPreviewsForOptions(data.payload.content_options);
      }
    } finally {
      setIsSending(false);
    }
  }

  async function onUploadReferencesAndContinue() {
    if (isSending) return;
    setIsSending(true);
    try {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: referenceFiles.length ? `Subo ${referenceFiles.length} referencias` : "No tengo referencias" },
      ]);
      const data = await callArchitect({
        mode: "generate_3",
        message: "Generar Post",
        last_content_options: options.length ? options : null,
        skip_references: referenceFiles.length === 0,
      });
      if (data.status !== "success") {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
        return;
      }
      setState(data.payload.state);
      setIsReady(!!data.is_ready);
      setOptions(data.payload.content_options || []);
      setSelectedOptionId(data.payload.selected_option_id ?? null);
      if (data.style_profile && isRecord(data.style_profile)) setStyleProfile(data.style_profile as StyleProfile);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.payload.chat_response }]);
      if (data.payload.state === "generating_options" && (data.payload.content_options?.length ?? 0) === 3) {
        await fetchPreviewsForOptions(data.payload.content_options);
      }
    } finally {
      setIsSending(false);
    }
  }

  function currentSelectedOption(): PosttyOption | null {
    if (selectedOptionId == null) return null;
    return options.find((o) => o.option_id === selectedOptionId) ?? null;
  }

  async function onSelectOption(id: number) {
    setSelectedOptionId(id);
    setState("refining");
    setRefineText("");
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: `Selecciono la opción ${id}` },
      { id: crypto.randomUUID(), role: "assistant", content: "Perfecto. ¿Qué quieres cambiar?" },
    ]);
  }

  async function onRefine() {
    const sel = selectedOptionId;
    const msg = refineText.trim();
    if (sel == null || !msg || isSending) return;
    setIsSending(true);
    try {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: msg }]);
      setRefineText("");

      const data = await callArchitect({
        mode: "refine",
        message: msg,
        selected_option_id: sel,
        last_content_options: options.length ? options : null,
      });
      if (data.status !== "success") {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
        return;
      }

      setState(data.payload.state);
      setIsReady(!!data.is_ready);
      setSelectedOptionId(data.payload.selected_option_id ?? sel);
      setOptions(data.payload.content_options || []);
      if (data.status === "success" && data.style_profile && isRecord(data.style_profile)) setStyleProfile(data.style_profile as StyleProfile);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.payload.chat_response }]);

      // Regenerate preview for the refined single option.
      if (data.payload.state === "refining" && data.payload.content_options?.length === 1) {
        const opt = data.payload.content_options[0];
        setPreviewLoading((p) => ({ ...p, [opt.option_id]: true }));
        try {
          const pvw = await generatePreviewForOption(opt);
          setPreviews((p) => ({ ...p, [opt.option_id]: pvw }));
        } finally {
          setPreviewLoading((p) => ({ ...p, [opt.option_id]: false }));
        }
      }
    } finally {
      setIsSending(false);
    }
  }

  const selected = currentSelectedOption();

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-indigo-100 to-rose-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 text-slate-900 dark:text-slate-50 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl h-[min(900px,100dvh-1rem)] sm:h-[min(900px,100dvh-2rem)] bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-white/60 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex h-full">
          <div className="flex-1 flex flex-col">
            <header className="px-4 sm:px-6 pt-4 pb-2 border-b border-white/40 dark:border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Postty · Content Architect</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    chatting → gallery (3) → refining (1)
                  </p>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 hidden md:block">
                  Endpoint: <span className="font-semibold">/postty-architect</span>
                </div>
              </div>
            </header>

            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[90%] md:max-w-[75%] rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 backdrop-blur-xl px-4 py-3 shadow-md"
                        : "max-w-[90%] md:max-w-[75%] rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-white/60 dark:border-white/10 backdrop-blur-xl px-4 py-3 shadow-md"
                    }
                  >
                    <p className="text-sm md:text-base whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}

              {state === "generating_options" && options.length === 3 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 font-semibold">
                      Opciones (3)
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {imageFile ? "Con foto" : "Sin foto"}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {options.map((o) => {
                      const p = previews[o.option_id] ?? null;
                      const loading = !!previewLoading[o.option_id];
                      return (
                        <div
                          key={o.option_id}
                          className="rounded-2xl overflow-hidden border border-white/60 dark:border-white/10 bg-white/50 dark:bg-white/5"
                        >
                          <div className="aspect-square bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center">
                            {loading ? (
                              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <Spinner size="sm" />
                                <span>Generando preview...</span>
                              </div>
                            ) : p?.preview_data_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.preview_data_url} alt={`Option ${o.option_id}`} className="w-full h-full object-cover" />
                            ) : (
                              <p className="text-sm text-slate-700 dark:text-slate-200 px-4 text-center">
                                Preview pendiente
                              </p>
                            )}
                          </div>
                          <div className="p-4 space-y-2">
                            <p className="text-sm font-semibold">
                              Opción {o.option_id}: {o.creative_angle}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {o.format === "instagram_reel" ? "Reel" : "Feed"} · Escenario {o.scenario}
                            </p>
                            <div className="space-y-1">
                              <p className="text-xs font-semibold">Hook</p>
                              <p className="text-sm">{o.copywriting.hook}</p>
                              <p className="text-xs font-semibold">Body</p>
                              <p className="text-sm">{o.copywriting.body}</p>
                              <p className="text-xs font-semibold">CTA</p>
                              <p className="text-sm">{o.copywriting.cta}</p>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-semibold">Overlay:</span> {o.text_overlay.text} · {o.text_overlay.position}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-semibold">Audio:</span> {o.audio_suggestion}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(o.hashtags || []).slice(0, 8).map((h, idx) => (
                                <span
                                  key={`${o.option_id}-h-${idx}`}
                                  className="text-xs rounded-full bg-white/60 dark:bg-slate-900/50 border border-white/60 dark:border-white/10 px-2 py-0.5"
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              radius="full"
                              isDisabled={isSending}
                              onPress={() => onSelectOption(o.option_id)}
                              className="w-full rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900 shadow-[0_0_16px_rgba(232,121,249,0.45)] transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_24px_rgba(232,121,249,0.65)]"
                            >
                              Elegir esta opción
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {state === "refining" && selected ? (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 font-semibold">
                    Refinando (opción {selected.option_id})
                  </p>
                  <div className="rounded-2xl overflow-hidden border border-white/60 dark:border-white/10 bg-white/50 dark:bg-white/5">
                    <div className="aspect-square bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center">
                      {previewLoading[selected.option_id] ? (
                        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <Spinner size="sm" />
                          <span>Generando preview...</span>
                        </div>
                      ) : previews[selected.option_id]?.preview_data_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previews[selected.option_id]?.preview_data_url as string}
                          alt="Selected preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <p className="text-sm text-slate-700 dark:text-slate-200 px-4 text-center">
                          Preview pendiente
                        </p>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <p className="text-sm font-semibold">{selected.creative_angle}</p>
                      <p className="text-sm">{selected.copywriting.hook}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{selected.copywriting.body}</p>
                      <p className="text-sm">{selected.copywriting.cta}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {isSending ? (
                <div className="flex justify-start">
                  <div className="max-w-[90%] md:max-w-[75%] rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-white/60 dark:border-white/10 backdrop-blur-xl px-4 py-3 shadow-md">
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <p className="text-sm md:text-base">Pensando...</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="px-4 sm:px-6 pb-4 pt-2 border-t border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl">
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setImageFile(f);
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
                    setReferenceFiles(files);
                  }}
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Attach image"
                    disabled={isSending}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-[52px] w-[52px] shrink-0 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 shadow-[0_0_15px_rgba(148,163,184,0.35)] hover:shadow-[0_0_22px_rgba(148,163,184,0.55)] transition-all duration-200 disabled:opacity-60"
                  >
                    <span className="text-xl leading-none font-semibold text-slate-800 dark:text-slate-100">+</span>
                  </button>

                  <div className="flex-1">
                    {state === "awaiting_references" ? (
                      <div className="mb-2 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 px-4 py-3">
                        <p className="text-sm font-semibold">Referencias (opcional)</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Sube imágenes de referencia para copiar colores, tipografía, composición y vibe. O salta este paso.
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            radius="full"
                            variant="flat"
                            isDisabled={isSending}
                            onPress={() => referencesInputRef.current?.click()}
                            className="rounded-full"
                          >
                            Elegir referencias
                          </Button>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {referenceFiles.length ? `${referenceFiles.length} seleccionadas` : "Ninguna seleccionada"}
                          </p>
                          {referenceFiles.length ? (
                            <button
                              className="ml-auto text-xs text-slate-600 dark:text-slate-300 underline underline-offset-4"
                              onClick={() => setReferenceFiles([])}
                              type="button"
                            >
                              Quitar
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center gap-2 justify-end">
                          <Button radius="full" size="sm" variant="flat" isDisabled={isSending} onPress={() => onSkipReferences()}>
                            Saltar
                          </Button>
                          <Button
                            radius="full"
                            size="sm"
                            isDisabled={isSending}
                            onPress={() => onUploadReferencesAndContinue()}
                            className="rounded-full px-4 font-semibold bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 text-slate-900"
                          >
                            Continuar y generar
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {state === "refining" ? (
                      <textarea
                        className="w-full min-h-[52px] max-h-40 resize-none rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 px-4 py-3 text-sm md:text-base shadow-[0_0_15px_rgba(148,163,184,0.35)] focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all duration-200"
                        placeholder="Qué quieres cambiar..."
                        value={refineText}
                        onChange={(e) => setRefineText(e.target.value)}
                        disabled={isSending}
                      />
                    ) : (
                      <textarea
                        className="w-full min-h-[52px] max-h-40 resize-none rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 px-4 py-3 text-sm md:text-base shadow-[0_0_15px_rgba(148,163,184,0.35)] focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all duration-200"
                        placeholder="Escribe tu idea..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isSending}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void onSend();
                          }
                        }}
                      />
                    )}

                    {imageFile ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-2 rounded-full bg-white/60 dark:bg-slate-900/50 border border-white/70 dark:border-white/10 px-3 py-1 backdrop-blur-xl">
                            <span className="font-semibold">Foto:</span>
                            <span className="truncate max-w-[16rem]">{imageFile.name}</span>
                          </span>
                        </div>
                        <button
                          className="text-xs text-slate-600 dark:text-slate-300 underline underline-offset-4"
                          onClick={() => setImageFile(null)}
                          type="button"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {state === "chatting" ? (
                    <Button
                      radius="full"
                      size="lg"
                      variant="flat"
                      onPress={() => onGenerate3()}
                      isDisabled={isSending || (!isReady && messages.length <= 1)}
                      className="h-[52px] rounded-full px-6 text-sm md:text-base font-semibold bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 shadow-[0_0_15px_rgba(148,163,184,0.25)]"
                    >
                      Generar Post
                    </Button>
                  ) : null}

                  {state === "awaiting_references" ? (
                    <Button
                      radius="full"
                      size="lg"
                      variant="flat"
                      onPress={() => referencesInputRef.current?.click()}
                      isDisabled={isSending}
                      className="h-[52px] rounded-full px-6 text-sm md:text-base font-semibold bg-white/70 dark:bg-slate-900/60 border border-white/70 dark:border-white/10 shadow-[0_0_15px_rgba(148,163,184,0.25)]"
                    >
                      Elegir referencias
                    </Button>
                  ) : null}

                  {state === "refining" ? (
                    <Button
                      radius="full"
                      size="lg"
                      onPress={() => onRefine()}
                      isLoading={isSending}
                      isDisabled={isSending || !refineText.trim() || selectedOptionId == null}
                      className="h-[52px] rounded-full px-6 text-sm md:text-base font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                    >
                      Ver nueva versión
                    </Button>
                  ) : (
                    <Button
                      radius="full"
                      size="lg"
                      onPress={() => onSend()}
                      isLoading={isSending}
                      isDisabled={isSending || !input.trim()}
                      className="h-[52px] rounded-full px-6 text-sm md:text-base font-semibold bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_18px_rgba(56,189,248,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_26px_rgba(56,189,248,0.9)]"
                    >
                      Enviar
                    </Button>
                  )}
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}


