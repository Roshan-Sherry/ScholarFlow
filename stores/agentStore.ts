/**
 * Agent Store - AI Agent State Management
 * Manages agent state, logs, and pending messages
 */

import { create } from 'zustand';
import { AgentState, type AgentLog } from '../types';

interface AgentStore {
  // State
  agentState: AgentState;
  agentLogs: AgentLog[];
  pendingMessage: string | null;
  isStreaming: boolean;

  // Actions
  setAgentState: (state: AgentState) => void;
  addAgentLog: (source: AgentLog['source'], message: string, status?: AgentLog['status']) => void;
  setPendingMessage: (message: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  
  // Avatar Speech
  avatarMessageToSpeak: string | null;
  setAvatarMessageToSpeak: (message: string | null) => void;

  clearLogs: () => void;
  reset: () => void;
}

const initialState = {
  agentState: AgentState.IDLE,
  agentLogs: [],
  pendingMessage: null,
  isStreaming: false,
};

export const useAgentStore = create<AgentStore>((set) => ({
  ...initialState,

  setAgentState: (state) => set({ agentState: state }),

  addAgentLog: (source, message, status = 'success') =>
    set((state) => ({
      agentLogs: [
        ...state.agentLogs,
        {
          id: Date.now().toString() + Math.random(),
          source,
          message,
          timestamp: new Date(),
          status,
        },
      ],
    })),

  setPendingMessage: (message) => set({ pendingMessage: message }),

  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  // Avatar Speech
  avatarMessageToSpeak: null,
  setAvatarMessageToSpeak: (message) => set({ avatarMessageToSpeak: message }),

  clearLogs: () => set({ agentLogs: [] }),

  reset: () => set(initialState),
}));
