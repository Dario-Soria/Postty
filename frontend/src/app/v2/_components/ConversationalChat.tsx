"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { TopBar } from "./ui/TopBar";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  images?: { id: string; src: string; name: string }[];
};

type Props = {
  onBack: () => void;
  imageFile: File;
  initialText: string;
};

// Simplified state machine
type Phase =
  | "ANALYZING_PRODUCT"
  | "ASK_POST_TYPE"       // "¿Qué querés hacer con tu polo?"
  | "ASK_DESCRIPTION"     // "Describí tu visión" + suggestions
  | "SEARCHING_REFS"
  | "SHOW_REFERENCES"
  | "ANALYZING_REF"
  | "ASK_PROMO"           // ONE question for all promo/texts
  | "EXTRACTING_TEXTS"
  | "ASK_FORMAT"
  | "GENERATING"
  | "DONE"
  | "OFFER_REFORMAT";

type PostTypeSuggestion = {
  id: string;
  name: string;
  description: string;
  followUpQuestion: string;
  suggestedStyles: string[];
};

type ProductAnalysis = {
  productType: string;
  productCategory: string;
  productDescription: string;
  suggestedPostTypes: PostTypeSuggestion[];
  keywords: string[];
};

type Reference = {
  id: string;
  style: string;
  name: string;
  description: string;
  keywords: string[];
  previewImage: string;
};

type DesignResources = {
  lighting: { type: string; direction: string; mood: string };
  composition: { angle: string; framing: string; subjectPosition: string };
  environment: { setting: string; background: string; props: string[] };
  style: { aesthetic: string; colorPalette: string[]; mood: string };
  person: { present: boolean; gender: string | null; pose: string | null };
  promptSuggestion: string;
};

type CollectedData = {
  productAnalysis: ProductAnalysis | null;
  selectedPostType: PostTypeSuggestion | null;
  description: string;
  selectedReference: Reference | null;
  designResources: DesignResources | null;
  texts: { title: string; subtitle: string; promo: string; extra: string };
  format: string;
};

export function ConversationalChat({ onBack, imageFile }: Props) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [phase, setPhase] = React.useState<Phase>("ANALYZING_PRODUCT");
  const [data, setData] = React.useState<CollectedData>({
    productAnalysis: null,
    selectedPostType: null,
    description: "",
    selectedReference: null,
    designResources: null,
    texts: { title: "", subtitle: "", promo: "", extra: "" },
    format: "",
  });

  const [references, setReferences] = React.useState<Reference[]>([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedImage, setGeneratedImage] = React.useState<string | null>(null);
  const [genProgress, setGenProgress] = React.useState(0);
  const [imagePreview, setImagePreview] = React.useState<string>("");
  const hasAnalyzed = React.useRef(false);

  React.useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  React.useEffect(() => {
    const busyPhases = ["ANALYZING_PRODUCT", "SEARCHING_REFS", "ANALYZING_REF", "EXTRACTING_TEXTS", "GENERATING"];
    if (!isTyping && !busyPhases.includes(phase)) {
      inputRef.current?.focus();
    }
  }, [phase, isTyping]);

  const addBotMessage = (content: string, image?: string, images?: { id: string; src: string; name: string }[]) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content, image, images }]);
  };

  const addUserMessage = (content: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content }]);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // === STEP 1: Analyze product ===
  React.useEffect(() => {
    if (hasAnalyzed.current) return;
    hasAnalyzed.current = true;

    const analyzeProduct = async () => {
      addBotMessage("🔍 Analizando tu producto...");

      try {
        const base64 = await fileToBase64(imageFile);
        const response = await fetch("/api/agent/analyze-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        const analysis = result.analysis as ProductAnalysis;
        setData((prev) => ({ ...prev, productAnalysis: analysis }));

        // Contextual question based on product type
        const productName = analysis.productType.charAt(0).toUpperCase() + analysis.productType.slice(1);
        const options = analysis.suggestedPostTypes
          .slice(0, 4)
          .map((pt, i) => `${i + 1}. **${pt.name}**`)
          .join("\n");

        setPhase("ASK_POST_TYPE");
        addBotMessage(
          `Perfecto, tenemos tu **${productName}**. ¿Qué querés crear?\n\n${options}\n\n(Escribí el número o describí lo que buscás)`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error";
        addBotMessage(`❌ ${msg}. Intentá de nuevo.`);
      }
    };

    analyzeProduct();
  }, [imageFile]);

  // === Handle input ===
  const handleSend = () => {
    if (!inputValue.trim() || isTyping || isGenerating) return;
    const userText = inputValue.trim();
    addUserMessage(userText);
    setInputValue("");
    setIsTyping(true);
    setTimeout(() => {
      processUserInput(userText, userText.toLowerCase());
      setIsTyping(false);
    }, 400);
  };

  const processUserInput = async (userText: string, userLower: string) => {
    switch (phase) {
      case "ASK_POST_TYPE":
        handlePostTypeSelection(userText, userLower);
        break;
      case "ASK_DESCRIPTION":
        handleDescription(userText);
        break;
      case "SHOW_REFERENCES":
        handleReferenceSelection(userText, userLower);
        break;
      case "ASK_PROMO":
        handlePromoInput(userText);
        break;
      case "ASK_FORMAT":
        handleFormat(userLower);
        break;
      case "OFFER_REFORMAT":
        handleReformatOffer(userLower);
        break;
    }
  };

  // === Phase handlers ===
  const handlePostTypeSelection = (userText: string, userLower: string) => {
    if (!data.productAnalysis) return;

    let selected: PostTypeSuggestion | null = null;
    const num = parseInt(userText);

    if (!isNaN(num) && num >= 1 && num <= data.productAnalysis.suggestedPostTypes.length) {
      selected = data.productAnalysis.suggestedPostTypes[num - 1];
    } else {
      selected = data.productAnalysis.suggestedPostTypes.find(
        (pt) => pt.name.toLowerCase().includes(userLower) || userLower.includes(pt.id)
      ) || data.productAnalysis.suggestedPostTypes[0];
    }

    setData((prev) => ({ ...prev, selectedPostType: selected }));
    setPhase("ASK_DESCRIPTION");

    // Contextual follow-up based on product and post type
    const product = data.productAnalysis.productType;
    const styles = selected?.suggestedStyles.slice(0, 3).join(", ") || "elegante, moderno, casual";
    
    addBotMessage(
      `Perfecto, vamos con **${selected?.name}**.\n\nDescribí tu visión:\n• **Estilo:** ¿Qué onda buscás? (${styles})\n• **Escenario:** ¿Dónde lo imaginás?\n• **Mood:** ¿Aspiracional, accesible, edgy?\n\nContame todo lo que tengas en mente.`
    );
  };

  const handleDescription = async (userText: string) => {
    setData((prev) => ({ ...prev, description: userText }));
    setPhase("SEARCHING_REFS");
    addBotMessage("🔍 Buscando referencias que matcheen...");

    try {
      const keywords = [
        ...(data.productAnalysis?.keywords || []),
        ...(data.selectedPostType?.suggestedStyles || []),
        ...userText.toLowerCase().split(" ").filter((w) => w.length > 3),
      ];

      const response = await fetch("/api/agent/search-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, style: data.selectedPostType?.suggestedStyles[0] }),
      });

      const result = await response.json();

      if (!result.success || !result.references?.length) {
        // No references found, skip to promo
        setPhase("ASK_PROMO");
        addBotMessage(
          `No encontré referencias específicas, pero vamos a crear algo genial.\n\n💰 **¿Qué promoción querés destacar?**\n(ej: "3x2 con envío gratis", "30% off", "nueva colección")`
        );
        return;
      }

      setReferences(result.references);
      setPhase("SHOW_REFERENCES");

      addBotMessage(
        `🎨 Encontré ${result.references.length} referencias:\n\n¿Cuál te gusta más? (1, 2 o 3)`,
        undefined,
        result.references.map((r: Reference, i: number) => ({
          id: r.id,
          src: r.previewImage,
          name: `${i + 1}. ${r.name}`,
        }))
      );
    } catch {
      setPhase("ASK_PROMO");
      addBotMessage(`💰 **¿Qué promoción querés destacar?**\n(ej: "3x2 con envío gratis", "30% off")`);
    }
  };

  const handleReferenceSelection = async (userText: string, userLower: string) => {
    const num = parseInt(userText);
    let selected: Reference | null = null;

    if (!isNaN(num) && num >= 1 && num <= references.length) {
      selected = references[num - 1];
    } else {
      selected = references[0];
    }

    setData((prev) => ({ ...prev, selectedReference: selected }));
    setPhase("ANALYZING_REF");
    addBotMessage(`✅ **${selected?.name}**\n\n🔬 Analizando estilo...`);

    try {
      const response = await fetch("/api/agent/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId: selected?.id }),
      });

      const result = await response.json();
      if (result.success) {
        setData((prev) => ({ ...prev, designResources: result.designResources }));
      }
    } catch {
      // Continue anyway
    }

    setPhase("ASK_PROMO");
    addBotMessage(
      `💰 **¿Qué promoción o texto querés en el post?**\n\nPodés decirme todo junto, por ejemplo:\n• "3x2 con envío gratis"\n• "30% off en efectivo, nueva colección"\n• "Solo quiero mostrar el producto, sin promo"`
    );
  };

  const handlePromoInput = async (userText: string) => {
    const noPromo = userText.toLowerCase().includes("sin promo") || 
                   userText.toLowerCase().includes("no promo") ||
                   userText.toLowerCase().includes("solo producto");

    if (noPromo) {
      // Use product name as title only
      setData((prev) => ({
        ...prev,
        texts: {
          title: data.productAnalysis?.productType || "Producto",
          subtitle: "",
          promo: "",
          extra: "",
        },
      }));
      setPhase("ASK_FORMAT");
      addBotMessage(`📐 ¿**Story** (vertical) o **Feed** (cuadrado)?`);
      return;
    }

    setPhase("EXTRACTING_TEXTS");
    addBotMessage("✨ Procesando...");

    try {
      const response = await fetch("/api/agent/extract-texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: userText,
          productType: data.productAnalysis?.productType || "producto",
          productDescription: data.productAnalysis?.productDescription || "",
        }),
      });

      const result = await response.json();

      if (result.success) {
        setData((prev) => ({ ...prev, texts: result.texts }));

        // Show extracted texts for confirmation
        const preview = [
          result.texts.title ? `📌 Título: **${result.texts.title}**` : "",
          result.texts.subtitle ? `🏷️ Subtítulo: **${result.texts.subtitle}**` : "",
          result.texts.promo ? `💥 Promo: **${result.texts.promo}**` : "",
          result.texts.extra ? `➕ Extra: **${result.texts.extra}**` : "",
        ]
          .filter(Boolean)
          .join("\n");

        setPhase("ASK_FORMAT");
        addBotMessage(`${preview}\n\n📐 ¿**Story** (vertical) o **Feed** (cuadrado)?`);
      } else {
        throw new Error(result.error);
      }
    } catch {
      // Fallback: use raw input as promo
      setData((prev) => ({
        ...prev,
        texts: {
          title: data.productAnalysis?.productType || "Producto",
          subtitle: "",
          promo: userText.toUpperCase(),
          extra: "",
        },
      }));
      setPhase("ASK_FORMAT");
      addBotMessage(`📐 ¿**Story** (vertical) o **Feed** (cuadrado)?`);
    }
  };

  const handleFormat = (userLower: string) => {
    const isStory = userLower.includes("story") || userLower.includes("vertical");
    const format = isStory ? "9:16" : "1:1";

    setData((prev) => ({ ...prev, format }));
    addBotMessage("¡Vamos! Creando tu imagen... ✨");
    setPhase("GENERATING");
    setTimeout(() => startGeneration(format), 500);
  };

  const handleReformatOffer = (userLower: string) => {
    const wantsReformat = ["si", "sí", "dale", "ok", "quiero"].some((w) => userLower.includes(w));

    if (wantsReformat) {
      const newFormat = data.format === "9:16" ? "1:1" : "9:16";
      const formatName = newFormat === "9:16" ? "Story" : "Feed";

      setData((prev) => ({ ...prev, format: newFormat }));
      addBotMessage(`Generando en formato ${formatName}... ✨`);
      setPhase("GENERATING");
      setGeneratedImage(null);
      setTimeout(() => startGeneration(newFormat), 500);
    } else {
      setPhase("DONE");
      addBotMessage("¡Listo! Tu imagen está lista para descargar. 📥");
    }
  };

  // === Generation ===
  const startGeneration = async (format: string) => {
    setIsGenerating(true);
    setGenProgress(0);

    const interval = setInterval(() => {
      setGenProgress((p) => Math.min(p + Math.random() * 12, 90));
    }, 1000);

    try {
      const productBase64 = await fileToBase64(imageFile);

      const sceneDescription = [
        data.description,
        data.designResources?.promptSuggestion || "",
        `Style: ${data.designResources?.style?.aesthetic || data.selectedReference?.style || "elegant"}`,
      ]
        .filter(Boolean)
        .join(". ");

      const response = await fetch("/api/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateStyle: data.selectedReference?.style || "old-money",
          productImageBase64: productBase64,
          sceneDescription,
          aspectRatio: format,
          texts: {
            "top-title": data.texts.title || "",
            "top-subtitle": data.texts.subtitle || "",
            "bottom-promo": data.texts.promo || "",
            "bottom-extra": data.texts.extra || "",
          },
        }),
      });

      const result = await response.json();
      clearInterval(interval);

      if (!result.success) throw new Error(result.error);

      setGenProgress(100);
      setGeneratedImage(result.finalImage);
      setIsGenerating(false);

      const currentFormat = format === "9:16" ? "Story" : "Feed";
      const otherFormat = format === "9:16" ? "Feed" : "Story";

      setPhase("OFFER_REFORMAT");
      setTimeout(() => {
        addBotMessage(`¡Listo! 🎉 Tu imagen para ${currentFormat}.\n\n¿Querés también en formato ${otherFormat}?`);
      }, 500);
    } catch (e) {
      clearInterval(interval);
      const msg = e instanceof Error ? e.message : "Error";
      addBotMessage(`❌ ${msg}`);
      setPhase("ASK_FORMAT");
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `postty-${Date.now()}.png`;
    link.click();
  };

  const busyPhases = ["ANALYZING_PRODUCT", "SEARCHING_REFS", "ANALYZING_REF", "EXTRACTING_TEXTS", "GENERATING"];

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 flex flex-col max-w-[860px] mx-auto w-full">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0 shadow-md">
            {imagePreview && <img src={imagePreview} alt="Product" className="w-full h-full object-cover" />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Postty</h1>
            <p className="text-sm text-slate-500">Tu asistente de contenido</p>
          </div>
        </div>

        <GlassCard className="flex-1 p-4 flex flex-col min-h-[400px] max-h-[calc(100vh-200px)]">
          <div className="flex-1 overflow-y-auto space-y-3 pb-4 scrollbar-thin">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    msg.role === "user"
                      ? "bg-slate-900 text-white"
                      : "bg-white/90 text-slate-800 shadow-sm border border-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>

                  {msg.images && msg.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {msg.images.map((img) => (
                        <div key={img.id} className="rounded-lg overflow-hidden border border-slate-200">
                          <img src={img.src} alt={img.name} className="w-full h-24 object-cover" />
                          <div className="bg-slate-50 px-2 py-1 text-xs text-slate-600 text-center truncate">
                            {img.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {generatedImage && (
              <div className="flex justify-center my-4">
                <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200 max-w-sm">
                  <img src={generatedImage} alt="Generated" className="w-full" />
                </div>
              </div>
            )}

            {phase === "GENERATING" && (
              <div className="flex justify-center">
                <div className="bg-white/90 rounded-2xl px-6 py-4 shadow-sm border border-slate-100 w-64">
                  <p className="text-sm text-slate-600 mb-2 text-center">Generando...</p>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-slate-600 to-slate-800 transition-all"
                      style={{ width: `${genProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {generatedImage && (phase === "DONE" || phase === "OFFER_REFORMAT") && (
            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={handleDownload}
                className="flex-1 px-4 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800"
              >
                Descargar
              </button>
              <button
                onClick={() => {
                  setGeneratedImage(null);
                  setPhase("ASK_POST_TYPE");
                  setData((prev) => ({
                    ...prev,
                    selectedPostType: null,
                    description: "",
                    selectedReference: null,
                    designResources: null,
                    texts: { title: "", subtitle: "", promo: "", extra: "" },
                    format: "",
                  }));
                  addBotMessage("¡Dale! ¿Qué querés crear ahora?");
                }}
                className="flex-1 px-4 py-3 bg-white text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50"
              >
                Crear otra
              </button>
            </div>
          )}

          {!generatedImage && !busyPhases.includes(phase) && (
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Escribí tu respuesta..."
                disabled={isGenerating}
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-[15px]"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping || isGenerating}
                className="px-5 py-3 bg-slate-900 text-white font-medium rounded-xl disabled:opacity-40 hover:bg-slate-800"
              >
                Enviar
              </button>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
