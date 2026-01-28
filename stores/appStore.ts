/**
 * App Store - UI State Management
 * Handles app mode, view state, and sidebar visibility
 */

import { create } from 'zustand';
import { AppMode, ViewState } from '../types';

interface AppStore {
  // State
  appMode: AppMode;
  viewState: ViewState;
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isLeftDrawerOpen: boolean;
  isRightDrawerOpen: boolean;
  leftSidebarWidth: number;
  rightSidebarWidth: number;

  // Actions
  setAppMode: (mode: AppMode) => void;
  setViewState: (view: ViewState) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  reset: () => void;
}

const initialState = {
  appMode: AppMode.RESEARCH,
  viewState: ViewState.DASHBOARD,
  isLeftSidebarCollapsed: false,
  isRightSidebarCollapsed: false,
  isLeftDrawerOpen: false,
  isRightDrawerOpen: false,
  leftSidebarWidth: 320,
  rightSidebarWidth: 360,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  setAppMode: (mode) => set({ appMode: mode }),
  
  setViewState: (view) => set({ viewState: view }),
  
  toggleLeftSidebar: () =>
    set((state) => ({ isLeftSidebarCollapsed: !state.isLeftSidebarCollapsed })),
  
  toggleRightSidebar: () =>
    set((state) => ({ isRightSidebarCollapsed: !state.isRightSidebarCollapsed })),
  
  setLeftDrawerOpen: (open) => set({ isLeftDrawerOpen: open }),
  
  setRightDrawerOpen: (open) => set({ isRightDrawerOpen: open }),
  
  setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
  
  setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
  
  reset: () => set(initialState),
}));
