"use client";

import React from 'react';
import { COLOR_PALETTE } from '../utils/colorPalette';

interface ColorPaletteProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
}

export function ColorPalette({ selectedColor, onColorChange }: ColorPaletteProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">Color</p>
      <div className="flex flex-wrap gap-2">
        {COLOR_PALETTE.map((color) => (
          <button
            key={color.hex}
            onClick={() => onColorChange(color.hex)}
            className={`w-8 h-8 rounded-lg border-2 transition-all ${
              selectedColor.toUpperCase() === color.hex.toUpperCase()
                ? 'border-sky-400 scale-110 shadow-lg'
                : 'border-white/60 hover:border-slate-300 hover:scale-105'
            }`}
            style={{ backgroundColor: color.hex }}
            title={color.name}
            aria-label={`Select ${color.name} color`}
          />
        ))}
        
        {/* Custom color input */}
        <label className="relative w-8 h-8 rounded-lg border-2 border-white/60 hover:border-slate-300 transition-all cursor-pointer overflow-hidden group">
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-600 group-hover:text-slate-900"
            style={{ backgroundColor: selectedColor }}
          >
            +
          </div>
        </label>
      </div>
    </div>
  );
}

