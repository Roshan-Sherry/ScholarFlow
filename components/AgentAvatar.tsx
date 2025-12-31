import React from 'react';
import { AgentState } from '../types';

interface AgentAvatarProps {
  state: AgentState;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ state }) => {
  // We use CSS animations to simulate the "Blob" / "Orb" effect.
  // In a full production app, this might be a Three.js canvas.
  
  const getColor = () => {
    switch (state) {
      case AgentState.IDLE: return 'bg-gray-400 opacity-20';
      case AgentState.LISTENING: return 'bg-green-500 opacity-80';
      case AgentState.THINKING: return 'bg-blue-500 opacity-90';
      case AgentState.SPEAKING: return 'bg-purple-500 opacity-90';
      default: return 'bg-gray-400';
    }
  };

  const getAnimation = () => {
    switch (state) {
      case AgentState.IDLE: return 'animate-pulse';
      case AgentState.LISTENING: return 'scale-110 duration-300';
      case AgentState.THINKING: return 'animate-spin-slow';
      case AgentState.SPEAKING: return 'animate-bounce-slight'; // Custom bounce needed for "speaking"
      default: return '';
    }
  };

  return (
    <div className="relative flex items-center justify-center w-24 h-24 my-6">
       {/* Outer Glow */}
      <div className={`absolute w-full h-full rounded-full blur-xl transition-colors duration-500 ${getColor()}`} />
      
      {/* Core Orb */}
      <div className={`relative w-12 h-12 rounded-full transition-all duration-500 shadow-lg ${getColor()} ${getAnimation()} flex items-center justify-center`}>
        <div className="w-10 h-10 bg-white/30 rounded-full blur-sm" />
      </div>

      {/* Status Text */}
      <div className="absolute -bottom-4 text-[10px] uppercase tracking-widest font-semibold opacity-50 dark:text-white">
        {state}
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        @keyframes bounce-slight {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-slight {
          animation: bounce-slight 1s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};
