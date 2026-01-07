/**
 * History management for undo/redo
 */

import type { EditableTextOverlay } from '../types';

export interface HistoryState {
  past: EditableTextOverlay[][];
  future: EditableTextOverlay[][];
}

const MAX_HISTORY = 20;

/**
 * Push new state to history
 */
export function pushHistory(
  history: HistoryState,
  current: EditableTextOverlay[]
): HistoryState {
  const newPast = [...history.past, current].slice(-MAX_HISTORY);
  
  return {
    past: newPast,
    future: [], // Clear future when new action is performed
  };
}

/**
 * Undo - move back in history
 */
export function undo(
  history: HistoryState,
  current: EditableTextOverlay[]
): { history: HistoryState; overlays: EditableTextOverlay[] } | null {
  if (history.past.length === 0) return null;
  
  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, -1);
  
  return {
    history: {
      past: newPast,
      future: [current, ...history.future],
    },
    overlays: previous,
  };
}

/**
 * Redo - move forward in history
 */
export function redo(
  history: HistoryState,
  current: EditableTextOverlay[]
): { history: HistoryState; overlays: EditableTextOverlay[] } | null {
  if (history.future.length === 0) return null;
  
  const next = history.future[0];
  const newFuture = history.future.slice(1);
  
  return {
    history: {
      past: [...history.past, current],
      future: newFuture,
    },
    overlays: next,
  };
}

/**
 * Check if undo is available
 */
export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

/**
 * Check if redo is available
 */
export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

