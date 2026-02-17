/**
 * Project Store - Active Project State
 * Manages active project and paper content directly.
 * No virtual file-system — paper text lives in `paperContent`.
 */

import { create } from 'zustand';
import type { Project, ProjectFile } from '../types';
import { EMPTY_MARKDOWN } from '../constants';

interface ProjectStore {
  // State
  activeProject: Project | null;
  // Direct paper content — no files[] indirection needed
  paperContent: string;
  // Keep activeFileId/files for left-sidebar file explorer (non-studio use)
  activeFileId: string;
  selectedContextIds: Set<string>;
  historyStack: string[];
  redoStack: string[];

  // Actions
  setActiveProject: (project: Project | null) => void;
  updateActiveProject: (updates: Partial<Project>) => void;
  setActiveFileId: (id: string) => void;
  toggleContext: (id: string) => void;
  clearContext: () => void;

  // Paper content operations (used by Studio / Co-Author)
  setPaperContent: (content: string) => void;
  updateSection: (sectionTitle: string, content: string, mode: 'append' | 'replace') => void;

  // File operations (used by left sidebar file explorer)
  updateFileContent: (fileId: string, content: string) => void;
  addFile: (file: ProjectFile) => void;
  deleteFile: (fileId: string) => void;

  // History
  pushHistory: (content: string) => void;
  undo: () => string | null;
  redo: () => string | null;

  // Reset
  reset: () => void;
}

const initialState = {
  activeProject: null,
  paperContent: EMPTY_MARKDOWN,
  activeFileId: 'main.md',
  selectedContextIds: new Set<string>(),
  historyStack: [],
  redoStack: [],
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...initialState,

  setActiveProject: (project) =>
    set({
      activeProject: project ?? null,
      // Reset paper content to empty template when opening a project.
      // The draft will be loaded from the backend by WorkspaceStudio on mount.
      paperContent: EMPTY_MARKDOWN,
      activeFileId: 'main.md',
      selectedContextIds: new Set(),
      historyStack: [],
      redoStack: [],
    }),

  updateActiveProject: (updates) =>
    set((state) => ({
      activeProject: state.activeProject
        ? { ...state.activeProject, ...updates }
        : null,
    })),

  setActiveFileId: (id) => set({ activeFileId: id }),

  toggleContext: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedContextIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return { selectedContextIds: newSet };
    }),

  clearContext: () => set({ selectedContextIds: new Set() }),

  // ── Direct paper content write ──────────────────────────────────────────
  setPaperContent: (content) => set({ paperContent: content }),

  // ── Update a single ## Section within the paper content ────────────────
  updateSection: (sectionTitle, content, mode) =>
    set((state) => {
      const currentContent = state.paperContent;
      const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `(## ${escapedTitle}\\n)((?:(?!\\n## )[\\s\\S])*)`,
        'i'
      );
      const match = currentContent.match(regex);

      let newContent = currentContent;
      if (match) {
        if (mode === 'replace') {
          newContent = currentContent.replace(regex, `$1${content}\n`);
        } else {
          const existing = match[2];
          if (!existing.trim().endsWith(content.trim())) {
            newContent = currentContent.replace(regex, `$1$2\n${content}\n`);
          }
        }
      } else {
        // Section not found — append it
        newContent = currentContent + `\n\n## ${sectionTitle}\n${content}`;
      }

      return { paperContent: newContent };
    }),

  // ── File operations (left-sidebar file explorer, non-studio) ────────────
  updateFileContent: (fileId, content) =>
    set((state) => {
      if (!state.activeProject) return state;
      const updatedFiles = state.activeProject.files.map((f) =>
        f.id === fileId ? { ...f, content } : f
      );
      return { activeProject: { ...state.activeProject, files: updatedFiles } };
    }),

  addFile: (file) =>
    set((state) => {
      if (!state.activeProject) return state;
      return {
        activeProject: {
          ...state.activeProject,
          files: [...state.activeProject.files, file],
        },
      };
    }),

  deleteFile: (fileId) =>
    set((state) => {
      if (!state.activeProject) return state;
      const updatedFiles = state.activeProject.files.filter(
        (f) => f.id !== fileId && f.parentId !== fileId
      );
      return {
        activeProject: { ...state.activeProject, files: updatedFiles },
        activeFileId: state.activeFileId === fileId ? 'main.md' : state.activeFileId,
      };
    }),

  // ── History (undo/redo operates on paperContent) ────────────────────────
  pushHistory: (content) =>
    set((state) => ({
      historyStack: [...state.historyStack, content].slice(-50),
      redoStack: [],
    })),

  undo: () => {
    const state = get();
    if (state.historyStack.length === 0) return null;
    const previous = state.historyStack[state.historyStack.length - 1];
    set({
      historyStack: state.historyStack.slice(0, -1),
      redoStack: [...state.redoStack, state.paperContent],
    });
    return previous;
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return null;
    const next = state.redoStack[state.redoStack.length - 1];
    set({
      historyStack: [...state.historyStack, state.paperContent],
      redoStack: state.redoStack.slice(0, -1),
    });
    return next;
  },

  reset: () => set(initialState),
}));
