"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";
import { useHoldToTalk } from "./hooks/useHoldToTalk";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
};

type Props = {
  agentId: string;
  agentName: string;
  onBack: () => void;
  showToast: (message: string, kind?: "error" | "info") => void;
};

export function AgentChat({ agentId, agentName, onBack, showToast }: Props) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  React.useEffect(() => {
    inputRef.current?.focus();
  }, [messages, isTyping]);

  // Initial greeting from agent when component mounts
  const hasGreetedRef = React.useRef(false);
  
  React.useEffect(() => {
    // Prevent duplicate calls (React may run effects twice in dev mode)
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;
    
    const fetchInitialGreeting = async () => {
      setIsTyping(true);
      
      try {
        const formData = new FormData();
        formData.append("agentType", agentId);
        formData.append("message", "START_CONVERSATION"); // Special message to trigger greeting
        formData.append("conversationHistory", JSON.stringify([]));
        
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
  }, []); // Only run once on mount

  const addAssistantMessage = (content: string, imageUrl?: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          imageUrl,
        },
      ]);
      setIsTyping(false);
    }, 800 + Math.random() * 400);
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

  const handleSendMessage = async (text?: string, uploadedFile?: File) => {
    const messageText = text || inputValue.trim();
    if (!messageText && !uploadedFile) return;
    if (isSending || isTyping) return;

    setInputValue("");
    
    // Add user message to chat
    if (uploadedFile) {
      const imageUrl = URL.createObjectURL(uploadedFile);
      addUserMessage(messageText || "📸 Imagen subida", imageUrl);
    } else {
      addUserMessage(messageText);
    }

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append("agentType", agentId);
      formData.append("message", messageText);
      formData.append("conversationHistory", JSON.stringify(messages));
      
      if (uploadedFile) {
        formData.append("image", uploadedFile);
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
        // Regular text response
        addAssistantMessage(result.text);
      } else if (result.type === "request_image") {
        // Agent is requesting an image upload (user can use + button)
        addAssistantMessage(result.text || "Por favor, subí una imagen usando el botón +");
      } else if (result.type === "image") {
        // Agent generated an image
        const text = result.text || "¡Listo! Acá está tu imagen 🎉";
        addAssistantMessage(text, result.imageUrl);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      showToast("Error al comunicarse con el agente", "error");
      addAssistantMessage("Perdón, tuve un problema. ¿Podés intentar de nuevo?");
    } finally {
      setIsSending(false);
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

    handleSendMessage("", file);
  };

  const handleDownloadImage = (imageUrl: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `postty-${agentId}-${Date.now()}.png`;
    link.click();
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
        <GlassCard className="flex-1 p-4 overflow-hidden flex flex-col min-h-[400px]">
          <div className="flex-1 overflow-y-auto space-y-3 pb-4">
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
                          onClick={() => handleDownloadImage(msg.imageUrl!)}
                          className="flex-1 py-2.5 px-3 bg-slate-900 text-white font-medium rounded-xl text-sm hover:bg-slate-800 transition"
                        >
                          Descargar
                        </button>
                        <button
                          onClick={onBack}
                          className="flex-1 py-2.5 px-3 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition"
                        >
                          Crear otra
                        </button>
                      </div>
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
              {/* Microphone button (LEFT) */}
              <button
                type="button"
                aria-label="Mantener para hablar"
                title={isRecording ? "Grabando..." : "Mantener para hablar"}
                disabled={isBusy}
                {...micBind}
                className={[
                  "h-[52px] w-[52px] shrink-0 flex items-center justify-center rounded-2xl border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed",
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
    </div>
  );
}

