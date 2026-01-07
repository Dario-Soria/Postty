"use client";

/**
 * Text Editor Public API
 * Entry point for opening the text editor modal
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextUIProvider } from '@nextui-org/react';
import type { BackendTextLayout, TextEditorResult, TextContent } from './types';
import { TextEditorModal } from './components/TextEditorModal';

/**
 * Open the text editor modal
 * Returns a promise that resolves when user clicks Done or Cancel
 */
export async function openTextEditor(params: {
  baseImageUrl: string;
  textLayout: BackendTextLayout;
}): Promise<TextEditorResult | null> {
  return new Promise((resolve) => {
    // Create container
    const container = document.createElement('div');
    container.id = 'text-editor-portal';
    document.body.appendChild(container);
    
    const root = createRoot(container);
    
    const handleClose = () => {
      root.unmount();
      document.body.removeChild(container);
      resolve(null);
    };
    
    const handleSave = (result: TextEditorResult) => {
      root.unmount();
      document.body.removeChild(container);
      resolve(result);
    };
    
    root.render(
      <NextUIProvider>
        <TextEditorModal
          isOpen={true}
          baseImageUrl={params.baseImageUrl}
          textLayout={params.textLayout}
          onClose={handleClose}
          onSave={handleSave}
        />
      </NextUIProvider>
    );
  });
}

// Export types for consumers
export type { BackendTextLayout, TextEditorResult, TextContent };

