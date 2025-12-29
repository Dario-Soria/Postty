'use client';

import { useState, useRef, useEffect } from 'react';

type MessageType = 'bot' | 'user';
type StepType = 'welcome' | 'style' | 'useCase' | 'product' | 'textChat' | 'confirmText' | 'generating' | 'result';

interface Message {
  id: string;
  type: MessageType;
  content: string;
  options?: string[];
  isImage?: boolean;
  imageUrl?: string;
}

interface TextContent {
  headline: string;
  subheadline: string;
  cta: string;
}

const FORMAT_OPTIONS = ['📱 Story (9:16)', '🖼️ Post (1:1)'];
const STYLE_OPTIONS = ['Old Money', 'Minimalista', 'Vibrante', 'Elegante', 'Urbano', 'Moderno'];
const USE_CASE_OPTIONS = ['Promoción/Oferta', 'Nuevo producto', 'Anuncio', 'Inspiracional'];

export default function PipelineChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState<StepType>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  const [selectedFormat, setSelectedFormat] = useState('1:1');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedUseCase, setSelectedUseCase] = useState('');
  const [productImage, setProductImage] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<TextContent>({ headline: '', subheadline: '', cta: '' });
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [userTextIntent, setUserTextIntent] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setMessages([{
      id: '1',
      type: 'bot',
      content: '¡Hola! 👋 Vamos a crear tu post.\n\n¿Qué formato necesitás?',
      options: FORMAT_OPTIONS,
    }]);
  }, []);

  const addMessage = (message: Omit<Message, 'id'>) => {
    const newMessage = { ...message, id: Date.now().toString() };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleOptionClick = (option: string) => {
    addMessage({ type: 'user', content: option });

    if (currentStep === 'welcome') {
      let format = '1:1';
      if (option.includes('9:16')) format = '9:16';
      setSelectedFormat(format);
      
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: '¿Qué estilo visual te gustaría?',
          options: STYLE_OPTIONS,
        });
        setCurrentStep('style');
      }, 300);
    } 
    else if (currentStep === 'style') {
      setSelectedStyle(option);
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: '¿Cuál es el objetivo?',
          options: USE_CASE_OPTIONS,
        });
        setCurrentStep('useCase');
      }, 300);
    } 
    else if (currentStep === 'useCase') {
      setSelectedUseCase(option);
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: 'Subí la foto del producto 📷',
        });
        setCurrentStep('product');
      }, 300);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const imageData = reader.result as string;
      setProductImage(imageData);
      
      addMessage({ 
        type: 'user', 
        content: '📷',
        isImage: true,
        imageUrl: imageData,
      });

      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: '¡Genial! Contame, ¿qué querés comunicar?\n\nPor ejemplo: "es una oferta del 50%", "nuevo producto de verano", "envío gratis"...',
        });
        setCurrentStep('textChat');
        setTimeout(() => inputRef.current?.focus(), 100);
      }, 300);
    };
    reader.readAsDataURL(file);
  };

  // Generar sugerencias de texto con IA
  const generateTextSuggestions = async (userIntent: string) => {
    setIsLoading(true);
    setUserTextIntent(userIntent);
    
    try {
      const response = await fetch('/api/suggest-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIntent,
          style: selectedStyle,
          useCase: selectedUseCase,
        }),
      });

      const data = await response.json();

      if (data.success && data.suggestion) {
        const { headline, subheadline } = data.suggestion;
        setTextContent({ headline: headline || '', subheadline: subheadline || '', cta: '' });
        
        let suggestion = '¡Me gusta! Te propongo:\n\n';
        if (headline) suggestion += `📌 "${headline}"\n`;
        if (subheadline) suggestion += `📝 "${subheadline}"\n`;
        suggestion += '\n¿O preferís usar tu texto original?';
        
        addMessage({
          type: 'bot',
          content: suggestion,
          options: ['✅ Dale, generá', `💬 Usar: "${userIntent.slice(0, 25)}${userIntent.length > 25 ? '...' : ''}"`, '✏️ Quiero cambiarlo', '🚫 Sin texto'],
        });
        setCurrentStep('confirmText');
      } else {
        // Fallback: usar el texto del usuario directamente
        setTextContent({ headline: userIntent.toUpperCase(), subheadline: '', cta: '' });
        addMessage({
          type: 'bot',
          content: `Perfecto, uso:\n\n📌 "${userIntent.toUpperCase()}"\n\n¿Generamos así?`,
          options: ['✅ Dale, generá', '✏️ Quiero cambiarlo', '🚫 Sin texto'],
        });
        setCurrentStep('confirmText');
      }
    } catch {
      // Si falla la API, usar el texto directamente
      const headline = userIntent.length <= 30 ? userIntent.toUpperCase() : userIntent.slice(0, 30).toUpperCase();
      setTextContent({ headline, subheadline: '', cta: '' });
      addMessage({
        type: 'bot',
        content: `Perfecto, uso:\n\n📌 "${headline}"\n\n¿Generamos así?`,
        options: ['✅ Dale, generá', '✏️ Quiero cambiarlo', '🚫 Sin texto'],
      });
      setCurrentStep('confirmText');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading) return;
    
    const message = inputValue.trim();
    setInputValue('');
    addMessage({ type: 'user', content: message });

    if (currentStep === 'textChat') {
      // Usuario describió qué quiere comunicar
      setTimeout(() => generateTextSuggestions(message), 300);
    } 
    else if (currentStep === 'confirmText') {
      // Usuario quiere ajustar el texto
      setTimeout(() => generateTextSuggestions(message), 300);
    }
  };

  const handleConfirmOption = (option: string) => {
    addMessage({ type: 'user', content: option });

    if (option.includes('Dale') || option.includes('generá')) {
      // Confirmar y generar con el texto propuesto
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: `🎨 Generando...\n\n• Formato: ${selectedFormat === '9:16' ? 'Story' : 'Post'}\n• Estilo: ${selectedStyle}\n\n⏳ 15-30 segundos`,
        });
        setCurrentStep('generating');
        generateImage(textContent);
      }, 300);
    }
    else if (option.includes('Usar:') || option.includes('💬')) {
      // Usar el texto original del usuario
      const originalText = userTextIntent.toUpperCase();
      setTextContent({ headline: originalText, subheadline: '', cta: '' });
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: `🎨 Generando con tu texto:\n\n📌 "${originalText}"\n\n• Formato: ${selectedFormat === '9:16' ? 'Story' : 'Post'}\n• Estilo: ${selectedStyle}\n\n⏳ 15-30 segundos`,
        });
        setCurrentStep('generating');
        generateImage({ headline: originalText, subheadline: '', cta: '' });
      }, 300);
    }
    else if (option.includes('cambiar') || option.includes('Quiero')) {
      // Quiere modificar
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: '¿Cómo lo preferís? Contame...',
        });
        setCurrentStep('textChat');
        setTimeout(() => inputRef.current?.focus(), 100);
      }, 300);
    } 
    else if (option.includes('Sin texto')) {
      // Generar sin texto
      setTextContent({ headline: '', subheadline: '', cta: '' });
      setTimeout(() => {
        addMessage({
          type: 'bot',
          content: `🎨 Generando imagen limpia (sin texto)...\n\n• Formato: ${selectedFormat === '9:16' ? 'Story' : 'Post'}\n• Estilo: ${selectedStyle}\n\n⏳ 15-30 segundos`,
        });
        setCurrentStep('generating');
        generateImage({ headline: '', subheadline: '', cta: '' });
      }, 300);
    }
  };

  const generateImage = async (text: TextContent) => {
    setIsLoading(true);

    try {
      const hasText = text.headline || text.subheadline || text.cta;
      
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageBase64: productImage,
          textPrompt: `Crear imagen promocional`,
          language: 'es',
          aspectRatio: selectedFormat,
          style: selectedStyle,
          useCase: selectedUseCase,
          skipText: !hasText,
          textContent: hasText ? {
            headline: text.headline || undefined,
            subheadline: text.subheadline || undefined,
            cta: text.cta || undefined,
          } : undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) throw new Error(data.error);

      setGeneratedImage(data.finalImage);
      setBaseImage(data.baseImage);

      addMessage({
        type: 'bot',
        content: '✅ ¡Lista!',
        isImage: true,
        imageUrl: data.finalImage,
      });

      setTimeout(() => {
        const alternativeFormat = selectedFormat === '9:16' 
          ? '🖼️ También en Post (1:1)' 
          : '📱 También en Story (9:16)';
        
        addMessage({
          type: 'bot',
          content: '¿Qué te parece?',
          options: ['💾 Descargar', alternativeFormat, '🔄 Otra variación', '🆕 Crear otro'],
        });
        setCurrentStep('result');
      }, 400);

    } catch (error) {
      addMessage({
        type: 'bot',
        content: `❌ ${error instanceof Error ? error.message : 'Error al generar'}`,
        options: ['🔄 Reintentar', '🆕 Crear otro'],
      });
      setCurrentStep('result');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResultOption = (option: string) => {
    addMessage({ type: 'user', content: option });

    if (option.includes('Descargar') && generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `postty-${selectedFormat.replace(':', 'x')}.png`;
      link.click();
      
      const alternativeFormat = selectedFormat === '9:16' 
        ? '🖼️ También en Post (1:1)' 
        : '📱 También en Story (9:16)';
      
      setTimeout(() => {
        addMessage({ 
          type: 'bot', 
          content: '✅ ¡Descargado!', 
          options: [alternativeFormat, '🔄 Otra variación', '🆕 Crear otro'] 
        });
      }, 200);
    } 
    else if (option.includes('Story') && baseImage) {
      addMessage({ type: 'bot', content: '🔄 Adaptando a Story...' });
      setCurrentStep('generating');
      reformatImage(textContent, '9:16');
    }
    else if (option.includes('Post (1:1)') && baseImage) {
      addMessage({ type: 'bot', content: '🔄 Adaptando a Post...' });
      setCurrentStep('generating');
      reformatImage(textContent, '1:1');
    }
    else if (option.includes('variación') && productImage) {
      addMessage({ type: 'bot', content: '🎨 Generando otra variación...' });
      setCurrentStep('generating');
      generateImage(textContent);
    } 
    else if (option.includes('Crear otro') || option.includes('Reintentar')) {
      resetConversation();
    }
  };

  const reformatImage = async (text: TextContent, newFormat: string) => {
    if (!baseImage) {
      generateImage(text);
      return;
    }

    setIsLoading(true);

    try {
      const hasText = text.headline || text.subheadline || text.cta;
      
      const response = await fetch('/api/pipeline/reformat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseImageBase64: baseImage,
          newAspectRatio: newFormat,
          style: selectedStyle,
          language: 'es',
          textContent: hasText ? {
            headline: text.headline || undefined,
            subheadline: text.subheadline || undefined,
            cta: text.cta || undefined,
          } : undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) throw new Error(data.error);

      setGeneratedImage(data.finalImage);
      setBaseImage(data.baseImage);
      setSelectedFormat(newFormat);

      const formatName = newFormat === '9:16' ? 'Story' : 'Post';
      
      addMessage({
        type: 'bot',
        content: `✅ ¡${formatName} listo!`,
        isImage: true,
        imageUrl: data.finalImage,
      });

      setTimeout(() => {
        const alternativeFormat = newFormat === '9:16' 
          ? '🖼️ También en Post (1:1)' 
          : '📱 También en Story (9:16)';
        
        addMessage({
          type: 'bot',
          content: '¿Algo más?',
          options: ['💾 Descargar', alternativeFormat, '🔄 Otra variación', '🆕 Crear otro'],
        });
        setCurrentStep('result');
      }, 400);

    } catch (error) {
      addMessage({
        type: 'bot',
        content: `❌ ${error instanceof Error ? error.message : 'Error'}`,
        options: ['🔄 Reintentar', '🆕 Crear otro'],
      });
      setCurrentStep('result');
    } finally {
      setIsLoading(false);
    }
  };

  const resetConversation = () => {
    setSelectedFormat('1:1');
    setSelectedStyle('');
    setSelectedUseCase('');
    setProductImage(null);
    setTextContent({ headline: '', subheadline: '', cta: '' });
    setGeneratedImage(null);
    setBaseImage(null);
    setUserTextIntent('');
    setInputValue('');
    setMessages([{
      id: Date.now().toString(),
      type: 'bot',
      content: '¿Qué formato necesitás?',
      options: FORMAT_OPTIONS,
    }]);
    setCurrentStep('welcome');
  };

  const canType = currentStep === 'textChat' || currentStep === 'confirmText';
  const canUpload = currentStep === 'product';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Postty</h1>
            <p className="text-xs text-slate-500">Tu asistente de contenido</p>
          </div>
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">● Online</span>
        </div>
      </header>

      {/* Chat */}
      <main className="max-w-xl mx-auto px-4 py-4 pb-28">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.type === 'bot' ? 'justify-start' : 'justify-end'} mb-3`}>
            <div className={`max-w-[85%] rounded-2xl p-3.5 ${
              msg.type === 'bot' 
                ? 'bg-white shadow-sm border border-slate-100' 
                : 'bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-md'
            }`}>
              {msg.isImage && msg.imageUrl && (
                <img src={msg.imageUrl} alt="" className="rounded-xl mb-2 max-h-72 w-auto" />
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              
              {msg.options && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {msg.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        if (currentStep === 'result') handleResultOption(opt);
                        else if (currentStep === 'confirmText') handleConfirmOption(opt);
                        else handleOptionClick(opt);
                      }}
                      disabled={isLoading}
                      className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium transition-all disabled:opacity-50 hover:border-slate-300"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'0.15s'}} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'0.3s'}} />
                </div>
                <span className="text-slate-500 text-sm">Pensando...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-slate-200 p-3">
        <div className="max-w-xl mx-auto flex items-center gap-2">
          {/* Botón de imagen */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpload || isLoading}
            className={`p-3 rounded-xl transition-all ${
              canUpload 
                ? 'bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-md hover:shadow-lg' 
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          
          {/* Input de texto */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={!canType || isLoading}
              placeholder={
                canUpload ? 'Subí una foto →' :
                canType ? 'Escribí tu mensaje...' :
                'Seleccioná una opción'
              }
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${
                canType 
                  ? 'bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            />
          </div>

          {/* Botón enviar */}
          {canType && (
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="p-3 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:shadow-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
