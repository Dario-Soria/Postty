"use client";

import React, { useState } from 'react';
import { Modal, ModalContent, Button } from '@nextui-org/react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EditableTextOverlay, BackendTextLayout, TextEditorResult } from '../types';
import { layoutToOverlays, overlaysToTextContent } from '../utils/adapters';
import { useTextEditor } from '../state/useTextEditor';
import { TextEditorCanvas } from './TextEditorCanvas';
import { ControlPanel } from './ControlPanel';
import { TextInput } from './TextInput';

interface TextEditorModalProps {
  isOpen: boolean;
  baseImageUrl: string;
  textLayout: BackendTextLayout;
  onClose: () => void;
  onSave: (result: TextEditorResult) => void;
}

export function TextEditorModal({
  isOpen,
  baseImageUrl,
  textLayout,
  onClose,
  onSave,
}: TextEditorModalProps) {
  console.log('[TextEditorModal] Rendering with:', { baseImageUrl, textLayout });
  
  const initialOverlays = layoutToOverlays(textLayout);
  
  console.log('[TextEditorModal] Initial overlays:', initialOverlays);
  
  const {
    overlays,
    selectedId,
    setSelectedId,
    updateOverlay,
    saveToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTextEditor(initialOverlays);
  
  const [isEditingText, setIsEditingText] = useState(false);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  
  const selectedOverlay = overlays.find(o => o.id === selectedId) || null;
  
  const handleSave = () => {
    const textContent = overlaysToTextContent(overlays);
    onSave({ textContent, overlays });
  };
  
  const handleOpenTextEditor = () => {
    if (selectedId) {
      setEditingOverlayId(selectedId);
      setIsEditingText(true);
    }
  };
  
  const handleSaveText = (newText: string) => {
    if (editingOverlayId) {
      saveToHistory();
      updateOverlay(editingOverlayId, { text: newText });
    }
  };
  
  const handleDoubleClick = (id: string) => {
    setEditingOverlayId(id);
    setIsEditingText(true);
  };
  
  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="full"
        hideCloseButton
        classNames={{
          base: 'bg-transparent',
          wrapper: 'p-0',
          body: 'p-0',
        }}
        motionProps={{
          variants: {
            enter: {
              opacity: 1,
              transition: { duration: 0.3 },
            },
            exit: {
              opacity: 0,
              transition: { duration: 0.2 },
            },
          },
        }}
      >
        <ModalContent className="h-screen w-screen m-0 rounded-none">
          <div className="h-full w-full flex flex-col bg-slate-900/95">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/70 backdrop-blur-xl border-b border-white/60">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="flat"
                  onPress={onClose}
                  className="bg-white/70 border border-white/60 text-slate-900 font-medium"
                >
                  Cancel
                </Button>
                
                {/* Undo/Redo */}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    onPress={undo}
                    isDisabled={!canUndo}
                    className="bg-white/70 border border-white/60"
                    title="Undo (Cmd/Ctrl+Z)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    onPress={redo}
                    isDisabled={!canRedo}
                    className="bg-white/70 border border-white/60"
                    title="Redo (Cmd/Ctrl+Shift+Z)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                    </svg>
                  </Button>
                </div>
              </div>
              
              <h2 className="text-lg font-bold text-slate-900">Edit Text</h2>
              
              <Button
                size="sm"
                onPress={handleSave}
                className="bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 font-semibold shadow-[0_0_18px_rgba(56,189,248,0.6)]"
              >
                Done
              </Button>
            </div>
            
            {/* Canvas Area */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <TextEditorCanvas
                baseImageUrl={baseImageUrl}
                overlays={overlays}
                selectedId={selectedId}
                onSelectOverlay={setSelectedId}
                onUpdateOverlay={updateOverlay}
                onDoubleClickOverlay={handleDoubleClick}
                onTransformComplete={saveToHistory}
              />
            </div>
            
            {/* Control Panel */}
            <ControlPanel
              selectedOverlay={selectedOverlay}
              onUpdateOverlay={(updates) => {
                if (selectedId) {
                  updateOverlay(selectedId, updates);
                }
              }}
              onEditText={handleOpenTextEditor}
              onSaveHistory={saveToHistory}
            />
          </div>
        </ModalContent>
      </Modal>
      
      {/* Text Edit Modal */}
      {editingOverlayId && (
        <TextInput
          isOpen={isEditingText}
          initialText={overlays.find(o => o.id === editingOverlayId)?.text || ''}
          onClose={() => {
            setIsEditingText(false);
            setEditingOverlayId(null);
          }}
          onSave={handleSaveText}
        />
      )}
    </>
  );
}

