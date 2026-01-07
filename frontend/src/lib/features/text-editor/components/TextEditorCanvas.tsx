"use client";

import React, { useRef, useEffect, useState } from 'react';
import type { EditableTextOverlay } from '../types';
import { EditableTextOverlay as OverlayComponent } from './EditableTextOverlay';

interface TextEditorCanvasProps {
  baseImageUrl: string;
  overlays: EditableTextOverlay[];
  selectedId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay: (id: string, updates: Partial<EditableTextOverlay>) => void;
  onDoubleClickOverlay: (id: string) => void;
  onTransformComplete: () => void;
}

export function TextEditorCanvas({
  baseImageUrl,
  overlays,
  selectedId,
  onSelectOverlay,
  onUpdateOverlay,
  onDoubleClickOverlay,
  onTransformComplete,
}: TextEditorCanvasProps) {
  console.log('[TextEditorCanvas] Rendering with:', { baseImageUrl, overlays: overlays.length, selectedId });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  useEffect(() => {
    console.log('[TextEditorCanvas] Image loaded:', imageLoaded, 'Canvas rect:', canvasRect);
  }, [imageLoaded, canvasRect]);
  
  // Update canvas rect when image loads or window resizes
  useEffect(() => {
    const updateCanvasRect = () => {
      if (imageRef.current && imageLoaded) {
        // Use the actual image element's bounding box
        const rect = imageRef.current.getBoundingClientRect();
        console.log('[TextEditorCanvas] Canvas rect updated:', rect);
        setCanvasRect(rect);
      }
    };
    
    updateCanvasRect();
    window.addEventListener('resize', updateCanvasRect);
    return () => window.removeEventListener('resize', updateCanvasRect);
  }, [imageLoaded]);
  
  // Deselect when clicking canvas background
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onSelectOverlay(null);
    }
  };
  
  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-slate-900/20"
      onClick={handleCanvasClick}
    >
      {/* Wrapper for image and overlays - positioned relative to each other */}
      <div ref={containerRef} className="relative inline-block">
        {/* Base Image */}
        <img
          ref={imageRef as any}
          src={baseImageUrl}
          alt="Base image"
          className="max-w-full max-h-full object-contain block"
          onLoad={() => {
            console.log('[TextEditorCanvas] Image loaded successfully');
            setImageLoaded(true);
          }}
          onError={(e) => {
            console.error('[TextEditorCanvas] Image failed to load:', e, 'URL:', baseImageUrl);
          }}
        />
        
        {/* Text Overlays - positioned absolutely within this wrapper */}
        {canvasRect && imageLoaded && overlays.map((overlay) => (
          <OverlayComponent
            key={overlay.id}
            overlay={overlay}
            isSelected={selectedId === overlay.id}
            canvasRect={canvasRect}
            onSelect={() => onSelectOverlay(overlay.id)}
            onUpdate={(updates) => onUpdateOverlay(overlay.id, updates)}
            onDoubleClick={() => onDoubleClickOverlay(overlay.id)}
            onTransformComplete={onTransformComplete}
          />
        ))}
        
        {/* Helper text when no overlays */}
        {overlays.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-white/60 text-sm">No text overlays</p>
          </div>
        )}
      </div>
    </div>
  );
}

