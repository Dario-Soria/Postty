"use client";

import React from 'react';
import { Select, SelectItem } from '@nextui-org/react';
import { AVAILABLE_FONTS } from '../utils/fontRegistry';

interface FontPickerProps {
  selectedFont: string;
  onFontChange: (font: string) => void;
}

export function FontPicker({ selectedFont, onFontChange }: FontPickerProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">Font</p>
      <Select
        size="sm"
        selectedKeys={[selectedFont]}
        onChange={(e) => onFontChange(e.target.value)}
        classNames={{
          trigger: 'bg-white/70 border border-white/60',
          value: 'text-slate-900',
        }}
        aria-label="Select font family"
      >
        {AVAILABLE_FONTS.map((font) => (
          <SelectItem
            key={font.name}
            value={font.name}
            style={{ fontFamily: font.family }}
          >
            {font.name}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}

