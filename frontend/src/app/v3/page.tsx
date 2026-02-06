"use client";

import * as React from "react";
import { Spinner } from "@nextui-org/react";
import { useAuth } from "@/contexts/AuthContext";
import LoginScreen from "@/app/components/LoginScreen";

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

export default function V3Page() {
  const { user, loading, signOut } = useAuth();
  const [activeLeftMenu, setActiveLeftMenu] = React.useState<'home' | 'posts' | 'reels'>('home');
  const [activeRightMenu, setActiveRightMenu] = React.useState<'feedback' | 'notifications' | 'profile' | null>(null);
  const [showProfileDropdown, setShowProfileDropdown] = React.useState(false);
  const [connectingInstagram, setConnectingInstagram] = React.useState(false);
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
  
  // Chat state
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [clientSessionId, setClientSessionId] = React.useState<string | null>(null);
  const [isFirstPost, setIsFirstPost] = React.useState<boolean | null>(null); // null = loading
  const [selectedReference, setSelectedReference] = React.useState<ReferenceOption | null>(null);
  const [productThumbnail, setProductThumbnail] = React.useState<string | null>(null);
  const [readyToGenerate, setReadyToGenerate] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = React.useState(0);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  // Microphone / Audio Recording state
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const [audioLevels, setAudioLevels] = React.useState<number[]>([0, 0, 0, 0, 0]); // 5 EQ bars
  const [micError, setMicError] = React.useState<string | null>(null);
  
  // Audio recording refs
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<BlobPart[]>([]);
  const audioStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  
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
  const loadingMessagesByStage: Record<LoadingStage, string[]> = {
    analyzing_product: [
      "Analizando tu producto",
      "Identificando características principales",
      "Estudiando la iluminación",
      "Evaluando composición y ángulos",
      "Detectando colores dominantes",
      "Analizando texturas y materiales",
      "Extrayendo estilo visual",
      "Casi listo..."
    ],
    searching_references: [
      "Buscando inspiración",
      "Explorando estilos similares",
      "Filtrando referencias relevantes",
      "Comparando opciones visuales",
      "Analizando tendencias",
      "Seleccionando las mejores coincidencias",
      "Preparando opciones para vos",
      "Ya casi..."
    ],
    applying_changes: [
      "Aplicando tus cambios",
      "Ajustando composición",
      "Refinando detalles",
      "Optimizando resultado",
      "Procesando ajustes finales",
      "Puliendo la imagen",
      "Últimos retoques",
      "Casi listo..."
    ]
  };

  const loadingMessages = loadingMessagesByStage[loadingStage];
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previousUserIdRef = React.useRef<string | null>(null);
  const referenceInputRef = React.useRef<HTMLInputElement>(null);

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
    return `${base}-${crypto.randomUUID()}`;
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add assistant message with typing delay
  const addAssistantMessage = (content: string, imageUrl?: string) => {
    setIsTyping(true);
    const delay = 600 + Math.random() * 300;
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
    }, delay);
  };

  // Add user message
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

  // Handle sending message to agent
  const handleSendMessage = async (text?: string, uploadedFile?: File, isReferenceUpload?: boolean) => {
    const messageText = text || inputValue.trim();
    if (!messageText && !uploadedFile) return;
    if (isSending || isTyping) return;

    setInputValue("");

    // Add user message to chat
    const uiMessage = uploadedFile && !messageText ? "📸 Imagen subida" : messageText;
    const backendMessage = uploadedFile && (!messageText || messageText === "📸 Imagen subida")
      ? isReferenceUpload ? "[User uploaded reference image]" : "[User uploaded product image]"
      : messageText;

    if (uploadedFile) {
      const imageUrl = URL.createObjectURL(uploadedFile);
      addUserMessage(uiMessage, imageUrl);
      // Save product thumbnail for context display
      if (!isReferenceUpload && !productThumbnail) {
        setProductThumbnail(imageUrl);
      }
    } else {
      addUserMessage(uiMessage);
    }

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append("agentType", "product-showcase");
      formData.append("message", backendMessage);
      formData.append("conversationHistory", JSON.stringify(
        messages.map((m) => ({ role: m.role, content: m.content }))
      ));
      if (clientSessionId) formData.append("sessionId", clientSessionId);
      if (uploadedFile) {
        formData.append("image", uploadedFile);
        if (isReferenceUpload) {
          formData.append("isReferenceUpload", "true");
        }
      }
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

      // Handle different response types
      if (result.type === "text") {
        // Check if ready to generate flag is set
        if (result.readyToGenerate) {
          setReadyToGenerate(true);
        }
        addAssistantMessage(result.text || "");
      } else if (result.type === "image") {
        setReadyToGenerate(false);
        setIsGenerating(false);
        addAssistantMessage(result.text || "¡Listo! Acá está tu imagen", result.imageUrl);
      } else if (result.type === "post_type_options") {
        // Step 1: Show post type options with images
        const msg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.text || "",
          postTypeOptions: result.postTypes,
          productThumbnail: productThumbnail || undefined,
        };
        setMessages((prev) => [...prev, msg]);
      } else if (result.type === "reference_options") {
        // Step 3: Show reference options carousel
        const msg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.text || "",
          referenceOptions: result.references,
        };
        setMessages((prev) => [...prev, msg]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      addAssistantMessage("Perdón, tuve un problema. ¿Podés intentar de nuevo?");
    } finally {
      setIsSending(false);
    }
  };

  // Handle post type selection
  const handlePostTypeSelect = (postType: PostTypeOption) => {
    handleSendMessage(postType.label);
  };

  // Handle reference selection
  const handleReferenceSelect = async (reference: ReferenceOption) => {
    setSelectedReference(reference);
    
    // Add user message with reference thumbnail
    addUserMessage("📷 Referencia seleccionada", reference.url);
    
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
      if (clientSessionId) formData.append("sessionId", clientSessionId);
      if (user?.uid) formData.append("userId", user.uid);

      const response = await fetch("/api/agent-chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to get response from agent");
      }

      const result = await response.json();
      
      if (result.type === "text") {
        if (result.readyToGenerate) {
          setReadyToGenerate(true);
        }
        addAssistantMessage(result.text || "");
      }
    } catch (error) {
      console.error("Error:", error);
      addAssistantMessage("Lo siento, hubo un error. Por favor intenta de nuevo.");
    } finally {
      setIsSending(false);
    }
  };

  // Handle custom reference upload
  const handleReferenceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Por favor subí un archivo de imagen");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("La imagen es muy grande. Máximo 10MB");
        return;
      }
      // Create a custom reference from uploaded file
      const imageUrl = URL.createObjectURL(file);
      const customRef: ReferenceOption = {
        id: `custom-${Date.now()}`,
        url: imageUrl,
        description: "Referencia personalizada",
      };
      setSelectedReference(customRef);
      handleSendMessage("", file, true);
    }
  };

  // ============ MICROPHONE / AUDIO FUNCTIONS ============
  
  // Cleanup audio resources
  const cleanupAudio = React.useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setAudioLevels([0, 0, 0, 0, 0]);
  }, []);

  // Update EQ levels from analyser - runs continuously while recording
  const updateAudioLevels = React.useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    // Get overall volume from lower frequencies where voice is (0-40% of spectrum)
    const voiceRange = Math.floor(bufferLength * 0.4);
    let totalEnergy = 0;
    for (let i = 0; i < voiceRange; i++) {
      totalEnergy += dataArray[i];
    }
    const avgEnergy = totalEnergy / voiceRange;
    const normalizedVolume = Math.min(1, avgEnergy / 100);
    
    // Create 5 bars with slight variation based on different frequency sub-ranges
    // This makes all bars move while still reflecting the audio
    const levels: number[] = [];
    const subRangeSize = Math.floor(voiceRange / 5);
    
    for (let i = 0; i < 5; i++) {
      const start = i * subRangeSize;
      const end = start + subRangeSize;
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += dataArray[j];
      }
      const bandAvg = sum / subRangeSize;
      // Mix band-specific level with overall volume for more uniform movement
      const bandLevel = Math.min(1, bandAvg / 100);
      const mixedLevel = (bandLevel * 0.4) + (normalizedVolume * 0.6);
      // Add slight random variation for visual interest
      const variation = 0.9 + Math.random() * 0.2;
      levels.push(Math.min(1, mixedLevel * variation));
    }
    
    setAudioLevels(levels);
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
  }, []);

  // Start microphone capture
  const startMicCapture = async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Micrófono no soportado en este navegador");
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      // Setup AudioContext and Analyser for EQ visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : 'audio/mp4';
      
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.start();
      
      // Start EQ animation
      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
      
    } catch (err) {
      cleanupAudio();
      throw err;
    }
  };

  // Stop capture and return audio blob
  const stopMicCapture = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      
      if (!recorder || recorder.state === 'inactive') {
        cleanupAudio();
        resolve(null);
        return;
      }
      
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        cleanupAudio();
        resolve(blob.size > 0 ? blob : null);
      };
      
      recorder.stop();
    });
  };

  // Transcribe audio blob
  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const form = new FormData();
      const ext = blob.type.includes('wav') ? 'wav' 
        : blob.type.includes('mp4') ? 'mp4' 
        : blob.type.includes('ogg') ? 'ogg' 
        : 'webm';
      form.set('audio', blob, `voice.${ext}`);
      
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = await res.json();
      
      if (data?.status !== 'success') {
        throw new Error(data?.message || 'Error en la transcripción');
      }
      
      const transcript = typeof data?.text === 'string' ? data.text.trim() : '';
      if (transcript) {
        setInputValue(prev => prev ? `${prev} ${transcript}` : transcript);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al transcribir';
      setMicError(msg);
      setTimeout(() => setMicError(null), 3000);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Mic button handlers - Click to start, click again to stop
  const handleMicClick = async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      
      try {
        const blob = await stopMicCapture();
        const MIN_AUDIO_BYTES = 2048;
        
        if (!blob || blob.size < MIN_AUDIO_BYTES) {
          setMicError('Audio muy corto, intentá de nuevo');
          setTimeout(() => setMicError(null), 3000);
          return;
        }
        
        await transcribeAudio(blob);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al procesar audio';
        setMicError(msg);
        setTimeout(() => setMicError(null), 3000);
      }
    } else {
      // Start recording
      if (isBusy || !hasMessages) return;
      
      setMicError(null);
      
      try {
        await startMicCapture();
        setIsRecording(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo iniciar el micrófono';
        setMicError(msg);
        setTimeout(() => setMicError(null), 3000);
        cleanupAudio();
      }
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // ============ END MICROPHONE FUNCTIONS ============

  // Handle generate button click
  const handleGenerate = async () => {
    if (!readyToGenerate || isGenerating) return;
    setIsGenerating(true);
    handleSendMessage("Generar");
  };

  // Handle file selection - now sends to agent
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      
      // Send the image to the agent
      handleSendMessage("", file);
    }
  };

  // Trigger file input click
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Handle text input submission
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim()) {
      handleSendMessage(inputValue.trim());
    }
  };

  // Handle key press in input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isBusy = isSending || isTyping || isGenerating || isRecording || isTranscribing;
  const hasMessages = messages.length > 0;

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
  if (loading) {
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
      {/* Hidden File Input for Reference */}
      <input
        type="file"
        ref={referenceInputRef}
        onChange={handleReferenceUpload}
        accept="image/*"
        className="hidden"
      />
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
      <div className="fixed z-40 
        bottom-6 left-1/2 -translate-x-1/2 flex-row
        sm:bottom-auto sm:left-6 sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0 sm:flex-col
        flex gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-full bg-[#f5f5f5]"
      >
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
          className={`p-2 rounded-full transition-all group cursor-pointer ${activeLeftMenu === 'reels' ? 'bg-white' : ''}`}
          title="Reels"
          onClick={() => setActiveLeftMenu('reels')}
        >
          <img 
            src="/icons/video-recorder.svg" 
            alt="Reels" 
            className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-opacity ${activeLeftMenu === 'reels' ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
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
            <button
              onClick={() => {
                handleConnectInstagram();
                setShowProfileDropdown(false);
              }}
              disabled={connectingInstagram}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#f5f5f5] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <img 
                src="/icons/link-04.svg" 
                alt="Connect" 
                className="w-4 h-4 opacity-50 flex-shrink-0"
              />
              <span className="text-sm text-gray-600">
                {connectingInstagram ? "Conectando..." : "Conectar Instagram"}
              </span>
            </button>
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
        <div className="w-full h-full flex flex-col rounded-[32px] border border-gray-200 bg-white overflow-hidden">
          
          {/* Chat Content Area */}
          <div className="flex-1 relative overflow-hidden">
            <div className="h-full overflow-y-auto p-5 sm:px-8 sm:py-6 scrollbar-hide">
            {!hasMessages ? (
              /* Welcome Box - Dashed border, hover effect, clickable to upload */
              <div className="h-full flex items-center justify-center">
                <div 
                  onClick={handleAttachClick}
                  className="w-full max-w-2xl p-12 sm:p-16 rounded-[24px] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="mb-3">
                    <img 
                      src="/icons/camera-plus.svg" 
                      alt="Camera" 
                      className="w-8 h-8 sm:w-10 sm:h-10 opacity-70"
                    />
                  </div>
                  <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-1">
                    {isFirstPost ? "¡Bienvenid@ a tu primer post!" : "¡Creemos tu nuevo post!"}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500">
                    {isFirstPost 
                      ? "Para empezar, sube una foto de tu producto o arrástrala a la pantalla :)"
                      : "Sube una foto de tu producto para comenzar"
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
                        <div className="flex items-start gap-2 max-w-[40%]">
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
                            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 mt-4">
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
                          )}

                          {/* 🚨 PROTECTED: Reference Carousel - horizontal scroll, no scrollbar visible, extends to chatbox edge */}
                          {/* Reference Options - Step 3 (Carousel) */}
                          {msg.referenceOptions && msg.referenceOptions.length > 0 && (
                            <div className="mt-6">
                              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                                {/* Upload custom reference button */}
                                <button
                                  onClick={() => referenceInputRef.current?.click()}
                                  disabled={isBusy}
                                  className="flex-shrink-0 w-64 h-96 rounded border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span className="text-xs text-gray-500 text-center px-2">Subir referencia</span>
                                </button>

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
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => {
                                    const link = document.createElement("a");
                                    link.href = msg.imageUrl!;
                                    link.download = `postty-${Date.now()}.png`;
                                    link.click();
                                  }}
                                  className="flex-1 py-2.5 px-4 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition"
                                >
                                  Descargar
                                </button>
                                <button
                                  className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
                                >
                                  Publicar
                                </button>
                              </div>
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
                    {msg.role === "user" && msg.content !== "📸 Imagen subida" && (
                      <div className="ml-auto flex items-center gap-2 max-w-[40%]">
                        {/* Reference selection with thumbnail */}
                        {msg.content === "📷 Referencia seleccionada" && msg.imageUrl ? (
                          <div className="flex items-center gap-2 bg-gray-100 rounded-2xl rounded-br-md px-3 py-2">
                            <span className="text-[14px] text-gray-900">Referencia seleccionada</span>
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
                    <div className="flex items-center gap-2 max-w-[40%]">
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
                          {isGenerating ? "Generando post" : loadingMessages[loadingMessageIndex]}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
            </div>
          </div>

          {/* Bottom Input Bar */}
          <div className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
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
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={hasMessages ? "Describe tu post" : "Sube una foto primero por favor"}
                  disabled={isBusy || !hasMessages}
                  className="flex-1 bg-transparent outline-none text-[15px] text-gray-700 placeholder-gray-400 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                />

                {/* Microphone Button with EQ Visualization */}
                {isRecording ? (
                  /* Recording: EQ Bars + Stop button */
                  <button 
                    type="button"
                    onClick={handleMicClick}
                    className="flex items-center gap-2 px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer"
                  >
                    {/* EQ Bars */}
                    <div className="flex items-center gap-[3px] h-[18px]">
                      {audioLevels.map((level, i) => (
                        <div
                          key={i}
                          className="w-[3px] bg-gray-500 rounded-full"
                          style={{ 
                            height: `${Math.max(4, level * 18)}px`,
                            transition: 'height 50ms ease-out'
                          }}
                        />
                      ))}
                    </div>
                    {/* Stop icon */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                    </svg>
                  </button>
                ) : isTranscribing ? (
                  /* Transcribing indicator */
                  <div className="flex items-center gap-1.5 px-3 py-1.5">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Transcribiendo...</span>
                  </div>
                ) : (
                  /* Normal mic button */
                  <button 
                    type="button"
                    onClick={handleMicClick}
                    disabled={(isBusy && !isRecording) || !hasMessages}
                    title={micError || "Click para grabar"}
                    className={`p-1.5 rounded-full hover:bg-white transition-colors cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed ${micError ? 'bg-red-50' : ''}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={`transition-opacity ${micError ? 'text-red-500 opacity-100' : 'opacity-40 group-hover:opacity-100'}`}>
                      <path d="M19 10V12C19 15.866 15.866 19 12 19M5 10V12C5 15.866 8.13401 19 12 19M12 19V22M8 22H16M12 15C10.3431 15 9 13.6569 9 12V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V12C15 13.6569 13.6569 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}

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
              {readyToGenerate && (
                <button 
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-6 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isGenerating ? "Generando..." : "Generar"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

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
                  const res = await fetch("/api/feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
    </div>
  );
}
