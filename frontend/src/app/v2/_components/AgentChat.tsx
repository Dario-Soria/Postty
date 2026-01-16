"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";
import { useHoldToTalk } from "./hooks/useHoldToTalk";
import { openTextEditor, type BackendTextLayout } from "@/lib/features/text-editor";
import { useAuth } from "@/contexts/AuthContext";
import { IconEraser } from "./ui/Icons";

type ReferenceOption = {
  id: string;
  url: string;
  description: string;
  keywords: string[];
  filename: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  references?: ReferenceOption[];
  textLayout?: BackendTextLayout;
};

type PersistedAgentChatState = {
  sessionId: string;
  messages: Message[];
  historyCutoffIndex?: number;
  pending?: boolean;
  pendingRequestId?: string | null;
};

type Props = {
  agentId: string;
  agentName: string;
  onBack: () => void;
  showToast: (message: string, kind?: "error" | "info") => void;
};

export function AgentChat({ agentId, agentName, onBack, showToast }: Props) {
  const { user, loading } = useAuth();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [historyCutoffIndex, setHistoryCutoffIndex] = React.useState(0);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [clientSessionId, setClientSessionId] = React.useState<string | null>(null);
  const [previewReference, setPreviewReference] = React.useState<{ ref: ReferenceOption; index: number } | null>(null);
  const [selectedReferenceFilename, setSelectedReferenceFilename] = React.useState<string | null>(null);
  const [showCaptionModal, setShowCaptionModal] = React.useState(false);
  const [captionInput, setCaptionInput] = React.useState("");
  const [publishingImageUrl, setPublishingImageUrl] = React.useState<string | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isCaptionGenerating, setIsCaptionGenerating] = React.useState(false);
  const [lastPromptForCaption, setLastPromptForCaption] = React.useState<string>("");
  const [lastUploadedProductImage, setLastUploadedProductImage] = React.useState<File | null>(null);
  const captionGenSeqRef = React.useRef(0);
  const mountedRef = React.useRef(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fileToDataUrl = React.useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (!result) return reject(new Error("Failed to read image file"));
        resolve(result);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  function tryExtractPipelineTrigger(raw: string): null | {
    prompt: string;
    skipText?: boolean;
    textContent?: { headline?: string; subheadline?: string; cta?: string };
    referenceImage?: string;
  } {
    // Expect a fenced json block containing { "TRIGGER_GENERATE_PIPELINE": { ... } }
    const m = raw.match(/```json\s*([\s\S]*?)```/i);
    if (!m) return null;
    try {
      const parsed = JSON.parse(m[1] || "");
      // Support both formats:
      // 1) { "TRIGGER_GENERATE_PIPELINE": { ... } }
      // 2) { "tool_code": { "tool_name": "TRIGGER_GENERATE_PIPELINE", "parameters": { ... } } }
      let params: any = null;
      if (parsed?.TRIGGER_GENERATE_PIPELINE && typeof parsed.TRIGGER_GENERATE_PIPELINE === "object") {
        params = parsed.TRIGGER_GENERATE_PIPELINE;
      } else if (
        parsed?.tool_code &&
        typeof parsed.tool_code === "object" &&
        String(parsed.tool_code.tool_name || "").toUpperCase() === "TRIGGER_GENERATE_PIPELINE" &&
        parsed.tool_code.parameters &&
        typeof parsed.tool_code.parameters === "object"
      ) {
        params = parsed.tool_code.parameters;
      }

      if (!params) return null;

      const prompt = typeof params.PROMPT === "string" ? params.PROMPT : "";
      if (!prompt.trim()) return null;
      const textArr = Array.isArray(params.TEXT_CONTENT) ? params.TEXT_CONTENT : null;
      const textContent =
        textArr && (typeof textArr[0] === "string" || typeof textArr[1] === "string" || typeof textArr[2] === "string")
          ? {
              headline: typeof textArr[0] === "string" ? textArr[0] : undefined,
              subheadline: typeof textArr[1] === "string" ? textArr[1] : undefined,
              cta: typeof textArr[2] === "string" ? textArr[2] : undefined,
            }
          : undefined;

      const referenceImage =
        typeof params.REFERENCE_IMAGE === "string" && params.REFERENCE_IMAGE.trim().length > 0
          ? params.REFERENCE_IMAGE.trim()
          : undefined;
      return {
        prompt: prompt.trim(),
        skipText: typeof params.SKIP_TEXT === "boolean" ? params.SKIP_TEXT : undefined,
        textContent,
        referenceImage,
      };
    } catch {
      return null;
    }
  }

  const makeFreshSessionId = React.useCallback(() => {
    const base = user?.uid ? `uid-${user.uid}` : "anon";
    return `${base}-${crypto.randomUUID()}`;
  }, [user?.uid]);

  const storageKey = React.useMemo(() => {
    const uid = user?.uid ? `uid-${user.uid}` : "anon";
    return `postty:v2:agentchat:${uid}:${agentId}`;
  }, [agentId, user?.uid]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const readPersisted = React.useCallback((): PersistedAgentChatState | null => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const sid = typeof parsed?.sessionId === "string" ? parsed.sessionId : null;
      const msgs = Array.isArray(parsed?.messages) ? (parsed.messages as Message[]) : null;
      if (!sid) return null;
      return {
        sessionId: sid,
        messages: msgs ?? [],
        historyCutoffIndex:
          typeof parsed?.historyCutoffIndex === "number" && Number.isFinite(parsed.historyCutoffIndex)
            ? Math.max(0, Math.trunc(parsed.historyCutoffIndex))
            : 0,
        pending: !!parsed?.pending,
        pendingRequestId: typeof parsed?.pendingRequestId === "string" ? parsed.pendingRequestId : null,
      };
    } catch {
      return null;
    }
  }, [storageKey]);

  const writePersisted = React.useCallback(
    (next: PersistedAgentChatState) => {
      try {
        if (typeof window === "undefined") return;
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  const setPendingInStorage = React.useCallback(
    (pendingRequestId: string) => {
      const current = readPersisted();
      const sid = current?.sessionId || clientSessionId;
      if (!sid) return;
      writePersisted({
        sessionId: sid,
        messages: current?.messages ?? messages,
        historyCutoffIndex: current?.historyCutoffIndex ?? historyCutoffIndex,
        pending: true,
        pendingRequestId,
      });
    },
    [clientSessionId, historyCutoffIndex, messages, readPersisted, writePersisted]
  );

  const clearPendingInStorage = React.useCallback(
    (pendingRequestId: string) => {
      const current = readPersisted();
      if (!current?.sessionId) return;
      if (current.pendingRequestId && current.pendingRequestId !== pendingRequestId) return;
      writePersisted({
        ...current,
        pending: false,
        pendingRequestId: null,
      });
    },
    [readPersisted, writePersisted]
  );

  const appendMessageToStorage = React.useCallback(
    (pendingRequestId: string, msg: Message) => {
      const current = readPersisted();
      const sid = current?.sessionId || clientSessionId;
      if (!sid) return;
      // Only append if this response corresponds to the latest pending request (avoids duplicates).
      if (current?.pendingRequestId && current.pendingRequestId !== pendingRequestId) return;
      const baseMessages = Array.isArray(current?.messages) ? current!.messages : messages;
      const nextMessages = Array.isArray(baseMessages) ? [...baseMessages, msg] : [msg];
      writePersisted({
        sessionId: sid,
        messages: nextMessages,
        historyCutoffIndex: current?.historyCutoffIndex ?? historyCutoffIndex,
        pending: false,
        pendingRequestId: null,
      });
    },
    [clientSessionId, historyCutoffIndex, messages, readPersisted, writePersisted]
  );

  // Restore chat session/messages on mount so going to Mis posts and back doesn't reset the flow.
  React.useEffect(() => {
    if (loading) return;
    if (clientSessionId) return;
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        const sid = typeof parsed?.sessionId === "string" ? parsed.sessionId : null;
        const msgs = Array.isArray(parsed?.messages) ? (parsed.messages as Message[]) : null;
        const cutoff =
          typeof parsed?.historyCutoffIndex === "number" && Number.isFinite(parsed.historyCutoffIndex)
            ? Math.max(0, Math.trunc(parsed.historyCutoffIndex))
            : 0;
        if (sid) setClientSessionId(sid);
        if (msgs && msgs.length > 0) setMessages(msgs);
        setHistoryCutoffIndex(cutoff);
        if (sid && msgs && msgs.length > 0) {
          // Prevent the greeting effect from firing for a restored session that already has messages.
          lastGreetedSessionRef.current = sid;
        }
        // If there is an in-flight request, restore the busy indicator so the user sees we're waiting.
        if (parsed?.pending === true) {
          setIsSending(true);
        }
        return;
      }
    } catch {
      // ignore
    }

    // Fallback: new session
    const sid = makeFreshSessionId();
    setClientSessionId(sid);
  }, [clientSessionId, loading, makeFreshSessionId, storageKey]);

  // Persist session + messages (keeps chat state across navigation)
  React.useEffect(() => {
    if (!clientSessionId) return;
    const current = readPersisted();
    // Preserve any in-flight marker written by handleSendMessage so it survives navigation.
    writePersisted({
      sessionId: clientSessionId,
      messages,
      historyCutoffIndex,
      pending: current?.pending ?? false,
      pendingRequestId: current?.pendingRequestId ?? null,
    });
  }, [clientSessionId, historyCutoffIndex, messages, readPersisted, writePersisted]);

  // If the user navigates away while a request is pending, the response can be appended to sessionStorage
  // by an older (unmounted) AgentChat instance. While we're "sending", poll sessionStorage so the new
  // instance picks up the finished result immediately (no UI change; just state resilience).
  React.useEffect(() => {
    if (!clientSessionId) return;
    if (!isSending) return;
    if (typeof window === "undefined") return;

    let stopped = false;
    const tick = () => {
      const current = readPersisted();
      if (!current) return;
      if (current.sessionId !== clientSessionId) return;

      if (Array.isArray(current.messages) && current.messages.length !== messages.length) {
        setMessages(current.messages);
      }
      const nextCutoff =
        typeof current.historyCutoffIndex === "number" && Number.isFinite(current.historyCutoffIndex)
          ? Math.max(0, Math.trunc(current.historyCutoffIndex))
          : 0;
      if (nextCutoff !== historyCutoffIndex) setHistoryCutoffIndex(nextCutoff);

      if (current.pending !== true) {
        setIsSending(false);
      }
    };

    tick();
    const t = window.setInterval(() => {
      if (stopped) return;
      tick();
    }, 500);

    return () => {
      stopped = true;
      window.clearInterval(t);
    };
    // We intentionally only depend on message count (not full messages) to keep this lightweight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSessionId, historyCutoffIndex, isSending, messages.length, readPersisted]);

  const getBackendHistory = React.useCallback(() => {
    // The backend currently doesn't strictly require conversationHistory, but we keep it correct and
    // future-proof by only sending messages after the last soft reset.
    const slice = messages.slice(Math.min(Math.max(historyCutoffIndex, 0), messages.length));
    return slice
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));
  }, [historyCutoffIndex, messages]);

  // Scroll to bottom when messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  React.useEffect(() => {
    inputRef.current?.focus();
  }, [messages, isTyping]);

  // Handle ESC key to close preview modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewReference) {
        handleClosePreview();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [previewReference]);

  // Initial greeting from agent when component mounts
  const lastGreetedSessionRef = React.useRef<string | null>(null);
  
  React.useEffect(() => {
    if (!clientSessionId) return;
    if (lastGreetedSessionRef.current === clientSessionId) return;
    // If we already have messages (restored session), don't restart the conversation.
    if (messages.length > 0) return;
    lastGreetedSessionRef.current = clientSessionId;
    
    const fetchInitialGreeting = async () => {
      setIsTyping(true);
      
      try {
        const formData = new FormData();
        formData.append("agentType", agentId);
        formData.append("message", "START_CONVERSATION"); // Special message to trigger greeting
        formData.append("conversationHistory", JSON.stringify([]));
        formData.append("sessionId", clientSessionId);
        
        // Add userId for session isolation
        if (user?.uid) {
          formData.append("userId", user.uid);
        }
        
        const response = await fetch("/api/agent-chat", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          if (result.type === "text" && result.text) {
            addAssistantMessage(result.text);
          } else {
            // Fallback greeting if agent doesn't respond
            const fallbackGreeting = "¡Hola! ¿En qué puedo ayudarte hoy?";
            addAssistantMessage(fallbackGreeting);
          }
        } else {
          // Fallback if API fails
          const fallbackGreeting = "¡Hola! ¿En qué puedo ayudarte hoy?";
          addAssistantMessage(fallbackGreeting);
        }
      } catch (error) {
        console.error("Error fetching initial greeting:", error);
        // Fallback greeting on error
        const fallbackGreeting = "¡Hola! ¿En qué puedo ayudarte hoy?";
        addAssistantMessage(fallbackGreeting);
      } finally {
        setIsTyping(false);
      }
    };

    fetchInitialGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, loading, clientSessionId, user?.uid]);

  const addAssistantMessage = (
    content: string,
    imageUrl?: string,
    textLayout?: any,
    opts?: { references?: ReferenceOption[]; pendingRequestId?: string }
  ) => {
    if (mountedRef.current) setIsTyping(true);
    const delay = 800 + Math.random() * 400;
    setTimeout(() => {
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        imageUrl,
        textLayout,
        ...(opts?.references ? { references: opts.references } : {}),
      };

      if (opts?.pendingRequestId) appendMessageToStorage(opts.pendingRequestId, msg);

      if (mountedRef.current) {
        setMessages((prev) => [...prev, msg]);
        setIsTyping(false);
      }
    }, delay);
  };

  const addUserMessage = (content: string, imageUrl?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
        imageUrl,
      },
    ]);
  };

  const hardReset = React.useCallback(async () => {
    // New session id guarantees the backend creates a completely fresh agent instance
    const nextSessionId = makeFreshSessionId();
    setClientSessionId(nextSessionId);
    // Prevent the auto-greeting effect from also firing for this new session
    lastGreetedSessionRef.current = nextSessionId;

    // Clear all UI state (messages, images, reference selection, modals)
    setIsTyping(false);
    setIsSending(false);
    setInputValue("");
    setPreviewReference(null);
    setShowCaptionModal(false);
    setCaptionInput("");
    setPublishingImageUrl(null);
    setIsPublishing(false);
    setMessages([]);
    setHistoryCutoffIndex(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    try {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }

    // Ask agent to hard-reset server-side state and return a fresh greeting
    setIsTyping(true);
    try {
      const formData = new FormData();
      formData.append("agentType", agentId);
      formData.append("message", "RESET_CONVERSATION");
      formData.append("conversationHistory", JSON.stringify([]));
      formData.append("sessionId", nextSessionId);
      if (user?.uid) formData.append("userId", user.uid);

      const response = await fetch("/api/agent-chat", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Failed to reset conversation");
      const result = await response.json();
      if (result?.type === "text" && result.text) {
        // Add immediately (no typing delay) so it feels like a true fresh start
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.text,
          },
        ]);
      } else {
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "¡Listo! Subí la foto de tu nuevo producto usando el botón (+) 📸",
          },
        ]);
      }
    } catch (error) {
      console.error("Error hard-resetting conversation:", error);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "¡Listo! Subí la foto de tu nuevo producto usando el botón (+) 📸",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [agentId, makeFreshSessionId, storageKey, user?.uid]);

  const softReset = React.useCallback(async () => {
    // Keep transcript, but reset backend session and clear current product flow state.
    const nextSessionId = makeFreshSessionId();
    setClientSessionId(nextSessionId);
    // Prevent auto-greeting for this brand new session; we'll prompt the user ourselves.
    lastGreetedSessionRef.current = nextSessionId;

    // New backend context begins after the current transcript.
    setHistoryCutoffIndex(messages.length);

    // Clear only "current run" UI state (but keep transcript)
    setIsTyping(false);
    setIsSending(false);
    setInputValue("");
    setPreviewReference(null);
    setShowCaptionModal(false);
    setCaptionInput("");
    setPublishingImageUrl(null);
    setIsPublishing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Append a Step 0 style instruction per prompt.md
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Ok. Subí la foto del nuevo producto usando el botón (+) y arrancamos de nuevo.",
      },
    ]);
  }, [makeFreshSessionId, messages.length]);

  const isStartOverIntent = React.useCallback((text: string) => {
    const msg = text.trim().toLowerCase();
    if (!msg) return false;
    const keywords = [
      "otro producto",
      "nueva imagen",
      "nuevo producto",
      "empezar de nuevo",
      "otra imagen",
      "generar otra",
      "generar otra imagen",
      "generar una nueva imagen",
      "start over",
      "different product",
      "another product",
      "new product",
      "create another",
      "quiero crear otra",
      "vamos a crear una nueva",
      "crear algo con otro",
      "imagen de producto nueva",
      "producto nueva",
      "generate another",
      "generate a new image",
      "another picture",
      "new picture",
      "restart",
    ];
    return keywords.some((k) => msg.includes(k));
  }, []);

  const handleSendMessage = async (text?: string, uploadedFile?: File) => {
    const messageText = text || inputValue.trim();
    if (!messageText && !uploadedFile) return;
    if (isSending || isTyping) return;

    // If the user is asking to start over, do a full reset (forget images + references + conversation)
    if (messageText && isStartOverIntent(messageText)) {
      await softReset();
      return;
    }

    if (mountedRef.current) setInputValue("");
    
    // Add user message to chat
    // UI vs backend message:
    // - UI message should remain user-friendly ("📸 Imagen subida")
    // - Backend should receive a deterministic marker so the agent follows Step 1/2 without re-sending Step 0 greeting.
    const uiMessage =
      uploadedFile && (!messageText || messageText.trim().length === 0) ? "📸 Imagen subida" : messageText;
    const backendMessage =
      uploadedFile &&
      (!messageText || messageText.trim().length === 0 || messageText.trim() === "📸 Imagen subida")
        ? "[User uploaded product image]"
        : messageText;
    if (uploadedFile) {
      const imageUrl = URL.createObjectURL(uploadedFile);
      addUserMessage(uiMessage, imageUrl);
    } else {
      addUserMessage(uiMessage);
    }

    // Track last user intent + product image for caption autofill.
    // Avoid using internal backend markers for caption generation.
    if (messageText && messageText.trim().length > 0 && messageText.trim() !== "[User uploaded product image]") {
      setLastPromptForCaption(messageText.trim());
    }
    if (uploadedFile) {
      setLastUploadedProductImage(uploadedFile);
    }

    const pendingRequestId = crypto.randomUUID();
    setPendingInStorage(pendingRequestId);
    if (mountedRef.current) setIsSending(true);

    try {
      const formData = new FormData();
      formData.append("agentType", agentId);
      formData.append("message", backendMessage);
      formData.append("conversationHistory", JSON.stringify(getBackendHistory()));
      if (clientSessionId) formData.append("sessionId", clientSessionId);
      
      if (uploadedFile) {
        formData.append("image", uploadedFile);
      }

      // Add userId for session isolation
      if (user?.uid) {
        formData.append("userId", user.uid);
      }

      const response = await fetch("/api/agent-chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to get response from agent");
      }

      const result = await response.json();

      if (result.type === "text") {
        // If agent returned a pipeline trigger JSON, execute it and show the resulting image
        const rawText = typeof result.text === "string" ? result.text : "";
        const trigger = rawText ? tryExtractPipelineTrigger(rawText) : null;
        if (trigger) {
          if (!lastUploadedProductImage) {
            addAssistantMessage(
              "Necesito que subas la foto del producto (botón +) antes de generar la imagen.",
              undefined,
              undefined,
              { pendingRequestId }
            );
          } else {
            // Show a friendly progress message instead of the JSON payload
            addAssistantMessage("Generando tu post... esto tomará unos segundos.", undefined, undefined, {
              pendingRequestId,
            });
            try {
              const productImageBase64 = await fileToDataUrl(lastUploadedProductImage);
              const pipelineRes = await fetch("/api/pipeline", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productImageBase64,
                  textPrompt: trigger.prompt,
                  referenceImage: trigger.referenceImage || selectedReferenceFilename || undefined,
                  skipText: trigger.skipText ?? false,
                  style: "Elegante",
                  useCase: "Promoción",
                  textContent: trigger.textContent,
                  aspectRatio: "1:1",
                  language: "es",
                }),
              });
              const pipelineData = await pipelineRes.json();
              if (!pipelineRes.ok || pipelineData?.success !== true || typeof pipelineData?.finalImage !== "string") {
                throw new Error(pipelineData?.error || "Pipeline failed");
              }
              addAssistantMessage("¡Listo! Acá está tu imagen.", pipelineData.finalImage, pipelineData.textLayout, {
                pendingRequestId,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Unknown error";
              addAssistantMessage(`No pude generar la imagen: ${msg}`, undefined, undefined, { pendingRequestId });
            }
          }
        } else {
          // Regular text response
          addAssistantMessage(rawText, undefined, undefined, { pendingRequestId });
        }

        // If a reel generation was started, backend returns a postId. Poll /api/posts
        // until it becomes ready_to_upload (or failed) and notify in chat.
        if (result.postId && typeof result.postId === "string" && user) {
          const postId: string = result.postId;
          const startedAt = Date.now();
          const timeoutMs = 3 * 60 * 1000; // 3 minutes
          const intervalMs = 2500;

          const poll = async (): Promise<void> => {
            if (!user) return;
            if (Date.now() - startedAt > timeoutMs) return;

            try {
              const token = await user.getIdToken();
              const res = await fetch("/api/posts?limit=40", {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              });
              const data = await res.json();
              if (!res.ok || data?.status !== "success") {
                // transient; keep polling
                setTimeout(poll, intervalMs);
                return;
              }

              const posts = Array.isArray(data.posts) ? data.posts : [];
              const found = posts.find((p: any) => p && p.id === postId);
              const status = found?.status;

              if (status === "ready_to_upload") {
                addAssistantMessage("Tu reel ya está listo. Abrí **Mis posts** para subirlo.");
                return;
              }
              if (status === "failed") {
                const err = typeof found?.error === "string" && found.error.trim().length > 0 ? found.error : "Error desconocido";
                addAssistantMessage(`Tu reel falló al generarse: ${err}`);
                return;
              }

              // still generating/publishing/etc.
              setTimeout(poll, intervalMs);
            } catch {
              // transient; keep polling
              setTimeout(poll, intervalMs);
            }
          };

          setTimeout(poll, 800);
        }
      } else if (result.type === "reference_options") {
        // Agent is presenting reference image options
        addAssistantMessage(result.text, undefined, undefined, { references: result.references, pendingRequestId });
      } else if (result.type === "request_image") {
        // Agent is requesting an image upload (user can use + button)
        addAssistantMessage(result.text || "Por favor, subí una imagen usando el botón +", undefined, undefined, {
          pendingRequestId,
        });
      } else if (result.type === "image") {
        // Agent generated an image
        const text = result.text || "¡Listo! Acá está tu imagen 🎉";
        addAssistantMessage(text, result.imageUrl, result.textLayout, { pendingRequestId });
        if (mountedRef.current) setIsSending(false);
        return;
      }
    } catch (error) {
      console.error("Error sending message:", error);
      showToast("Error al comunicarse con el agente", "error");
      addAssistantMessage("Perdón, tuve un problema. ¿Podés intentar de nuevo?", undefined, undefined, {
        pendingRequestId,
      });
    } finally {
      clearPendingInStorage(pendingRequestId);
      if (mountedRef.current) setIsSending(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast("Por favor subí un archivo de imagen", "error");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast("La imagen es muy grande. Máximo 10MB", "error");
      return;
    }

    handleSendMessage("📸 Imagen subida", file);
  };

  const handleDownloadImage = (imageUrl: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `postty-${agentId}-${Date.now()}.png`;
    link.click();
  };

  const handleOpenPublishModal = (imageUrl: string) => {
    setPublishingImageUrl(imageUrl);
    setCaptionInput("");
    setShowCaptionModal(true);

    // Auto-generate caption on open (non-blocking).
    const seq = ++captionGenSeqRef.current;
    setIsCaptionGenerating(true);
    (async () => {
      try {
        const basePrompt = lastPromptForCaption.trim();
        if (!basePrompt) return;

        const body: any = { base_prompt: basePrompt };
        if (lastUploadedProductImage) {
          body.product_image_base64 = await fileToDataUrl(lastUploadedProductImage);
        }

        const res = await fetch("/api/caption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        const nextCaption = typeof data?.caption?.text === "string" ? data.caption.text : "";

        if (captionGenSeqRef.current !== seq) return;
        if (!nextCaption.trim()) return;
        setCaptionInput(nextCaption);
      } catch {
        // Silent failure: user can still type manually.
      } finally {
        if (captionGenSeqRef.current === seq) setIsCaptionGenerating(false);
      }
    })();
  };

  const handleClosePublishModal = () => {
    setShowCaptionModal(false);
    setPublishingImageUrl(null);
    setCaptionInput("");
    setIsCaptionGenerating(false);
  };

  const handleEditText = async (imageUrl: string, textLayout: any) => {
    console.log('[AgentChat] handleEditText called with:', { imageUrl, textLayout });
    
    if (!textLayout || !textLayout.elements || textLayout.elements.length === 0) {
      console.error('[AgentChat] Invalid textLayout:', textLayout);
      return;
    }

    try {
      console.log('[AgentChat] Opening text editor with:', {
        baseImageUrl: imageUrl,
        textLayout: textLayout,
      });
      
      const result = await openTextEditor({
        baseImageUrl: imageUrl,
        textLayout: textLayout,
      });
      
      console.log('[AgentChat] Text editor returned:', result);
      if (result) {
        // User clicked Done - show success message
        showToast("Texto actualizado! La regeneración estará disponible pronto.", "info");
        // TODO: Implement regeneration with updated text
      }
    } catch (error) {
      console.error("Error opening text editor:", error);
      showToast("Error al abrir el editor de texto", "error");
    }
  };

  const handleCreateAnother = async () => {
    await softReset();
  };

  const handlePublishToInstagram = async () => {
    if (!publishingImageUrl || !captionInput.trim()) {
      showToast("Por favor escribí un caption para la publicación", "error");
      return;
    }

    setIsPublishing(true);

    try {
      if (!user) {
        throw new Error("Tenés que iniciar sesión para publicar.");
      }
      const token = await user.getIdToken();

      // Extract filename from URL (e.g., http://localhost:8080/generated-images/1234.png -> 1234.png)
      const url = new URL(publishingImageUrl);
      const pathParts = url.pathname.split('/');
      const filename = pathParts[pathParts.length - 1];
      const imagePath = `generated-images/${filename}`;

      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          image_path: imagePath,
          caption: captionInput.trim(),
        }),
      });

      const data = await response.json();

      if (data?.status !== "success") {
        throw new Error(data?.message || "Error al publicar");
      }

      showToast("¡Publicado exitosamente en Instagram! 🎉", "info");
      handleClosePublishModal();
    } catch (error) {
      console.error("Error publishing to Instagram:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al publicar en Instagram";
      showToast(errorMessage, "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSelectReference = (number: number, ref: ReferenceOption) => {
    setSelectedReferenceFilename(ref.filename);
    // Send selection number as message to agent
    setPreviewReference(null); // Close modal
    handleSendMessage(String(number));
  };

  const handleOpenPreview = (ref: ReferenceOption, index: number) => {
    setPreviewReference({ ref, index });
  };

  const handleClosePreview = () => {
    setPreviewReference(null);
  };

  const handleApproveReference = () => {
    if (previewReference) {
      handleSelectReference(previewReference.index + 1, previewReference.ref);
    }
  };

  // Microphone functionality
  const { isRecording, isTranscribing, bind: micBind } = useHoldToTalk({
    onTranscript: (text) => {
      setInputValue(text);
    },
    onMessage: (msg, kind) => {
      showToast(msg, kind);
    },
    disabled: isSending || isTyping,
  });

  const isBusy = isSending || isTyping || isRecording || isTranscribing;

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 flex flex-col max-w-[860px] mx-auto w-full">
        {/* Header with agent info */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-2xl shadow-md">
            📸
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{agentName}</h1>
            <p className="text-sm text-slate-500">Agente especializado</p>
          </div>
        </div>

        {/* Chat messages */}
        <GlassCard className="flex-1 p-4 flex flex-col min-h-[400px]">
          <div className="flex-1 overflow-y-auto space-y-3 pb-4" style={{ maxHeight: 'calc(100vh - 400px)' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    msg.role === "user"
                      ? "bg-slate-900 text-white"
                      : "bg-white/90 text-slate-800 shadow-sm border border-slate-100"
                  }`}
                >
                  {/* Message text */}
                  {msg.content && (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                  )}

                  {/* User uploaded image */}
                  {msg.role === "user" && msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="Uploaded"
                      className="mt-2 rounded-lg max-w-[200px]"
                    />
                  )}

                  {/* Generated image with download button */}
                  {msg.role === "assistant" && msg.imageUrl && (
                    <div className="mt-3">
                      <img
                        src={msg.imageUrl}
                        alt="Generated"
                        className="w-full rounded-xl shadow-sm"
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleOpenPublishModal(msg.imageUrl!)}
                          className="flex-1 py-2.5 px-3 bg-slate-900 text-white font-medium rounded-xl text-sm hover:bg-slate-800 transition"
                        >
                          Publicar
                        </button>
                        {(msg.textLayout?.elements?.length ?? 0) > 0 && (
                          <button
                            onClick={() => handleEditText(msg.imageUrl!, msg.textLayout)}
                            className="flex-1 py-2.5 px-3 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition"
                          >
                            Editar texto
                          </button>
                        )}
                        <button
                          onClick={handleCreateAnother}
                          className="flex-1 py-2.5 px-3 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition"
                        >
                          Crear otra
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reference image options grid */}
                  {msg.role === "assistant" && msg.references && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {msg.references.map((ref, idx) => (
                        <button
                          key={ref.id}
                          onClick={() => handleOpenPreview(ref, idx)}
                          disabled={isSending || isTyping}
                          className="relative group cursor-pointer rounded-xl overflow-hidden border-2 border-slate-200 hover:border-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-slate-50 hover:shadow-lg"
                        >
                          <div className="w-full h-48 flex items-center justify-center p-2">
                            <img
                              src={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'}${ref.url}`}
                              alt={ref.description}
                              className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                              onError={(e) => {
                                console.error('Failed to load image:', ref.url);
                                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%23999"%3EImage not found%3C/text%3E%3C/svg%3E';
                              }}
                            />
                          </div>
                          <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition pointer-events-none" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {(isTyping || isSending) && (
              <div className="flex justify-start">
                <div className="bg-white/90 rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200/50 pt-3 mt-auto">
            <div className="flex gap-2 items-end">
              {/* LEFT column: Clear (eraser) + Microphone */}
              <div className="shrink-0 flex flex-col gap-2">
                <button
                  type="button"
                  aria-label="Borrar chat"
                  title="Borrar chat"
                  disabled={isBusy}
                  onClick={() => {
                    const ok = window.confirm(
                      "This will erase your chat history, do you want to continue?"
                    );
                    if (!ok) return;
                    void hardReset();
                  }}
                  className="h-[52px] w-[52px] flex items-center justify-center rounded-2xl border bg-white/90 border-slate-200 text-slate-800 hover:bg-white shadow-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconEraser className="w-6 h-6" />
                </button>

                <button
                  type="button"
                  aria-label="Mantener para hablar"
                  title={isRecording ? "Grabando..." : "Mantener para hablar"}
                  disabled={isBusy}
                  {...micBind}
                  className={[
                    "h-[52px] w-[52px] flex items-center justify-center rounded-2xl border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed",
                    isRecording
                      ? "bg-rose-500 border-rose-400 text-white shadow-[0_0_22px_rgba(244,63,94,0.65)]"
                      : "bg-white/90 border-slate-200 text-slate-800 hover:bg-white shadow-sm",
                  ].join(" ")}
                >
                  {isTranscribing ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  )}
                </button>
              </div>

              {/* Text input - Multi-line textarea */}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Escribí tu mensaje..."
                disabled={isBusy}
                rows={4}
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] resize-none overflow-y-auto leading-relaxed"
                style={{ height: '112px' }}
              />

              {/* Stacked buttons container (RIGHT) */}
              <div className="flex flex-col gap-2 shrink-0">
                {/* Image upload button (+) - TOP */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="h-[52px] w-[52px] flex items-center justify-center rounded-2xl bg-slate-900 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition shadow-sm"
                  aria-label="Subir imagen"
                  title="Subir imagen"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>

                {/* Send button - BOTTOM */}
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isBusy}
                  className="h-[52px] w-[52px] flex items-center justify-center rounded-2xl bg-slate-900 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition shadow-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </GlassCard>
      </div>

      {/* Reference Image Preview Modal */}
      {previewReference && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={handleClosePreview}
        >
          <div 
            className="relative max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Main Image */}
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden max-w-full max-h-full flex items-center justify-center p-4">
              <img
                src={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'}${previewReference.ref.url}`}
                alt={previewReference.ref.description}
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>

            {/* Thumbs Down Button (Left) */}
            <button
              onClick={handleClosePreview}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white shadow-2xl flex items-center justify-center hover:scale-110 transition-all border-2 border-slate-200 hover:border-red-400 hover:bg-red-50"
              aria-label="Rechazar"
            >
              <svg className="w-8 h-8 text-slate-700 hover:text-red-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/>
              </svg>
            </button>

            {/* Thumbs Up Button (Right) */}
            <button
              onClick={handleApproveReference}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-slate-900 shadow-2xl flex items-center justify-center hover:scale-110 transition-all hover:bg-slate-800"
              aria-label="Seleccionar"
            >
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Caption Modal for Instagram Publishing */}
      {showCaptionModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={handleClosePublishModal}
        >
          <div 
            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-slate-900 mb-4">Publicar en Instagram</h2>
            
            <div className="mb-4">
              <label htmlFor="caption" className="block text-sm font-medium text-slate-700 mb-2">
                Escribí el caption para tu publicación:
              </label>
              <textarea
                id="caption"
                value={captionInput}
                onChange={(e) => setCaptionInput(e.target.value)}
                placeholder="Ingresá el texto de tu publicación..."
                rows={4}
                disabled={isPublishing || isCaptionGenerating}
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] resize-none"
              />
              {isCaptionGenerating ? (
                <div className="mt-2 text-xs text-slate-500 font-medium flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-400" />
                  Generando caption…
                </div>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleClosePublishModal}
                disabled={isPublishing}
                className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handlePublishToInstagram}
                disabled={isPublishing || !captionInput.trim()}
                className="flex-1 py-2.5 px-4 bg-slate-900 text-white font-medium rounded-xl text-sm hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPublishing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Publicando...
                  </>
                ) : (
                  "Publicar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

