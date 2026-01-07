/**
 * Text Editor State Hook
 */

import { useState, useCallback, useEffect } from 'react';
import type { EditableTextOverlay, TextEditorState } from '../types';
import { pushHistory, undo, redo, canUndo, canRedo } from './history';

export function useTextEditor(initialOverlays: EditableTextOverlay[]) {
  const [overlays, setOverlays] = useState<EditableTextOverlay[]>(initialOverlays);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState({
    past: [] as EditableTextOverlay[][],
    future: [] as EditableTextOverlay[][],
  });
  
  /**
   * Save current state to history
   */
  const saveToHistory = useCallback(() => {
    setHistory(prev => pushHistory(prev, overlays));
  }, [overlays]);
  
  /**
   * Update a specific overlay
   */
  const updateOverlay = useCallback((id: string, updates: Partial<EditableTextOverlay>) => {
    setOverlays(prev => prev.map(o => 
      o.id === id ? { ...o, ...updates } : o
    ));
  }, []);
  
  /**
   * Delete an overlay
   */
  const deleteOverlay = useCallback((id: string) => {
    saveToHistory();
    setOverlays(prev => prev.filter(o => o.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  }, [selectedId, saveToHistory]);
  
  /**
   * Undo last action
   */
  const handleUndo = useCallback(() => {
    const result = undo(history, overlays);
    if (result) {
      setHistory(result.history);
      setOverlays(result.overlays);
    }
  }, [history, overlays]);
  
  /**
   * Redo last undone action
   */
  const handleRedo = useCallback(() => {
    const result = redo(history, overlays);
    if (result) {
      setHistory(result.history);
      setOverlays(result.overlays);
    }
  }, [history, overlays]);
  
  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      
      // Redo: Cmd/Ctrl + Shift + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      
      // Delete: Backspace/Delete
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        e.preventDefault();
        deleteOverlay(selectedId);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedId, deleteOverlay]);
  
  return {
    overlays,
    setOverlays,
    selectedId,
    setSelectedId,
    updateOverlay,
    deleteOverlay,
    saveToHistory,
    undo: handleUndo,
    redo: handleRedo,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}

