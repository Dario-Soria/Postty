"use client";

import * as React from "react";
import { Spinner } from "@nextui-org/react";
import { useAuth } from "@/contexts/AuthContext";
import LoginScreen from "@/app/components/LoginScreen";
import { AccessPendingScreen } from "@/app/v2/_components/AccessPendingScreen";
import { uuid } from "@/lib/uuid";
import {
  updateUserLanguagePreference,
  type UserProfile,
} from "@/lib/firebase/firestore";
import {
  detectBrowserLanguage,
  normalizePreferredLanguage,
  type SupportedLanguage,
} from "@/lib/language";

type PostTypeOption = {
  type: string;
  label: string;
  exampleImage: { url: string; id: string };
};

type ReferenceOption = {
  id: string;
  url: string;
  description?: string;
  tags?: string[];
  design_guidelines?: any;
  text_in_image?: string;
  post_type?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  // New fields for rich responses
  postTypeOptions?: PostTypeOption[];
  referenceOptions?: ReferenceOption[];
  selectedReference?: ReferenceOption;
  productThumbnail?: string;
  readyToGenerate?: boolean;
};

type UserPost = {
  id: string;
  uid: string;
  kind: "image" | "video";
  status: "ready_to_upload" | "publishing" | "published" | "discarded" | "failed" | "generating" | string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  caption?: string | null;
  mediaUrl?: string | null;
  previewUrl?: string | null;
  instagramMediaId?: string | null;
  instagramPermalink?: string | null;
  error?: string | null;
};

const isDisplayableImageUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url) return false;
  return (
    url.startsWith("data:image/") ||
    url.startsWith("blob:") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
};

export default function V3Page() {
  const { user, userProfile, loading, signOut } = useAuth();
  const MULTILANG_ENABLED = process.env.NEXT_PUBLIC_POSTTY_MULTILANG_ENABLED === "true";
  const AUTO_FEEDBACK_AFTER_GENERATION_ENABLED =
    process.env.NEXT_PUBLIC_POSTTY_V3_AUTO_FEEDBACK_ENABLED === "true";
  const [accessCheckLoading, setAccessCheckLoading] = React.useState(false);
  const [accessDenied, setAccessDenied] = React.useState(false);
  const [isMobileBrowser, setIsMobileBrowser] = React.useState(false);
  const [showMobileImageChooser, setShowMobileImageChooser] = React.useState(false);
  const [mobileToast, setMobileToast] = React.useState<string | null>(null);
  const postTypeCarouselRef = React.useRef<HTMLDivElement | null>(null);
  const [postTypeCarouselVisible, setPostTypeCarouselVisible] = React.useState(false);
  const [postTypeCarouselSwiped, setPostTypeCarouselSwiped] = React.useState(false);
  const [activeLeftMenu, setActiveLeftMenu] = React.useState<'home' | 'posts' | 'reels'>('home');
  const [activeRightMenu, setActiveRightMenu] = React.useState<'feedback' | 'notifications' | 'profile' | null>(null);
  const [showProfileDropdown, setShowProfileDropdown] = React.useState(false);
  const [connectingInstagram, setConnectingInstagram] = React.useState(false);
  const [igConnected, setIgConnected] = React.useState<boolean>(false);
  const [igLabel, setIgLabel] = React.useState<string | null>(null);
  const [igLoading, setIgLoading] = React.useState(false);
  const [igToast, setIgToast] = React.useState<{ msg: string; kind?: "error" | "info" } | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = React.useState(false);
  const [showFeedbackBlur, setShowFeedbackBlur] = React.useState(false);
  const [showFeedbackSuccess, setShowFeedbackSuccess] = React.useState(false);
  const [feedbackRating1, setFeedbackRating1] = React.useState(0);
  const [feedbackRating2, setFeedbackRating2] = React.useState(0);
  const [feedbackComment, setFeedbackComment] = React.useState("");
  const [hoverRating1, setHoverRating1] = React.useState(0);
  const [hoverRating2, setHoverRating2] = React.useState(0);
  const profileDropdownRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const dragCounterRef = React.useRef(0);

  // Mobile-only UI tweaks should apply to mobile browsers (not merely narrow desktop windows).
  React.useEffect(() => {
    try {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      const uadMobile = Boolean(nav?.userAgentData?.mobile);
      if (uadMobile) {
        setIsMobileBrowser(true);
        return;
      }
      const ua = String(nav?.userAgent || "");
      const isMobileUa = /Android|iPhone|iPad|iPod|IEMobile|Mobile|CriOS/i.test(ua);
      setIsMobileBrowser(isMobileUa);
    } catch {
      setIsMobileBrowser(false);
    }
  }, []);

  const bubbleMaxWidth = isMobileBrowser ? "max-w-[92%]" : "max-w-[40%]";

  const showMobileToast = React.useCallback((msg: string) => {
    if (!isMobileBrowser) return;
    setMobileToast(msg);
    window.setTimeout(() => setMobileToast(null), 2400);
  }, [isMobileBrowser]);

  const shareImage = React.useCallback(
    async (url: string, filename = "postty.png") => {
      if (typeof window === "undefined") return;
      const nav: any = navigator as any;

      // Prefer the native share sheet when available.
      if (nav?.share) {
        // Enhancement: try sharing as a real File (can fail due to CORS, opaque responses, etc.).
        try {
          const res = await fetch(url, { cache: "no-store" });
          const blob = await res.blob();
          const type = blob.type || "image/png";
          const file = new File([blob], filename, { type });

          if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
            await nav.share({ files: [file], title: "Postty" });
            return;
          }
        } catch {
          // ignore and fall back to URL sharing below
        }

        // Always attempt URL share even if file fetch failed.
        try {
          await nav.share({ url, title: "Postty" });
          return;
        } catch {
          // fall through to last-resort fallback below
        }
      }

      // Fallback: open the image so the user can long-press and share.
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        // ignore
      }
      showMobileToast("Abrí la imagen y mantené apretado para compartir.");
    },
    [showMobileToast]
  );

  const showIgToast = React.useCallback((msg: string, kind?: "error" | "info") => {
    setIgToast({ msg, kind });
    window.setTimeout(() => setIgToast(null), 2600);
  }, []);

  const refreshIgStatus = React.useCallback(async () => {
    if (!user) return;
    setIgLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/accounts", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") return;

      const connected = Boolean(data.connected);
      setIgConnected(connected);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`postty:v3:${user.uid}:igConnected:v1`, JSON.stringify(connected));
        }
      } catch {
        // ignore
      }

      const activeAccountId = typeof data.activeAccountId === "string" ? data.activeAccountId : null;
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];

      let label: string | null = null;
      if (activeAccountId?.startsWith("acc:")) {
        const id = activeAccountId.slice("acc:".length);
        const found = accounts.find((a: any) => a?.accountId === id);
        if (found && typeof found.label === "string") label = found.label;
      }
      setIgLabel(label);
    } catch {
      // silent
    } finally {
      setIgLoading(false);
    }
  }, [user]);

  const handleDisconnectInstagram = React.useCallback(async () => {
    if (!user) return;
    setIgLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") throw new Error(data?.message || "Failed to disconnect");
      setIgConnected(false);
      setIgLabel(null);
      showIgToast("Instagram desconectado", "info");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showIgToast(msg, "error");
    } finally {
      setIgLoading(false);
    }
  }, [showIgToast, user]);

  // Handle Instagram connection
  const handleConnectInstagram = async () => {
    if (!user) return;
    setConnectingInstagram(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/connect-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          remember: true,
          returnTo: typeof window !== "undefined" ? `${window.location.origin}/v3` : "/v3",
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success" || typeof data.connectUrl !== "string") {
        throw new Error(data?.message || "Failed to start Instagram connect");
      }
      window.location.href = data.connectUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al conectar Instagram";
      console.error(msg);
      alert(msg);
    } finally {
      setConnectingInstagram(false);
    }
  };

  // Refresh IG status when opening dropdown
  React.useEffect(() => {
    if (!showProfileDropdown) return;
    refreshIgStatus();
  }, [refreshIgStatus, showProfileDropdown]);

  // Refresh IG status behind the scenes on load / user change.
  React.useEffect(() => {
    if (!user) return;
    // Best-effort optimistic restore (prevents “grayed out until profile click”).
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(`postty:v3:${user.uid}:igConnected:v1`);
        if (raw) setIgConnected(Boolean(JSON.parse(raw)));
      }
    } catch {
      // ignore
    }
    refreshIgStatus();
  }, [refreshIgStatus, user]);

  // Periodic IG status refresh so it stays accurate.
  React.useEffect(() => {
    if (!user) return;
    const intervalMs = 90_000;
    const id = window.setInterval(() => {
      refreshIgStatus();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [refreshIgStatus, user]);

  // After OAuth redirect, refresh IG status and show feedback
  React.useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const ig = url.searchParams.get("ig");
    const message = url.searchParams.get("message");
    if (!ig) return;

    if (ig === "connected") {
      refreshIgStatus();
      showIgToast("Instagram conectado", "info");
    } else if (ig === "error") {
      showIgToast(message ? `Instagram: ${message}` : "No se pudo conectar Instagram", "error");
    }

    url.searchParams.delete("ig");
    url.searchParams.delete("message");
    window.history.replaceState({}, "", url.toString());
  }, [refreshIgStatus, showIgToast, user]);
  
  // Chat state
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [clientSessionId, setClientSessionId] = React.useState<string | null>(null);
  const [isFirstPost, setIsFirstPost] = React.useState<boolean | null>(null); // null = loading
  const [selectedReference, setSelectedReference] = React.useState<ReferenceOption | null>(null);
  const [productThumbnail, setProductThumbnail] = React.useState<string | null>(null);
  const productThumbnailRef = React.useRef<string | null>(null);
  const [readyToGenerate, setReadyToGenerate] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [preferredLanguage, setPreferredLanguage] = React.useState<SupportedLanguage>("en");
  const persistedLanguageRef = React.useRef<SupportedLanguage | null>(null);
  
  // Save / Post (caption + background publish) state
  const [showCaptionModal, setShowCaptionModal] = React.useState(false);
  const [captionInput, setCaptionInput] = React.useState("");
  const [publishingImageUrl, setPublishingImageUrl] = React.useState<string | null>(null);
  const [publishingPostId, setPublishingPostId] = React.useState<string | null>(null);
  const publishingPostBasePromptRef = React.useRef<string | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isCaptionGenerating, setIsCaptionGenerating] = React.useState(false);
  const [isSavingToPosts, setIsSavingToPosts] = React.useState(false);
  const captionGenSeqRef = React.useRef(0);
  const lastUploadedProductImageRef = React.useRef<File | null>(null);
  const lastUserPromptForCaptionRef = React.useRef<string>("");
  const lastAssistantPromptForCaptionRef = React.useRef<string>("");
  const lastSelectedPostTypeLabelRef = React.useRef<string>("");
  const lastProductSummaryForCaptionRef = React.useRef<string>("");
  const pendingPublishIdsRef = React.useRef<Set<string>>(new Set());
  const autoFeedbackTimerRef = React.useRef<number | null>(null);

  // My Posts panel state
  const [myPosts, setMyPosts] = React.useState<UserPost[]>([]);
  const [myPostsLoading, setMyPostsLoading] = React.useState(false);
  const [myPostsError, setMyPostsError] = React.useState<string | null>(null);
  const [brokenPostMediaIds, setBrokenPostMediaIds] = React.useState<Record<string, true>>({});

  const [loadingMessageIndex, setLoadingMessageIndex] = React.useState(0);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const restoredForUidRef = React.useRef<string | null>(null);

  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    productThumbnailRef.current = productThumbnail;
  }, [productThumbnail]);

  const scrollChatToBottom = React.useCallback(
    (behavior: ScrollBehavior) => {
      const el = chatScrollRef.current;
      if (!el) return;
      // Only auto-scroll the chat frame (not the Posts panel).
      if (activeLeftMenu !== "home") return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [activeLeftMenu]
  );

  const scheduleAutoFeedbackAfterGeneration = React.useCallback(() => {
    if (autoFeedbackTimerRef.current !== null) {
      window.clearTimeout(autoFeedbackTimerRef.current);
    }
    autoFeedbackTimerRef.current = window.setTimeout(() => {
      setShowFeedbackBlur(true);
      setShowFeedbackModal(true);
      autoFeedbackTimerRef.current = null;
    }, 3000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (autoFeedbackTimerRef.current !== null) {
        window.clearTimeout(autoFeedbackTimerRef.current);
      }
    };
  }, []);
  
  // Mobile-only: show swipe hint until user actually swipes the post-type carousel.
  React.useEffect(() => {
    if (!isMobileBrowser) return;
    if (typeof window === "undefined") return;
    const uidOrAnon = user?.uid ? user.uid : "anon";
    const key = `postty:v3:postTypeCarouselSwiped:v1:${uidOrAnon}`;
    try {
      setPostTypeCarouselSwiped(window.localStorage.getItem(key) === "1");
    } catch {
      setPostTypeCarouselSwiped(false);
    }
  }, [isMobileBrowser, user?.uid]);

  React.useEffect(() => {
    if (!isMobileBrowser) return;
    const el = postTypeCarouselRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setPostTypeCarouselVisible(Boolean(entry?.isIntersecting));
      },
      { root: null, threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isMobileBrowser, messages.length]);

  const markCarouselSwiped = React.useCallback(() => {
    if (!isMobileBrowser) return;
    if (postTypeCarouselSwiped) return;
    setPostTypeCarouselSwiped(true);
    const uidOrAnon = user?.uid ? user.uid : "anon";
    const key = `postty:v3:postTypeCarouselSwiped:v1:${uidOrAnon}`;
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }, [isMobileBrowser, postTypeCarouselSwiped, user?.uid]);

  // Microphone functionality intentionally removed from /v3 (will return in a future version).

  // Determine current loading stage based on conversation state
  type LoadingStage = 'analyzing_product' | 'searching_references' | 'applying_changes';
  
  const loadingStage = React.useMemo((): LoadingStage => {
    if (selectedReference) {
      return 'applying_changes';
    }
    // Check if we've already shown reference options (means we're past product analysis)
    const hasShownReferences = messages.some(m => m.referenceOptions && m.referenceOptions.length > 0);
    const hasShownPostTypes = messages.some(m => m.postTypeOptions && m.postTypeOptions.length > 0);
    
    if (hasShownPostTypes && !hasShownReferences) {
      return 'searching_references';
    }
    
    return 'analyzing_product';
  }, [selectedReference, messages]);

  // Loading messages by stage - designed to NOT repeat (stops at last message)
  const loadingMessagesByStage: Record<LoadingStage, string[]> =
    preferredLanguage === "pt"
      ? {
          analyzing_product: [
            "Analisando seu produto",
            "Identificando características principais",
            "Estudando a iluminação",
            "Avaliando composição e ângulos",
            "Detectando cores dominantes",
            "Analisando texturas e materiais",
            "Extraindo estilo visual",
            "Quase pronto...",
          ],
          searching_references: [
            "Buscando inspiração",
            "Explorando estilos similares",
            "Filtrando referências relevantes",
            "Comparando opções visuais",
            "Analisando tendências",
            "Selecionando as melhores opções",
            "Preparando opções para você",
            "Quase lá...",
          ],
          applying_changes: [
            "Aplicando suas mudanças",
            "Ajustando composição",
            "Refinando detalhes",
            "Otimizando resultado",
            "Processando ajustes finais",
            "Polindo a imagem",
            "Últimos retoques",
            "Quase pronto...",
          ],
        }
      : preferredLanguage === "en"
        ? {
            analyzing_product: [
              "Analyzing your product",
              "Identifying key features",
              "Studying the lighting",
              "Evaluating composition and angles",
              "Detecting dominant colors",
              "Analyzing textures and materials",
              "Extracting visual style",
              "Almost ready...",
            ],
            searching_references: [
              "Searching for inspiration",
              "Exploring similar styles",
              "Filtering relevant references",
              "Comparing visual options",
              "Analyzing trends",
              "Selecting the best matches",
              "Preparing options for you",
              "Almost there...",
            ],
            applying_changes: [
              "Applying your changes",
              "Adjusting composition",
              "Refining details",
              "Optimizing result",
              "Processing final tweaks",
              "Polishing the image",
              "Final touches",
              "Almost ready...",
            ],
          }
        : {
            analyzing_product: [
              "Analizando tu producto",
              "Identificando características principales",
              "Estudiando la iluminación",
              "Evaluando composición y ángulos",
              "Detectando colores dominantes",
              "Analizando texturas y materiales",
              "Extrayendo estilo visual",
              "Casi listo...",
            ],
            searching_references: [
              "Buscando inspiración",
              "Explorando estilos similares",
              "Filtrando referencias relevantes",
              "Comparando opciones visuales",
              "Analizando tendencias",
              "Seleccionando las mejores coincidencias",
              "Preparando opciones para vos",
              "Ya casi...",
            ],
            applying_changes: [
              "Aplicando tus cambios",
              "Ajustando composición",
              "Refinando detalles",
              "Optimizando resultado",
              "Procesando ajustes finales",
              "Puliendo la imagen",
              "Últimos retoques",
              "Casi listo...",
            ],
          };

  const loadingMessages = loadingMessagesByStage[loadingStage];
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const previousUserIdRef = React.useRef<string | null>(null);
  // Reference uploads intentionally disabled in v3 (will return in a future version).

  const uiCopy = React.useMemo(() => {
    if (preferredLanguage === "es") {
      return {
        uploadMarker: "📸 Imagen subida",
        referenceSelectedMarker: "📷 Referencia seleccionada",
        referenceSelectedLabel: "Referencia seleccionada",
        genericError: "Perdón, tuve un problema. ¿Podés intentar de nuevo?",
        genericErrorAlt: "Lo siento, hubo un error. Por favor intenta de nuevo.",
        imageReady: "¡Listo! Acá está tu imagen",
        placeholderWithMessages: "Describe tu post",
        placeholderWithoutMessages: "Sube una foto primero por favor",
        needInstagram: "Necesitás conectar Instagram para publicar.",
        instagramPublished: "Publicado en Instagram.",
        instagramFailedPrefix: "Falló la publicación en Instagram:",
        unknownError: "Error desconocido",
        uploadToInstagram: "Subiendo a Instagram...",
        generatingPost: "Generando post",
        generateAction: "Generar",
        generatingAction: "Generando...",
        welcomeTitleFirstPost: "¡Bienvenid@ a tu primer post!",
        welcomeTitleNextPost: "¡Creemos tu nuevo post!",
        welcomeHintFirstPost: "Para empezar, sube una foto de tu producto o arrástrala a la pantalla :)",
        welcomeHintNextPost: "Sube una foto de tu producto para comenzar",
        captionInstruction: "Caption para un post de Instagram.",
        captionModalTitle: "Postear en Instagram",
        captionLabel: "Caption",
        captionPlaceholder: "Escribe tu caption...",
        captionGenerating: "Generando caption...",
        cancel: "Cancelar",
        publish: "Publicar",
        publishing: "Subiendo...",
        savedInMyPosts: "Guardado en **My posts**.",
        save: "Guardar",
        saving: "Guardando...",
        share: "Compartir",
        post: "Postear",
        myPostsTitle: "My posts",
        myPostsSubtitle: "Guardados, subiendo y publicados.",
        refresh: "Actualizar",
        loading: "Cargando...",
        noPostsYetPrefix: "Aún no hay posts.",
        noPostsYetActionSave: "Guardar",
        noPostsYetActionPost: "Postear",
        loadingPosts: "Cargando posts...",
        statusSaved: "Guardados",
        statusUploading: "Subiendo",
        statusPublished: "Publicados",
        statusFailed: "Fallidos",
        missingMedia: "Falta el media",
        failedToLoad: "No se pudo cargar",
        noUrl: "Sin URL",
        noCaption: "Sin caption",
      };
    }
    if (preferredLanguage === "pt") {
      return {
        uploadMarker: "📸 Imagem enviada",
        referenceSelectedMarker: "📷 Referência selecionada",
        referenceSelectedLabel: "Referência selecionada",
        genericError: "Desculpe, tive um problema. Pode tentar de novo?",
        genericErrorAlt: "Desculpe, ocorreu um erro. Tente novamente.",
        imageReady: "Perfeito! Aqui está sua imagem",
        placeholderWithMessages: "Descreva seu post",
        placeholderWithoutMessages: "Envie uma foto primeiro, por favor",
        needInstagram: "Você precisa conectar o Instagram para publicar.",
        instagramPublished: "Publicado no Instagram.",
        instagramFailedPrefix: "Falha ao publicar no Instagram:",
        unknownError: "Erro desconhecido",
        uploadToInstagram: "Enviando para o Instagram...",
        generatingPost: "Gerando post",
        generateAction: "Gerar",
        generatingAction: "Gerando...",
        welcomeTitleFirstPost: "Bem-vind@ ao seu primeiro post!",
        welcomeTitleNextPost: "Vamos criar seu novo post!",
        welcomeHintFirstPost: "Para começar, envie uma foto do seu produto ou arraste para a tela :)",
        welcomeHintNextPost: "Envie uma foto do seu produto para começar",
        captionInstruction: "Legenda para um post de Instagram.",
        captionModalTitle: "Postar no Instagram",
        captionLabel: "Legenda",
        captionPlaceholder: "Escreva sua legenda...",
        captionGenerating: "Gerando legenda...",
        cancel: "Cancelar",
        publish: "Publicar",
        publishing: "Enviando...",
        savedInMyPosts: "Salvo em **My posts**.",
        save: "Salvar",
        saving: "Salvando...",
        share: "Compartilhar",
        post: "Postar",
        myPostsTitle: "My posts",
        myPostsSubtitle: "Salvos, enviando e publicados.",
        refresh: "Atualizar",
        loading: "Carregando...",
        noPostsYetPrefix: "Ainda não há posts.",
        noPostsYetActionSave: "Salvar",
        noPostsYetActionPost: "Postar",
        loadingPosts: "Carregando posts...",
        statusSaved: "Salvos",
        statusUploading: "Enviando",
        statusPublished: "Publicados",
        statusFailed: "Falhos",
        missingMedia: "Mídia ausente",
        failedToLoad: "Falha ao carregar",
        noUrl: "Sem URL",
        noCaption: "Sem legenda",
      };
    }
    return {
      uploadMarker: "📸 Photo uploaded",
      referenceSelectedMarker: "📷 Reference selected",
      referenceSelectedLabel: "Reference selected",
      genericError: "Sorry, I had a problem. Could you try again?",
      genericErrorAlt: "Sorry, something went wrong. Please try again.",
      imageReady: "Done! Here is your image",
      placeholderWithMessages: "Describe your post",
      placeholderWithoutMessages: "Please upload a photo first",
      needInstagram: "You need to connect Instagram to publish.",
      instagramPublished: "Published on Instagram.",
      instagramFailedPrefix: "Instagram publish failed:",
      unknownError: "Unknown error",
      uploadToInstagram: "Uploading to Instagram...",
      generatingPost: "Generating post",
      generateAction: "Generate",
      generatingAction: "Generating...",
      welcomeTitleFirstPost: "Welcome to your first post!",
      welcomeTitleNextPost: "Let's create your new post!",
      welcomeHintFirstPost: "To start, upload a product photo or drag it onto the screen :)",
      welcomeHintNextPost: "Upload a product photo to continue",
      captionInstruction: "Caption for an Instagram post.",
      captionModalTitle: "Post to Instagram",
      captionLabel: "Caption",
      captionPlaceholder: "Write your caption...",
      captionGenerating: "Generating caption...",
      cancel: "Cancel",
      publish: "Publish",
      publishing: "Uploading...",
      savedInMyPosts: "Saved in **My posts**.",
      save: "Save",
      saving: "Saving...",
      share: "Share",
      post: "Post",
      myPostsTitle: "My posts",
      myPostsSubtitle: "Saved, uploading, and published posts.",
      refresh: "Refresh",
      loading: "Loading...",
      noPostsYetPrefix: "No posts yet.",
      noPostsYetActionSave: "Save",
      noPostsYetActionPost: "Post",
      loadingPosts: "Loading posts...",
      statusSaved: "Saved",
      statusUploading: "Uploading",
      statusPublished: "Published",
      statusFailed: "Failed",
      missingMedia: "Missing media",
      failedToLoad: "Failed to load",
      noUrl: "No URL",
      noCaption: "No caption",
    };
  }, [preferredLanguage]);

  const persistPreferredLanguage = React.useCallback(
    async (language: SupportedLanguage, source: "stored" | "browser" | "message") => {
      if (!MULTILANG_ENABLED || !user) return;
      if (persistedLanguageRef.current === language && source !== "message") return;
      try {
        await updateUserLanguagePreference(user.uid, language, source);
        persistedLanguageRef.current = language;
      } catch (error) {
        console.error("[multilang] failed to persist preferred language", error);
      }
    },
    [MULTILANG_ENABLED, user]
  );

  const syncLanguageFromAgentResult = React.useCallback(
    async (result: any) => {
      if (!MULTILANG_ENABLED) return;
      const next = normalizePreferredLanguage(result?.language);
      if (!next) return;
      if (next !== preferredLanguage) {
        setPreferredLanguage(next);
      }
      if (result?.languageSource === "message" && next !== persistedLanguageRef.current) {
        await persistPreferredLanguage(next, "message");
      }
    },
    [MULTILANG_ENABLED, persistPreferredLanguage, preferredLanguage]
  );

  React.useEffect(() => {
    if (!MULTILANG_ENABLED) return;
    if (!user) return;
    const profile = (userProfile || null) as UserProfile | null;
    const stored = normalizePreferredLanguage(profile?.preferredLanguage);
    const initial = stored || detectBrowserLanguage();
    setPreferredLanguage(initial);
    persistedLanguageRef.current = stored || null;
    if (!stored) {
      void persistPreferredLanguage(initial, "browser");
    }
  }, [MULTILANG_ENABLED, persistPreferredLanguage, user, userProfile]);

  // Track previous loading stage to reset index when stage changes
  const prevLoadingStageRef = React.useRef<LoadingStage>(loadingStage);
  
  // Reset loading message index when stage changes
  React.useEffect(() => {
    if (prevLoadingStageRef.current !== loadingStage) {
      setLoadingMessageIndex(0);
      prevLoadingStageRef.current = loadingStage;
    }
  }, [loadingStage]);

  // Cycle through loading messages while waiting (stops at last message, doesn't repeat)
  React.useEffect(() => {
    if (isTyping || isSending || isGenerating) {
      const interval = setInterval(() => {
        // Stop at the last message instead of looping back
        setLoadingMessageIndex((prev) => Math.min(prev + 1, loadingMessages.length - 1));
      }, 2500); // Change message every 2.5 seconds for better pacing
      return () => clearInterval(interval);
    } else {
      setLoadingMessageIndex(0); // Reset when done loading
    }
  }, [isTyping, isSending, isGenerating, loadingMessages.length]);

  // Generate session ID
  const makeFreshSessionId = React.useCallback(() => {
    const base = user?.uid ? `uid-${user.uid}` : "anon";
    return `${base}-${uuid()}`;
  }, [user?.uid]);

  // Reset chat when user changes (login/logout)
  React.useEffect(() => {
    if (loading) return;
    
    const currentUserId = user?.uid || null;
    const previousUserId = previousUserIdRef.current;
    
    // If user changed (different user or logged out/in), reset chat
    if (previousUserId !== null && previousUserId !== currentUserId) {
      setMessages([]);
      setInputValue("");
      setIsTyping(false);
      setIsSending(false);
      setClientSessionId(null);
      setIsFirstPost(null); // Reset to trigger re-fetch
      setSelectedReference(null);
      setProductThumbnail(null);
      setReadyToGenerate(false);
      setIsGenerating(false);
      setPreferredLanguage("en");
      persistedLanguageRef.current = null;
      // Allow restoring when a user logs back in (or switches accounts).
      restoredForUidRef.current = null;
    }
    
    previousUserIdRef.current = currentUserId;
  }, [user?.uid, loading]);

  // Check if this is the user's first post
  React.useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (isFirstPost !== null) return; // Already fetched

    const checkFirstPost = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/user/is-first-post", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setIsFirstPost(data.isFirstPost ?? true);
        } else {
          // Default to first post on error
          setIsFirstPost(true);
        }
      } catch (error) {
        console.error("Error checking first post:", error);
        setIsFirstPost(true); // Default to first post on error
      }
    };

    checkFirstPost();
  }, [user, loading, isFirstPost]);

  // Initialize session on mount or after reset
  React.useEffect(() => {
    if (loading) return;
    if (clientSessionId) return;
    const sid = makeFreshSessionId();
    setClientSessionId(sid);
  }, [clientSessionId, loading, makeFreshSessionId]);

  // Scroll to bottom when messages change
  React.useEffect(() => {
    if (isMobileBrowser) {
      // Mobile: avoid smooth scrolling + keyboard jank; always stick to bottom.
      requestAnimationFrame(() => scrollChatToBottom("auto"));
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isMobileBrowser, messages, scrollChatToBottom]);

  // Persist / restore v3 state across reloads (per-user).
  React.useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (restoredForUidRef.current === user.uid) return;

    const key = `postty:v3:${user.uid}:state:v1`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.messages)) {
          const sanitizedMessages = (parsed.messages as Message[]).map((message) => {
            if (!message || typeof message !== "object") return message;
            if (!("productThumbnail" in message)) return message;
            if (isDisplayableImageUrl(message.productThumbnail)) return message;
            const { productThumbnail: _dropInvalidThumbnail, ...rest } = message;
            return rest as Message;
          });
          setMessages(sanitizedMessages);
        }
        if (typeof parsed.clientSessionId === "string") setClientSessionId(parsed.clientSessionId);
        if (parsed.clientSessionId === null) setClientSessionId(null);
        // Note: "reels" is intentionally not restorable. The button is "coming soon"
        // and should not activate any transitions or state changes.
        if (parsed.activeLeftMenu === "home" || parsed.activeLeftMenu === "posts") {
          setActiveLeftMenu(parsed.activeLeftMenu);
        }
        if (isDisplayableImageUrl(parsed.productThumbnail) || parsed.productThumbnail === null) {
          setProductThumbnail(parsed.productThumbnail);
        }
      }
    } catch {
      // ignore
    } finally {
      restoredForUidRef.current = user.uid;
      // Mobile: after restoring state, ensure the chat is anchored to bottom.
      if (isMobileBrowser) requestAnimationFrame(() => scrollChatToBottom("auto"));
    }
  }, [user, isMobileBrowser, scrollChatToBottom]);

  React.useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (restoredForUidRef.current !== user.uid) return;
    const key = `postty:v3:${user.uid}:state:v1`;
    try {
      const payload = {
        messages,
        clientSessionId,
        activeLeftMenu,
        productThumbnail,
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore quota / serialization issues
    }
  }, [activeLeftMenu, clientSessionId, messages, productThumbnail, user]);

  // Keep the latest uploaded product thumbnail in the active post-type assistant card.
  // This fixes stale thumbnails when the user starts another post with a new image.
  React.useEffect(() => {
    if (!productThumbnail) return;
    setMessages((prev) => {
      let targetIndex = -1;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        const m = prev[i];
        if (m.role === "assistant" && m.postTypeOptions && m.postTypeOptions.length > 0) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex < 0) return prev;
      const current = prev[targetIndex];
      if (current.productThumbnail === productThumbnail) return prev;
      const next = [...prev];
      next[targetIndex] = { ...current, productThumbnail };
      return next;
    });
  }, [productThumbnail]);

  // Auto-grow chat textarea (up to a max height)
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 160); // ~8-9 lines depending on font
    el.style.height = `${next}px`;
  }, [inputValue]);

  // Add assistant message with typing delay
  const addAssistantMessage = (
    content: string,
    imageUrl?: string,
    onShown?: () => void
  ) => {
    setIsTyping(true);
    const delay = 600 + Math.random() * 300;
    setTimeout(() => {
      // Keep assistant prompt as a fallback, but v2-parity prefers user intent + structured context.
      const c = (content || "").trim();
      if (c.length >= 20 && !c.toLowerCase().includes("subí la foto")) lastAssistantPromptForCaptionRef.current = c;
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content,
          imageUrl,
        },
      ]);
      onShown?.();
      setIsTyping(false);
    }, delay);
  };

  // Add user message
  const addUserMessage = (content: string, imageUrl?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uuid(),
        role: "user",
        content,
        imageUrl,
      },
    ]);
  };

  // Handle sending message to agent
  const handleSendMessage = async (
    text?: string,
    uploadedFile?: File,
    _isReferenceUpload?: boolean,
    opts?: { selectedPostType?: string; uploadedThumbnailUrl?: string; languageDetectionText?: string }
  ) => {
    const rawInputText = inputValue.trim();
    const messageText = text ?? rawInputText;
    if (!messageText && !uploadedFile) return;
    if (isSending || isTyping) return;
    const languageDetectionText =
      typeof opts?.languageDetectionText === "string" ? opts.languageDetectionText : text === undefined ? rawInputText : "";

    setInputValue("");

    // Track last user intent + product image for caption autofill.
    const msgNorm = (messageText || "").trim();
    const msgLower = msgNorm.toLowerCase();
    const isStartOverIntent =
      msgLower.includes("empezar de nuevo") ||
      msgLower.includes("start over") ||
      msgLower.includes("restart");
    const isControl =
      msgLower === "generar" ||
      msgLower === "generate" ||
      msgLower.includes("generar otra") ||
      msgLower.includes("otra imagen") ||
      isStartOverIntent;
    const isUploadMarker = msgLower === "[user uploaded product image]" || msgNorm === uiCopy.uploadMarker;
    if (msgNorm && !isControl && !isUploadMarker) {
      lastUserPromptForCaptionRef.current = msgNorm;
    }
    if (isStartOverIntent) {
      // Prevent stale thumbnail bleed when the user starts a fresh run.
      setProductThumbnail(null);
      productThumbnailRef.current = null;
      lastUploadedProductImageRef.current = null;
    }
    if (uploadedFile) {
      lastUploadedProductImageRef.current = uploadedFile;
    }

    // Add user message to chat
    const uiMessage = uploadedFile && !messageText ? uiCopy.uploadMarker : messageText;
    const backendMessage = uploadedFile && (!messageText || messageText === uiCopy.uploadMarker)
      ? "[User uploaded product image]"
      : messageText;

    if (uploadedFile) {
      const imageUrl = opts?.uploadedThumbnailUrl || URL.createObjectURL(uploadedFile);
      addUserMessage(uiMessage, imageUrl);
    } else {
      addUserMessage(uiMessage);
    }

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append("agentType", "product-showcase");
      formData.append("message", backendMessage);
      if (opts?.selectedPostType) formData.append("selectedPostType", opts.selectedPostType);
      formData.append("conversationHistory", JSON.stringify(
        messages.map((m) => ({ role: m.role, content: m.content }))
      ));
      formData.append("preferredLanguage", preferredLanguage);
      formData.append("languageDetectionText", languageDetectionText);
      if (clientSessionId) formData.append("sessionId", clientSessionId);
      if (uploadedFile) {
        formData.append("image", uploadedFile);
      }
      if (user?.uid) {
        formData.append("userId", user.uid);
      }
      const token = user ? await user.getIdToken() : null;

      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!response.ok) {
        let details = "";
        try {
          const data = await response.json();
          const msg = typeof data?.message === "string" ? data.message : "";
          const det = typeof data?.details === "string" ? data.details : "";
          details = [msg, det].filter(Boolean).join("\n");
        } catch {
          try {
            details = await response.text();
          } catch {
            details = "";
          }
        }
        const fallback = `Agent request failed (HTTP ${response.status})`;
        throw new Error(details || fallback);
      }

      const result = await response.json();
      await syncLanguageFromAgentResult(result);
      if (MULTILANG_ENABLED && result?.languageApplied === false) {
        console.warn("[multilang] backend reported language not applied", result?.languageError || "unknown");
      }

      // Handle different response types
      if (result.type === "text") {
        // Any response ends the generating lock, including failures.
        setIsGenerating(false);
        // Check if ready to generate flag is set
        if (result.readyToGenerate) {
          setReadyToGenerate(true);
        }
        addAssistantMessage(result.text || "");
      } else if (result.type === "image") {
        setReadyToGenerate(false);
        setIsGenerating(false);
        addAssistantMessage(
          result.text || uiCopy.imageReady,
          result.imageUrl,
          AUTO_FEEDBACK_AFTER_GENERATION_ENABLED ? scheduleAutoFeedbackAfterGeneration : undefined
        );
      } else if (result.type === "post_type_options") {
        setIsGenerating(false);
        // Step 1: Show post type options with images
        const t = typeof result.text === "string" ? result.text.trim() : "";
        if (t) lastProductSummaryForCaptionRef.current = t;
        const resolvedThumb =
          opts?.uploadedThumbnailUrl ||
          productThumbnailRef.current ||
          (isDisplayableImageUrl(result.productThumbnail) ? result.productThumbnail : undefined);
        const msg: Message = {
          id: uuid(),
          role: "assistant",
          content: result.text || "",
          postTypeOptions: result.postTypes,
          productThumbnail: resolvedThumb,
        };
        setMessages((prev) => [...prev, msg]);
      } else if (result.type === "reference_options") {
        setIsGenerating(false);
        // Step 3: Show reference options carousel
        const msg: Message = {
          id: uuid(),
          role: "assistant",
          content: result.text || "",
          referenceOptions: result.references,
        };
        setMessages((prev) => [...prev, msg]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setIsGenerating(false);
      const msg =
        error instanceof Error && error.message
          ? error.message
          : uiCopy.genericError;
      addAssistantMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  // Handle post type selection
  const handlePostTypeSelect = (postType: PostTypeOption) => {
    lastSelectedPostTypeLabelRef.current = postType.label;
    // Send canonical post type for deterministic backend routing (keeps chat-visible label as-is).
    handleSendMessage(postType.label, undefined, undefined, {
      selectedPostType: postType.type,
      languageDetectionText: "",
    });
  };

  // Handle reference selection
  const handleReferenceSelect = async (reference: ReferenceOption) => {
    setSelectedReference(reference);
    
    // Add user message with reference thumbnail
    addUserMessage(uiCopy.referenceSelectedMarker, reference.url);
    
    setIsSending(true);
    
    try {
      const formData = new FormData();
      formData.append("agentType", "product-showcase");
      formData.append("message", `[User selected reference: ${reference.id}]`);
      formData.append("conversationHistory", JSON.stringify(
        messages.map((m) => ({ role: m.role, content: m.content }))
      ));
      formData.append("selectedReferenceId", reference.id);
      formData.append("selectedReferenceUrl", reference.url);
      formData.append("preferredLanguage", preferredLanguage);
      formData.append("languageDetectionText", "");
      if (clientSessionId) formData.append("sessionId", clientSessionId);
      if (user?.uid) formData.append("userId", user.uid);
      const token = user ? await user.getIdToken() : null;

      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!response.ok) {
        let details = "";
        try {
          const data = await response.json();
          const msg = typeof data?.message === "string" ? data.message : "";
          const det = typeof data?.details === "string" ? data.details : "";
          details = [msg, det].filter(Boolean).join("\n");
        } catch {
          try {
            details = await response.text();
          } catch {
            details = "";
          }
        }
        const fallback = `Agent request failed (HTTP ${response.status})`;
        throw new Error(details || fallback);
      }

      const result = await response.json();
      await syncLanguageFromAgentResult(result);
      if (MULTILANG_ENABLED && result?.languageApplied === false) {
        console.warn("[multilang] backend reported language not applied", result?.languageError || "unknown");
      }
      
      if (result.type === "text") {
        if (result.readyToGenerate) {
          setReadyToGenerate(true);
        }
        addAssistantMessage(result.text || "");
      }
    } catch (error) {
      console.error("Error:", error);
      const msg =
        error instanceof Error && error.message
          ? error.message
          : uiCopy.genericErrorAlt;
      addAssistantMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  // (Reference upload handler removed.)

  // (Microphone cleanup removed.)

  // Handle generate button click
  const handleGenerate = async () => {
    if (!readyToGenerate || isGenerating) return;
    setIsGenerating(true);
    handleSendMessage("Generar", undefined, undefined, { languageDetectionText: "" });
  };

  const fileToDataUrl = React.useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }, []);

  const hydrateProductThumbnailFromFile = React.useCallback((file: File) => {
    // Clear previous thumbnail immediately so older images cannot be reused.
    setProductThumbnail(null);
    fileToDataUrl(file)
      .then((dataUrl) => {
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
          setProductThumbnail(dataUrl);
        }
      })
      .catch(() => {
        // ignore
      });
  }, [fileToDataUrl]);

  const getCaptionBasePrompt = React.useCallback(() => {
    // v2-parity: prefer the last meaningful USER intent, not assistant UI/status text.
    const u = (lastUserPromptForCaptionRef.current || "").trim();
    const postType = (lastSelectedPostTypeLabelRef.current || "").trim();
    const productSummary = (lastProductSummaryForCaptionRef.current || "").trim();
    const a = (lastAssistantPromptForCaptionRef.current || "").trim();

    const parts = [
      u,
      postType ? `Tipo de post: ${postType}` : "",
      productSummary ? `Contexto del producto:\n${productSummary}` : "",
      // Last resort fallback (helps if user never typed a meaningful prompt)
      !u && a ? a : "",
    ].filter((x) => typeof x === "string" && x.trim().length > 0);

    return parts.join("\n\n").trim();
  }, []);

  const handleOpenCaptionModal = React.useCallback(
    (imageUrl: string) => {
      setPublishingImageUrl(imageUrl);
      setPublishingPostId(null);
      publishingPostBasePromptRef.current = null;
      setCaptionInput("");
      setShowCaptionModal(true);

      // Auto-generate caption on open (non-blocking).
      const seq = ++captionGenSeqRef.current;
      setIsCaptionGenerating(true);
      (async () => {
        try {
          const basePrompt = getCaptionBasePrompt();
          if (!basePrompt) return;

          const postType = (lastSelectedPostTypeLabelRef.current || "").trim();
          const body: any = {
            base_prompt: basePrompt,
            instruction: postType ? `Caption para un post de Instagram tipo ${postType}.` : undefined,
          };
          const file = lastUploadedProductImageRef.current;
          if (file) {
            body.product_image_base64 = await fileToDataUrl(file);
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
    },
    [fileToDataUrl, getCaptionBasePrompt]
  );

  const handleTryOpenCaptionModal = React.useCallback(
    (imageUrl: string) => {
      if (!igConnected) {
        if (isMobileBrowser) showMobileToast(uiCopy.needInstagram);
        return;
      }
      handleOpenCaptionModal(imageUrl);
    },
    [handleOpenCaptionModal, igConnected, isMobileBrowser, showMobileToast, uiCopy.needInstagram]
  );

  const handleOpenCaptionModalForSavedPost = React.useCallback((post: UserPost) => {
    const url = post.mediaUrl || post.previewUrl || "";
    if (!url) return;

    setPublishingImageUrl(url);
    setPublishingPostId(post.id);

    const basePrompt = (post.prompt || post.caption || "").toString().trim();
    publishingPostBasePromptRef.current = basePrompt || null;

    const existingCaption = (post.caption || "").toString();
    setCaptionInput(existingCaption);
    setShowCaptionModal(true);

    // Auto-generate only if there's no existing caption to avoid overwriting.
    if (existingCaption.trim()) return;

    const seq = ++captionGenSeqRef.current;
    setIsCaptionGenerating(true);
    (async () => {
      try {
        if (!basePrompt) return;
        const body: any = {
          base_prompt: basePrompt,
          instruction: uiCopy.captionInstruction,
        };
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

        // Persist caption draft so My Posts shows it and we don't regenerate next time.
        try {
          if (!user) return;
          const token = await user.getIdToken();
          await fetch("/api/posts/update-caption", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ postId: post.id, caption: nextCaption }),
          });
          // Optimistic local update (avoid depending on refreshMyPosts ordering).
          setMyPosts((prev) =>
            prev.map((p) => (p.id === post.id ? { ...p, caption: nextCaption } : p))
          );
        } catch {
          // ignore (draft saving is best-effort)
        }
      } catch {
        // Silent failure: user can still type manually.
      } finally {
        if (captionGenSeqRef.current === seq) setIsCaptionGenerating(false);
      }
    })();
  }, [uiCopy.captionInstruction, user]);

  const handleTryOpenCaptionModalForSavedPost = React.useCallback(
    (post: UserPost) => {
      if (!igConnected) {
        if (isMobileBrowser) showMobileToast(uiCopy.needInstagram);
        return;
      }
      handleOpenCaptionModalForSavedPost(post);
    },
    [handleOpenCaptionModalForSavedPost, igConnected, isMobileBrowser, showMobileToast, uiCopy.needInstagram]
  );

  const handleCloseCaptionModal = React.useCallback(() => {
    setShowCaptionModal(false);
    setPublishingImageUrl(null);
    setPublishingPostId(null);
    publishingPostBasePromptRef.current = null;
    setCaptionInput("");
    setIsCaptionGenerating(false);
  }, []);

  const refreshMyPosts = React.useCallback(async () => {
    if (!user) return;
    setMyPostsLoading(true);
    setMyPostsError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/posts?limit=120", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") {
        throw new Error(data?.message || "Failed to load posts");
      }
      const posts = Array.isArray(data?.posts) ? (data.posts as UserPost[]) : [];
      setMyPosts(posts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load posts";
      setMyPostsError(msg);
    } finally {
      setMyPostsLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (!user) return;
    if (activeLeftMenu !== "posts") return;
    refreshMyPosts();
  }, [activeLeftMenu, refreshMyPosts, user]);

  const startPublishPolling = React.useCallback(
    async (postId: string) => {
      if (!user) return;
      if (!postId || typeof postId !== "string") return;
      if (pendingPublishIdsRef.current.has(postId)) return;
      pendingPublishIdsRef.current.add(postId);

      // Persist pending ids so a reload can resume.
      try {
        if (typeof window !== "undefined") {
          const key = `postty:v3:${user.uid}:pendingPublishes:v1`;
          const raw = window.localStorage.getItem(key);
          const arr = raw ? (JSON.parse(raw) as any[]) : [];
          const next = Array.from(new Set([...(Array.isArray(arr) ? arr : []), postId]));
          window.localStorage.setItem(key, JSON.stringify(next));
        }
      } catch {
        // ignore
      }

      const startedAt = Date.now();
      const timeoutMs = 3 * 60 * 1000; // 3 minutes
      const intervalMs = 2500;

      const pollOnce = async (): Promise<void> => {
        if (!user) return;
        if (Date.now() - startedAt > timeoutMs) return;
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/posts?limit=160", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (!res.ok || data?.status !== "success") {
            window.setTimeout(pollOnce, intervalMs);
            return;
          }

          const posts = Array.isArray(data.posts) ? (data.posts as any[]) : [];
          const found = posts.find((p) => p && p.id === postId);
          const status = found?.status;

          if (status === "published") {
            const permalink =
              typeof found?.instagramPermalink === "string" && found.instagramPermalink.trim().length > 0
                ? found.instagramPermalink.trim()
                : null;
            addAssistantMessage(
              permalink ? `${uiCopy.instagramPublished}\n${permalink}` : uiCopy.instagramPublished
            );
            return;
          }
          if (status === "failed") {
            const err =
              typeof found?.error === "string" && found.error.trim().length > 0
                ? found.error.trim()
                : uiCopy.unknownError;
            addAssistantMessage(`${uiCopy.instagramFailedPrefix} ${err}`);
            return;
          }

          window.setTimeout(pollOnce, intervalMs);
        } catch {
          window.setTimeout(pollOnce, intervalMs);
        }
      };

      window.setTimeout(pollOnce, 800);
    },
    [addAssistantMessage, uiCopy.instagramFailedPrefix, uiCopy.instagramPublished, uiCopy.unknownError, user]
  );

  // Resume polling after reload (if any publish jobs were pending).
  React.useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    try {
      const key = `postty:v3:${user.uid}:pendingPublishes:v1`;
      const raw = window.localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
      ids.forEach((id) => void startPublishPolling(id));
    } catch {
      // ignore
    }
  }, [startPublishPolling, user]);

  const handleSaveImageToMyPosts = React.useCallback(
    async (imageUrl: string) => {
      if (!user) throw new Error("Tenés que iniciar sesión para guardar.");
      const token = await user.getIdToken();
      const basePrompt = getCaptionBasePrompt();

      setIsSavingToPosts(true);
      try {
        const res = await fetch("/api/posts/save-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ imageUrl, prompt: basePrompt }),
        });
        const data = await res.json();
        if (!res.ok || data?.status !== "success") {
          throw new Error(data?.message || "Failed to save image");
        }
        // Refresh My Posts in background
        refreshMyPosts();
        return data;
      } finally {
        setIsSavingToPosts(false);
      }
    },
    [getCaptionBasePrompt, refreshMyPosts, user]
  );

  const handlePublishImageToInstagram = React.useCallback(async () => {
    if (!publishingImageUrl) return;
    if (!captionInput.trim()) return;
    if (!user) throw new Error("Tenés que iniciar sesión para publicar.");

    setIsPublishing(true);
    try {
      const token = await user.getIdToken();
      const basePrompt = publishingPostBasePromptRef.current || getCaptionBasePrompt();

      const res = await fetch("/api/posts/publish-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          postId: publishingPostId || undefined,
          imageUrl: publishingImageUrl,
          caption: captionInput.trim(),
          prompt: basePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !(data?.status === "accepted" || data?.status === "success")) {
        throw new Error(data?.message || "Failed to publish");
      }
      const postId = typeof data?.postId === "string" ? data.postId : null;

      // Non-blocking UX: let it finish in the background.
      addAssistantMessage(uiCopy.uploadToInstagram);
      if (postId) void startPublishPolling(postId);
      refreshMyPosts();
      handleCloseCaptionModal();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Failed to publish";
      addAssistantMessage(m);
    } finally {
      setIsPublishing(false);
    }
  }, [
    addAssistantMessage,
    captionInput,
    getCaptionBasePrompt,
    handleCloseCaptionModal,
    publishingImageUrl,
    refreshMyPosts,
    startPublishPolling,
    user,
    publishingPostId,
    uiCopy.uploadToInstagram,
  ]);

  // Handle file selection - now sends to agent
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file by always clearing the input value.
    event.target.value = "";
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Por favor subí un archivo de imagen");
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert("La imagen es muy grande. Máximo 10MB");
        return;
      }
      
      // Persistable product thumbnail (data URL) for reload + panel switching.
      hydrateProductThumbnailFromFile(file);
      const uploadPreviewUrl = URL.createObjectURL(file);

      // Send the image to the agent
      handleSendMessage("", file, undefined, { uploadedThumbnailUrl: uploadPreviewUrl });
    }
  };

  // Trigger file input click
  const handleAttachClick = () => {
    if (isMobileBrowser) {
      setShowMobileImageChooser(true);
      return;
    }
    fileInputRef.current?.click();
  };

  // Handle text input submission
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim()) {
      const typed = inputValue.trim();
      handleSendMessage(typed, undefined, undefined, { languageDetectionText: typed });
      // Keep typing without extra clicks
      queueMicrotask(() => inputRef.current?.focus());
    }
  };

  // Handle key press in input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isBusy = isSending || isTyping || isGenerating;
  const hasMessages = messages.length > 0;

  // Restore focus to chat input after requests finish
  React.useEffect(() => {
    if (isBusy) return;
    if (!hasMessages) return;
    // Avoid fighting the user when a modal is open
    if (showFeedbackModal || showCaptionModal) return;
    // If we're still waiting for the user to upload the product picture,
    // do NOT auto-focus (mobile keyboard should not pop).
    if (!productThumbnail) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const presentingOptions =
      Boolean(lastAssistant && ((lastAssistant.postTypeOptions?.length || 0) > 0 || (lastAssistant.referenceOptions?.length || 0) > 0));
    const presentingGeneratedImage = Boolean(lastAssistant && lastAssistant.imageUrl);

    // Only focus when we expect typing (not when user must tap/swipe/press buttons).
    if (presentingOptions) return;
    if (presentingGeneratedImage) return;
    if (readyToGenerate) return;

    inputRef.current?.focus();
  }, [isBusy, hasMessages, messages, productThumbnail, readyToGenerate, showCaptionModal, showFeedbackModal]);

  // Prevent the browser from navigating away when dropping a file near edges.
  // Only active on the empty (welcome) state, per spec.
  React.useEffect(() => {
    if (hasMessages) return;
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, [hasMessages]);

  const isFileDragEvent = React.useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes("Files");
  }, []);

  const handleDragEnter = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (hasMessages) return;
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setDragOver(true);
  }, [hasMessages, isFileDragEvent]);

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (hasMessages) return;
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, [hasMessages, isFileDragEvent]);

  const handleDragLeave = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (hasMessages) return;
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragOver(false);
  }, [hasMessages, isFileDragEvent]);

  const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (hasMessages) return;
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor subí un archivo de imagen");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("La imagen es muy grande. Máximo 10MB");
      return;
    }

    hydrateProductThumbnailFromFile(file);
    const uploadPreviewUrl = URL.createObjectURL(file);
    void handleSendMessage("", file, undefined, { uploadedThumbnailUrl: uploadPreviewUrl });
  }, [handleSendMessage, hasMessages, hydrateProductThumbnailFromFile, isFileDragEvent]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show loading state while checking auth
  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      setAccessDenied(false);
      setAccessCheckLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setAccessCheckLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/user/is-first-post", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 403) {
          setAccessDenied(true);
        } else {
          setAccessDenied(false);
        }
      } catch {
        if (!cancelled) setAccessDenied(false);
      } finally {
        if (!cancelled) setAccessCheckLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading || accessCheckLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Spinner size="lg" />
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  if (accessDenied) {
    return <AccessPendingScreen email={user.email} onSignOut={signOut} />;
  }

  // User is authenticated - show main app
  return (
    <div className="min-h-screen w-full bg-white text-slate-900">
      {/* Hidden File Input for Product */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />
      {/* Hidden File Input for Product (Camera) - mobile-only trigger */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      {/* Hidden File Input for Reference */}
      {/* Reference uploads disabled in v3 */}

      {/* Mobile-only: choose camera vs library */}
      {isMobileBrowser && showMobileImageChooser ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setShowMobileImageChooser(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-lg p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-900">Agregar foto del producto</div>
            <div className="mt-1 text-xs text-gray-500">Elegí una opción</div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setShowMobileImageChooser(false);
                  queueMicrotask(() => cameraInputRef.current?.click());
                }}
              >
                Sacar foto
              </button>
              <button
                type="button"
                className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setShowMobileImageChooser(false);
                  queueMicrotask(() => fileInputRef.current?.click());
                }}
              >
                Elegir de la galería
              </button>
              <button
                type="button"
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
                onClick={() => setShowMobileImageChooser(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile toast */}
      {isMobileBrowser && mobileToast ? (
        <div className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-24 px-4 pointer-events-none">
          <div className="bg-gray-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg max-w-[92vw] text-center">
            {mobileToast}
          </div>
        </div>
      ) : null}
      {/* Logo - Top Left */}
      <div className="fixed top-4 left-4 sm:top-5 sm:left-8 z-40">
        <h1 
          className="text-xl sm:text-2xl text-black"
          style={{ 
            fontFamily: 'var(--font-logo)',
            letterSpacing: '-0.04em',
            fontStyle: 'normal',
            transform: 'scaleY(0.85)'
          }}
        >
          Postty
        </h1>
      </div>

      {/* Left Sidebar Pill - Home, Posts, Reels */}
      {/* Desktop: left side vertical | Mobile: bottom center horizontal */}
      <div className="fixed z-40 bottom-6 left-1/2 -translate-x-1/2 flex-row sm:bottom-auto sm:left-6 sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0 sm:flex-col flex gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-full bg-[#f5f5f5]">
        <button 
          className={`p-2 rounded-full transition-all group cursor-pointer ${activeLeftMenu === 'home' ? 'bg-white' : ''}`}
          title="Home"
          onClick={() => setActiveLeftMenu('home')}
        >
          <img 
            src="/icons/home-line.svg" 
            alt="Home" 
            className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-opacity ${activeLeftMenu === 'home' ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
          />
        </button>
        <button 
          className={`p-2 rounded-full transition-all group cursor-pointer ${activeLeftMenu === 'posts' ? 'bg-white' : ''}`}
          title="Posts"
          onClick={() => setActiveLeftMenu('posts')}
        >
          <img 
            src="/icons/image-01.svg" 
            alt="Posts" 
            className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-opacity ${activeLeftMenu === 'posts' ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
          />
        </button>
        <button
          type="button"
          aria-disabled="true"
          className="p-2 rounded-full transition-all group cursor-help"
          title="Reels (Coming soon)"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <img 
            src="/icons/video-recorder.svg" 
            alt="Reels" 
            className="w-4 h-4 sm:w-[18px] sm:h-[18px] transition-opacity opacity-40 group-hover:opacity-100"
          />
        </button>
      </div>

      {/* Top Right Pill - Feedback, Notifications, Profile */}
      <div className="fixed top-4 right-4 sm:top-5 sm:right-8 z-40" ref={profileDropdownRef}>
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-full bg-[#f5f5f5]">
          <button 
            className={`p-2 rounded-full transition-all group cursor-pointer ${showFeedbackModal ? 'bg-white' : ''}`}
            title="Feedback"
            onClick={() => { setShowFeedbackModal(true); setShowFeedbackBlur(true); }}
          >
            <img 
              src="/icons/message-chat-circle.svg" 
              alt="Feedback" 
              className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-opacity ${showFeedbackModal ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
            />
          </button>
          <button 
            className={`p-2 rounded-full transition-all group cursor-pointer ${activeRightMenu === 'notifications' ? 'bg-white' : ''}`}
            title="Notifications"
            onClick={() => setActiveRightMenu(activeRightMenu === 'notifications' ? null : 'notifications')}
          >
            <img 
              src="/icons/bell-01.svg" 
              alt="Notifications" 
              className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-opacity ${activeRightMenu === 'notifications' ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
            />
          </button>
          {/* Profile Photo */}
          <button 
            className={`rounded-full transition-all cursor-pointer overflow-hidden ${showProfileDropdown ? 'ring-2 ring-gray-300' : ''}`}
            title="Profile"
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
          >
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <img 
                  src="/icons/user-01.svg" 
                  alt="Profile" 
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-60"
                />
              </div>
            )}
          </button>
        </div>

        {/* Profile Dropdown */}
        {showProfileDropdown && (
          <div className="absolute top-full right-0 mt-2 flex flex-col p-1.5 rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/icons/link-04.svg"
                  alt="Instagram"
                  className="w-4 h-4 opacity-50 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm text-gray-700 font-medium truncate">
                    Instagram
                  </div>
                  <div className={`text-xs truncate ${igConnected ? "text-emerald-600" : "text-gray-500"}`}>
                    {igLoading ? "Verificando..." : igConnected ? `Conectado${igLabel ? ` (${igLabel})` : ""}` : "No conectado"}
                  </div>
                </div>
              </div>

              {igConnected ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDisconnectInstagram();
                    setShowProfileDropdown(false);
                  }}
                  disabled={igLoading}
                  className="px-2.5 py-1.5 rounded-full text-xs font-medium border border-gray-200 hover:bg-[#f5f5f5] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleConnectInstagram();
                    setShowProfileDropdown(false);
                  }}
                  disabled={connectingInstagram || igLoading}
                  className="px-2.5 py-1.5 rounded-full text-xs font-medium border border-gray-200 hover:bg-[#f5f5f5] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {connectingInstagram ? "Conectando..." : "Conectar"}
                </button>
              )}
            </div>

            {igToast ? (
              <div className="px-3 pb-1">
                <div
                  className={`px-2.5 py-2 rounded-lg text-xs font-semibold border ${
                    igToast.kind === "error"
                      ? "bg-rose-50 text-rose-800 border-rose-100"
                      : "bg-white text-gray-800 border-gray-100"
                  }`}
                >
                  {igToast.msg}
                </div>
              </div>
            ) : null}

            <button
              onClick={() => {
                signOut();
                setShowProfileDropdown(false);
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#f5f5f5] transition-colors cursor-pointer whitespace-nowrap"
            >
              <img 
                src="/icons/log-out-01.svg" 
                alt="Logout" 
                className="w-4 h-4 opacity-50 flex-shrink-0"
              />
              <span className="text-sm text-gray-600">Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {/* Chatbox starts below top pill, same spacing on all sides relative to pills */}
      <div className="fixed top-[88px] bottom-8 left-4 right-4 sm:left-[96px] sm:right-8 flex flex-col pb-16 sm:pb-0">
        {/* Main Chat Container */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            "w-full h-full flex flex-col rounded-[32px] border overflow-hidden transition-colors",
            !hasMessages && dragOver ? "border-gray-300 bg-gray-50/40" : "border-gray-200 bg-white",
          ].join(" ")}
        >
          
          {/* Chat Content Area */}
          <div className="flex-1 relative overflow-hidden">
            <div
              className="absolute inset-0 flex w-[200%] transition-transform duration-300 ease-in-out"
              style={{ transform: activeLeftMenu === "posts" ? "translateX(-50%)" : "translateX(0%)" }}
            >
              {/* Chat frame */}
              <div className="w-1/2 h-full shrink-0 flex flex-col">
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 sm:px-8 sm:py-6 scrollbar-hide">
            {!hasMessages ? (
              /* Welcome Box - Dashed border, hover effect, clickable to upload */
              <div className="h-full flex items-center justify-center">
                <div 
                  onClick={handleAttachClick}
                  className={[
                    "w-full max-w-2xl p-12 sm:p-16 rounded-[24px] border border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors",
                    dragOver ? "border-gray-300 bg-gray-50" : "border-gray-200 hover:bg-gray-50",
                  ].join(" ")}
                >
                  <div className="mb-3">
                    <img 
                      src="/icons/camera-plus.svg" 
                      alt="Camera" 
                      className="w-8 h-8 sm:w-10 sm:h-10 opacity-70"
                    />
                  </div>
                  <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-1">
                    {isFirstPost === true ? uiCopy.welcomeTitleFirstPost : uiCopy.welcomeTitleNextPost}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    {isFirstPost 
                      ? uiCopy.welcomeHintFirstPost
                      : uiCopy.welcomeHintNextPost
                    }
                  </p>
                </div>
              </div>
            ) : (
              /* Chat Messages */
              <div className="space-y-4 relative w-full">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                  >
                    {/* 🚨 PROTECTED: Agent message styling - See flag below for user messages */}
                    {msg.role === "assistant" && (
                      <div className="w-full">
                        {/* Top row: Avatar + Product thumbnail + Text - limited to 40% */}
                        <div className={["flex items-start gap-2", bubbleMaxWidth].join(" ")}>
                          {/* Avatar P - Postty brand with ITC Benguiat font */}
                          <div className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                            <span 
                              className="text-white text-[10px]"
                              style={{ 
                                fontFamily: 'var(--font-logo)',
                                letterSpacing: '-0.04em',
                                transform: 'scaleY(0.85)'
                              }}
                            >P</span>
                          </div>

                          {/* Product thumbnail next to avatar */}
                          {msg.productThumbnail && (
                            <img 
                              src={msg.productThumbnail} 
                              alt="Product" 
                              className="w-8 h-8 rounded-lg object-cover border border-gray-100 shrink-0"
                            />
                          )}

                          {/* Message text */}
                          {msg.content && (
                            <div 
                              className="text-[14px] leading-normal text-gray-900"
                              dangerouslySetInnerHTML={{
                                __html: msg.content
                                  .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                                  .replace(/\n/g, '<br/>')
                              }}
                            />
                          )}
                        </div>

                        {/* Content below (cards, images, etc) - full width for carousels */}
                        <div className="ml-7">
                          {/* 🚨 PROTECTED: Post Type Carousel - horizontal scroll, no scrollbar visible, extends to chatbox edge */}
                          {/* Post Type Options - Step 1 */}
                          {msg.postTypeOptions && msg.postTypeOptions.length > 0 && (
                            <div className="relative mt-4">
                              {/* Mobile-only swipe hint overlay */}
                              {isMobileBrowser && postTypeCarouselVisible && !postTypeCarouselSwiped ? (
                                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
                                  <div className="posttySwipeHint motion-reduce:animate-none">
                                    <div className="posttySwipeHintInner motion-reduce:animate-none">
                                      <span className="posttySwipeArrow" aria-hidden="true">←</span>
                                      <svg
                                        width="26"
                                        height="26"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M8.5 12.5v-6.3a1.2 1.2 0 0 1 2.4 0v5.1"
                                          stroke="currentColor"
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        <path
                                          d="M10.9 11V4.9a1.2 1.2 0 0 1 2.4 0V11"
                                          stroke="currentColor"
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        <path
                                          d="M13.3 11.3V5.8a1.2 1.2 0 0 1 2.4 0v7.1"
                                          stroke="currentColor"
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        <path
                                          d="M15.7 12.4V7.3a1.2 1.2 0 0 1 2.4 0v7.3c0 2.9-1.8 5.4-4.5 6.2l-1 .3a6.6 6.6 0 0 1-8.3-5.1l-.3-1.6a1.1 1.1 0 0 1 1.8-1l2.7 2.2V12.5"
                                          stroke="currentColor"
                                          strokeWidth="1.8"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                      <span className="posttySwipeText">Deslizá</span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              <div
                                ref={postTypeCarouselRef}
                                className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
                                onScroll={(e) => {
                                  const t = e.currentTarget;
                                  if (t.scrollLeft > 16) markCarouselSwiped();
                                }}
                                onTouchMove={() => markCarouselSwiped()}
                              >
                                {msg.postTypeOptions.map((option) => (
                                  <button
                                    key={option.type}
                                    onClick={() => handlePostTypeSelect(option)}
                                    disabled={isBusy}
                                    className="relative flex-shrink-0 w-64 h-96 rounded overflow-hidden border-2 border-gray-100 hover:border-gray-300 transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <img 
                                      src={option.exampleImage.url} 
                                      alt={option.label}
                                      className="w-full h-full object-cover"
                                    />
                                    {/* Label pill at top */}
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2">
                                      <span className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-900 shadow-sm whitespace-nowrap">
                                        {option.label}
                                      </span>
                                    </div>
                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                  </button>
                                ))}
                                {/* Spacer for right padding in scroll */}
                                <div className="flex-shrink-0 w-6" aria-hidden="true" />
                              </div>
                            </div>
                          )}

                          {/* 🚨 PROTECTED: Reference Carousel - horizontal scroll, no scrollbar visible, extends to chatbox edge */}
                          {/* Reference Options - Step 3 (Carousel) */}
                          {msg.referenceOptions && msg.referenceOptions.length > 0 && (
                            <div className="mt-6">
                              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                                {/* Reference images */}
                                {msg.referenceOptions.slice(0, 20).map((ref, idx) => (
                                  <button
                                    key={ref.id}
                                    onClick={() => handleReferenceSelect(ref)}
                                    disabled={isBusy}
                                    className="relative flex-shrink-0 w-64 h-96 rounded overflow-hidden border-2 border-gray-100 hover:border-gray-300 transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <img 
                                      src={ref.url} 
                                      alt={`Reference ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                  </button>
                                ))}
                                {/* Spacer for right padding in scroll */}
                                <div className="flex-shrink-0 w-4" aria-hidden="true" />
                              </div>
                            </div>
                          )}

                          {/* Generated image */}
                          {msg.imageUrl && (
                            <div className="mt-3 max-w-md">
                              <img
                                src={msg.imageUrl}
                                alt="Generated"
                                className="w-full rounded-2xl border border-gray-100"
                              />
                              {isMobileBrowser ? (
                                <div className="flex gap-2 mt-3">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await handleSaveImageToMyPosts(msg.imageUrl!);
                                        addAssistantMessage(uiCopy.savedInMyPosts);
                                      } catch (e) {
                                        const m = e instanceof Error ? e.message : "Failed to save";
                                        addAssistantMessage(m);
                                      }
                                    }}
                                    disabled={isSavingToPosts || isBusy}
                                    className="flex-1 py-2.5 px-4 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSavingToPosts ? uiCopy.saving : uiCopy.save}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void shareImage(msg.imageUrl!, `postty-${Date.now()}.png`)}
                                    disabled={isBusy}
                                    className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {uiCopy.share}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTryOpenCaptionModal(msg.imageUrl!)}
                                    disabled={isBusy}
                                    className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {uiCopy.post}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2 mt-3">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await handleSaveImageToMyPosts(msg.imageUrl!);
                                        addAssistantMessage(uiCopy.savedInMyPosts);
                                      } catch (e) {
                                        const m = e instanceof Error ? e.message : "Failed to save";
                                        addAssistantMessage(m);
                                      }
                                    }}
                                    disabled={isSavingToPosts || isBusy}
                                    className="flex-1 py-2.5 px-4 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition"
                                  >
                                    {isSavingToPosts ? uiCopy.saving : uiCopy.save}
                                  </button>
                                  <div className="flex-1 relative group">
                                    <button
                                      onClick={() => handleOpenCaptionModal(msg.imageUrl!)}
                                      disabled={!igConnected || isBusy}
                                      className="w-full py-2.5 px-4 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {uiCopy.post}
                                    </button>
                                    {!igConnected ? (
                                      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                                          {uiCopy.needInstagram}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ============================================================
                        🚨 DO NOT MODIFY - PROTECTED MESSAGE BUBBLE STYLING 🚨
                        ============================================================
                        This message bubble design is APPROVED and FINALIZED.
                        Source: "mejores practicas para chat.pdf"
                        
                        Key styling that MUST be preserved:
                        - User messages: rounded-2xl rounded-br-md (bottom-right corner different)
                        - Agent messages: rounded-2xl rounded-bl-md (bottom-left corner different)
                        - Padding: px-4 py-2.5
                        - Font: text-[15px] leading-relaxed
                        - Colors: bg-gray-100 for user, no background for agent
                        
                        ⚠️ BEFORE ANY CHANGES: Always ask the user first!
                        ============================================================ */}
                    
                    {/* User messages - max 40% width, aligned right */}
                    {msg.role === "user" && msg.content !== uiCopy.uploadMarker && (
                      <div className={["ml-auto flex items-center gap-2", bubbleMaxWidth].join(" ")}>
                        {/* Reference selection with thumbnail */}
                        {msg.content === uiCopy.referenceSelectedMarker && msg.imageUrl ? (
                          <div className="flex items-center gap-2 bg-gray-100 rounded-2xl rounded-br-md px-3 py-2">
                            <span className="text-[14px] text-gray-900">{uiCopy.referenceSelectedLabel}</span>
                            <img 
                              src={msg.imageUrl} 
                              alt="Reference" 
                              className="w-8 h-8 rounded-lg object-cover"
                            />
                          </div>
                        ) : (
                          <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-br-md px-3 py-2">
                            <p className="text-[14px] leading-relaxed">{msg.content}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {(isTyping || isSending || isGenerating) && (
                  <div className="flex justify-start animate-in fade-in duration-200">
                    <div className={["flex items-center gap-2", bubbleMaxWidth].join(" ")}>
                      <div className="w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                        <span 
                          className="text-white text-[10px]"
                          style={{ 
                            fontFamily: 'var(--font-logo)',
                            letterSpacing: '-0.04em',
                            transform: 'scaleY(0.85)'
                          }}
                        >P</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Spinning loader */}
                        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                        {/* Changing text */}
                        <span className="text-[15px] text-gray-600">
                          {isGenerating ? uiCopy.generatingPost : loadingMessages[loadingMessageIndex]}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
                </div>

                {/* Bottom Input Bar (Home frame only) */}
                <div className="p-3 sm:p-4">
                  <div className={isMobileBrowser && readyToGenerate ? "flex flex-col gap-2" : "flex items-center gap-3"}>
                    {/* Mobile: make Generar prominent (full width row) */}
                    {isMobileBrowser && readyToGenerate ? (
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGenerating ? uiCopy.generatingAction : uiCopy.generateAction}
                      </button>
                    ) : null}
                    {/* Input form - Enter only sends text, NOT generate */}
                    <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 p-1.5 sm:p-2 rounded-full bg-[#f5f5f5]">
                      {/* Plus Button - Attach files (always enabled and white background) */}
                      <button 
                        type="button"
                        onClick={handleAttachClick}
                        className="p-1.5 rounded-full bg-white transition-colors cursor-pointer group"
                        title="Adjuntar archivo"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-40 group-hover:opacity-100 transition-opacity">
                          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Input Field */}
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder={
                          hasMessages
                            ? uiCopy.placeholderWithMessages
                            : uiCopy.placeholderWithoutMessages
                        }
                        disabled={isBusy || !hasMessages}
                        className="flex-1 bg-transparent outline-none text-[15px] text-gray-700 placeholder-gray-400 py-1 resize-none overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                      />

                      {/* Send Button - always visible */}
                      <button 
                        type="submit"
                        disabled={!inputValue.trim() || isBusy || !hasMessages}
                        className="p-1.5 rounded-full bg-white transition-colors cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-40 group-hover:opacity-100 transition-opacity">
                          <path d="M18 15L12 9L6 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </form>

                    {/* Generate Button - OUTSIDE the form, must be clicked (Enter won't trigger) */}
                    {!isMobileBrowser && readyToGenerate && (
                      <button 
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="px-6 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {isGenerating ? uiCopy.generatingAction : uiCopy.generateAction}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* My posts frame */}
              <div className="w-1/2 h-full shrink-0 border-l border-gray-200 bg-white">
                <div className="h-full overflow-y-auto p-5 sm:px-8 sm:py-6 scrollbar-hide">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{uiCopy.myPostsTitle}</h2>
                      <p className="text-xs text-gray-500">{uiCopy.myPostsSubtitle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshMyPosts()}
                      disabled={myPostsLoading}
                      className="px-3 py-2 rounded-full border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {myPostsLoading ? uiCopy.loading : uiCopy.refresh}
                    </button>
                  </div>

                  {myPostsError ? <div className="text-sm text-red-600">{myPostsError}</div> : null}

                  {!myPostsLoading && myPosts.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      {uiCopy.noPostsYetPrefix} Use <strong>{uiCopy.noPostsYetActionSave}</strong> or{" "}
                      <strong>{uiCopy.noPostsYetActionPost}</strong> on a generated image.
                    </div>
                  ) : null}

                  {myPostsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Spinner size="sm" />
                      {uiCopy.loadingPosts}
                    </div>
                  ) : (
                    <div className="space-y-10">
                      {[
                        {
                          key: "ready_to_upload",
                          title: uiCopy.statusSaved,
                          items: myPosts.filter((p) => p.kind === "image" && p.status === "ready_to_upload"),
                        },
                        {
                          key: "publishing",
                          title: uiCopy.statusUploading,
                          items: myPosts.filter((p) => p.kind === "image" && (p.status === "publishing" || p.status === "generating")),
                        },
                        { key: "published", title: uiCopy.statusPublished, items: myPosts.filter((p) => p.kind === "image" && p.status === "published") },
                        { key: "failed", title: uiCopy.statusFailed, items: myPosts.filter((p) => p.kind === "image" && p.status === "failed") },
                      ]
                        .filter((row) => row.items.length > 0)
                        .map((row) => (
                          <div key={row.key}>
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">{row.title}</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                              {row.items.map((p) => {
                                const isBroken = !!brokenPostMediaIds[p.id];
                                const url = isBroken ? null : p.mediaUrl || p.previewUrl || null;
                                const canPostFromHere =
                                  (p.status === "ready_to_upload" || p.status === "failed") && Boolean(url);
                                return (
                                  <div
                                    key={p.id}
                                    className="min-w-0 w-full h-full flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden"
                                  >
                                    <div className="aspect-square bg-gray-50">
                                      {url ? (
                                        <img
                                          src={url}
                                          alt="Post"
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                          onError={() => {
                                            setBrokenPostMediaIds((prev) => ({ ...prev, [p.id]: true }));
                                          }}
                                        />
                                      ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-xs text-gray-400 gap-1">
                                          <div className="font-medium">{uiCopy.missingMedia}</div>
                                          <div className="text-[11px]">
                                            {p.mediaUrl || p.previewUrl ? uiCopy.failedToLoad : uiCopy.noUrl}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="p-3 flex flex-col flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-[11px] text-gray-500">{p.status}</div>
                                        {p.instagramPermalink ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              window.open(p.instagramPermalink!, "_blank", "noopener,noreferrer")
                                            }
                                            className="text-[11px] text-gray-900 underline underline-offset-2"
                                          >
                                            Open
                                          </button>
                                        ) : null}
                                      </div>
                                      {p.caption ? (
                                        <div className="mt-2 text-xs text-gray-700 whitespace-pre-wrap break-words">
                                          {p.caption}
                                        </div>
                                      ) : (
                                        <div className="mt-2 text-xs text-gray-400">{uiCopy.noCaption}</div>
                                      )}
                                      {canPostFromHere ? (
                                        isMobileBrowser ? (
                                          <div className="mt-auto pt-3 flex gap-2">
                                            <button
                                              type="button"
                                              onClick={() => void shareImage((p.mediaUrl || p.previewUrl) as string, `postty-${p.id}.png`)}
                                              disabled={!(p.mediaUrl || p.previewUrl)}
                                              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {uiCopy.share}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleTryOpenCaptionModalForSavedPost(p)}
                                              className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-50 transition"
                                            >
                                              {uiCopy.post}
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="mt-3 relative group">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenCaptionModalForSavedPost(p)}
                                              disabled={!igConnected}
                                              className="w-full py-2.5 px-4 border border-gray-200 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {uiCopy.post}
                                            </button>
                                            {!igConnected ? (
                                              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                                                  {uiCopy.needInstagram}
                                                </div>
                                              </div>
                                            ) : null}
                                          </div>
                                        )
                                      ) : null}
                                      {p.error ? <div className="mt-2 text-[11px] text-red-600">{p.error}</div> : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Caption Modal for Instagram Publishing */}
      {showCaptionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: "blur(12px)", backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          onClick={handleCloseCaptionModal}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{uiCopy.captionModalTitle}</h2>

            <div className="mb-4">
              <label htmlFor="caption" className="block text-sm font-medium text-gray-700 mb-2">
                {uiCopy.captionLabel}
              </label>
              <textarea
                id="caption"
                value={captionInput}
                onChange={(e) => setCaptionInput(e.target.value)}
                placeholder={uiCopy.captionPlaceholder}
                rows={4}
                disabled={isPublishing || isCaptionGenerating}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-[15px] resize-none"
              />
              {isCaptionGenerating ? (
                <div className="mt-2 text-xs text-gray-500 font-medium flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400" />
                  {uiCopy.captionGenerating}
                </div>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCloseCaptionModal}
                disabled={isPublishing}
                className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uiCopy.cancel}
              </button>
              <button
                onClick={() => void handlePublishImageToInstagram()}
                disabled={isPublishing || !captionInput.trim()}
                className="flex-1 py-2.5 px-4 bg-gray-900 text-white font-medium rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPublishing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    {uiCopy.publishing}
                  </>
                ) : (
                  uiCopy.publish
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Blur Overlay */}
      {showFeedbackBlur && (
        <div className="fixed inset-0 z-50 bg-white/60 backdrop-blur-sm" />
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop click area */}
          <div 
            className="absolute inset-0"
            onClick={() => { setShowFeedbackModal(false); setShowFeedbackBlur(false); }}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-3xl border border-gray-200 p-8 w-full max-w-md">
            {/* Close Button */}
            <button
              onClick={() => { setShowFeedbackModal(false); setShowFeedbackBlur(false); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Title */}
            <h2 className="text-xl font-semibold text-gray-900 text-center">
              ¡Tu opinión nos importa!
            </h2>
            <p className="text-sm text-gray-500 text-center mt-1">
              Gracias por ayudarnos a mejorar
            </p>

            {/* Rating 1 */}
            <div className="mt-8">
              <p className="text-sm font-medium text-gray-700 text-center mb-3">
                ¿Qué tan rápido pudiste crear tu post?
              </p>
              <div className="flex justify-center">
                <div className="flex items-start gap-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <div key={star} className="flex flex-col items-center" style={{ width: '28px' }}>
                      <button
                        type="button"
                        onClick={() => setFeedbackRating1(star)}
                        onMouseEnter={() => setHoverRating1(star)}
                        onMouseLeave={() => setHoverRating1(0)}
                        className="cursor-pointer transition-transform hover:scale-110"
                      >
                        <svg 
                          width="28" 
                          height="28" 
                          viewBox="0 0 24 24" 
                          fill={(hoverRating1 || feedbackRating1) >= star ? "#FBBF24" : "none"}
                          className="transition-colors"
                        >
                          <path 
                            d="M11.2827 3.45332C11.5131 2.98638 11.6284 2.75291 11.7848 2.67831C11.9209 2.61341 12.0791 2.61341 12.2152 2.67831C12.3717 2.75291 12.4869 2.98638 12.7174 3.45332L14.9041 7.88328C14.9721 8.02113 15.0061 8.09006 15.0558 8.14358C15.0999 8.19096 15.1527 8.22935 15.2113 8.25662C15.2776 8.28742 15.3536 8.29854 15.5057 8.32077L20.397 9.03571C20.9121 9.11099 21.1696 9.14863 21.2888 9.27444C21.3925 9.38389 21.4412 9.5343 21.4215 9.68377C21.3988 9.85558 21.2124 10.0372 20.8395 10.4004L17.3014 13.8464C17.1912 13.9538 17.136 14.0076 17.1004 14.0715C17.0689 14.128 17.0487 14.1902 17.0409 14.2545C17.0321 14.3271 17.0451 14.403 17.0711 14.5547L17.906 19.4221C17.994 19.9355 18.038 20.1922 17.9553 20.3445C17.8833 20.477 17.7554 20.57 17.6071 20.5975C17.4366 20.6291 17.2061 20.5078 16.7451 20.2654L12.3724 17.9658C12.2361 17.8942 12.168 17.8584 12.0962 17.8443C12.0327 17.8318 11.9673 17.8318 11.9038 17.8443C11.832 17.8584 11.7639 17.8942 11.6277 17.9658L7.25492 20.2654C6.79392 20.5078 6.56341 20.6291 6.39297 20.5975C6.24468 20.57 6.11672 20.477 6.04474 20.3445C5.962 20.1922 6.00603 19.9355 6.09407 19.4221L6.92889 14.5547C6.95491 14.403 6.96793 14.3271 6.95912 14.2545C6.95132 14.1902 6.93111 14.128 6.89961 14.0715C6.86402 14.0076 6.80888 13.9538 6.69859 13.8464L3.16056 10.4004C2.78766 10.0372 2.60121 9.85558 2.57853 9.68377C2.55879 9.5343 2.60755 9.38389 2.71125 9.27444C2.83044 9.14863 3.08797 9.11099 3.60304 9.03571L8.49431 8.32077C8.64642 8.29854 8.72248 8.28742 8.78872 8.25662C8.84736 8.22935 8.90016 8.19096 8.94419 8.14358C8.99391 8.09006 9.02793 8.02113 9.09597 7.88328L11.2827 3.45332Z" 
                            stroke={(hoverRating1 || feedbackRating1) >= star ? "#FBBF24" : "#D1D5DB"}
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {star === 1 && <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">Muy lento</span>}
                      {star === 5 && <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">Muy rápido</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rating 2 */}
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-700 text-center mb-3">
                ¿Qué tan bueno fue el resultado final?
              </p>
              <div className="flex justify-center">
                <div className="flex items-start gap-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <div key={star} className="flex flex-col items-center" style={{ width: '28px' }}>
                      <button
                        type="button"
                        onClick={() => setFeedbackRating2(star)}
                        onMouseEnter={() => setHoverRating2(star)}
                        onMouseLeave={() => setHoverRating2(0)}
                        className="cursor-pointer transition-transform hover:scale-110"
                      >
                        <svg 
                          width="28" 
                          height="28" 
                          viewBox="0 0 24 24" 
                          fill={(hoverRating2 || feedbackRating2) >= star ? "#FBBF24" : "none"}
                          className="transition-colors"
                        >
                          <path 
                            d="M11.2827 3.45332C11.5131 2.98638 11.6284 2.75291 11.7848 2.67831C11.9209 2.61341 12.0791 2.61341 12.2152 2.67831C12.3717 2.75291 12.4869 2.98638 12.7174 3.45332L14.9041 7.88328C14.9721 8.02113 15.0061 8.09006 15.0558 8.14358C15.0999 8.19096 15.1527 8.22935 15.2113 8.25662C15.2776 8.28742 15.3536 8.29854 15.5057 8.32077L20.397 9.03571C20.9121 9.11099 21.1696 9.14863 21.2888 9.27444C21.3925 9.38389 21.4412 9.5343 21.4215 9.68377C21.3988 9.85558 21.2124 10.0372 20.8395 10.4004L17.3014 13.8464C17.1912 13.9538 17.136 14.0076 17.1004 14.0715C17.0689 14.128 17.0487 14.1902 17.0409 14.2545C17.0321 14.3271 17.0451 14.403 17.0711 14.5547L17.906 19.4221C17.994 19.9355 18.038 20.1922 17.9553 20.3445C17.8833 20.477 17.7554 20.57 17.6071 20.5975C17.4366 20.6291 17.2061 20.5078 16.7451 20.2654L12.3724 17.9658C12.2361 17.8942 12.168 17.8584 12.0962 17.8443C12.0327 17.8318 11.9673 17.8318 11.9038 17.8443C11.832 17.8584 11.7639 17.8942 11.6277 17.9658L7.25492 20.2654C6.79392 20.5078 6.56341 20.6291 6.39297 20.5975C6.24468 20.57 6.11672 20.477 6.04474 20.3445C5.962 20.1922 6.00603 19.9355 6.09407 19.4221L6.92889 14.5547C6.95491 14.403 6.96793 14.3271 6.95912 14.2545C6.95132 14.1902 6.93111 14.128 6.89961 14.0715C6.86402 14.0076 6.80888 13.9538 6.69859 13.8464L3.16056 10.4004C2.78766 10.0372 2.60121 9.85558 2.57853 9.68377C2.55879 9.5343 2.60755 9.38389 2.71125 9.27444C2.83044 9.14863 3.08797 9.11099 3.60304 9.03571L8.49431 8.32077C8.64642 8.29854 8.72248 8.28742 8.78872 8.25662C8.84736 8.22935 8.90016 8.19096 8.94419 8.14358C8.99391 8.09006 9.02793 8.02113 9.09597 7.88328L11.2827 3.45332Z" 
                            stroke={(hoverRating2 || feedbackRating2) >= star ? "#FBBF24" : "#D1D5DB"}
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {star === 1 && <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">Muy malo</span>}
                      {star === 5 && <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">Excelente</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Comment */}
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-700 text-center mb-3">
                ¿Algún comentario adicional?
              </p>
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder=""
                className="w-full h-24 p-3 bg-white border border-gray-200 rounded-xl resize-none text-sm text-gray-700 focus:outline-none"
              />
            </div>

            {/* Send Button */}
            <button
              onClick={async () => {
                try {
                  if (!user) throw new Error("Not signed in");
                  const token = await user.getIdToken();
                  const res = await fetch("/api/feedback", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      email: user?.email || "unknown",
                      rating1: feedbackRating1,
                      rating2: feedbackRating2,
                      comment: feedbackComment,
                    }),
                  });
                  const data = await res.json();
                  if (data.status === "success") {
                    console.log("Feedback saved successfully");
                  }
                } catch (e) {
                  console.error("Error saving feedback:", e);
                }
                // Reset form values
                setFeedbackRating1(0);
                setFeedbackRating2(0);
                setFeedbackComment("");
                // Hide feedback modal but keep blur
                setShowFeedbackModal(false);
                // Show success modal after 0.25s
                setTimeout(() => {
                  setShowFeedbackSuccess(true);
                }, 250);
                // Hide everything after 1.75s total
                setTimeout(() => {
                  setShowFeedbackSuccess(false);
                  setShowFeedbackBlur(false);
                }, 1750);
              }}
              className="w-full mt-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-[#f5f5f5] transition-colors cursor-pointer"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Feedback Success Modal */}
      {showFeedbackSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 border border-gray-200 flex flex-col items-center gap-4">
            <span className="text-lg font-semibold text-gray-800">Enviado</span>
            <img 
              src="/icons/check-circle.svg" 
              alt="Success" 
              className="w-10 h-10"
              style={{ filter: 'invert(48%) sepia(79%) saturate(382%) hue-rotate(93deg) brightness(95%) contrast(91%)' }}
            />
          </div>
        </div>
      )}

      {/* Mobile-only swipe hint animation (for post type carousel) */}
      <style jsx global>{`
        @keyframes posttySwipeHintFloatIn {
          0% {
            opacity: 0;
            transform: translateY(-6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes posttySwipeHintHand {
          0% {
            transform: translateX(14px);
          }
          50% {
            transform: translateX(-14px);
          }
          100% {
            transform: translateX(14px);
          }
        }

        @keyframes posttySwipeHintArrow {
          0% {
            opacity: 0.25;
            transform: translateX(0);
          }
          50% {
            opacity: 1;
            transform: translateX(-10px);
          }
          100% {
            opacity: 0.25;
            transform: translateX(0);
          }
        }

        .posttySwipeHint {
          margin-top: 10px;
          padding: 8px 10px;
          border-radius: 9999px;
          border: 1px solid rgba(229, 231, 235, 0.9);
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: posttySwipeHintFloatIn 180ms ease-out both;
        }

        .posttySwipeHintInner {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(17, 24, 39, 0.8);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.01em;
          animation: posttySwipeHintHand 1100ms ease-in-out infinite;
        }

        .posttySwipeArrow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: rgba(243, 244, 246, 0.9);
          animation: posttySwipeHintArrow 1100ms ease-in-out infinite;
        }

        .posttySwipeText {
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
