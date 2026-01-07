"use client";

import React from 'react';
import { Button, ButtonGroup, Slider } from '@nextui-org/react';
import type { EditableTextOverlay } from '../types';
import { ColorPalette } from './ColorPalette';
import { FontPicker } from './FontPicker';

interface ControlPanelProps {
  selectedOverlay: EditableTextOverlay | null;
  onUpdateOverlay: (updates: Partial<EditableTextOverlay>) => void;
  onEditText: () => void;
  onSaveHistory: () => void;
}

export function ControlPanel({
  selectedOverlay,
  onUpdateOverlay,
  onEditText,
  onSaveHistory,
}: ControlPanelProps) {
  if (!selectedOverlay) {
    return (
      <div className="w-full p-4 bg-white/70 backdrop-blur-xl border-t border-white/60 flex items-center justify-center">
        <p className="text-sm text-slate-600">Select a text element to edit</p>
      </div>
    );
  }
  
  return (
    <div className="w-full p-4 bg-white/70 backdrop-blur-xl border-t border-white/60 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Text Edit */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Content</p>
          <Button
            size="sm"
            fullWidth
            onPress={onEditText}
            className="bg-white/70 border border-white/60 text-slate-900 font-medium"
          >
            Edit Text
          </Button>
          <p className="text-xs text-slate-600 truncate">"{selectedOverlay.text}"</p>
        </div>
        
        {/* Font */}
        <FontPicker
          selectedFont={selectedOverlay.fontFamily}
          onFontChange={(font) => {
            onUpdateOverlay({ fontFamily: font });
            onSaveHistory();
          }}
        />
        
        {/* Size */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Size</p>
          <Slider
            size="sm"
            step={1}
            minValue={20}
            maxValue={120}
            value={selectedOverlay.fontSize * selectedOverlay.scale}
            onChange={(value) => {
              const newSize = Array.isArray(value) ? value[0] : value;
              const newScale = newSize / selectedOverlay.fontSize;
              onUpdateOverlay({ scale: newScale });
            }}
            onChangeEnd={onSaveHistory}
            className="max-w-full"
            classNames={{
              track: 'bg-white/60',
              thumb: 'bg-sky-400',
            }}
          />
          <p className="text-xs text-slate-600">
            {Math.round(selectedOverlay.fontSize * selectedOverlay.scale)}px
          </p>
        </div>
        
        {/* Alignment */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Alignment</p>
          <ButtonGroup size="sm" fullWidth>
            <Button
              onPress={() => {
                onUpdateOverlay({ align: 'left' });
                onSaveHistory();
              }}
              className={selectedOverlay.align === 'left' ? 'bg-sky-400 text-white' : 'bg-white/70 border border-white/60'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" />
              </svg>
            </Button>
            <Button
              onPress={() => {
                onUpdateOverlay({ align: 'center' });
                onSaveHistory();
              }}
              className={selectedOverlay.align === 'center' ? 'bg-sky-400 text-white' : 'bg-white/70 border border-white/60'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M5 18h14" />
              </svg>
            </Button>
            <Button
              onPress={() => {
                onUpdateOverlay({ align: 'right' });
                onSaveHistory();
              }}
              className={selectedOverlay.align === 'right' ? 'bg-sky-400 text-white' : 'bg-white/70 border border-white/60'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M6 18h14" />
              </svg>
            </Button>
          </ButtonGroup>
        </div>
      </div>
      
      {/* Color Palette */}
      <ColorPalette
        selectedColor={selectedOverlay.color}
        onColorChange={(color) => {
          onUpdateOverlay({ color });
          onSaveHistory();
        }}
      />
      
      {/* Rotation display */}
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Rotation: {Math.round(selectedOverlay.rotation)}°</span>
        <span>•</span>
        <span>Scale: {(selectedOverlay.scale * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

