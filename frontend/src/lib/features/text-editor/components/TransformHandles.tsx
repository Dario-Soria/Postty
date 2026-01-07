"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface TransformHandlesProps {
  onRotateStart: (e: React.PointerEvent) => void;
  onScaleStart: (e: React.PointerEvent, corner: 'tl' | 'tr' | 'bl' | 'br') => void;
}

export function TransformHandles({ onRotateStart, onScaleStart }: TransformHandlesProps) {
  const handleSize = 12;
  const rotateHandleOffset = 30;
  
  return (
    <>
      {/* Corner scale handles */}
      <motion.div
        className="absolute -top-1 -left-1 w-3 h-3 bg-sky-400 border-2 border-white rounded-full cursor-nwse-resize shadow-lg"
        onPointerDown={(e) => {
          e.stopPropagation();
          onScaleStart(e, 'tl');
        }}
        whileHover={{ scale: 1.3 }}
        style={{ width: handleSize, height: handleSize }}
      />
      <motion.div
        className="absolute -top-1 -right-1 w-3 h-3 bg-sky-400 border-2 border-white rounded-full cursor-nesw-resize shadow-lg"
        onPointerDown={(e) => {
          e.stopPropagation();
          onScaleStart(e, 'tr');
        }}
        whileHover={{ scale: 1.3 }}
        style={{ width: handleSize, height: handleSize }}
      />
      <motion.div
        className="absolute -bottom-1 -left-1 w-3 h-3 bg-sky-400 border-2 border-white rounded-full cursor-nesw-resize shadow-lg"
        onPointerDown={(e) => {
          e.stopPropagation();
          onScaleStart(e, 'bl');
        }}
        whileHover={{ scale: 1.3 }}
        style={{ width: handleSize, height: handleSize }}
      />
      <motion.div
        className="absolute -bottom-1 -right-1 w-3 h-3 bg-sky-400 border-2 border-white rounded-full cursor-nwse-resize shadow-lg"
        onPointerDown={(e) => {
          e.stopPropagation();
          onScaleStart(e, 'br');
        }}
        whileHover={{ scale: 1.3 }}
        style={{ width: handleSize, height: handleSize }}
      />
      
      {/* Rotation handle (top center) */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
        style={{ top: -rotateHandleOffset }}
      >
        <div className="w-px h-5 bg-sky-400/60" />
        <motion.div
          className="w-4 h-4 bg-emerald-400 border-2 border-white rounded-full cursor-grab active:cursor-grabbing shadow-lg flex items-center justify-center"
          onPointerDown={(e) => {
            e.stopPropagation();
            onRotateStart(e);
          }}
          whileHover={{ scale: 1.3 }}
        >
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </motion.div>
      </motion.div>
    </>
  );
}

