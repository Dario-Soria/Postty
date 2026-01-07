"use client";

import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { EditableTextOverlay as OverlayType } from '../types';
import { TransformHandles } from './TransformHandles';
import { getFontFamilyCSS } from '../utils/fontRegistry';

interface EditableTextOverlayProps {
  overlay: OverlayType;
  isSelected: boolean;
  canvasRect: DOMRect;
  onSelect: () => void;
  onUpdate: (updates: Partial<OverlayType>) => void;
  onDoubleClick: () => void;
  onTransformComplete: () => void;
}

export function EditableTextOverlay({
  overlay,
  isSelected,
  canvasRect,
  onSelect,
  onUpdate,
  onDoubleClick,
  onTransformComplete,
}: EditableTextOverlayProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0, overlayX: 0, overlayY: 0 });
  const scaleStartData = useRef({ scale: 1, distance: 0, corner: 'br' as 'tl' | 'tr' | 'bl' | 'br' });
  const rotateStartData = useRef({ rotation: 0, angle: 0 });
  
  // Convert canvas % to pixels
  const left = (overlay.x / 100) * canvasRect.width;
  const top = (overlay.y / 100) * canvasRect.height;
  
  // Handle drag
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (!isSelected) {
      onSelect();
      return;
    }
    
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      overlayX: overlay.x,
      overlayY: overlay.y,
    };
    
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [isSelected, onSelect, overlay.x, overlay.y]);
  
  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    
    const newX = dragStartPos.current.overlayX + (dx / canvasRect.width) * 100;
    const newY = dragStartPos.current.overlayY + (dy / canvasRect.height) * 100;
    
    // Constrain to canvas bounds
    const constrainedX = Math.max(0, Math.min(100, newX));
    const constrainedY = Math.max(0, Math.min(100, newY));
    
    onUpdate({ x: constrainedX, y: constrainedY });
  }, [isDragging, canvasRect, onUpdate]);
  
  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
      onTransformComplete();
    }
  }, [isDragging, onTransformComplete]);
  
  // Handle scale
  const handleScaleStart = useCallback((e: React.PointerEvent, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    setIsTransforming(true);
    
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    
    scaleStartData.current = {
      scale: overlay.scale,
      distance,
      corner,
    };
    
    window.addEventListener('pointermove', handleScaleMove);
    window.addEventListener('pointerup', handleScaleEnd);
  }, [overlay.scale]);
  
  const handleScaleMove = useCallback((e: PointerEvent) => {
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currentDistance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    
    const scaleRatio = currentDistance / scaleStartData.current.distance;
    const newScale = Math.max(0.5, Math.min(3, scaleStartData.current.scale * scaleRatio));
    
    onUpdate({ scale: newScale });
  }, [onUpdate]);
  
  const handleScaleEnd = useCallback(() => {
    setIsTransforming(false);
    window.removeEventListener('pointermove', handleScaleMove);
    window.removeEventListener('pointerup', handleScaleEnd);
    onTransformComplete();
  }, [handleScaleMove, onTransformComplete]);
  
  // Handle rotation
  const handleRotateStart = useCallback((e: React.PointerEvent) => {
    setIsTransforming(true);
    
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    
    rotateStartData.current = {
      rotation: overlay.rotation,
      angle,
    };
    
    window.addEventListener('pointermove', handleRotateMove);
    window.addEventListener('pointerup', handleRotateEnd);
  }, [overlay.rotation]);
  
  const handleRotateMove = useCallback((e: PointerEvent) => {
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    
    const deltaAngle = currentAngle - rotateStartData.current.angle;
    const newRotation = rotateStartData.current.rotation + deltaAngle;
    
    onUpdate({ rotation: newRotation });
  }, [onUpdate]);
  
  const handleRotateEnd = useCallback(() => {
    setIsTransforming(false);
    window.removeEventListener('pointermove', handleRotateMove);
    window.removeEventListener('pointerup', handleRotateEnd);
    onTransformComplete();
  }, [handleRotateMove, onTransformComplete]);
  
  return (
    <motion.div
      ref={elementRef}
      className={`absolute cursor-move select-none ${isSelected ? 'z-50' : 'z-10'}`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg) scale(${overlay.scale})`,
        transformOrigin: 'center center',
      }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onDoubleClick={onDoubleClick}
    >
      {/* Selection border */}
      {isSelected && (
        <div className="absolute inset-0 border-2 border-dashed border-sky-400 pointer-events-none -m-2" />
      )}
      
      {/* Text content */}
      <div
        className="px-2 py-1 whitespace-pre-wrap"
        style={{
          fontFamily: getFontFamilyCSS(overlay.fontFamily),
          fontSize: `${overlay.fontSize}px`,
          fontWeight: overlay.fontWeight,
          color: overlay.color,
          textAlign: overlay.align,
          letterSpacing: overlay.letterSpacing ? `${overlay.letterSpacing}px` : undefined,
          maxWidth: overlay.maxWidth ? `${overlay.maxWidth}vw` : undefined,
          textShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 16px rgba(0,0,0,0.3)',
        }}
      >
        {overlay.text}
      </div>
      
      {/* Transform handles (only when selected) */}
      {isSelected && !isDragging && !isTransforming && (
        <TransformHandles
          onRotateStart={handleRotateStart}
          onScaleStart={handleScaleStart}
        />
      )}
    </motion.div>
  );
}

