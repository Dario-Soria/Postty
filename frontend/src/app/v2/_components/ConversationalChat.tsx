"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Props = {
  onBack: () => void;
  imageFile: File;
  initialText: string;
};

type CollectedData = {
  style: string;
  scene: string;
  sceneDescription: string; // Full description: "persona en Italia", etc.
  text: string;
  textFormat: string; // How user wants text: "50% OFF grande, ENVIO GRATIS chico"
  format: string;
  extraDetails: string;
};

export function ConversationalChat({ onBack, imageFile, initialText }: Props) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Collected data from conversation
  const [collectedData, setCollectedData] = React.useState<CollectedData>({
    style: "",
    scene: "",
    sceneDescription: "",
    text: initialText,
    textFormat: "",
    format: "",
    extraDetails: "",
  });
  
  // Generation state
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedImage, setGeneratedImage] = React.useState<string | null>(null);
  const [genProgress, setGenProgress] = React.useState(0);

  // Conversation history for Gemini
  const [conversationContext, setConversationContext] = React.useState<string[]>([]);

  // Preview image
  const [imagePreview, setImagePreview] = React.useState<string>("");

  React.useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  React.useEffect(() => {
    inputRef.current?.focus();
  }, [messages, isTyping]);

  // Initial message - ask about style first
  React.useEffect(() => {
    const timer = setTimeout(() => {
      addAssistantMessage(
        `¡Hola! 👋 Vi tu producto, se ve genial.\n\nContame, ¿qué estilo querés para la imagen? Por ejemplo:\n• Old money / elegante\n• Minimalista\n• Vibrante / colorido\n• Urbano / street`
      );
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const addAssistantMessage = (content: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content },
      ]);
      setIsTyping(false);
    }, 800 + Math.random() * 400);
  };

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content },
    ]);
  };

  const analyzeResponseWithGemini = async (userMessage: string, context: string[]): Promise<{
    nextQuestion: string;
    extractedData: Partial<CollectedData>;
    isReadyToGenerate: boolean;
  }> => {
    try {
      const response = await fetch("/api/chat-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          conversationHistory: context,
          currentData: collectedData,
          initialText,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      return await response.json();
    } catch (error) {
      // Fallback to simple logic if API fails
      return fallbackAnalysis(userMessage, context);
    }
  };

  const fallbackAnalysis = (userMessage: string, context: string[]): {
    nextQuestion: string;
    extractedData: Partial<CollectedData>;
    isReadyToGenerate: boolean;
  } => {
    const msgLower = userMessage.toLowerCase();
    const contextLength = context.length;

    // Simple keyword extraction
    let extractedData: Partial<CollectedData> = {};

    // Style detection
    if (msgLower.includes("elegante") || msgLower.includes("old money") || msgLower.includes("lujo")) {
      extractedData.style = "elegante-old-money";
    } else if (msgLower.includes("minimal") || msgLower.includes("simple") || msgLower.includes("limpio")) {
      extractedData.style = "minimalista";
    } else if (msgLower.includes("vibrant") || msgLower.includes("color") || msgLower.includes("llamativ")) {
      extractedData.style = "vibrante";
    } else if (msgLower.includes("urban") || msgLower.includes("street") || msgLower.includes("ciudad")) {
      extractedData.style = "urbano";
    } else if (msgLower.includes("natural") || msgLower.includes("organic")) {
      extractedData.style = "natural";
    } else if (msgLower.includes("modern") || msgLower.includes("tech") || msgLower.includes("futurist")) {
      extractedData.style = "moderno";
    }

    // Scene detection
    if (msgLower.includes("persona") || msgLower.includes("modelo") || msgLower.includes("alguien")) {
      extractedData.scene = "con-persona";
      // Capture the full scene description
      extractedData.sceneDescription = userMessage;
    } else if (msgLower.includes("solo") || msgLower.includes("producto solo") || msgLower.includes("sin persona")) {
      extractedData.scene = "solo-producto";
      extractedData.sceneDescription = "producto solo, sin personas";
    } else if (msgLower.includes("lifestyle") || msgLower.includes("ambiente") || msgLower.includes("casa")) {
      extractedData.scene = "lifestyle";
      extractedData.sceneDescription = userMessage;
    } else if (msgLower.includes("fondo") || msgLower.includes("simple") || msgLower.includes("liso")) {
      extractedData.scene = "fondo-simple";
      extractedData.sceneDescription = "fondo simple y limpio";
    }
    
    // If there's location info, capture it in sceneDescription
    if (msgLower.includes("italia") || msgLower.includes("paris") || msgLower.includes("playa") || 
        msgLower.includes("ciudad") || msgLower.includes("calle") || msgLower.includes("cafe")) {
      extractedData.sceneDescription = userMessage;
    }

    // Format detection
    if (msgLower.includes("story") || msgLower.includes("historia") || msgLower.includes("vertical") || msgLower.includes("9:16")) {
      extractedData.format = "9:16";
    } else if (msgLower.includes("post") || msgLower.includes("cuadrad") || msgLower.includes("1:1") || msgLower.includes("feed")) {
      extractedData.format = "1:1";
    }

    // Text changes
    if (msgLower.includes("sin texto") || msgLower.includes("no texto") || msgLower.includes("sin letras")) {
      extractedData.text = "";
    } else if (msgLower.includes("cambiar") || msgLower.includes("poner") || msgLower.includes("quiero que diga")) {
      // Try to extract quoted text
      const quoteMatch = userMessage.match(/[""]([^""]+)[""]/);
      if (quoteMatch) {
        extractedData.text = quoteMatch[1];
      }
    }

    // Ready to generate?
    if (msgLower.includes("dale") || msgLower.includes("generar") || msgLower.includes("crear") || 
        msgLower.includes("listo") || msgLower.includes("perfecto") || msgLower.includes("si, ") ||
        msgLower.includes("sí, ") || msgLower.includes("ok") || msgLower.includes("vamos")) {
      
      const updatedData = { ...collectedData, ...extractedData };
      if (updatedData.style && updatedData.format) {
        return {
          nextQuestion: "¡Genial! Voy a crear tu imagen ahora... 🚀",
          extractedData,
          isReadyToGenerate: true,
        };
      }
    }

    // Determine next question based on what's missing
    const updatedData = { ...collectedData, ...extractedData };
    
    let nextQuestion = "";
    if (!updatedData.style) {
      nextQuestion = "¿Qué estilo te gustaría? Puede ser elegante, minimalista, vibrante, urbano...";
    } else if (!updatedData.scene) {
      nextQuestion = `Me gusta el estilo ${updatedData.style}. ¿Cómo querés la escena? ¿Con una persona posando, solo el producto, o en un ambiente lifestyle?`;
    } else if (!updatedData.format) {
      nextQuestion = `Perfecto. ¿Lo querés para el feed (cuadrado) o para stories (vertical)?`;
    } else {
      nextQuestion = `Tengo todo: estilo ${updatedData.style}, escena ${updatedData.scene}, formato ${updatedData.format}${updatedData.text ? `, texto "${updatedData.text}"` : " sin texto"}. ¿Lo genero así o querés cambiar algo?`;
    }

    return {
      nextQuestion,
      extractedData,
      isReadyToGenerate: false,
    };
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing || isGenerating) return;
    
    const userMessage = inputValue.trim();
    setInputValue("");
    addUserMessage(userMessage);
    setIsProcessing(true);

    // Update context
    const newContext = [...conversationContext, `User: ${userMessage}`];
    setConversationContext(newContext);

    try {
      const analysis = await analyzeResponseWithGemini(userMessage, newContext);
      
      // Update collected data
      setCollectedData(prev => ({ ...prev, ...analysis.extractedData }));

      if (analysis.isReadyToGenerate) {
        const finalData = { ...collectedData, ...analysis.extractedData };
        addAssistantMessage(analysis.nextQuestion);
        setTimeout(() => startGeneration(finalData), 1500);
      } else {
        addAssistantMessage(analysis.nextQuestion);
        setConversationContext([...newContext, `Assistant: ${analysis.nextQuestion}`]);
      }
    } catch (error) {
      addAssistantMessage("Perdón, no entendí bien. ¿Podés decirme de otra forma?");
    } finally {
      setIsProcessing(false);
    }
  };

  const startGeneration = async (data: CollectedData) => {
    setIsGenerating(true);
    setGenProgress(5);

    const interval = setInterval(() => {
      setGenProgress((p) => Math.min(90, p + Math.random() * 8));
    }, 500);

    try {
      const buffer = await imageFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const productImageBase64 = `data:${imageFile.type};base64,${base64}`;

      // Build detailed prompt with scene description
      const scenePrompt = data.sceneDescription 
        ? data.sceneDescription 
        : `escena ${data.scene}`;
      
      const fullPrompt = `Crear imagen promocional con estilo ${data.style}. 
ESCENA: ${scenePrompt}. 
El producto debe estar siendo usado/mostrado en esta escena.
${data.extraDetails}`;

      console.log("Generation prompt:", fullPrompt);
      console.log("Format:", data.format);
      console.log("Text format:", data.textFormat);

      // Parse text into headline and subheadline if it has multiple parts
      let textContent: { headline?: string; subheadline?: string } | undefined;
      if (data.text) {
        // Check if text has separators like + or /
        const separators = [' + ', ' / ', ' - ', '\n'];
        let parts: string[] = [data.text];
        
        for (const sep of separators) {
          if (data.text.includes(sep)) {
            parts = data.text.split(sep).map(p => p.trim()).filter(p => p);
            break;
          }
        }
        
        if (parts.length >= 2) {
          // First part is headline (bigger), second is subheadline (smaller)
          textContent = {
            headline: parts[0],
            subheadline: parts.slice(1).join(' '),
          };
          console.log("Split text:", textContent);
        } else {
          textContent = { headline: data.text };
        }
      }

      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImageBase64,
          textPrompt: fullPrompt,
          style: data.style,
          useCase: data.sceneDescription || data.scene || "promoción",
          aspectRatio: data.format || "1:1",
          skipText: !data.text,
          language: "es",
          textContent,
          textFormat: data.textFormat || undefined,
        }),
      });

      const result = await response.json();
      clearInterval(interval);

      if (!result.success) {
        throw new Error(result.error || "Error al generar");
      }

      setGenProgress(100);
      setGeneratedImage(result.finalImage);
      
      setTimeout(() => {
        addAssistantMessage("¡Listo! 🎉 Acá tenés tu imagen. ¿Qué te parece?");
      }, 500);

    } catch (e) {
      clearInterval(interval);
      const msg = e instanceof Error ? e.message : "Error desconocido";
      addAssistantMessage(`Ups, hubo un error: ${msg}. ¿Querés que lo intente de nuevo?`);
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `postty-${collectedData.style}-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 flex flex-col max-w-[860px] mx-auto w-full">
        {/* Header with product preview */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0 shadow-md">
            {imagePreview && (
              <img src={imagePreview} alt="Product" className="w-full h-full object-cover" />
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Postty</h1>
            <p className="text-sm text-slate-500">Contame cómo querés tu imagen</p>
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
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {(isTyping || isProcessing) && (
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

            {/* Generation progress */}
            {isGenerating && !generatedImage && (
              <div className="flex justify-start">
                <div className="bg-white/90 rounded-2xl px-4 py-3 shadow-sm border border-slate-100 w-full max-w-[280px]">
                  <p className="text-sm text-slate-600 mb-2">✨ Creando tu imagen...</p>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${genProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Generated image */}
            {generatedImage && (
              <div className="flex justify-start">
                <div className="bg-white/90 rounded-2xl p-3 shadow-sm border border-slate-100 max-w-[350px]">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full rounded-xl shadow-sm"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleDownload}
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
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200/50 pt-3 mt-auto">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                placeholder="Escribí tu mensaje..."
                disabled={isGenerating}
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-[15px]"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isProcessing || isGenerating}
                className="px-5 py-3 bg-slate-900 text-white font-medium rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
