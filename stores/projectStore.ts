/**
 * Project Store - Active Project State
 * Manages active project, file system, and context selection
 */

import { create } from 'zustand';
import type { Project, ProjectFile } from '../types';

interface ProjectStore {
  // State
  activeProject: Project | null;
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
  
  // File operations
  updateFileContent: (fileId: string, content: string) => void;
  updateSection: (fileId: string, sectionTitle: string, content: string, mode: 'append' | 'replace') => void;
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
  activeFileId: 'main.md',
  selectedContextIds: new Set<string>(),
  historyStack: [],
  redoStack: [],
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...initialState,

  setActiveProject: (project) =>
    set({
      activeProject: project,
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
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedContextIds: newSet };
    }),

  clearContext: () => set({ selectedContextIds: new Set() }),

  updateFileContent: (fileId, content) =>
    set((state) => {
      if (!state.activeProject) return state;

      const updatedFiles = state.activeProject.files.map((f) =>
        f.id === fileId ? { ...f, content } : f
      );

      return {
        activeProject: {
          ...state.activeProject,
          files: updatedFiles,
        },
      };
    }),

  updateSection: (fileId, sectionTitle, content, mode) =>
    set((state) => {
      if (!state.activeProject) return state;

      // Get the current file content from the latest state
      const currentFile = state.activeProject.files.find((f) => f.id === fileId);
      if (!currentFile) return state;

      const currentContent = currentFile.content;
      const regex = new RegExp(`(## ${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)([^#]*)`, 'i');
      const match = currentContent.match(regex);

      let newContent = currentContent;
      if (match) {
        if (mode === 'replace') {
          newContent = currentContent.replace(regex, `$1${content}\n`);
        } else {
          // append mode
          const currentSectionContent = match[2];
          if (!currentSectionContent.trim().endsWith(content.trim())) {
            newContent = currentContent.replace(regex, `$1$2\n${content}\n`);
          }
        }
      } else {
        // Section doesn't exist, append it
        newContent = currentContent + `\n\n## ${sectionTitle}\n${content}`;
      }

      const updatedFiles = state.activeProject.files.map((f) =>
        f.id === fileId ? { ...f, content: newContent } : f
      );

      return {
        activeProject: {
          ...state.activeProject,
          files: updatedFiles,
        },
      };
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
        activeProject: {
          ...state.activeProject,
          files: updatedFiles,
        },
        activeFileId:
          state.activeFileId === fileId ? 'main.md' : state.activeFileId,
      };
    }),

  pushHistory: (content) =>
    set((state) => ({
      historyStack: [...state.historyStack, content].slice(-50),
      redoStack: [],
    })),

  undo: () => {
    const state = get();
    if (state.historyStack.length === 0) return null;

    const previousState = state.historyStack[state.historyStack.length - 1];
    const newHistory = state.historyStack.slice(0, -1);

    // Get current content for redo
    const currentFile = state.activeProject?.files.find(
      (f) => f.id === state.activeFileId
    );
    const currentContent = currentFile?.content || '';

    set({
      historyStack: newHistory,
      redoStack: [...state.redoStack, currentContent],
    });

    return previousState;
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return null;

    const nextState = state.redoStack[state.redoStack.length - 1];
    const newRedo = state.redoStack.slice(0, -1);

    // Get current content for history
    const currentFile = state.activeProject?.files.find(
      (f) => f.id === state.activeFileId
    );
    const currentContent = currentFile?.content || '';

    set({
      historyStack: [...state.historyStack, currentContent],
      redoStack: newRedo,
    });

    return nextState;
  },

  reset: () => set(initialState),
}));
