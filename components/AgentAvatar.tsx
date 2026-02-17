import React, { useState, useEffect, useRef } from 'react';
import { Video, X, Loader2, Signal } from 'lucide-react';
import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import { useAgentStore } from '../stores/agentStore';

interface AgentAvatarProps {
  state: string; // 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'
}

enum AgentState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ state }) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<any>(null);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.stopStreaming();
        clientRef.current = null;
      }
    };
  }, []);



  // -- NEW: Listen for Global Speech Events (e.g. from typed chat) --
  const { avatarMessageToSpeak, setAvatarMessageToSpeak } = useAgentStore();

  useEffect(() => {
    if (avatarMessageToSpeak && clientRef.current && isConnected) {
      try {
        console.log("Avatar speaking (global trigger):", avatarMessageToSpeak);
        clientRef.current.talk(avatarMessageToSpeak);
        setAvatarMessageToSpeak(null); // Clear after triggering
      } catch (e) {
        console.error("Failed to trigger avatar speech:", e);
      }
    }
  }, [avatarMessageToSpeak, isConnected, setAvatarMessageToSpeak]);

  const handleUserMessage = async (messageHistory: any[]) => {
    // Only respond to user messages
    if (messageHistory.length === 0 || messageHistory[messageHistory.length - 1].role !== 'user') {
      return;
    }

    if (!clientRef.current) return;

    try {
      console.log('User message received, querying internal agent...');

      // Create a streaming talk session
      const talkStream = clientRef.current.createTalkMessageStream();

      // Call our backend chat endpoint
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const response = await fetch(`${apiUrl}/avatar/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messageHistory.map(m => ({ role: m.role, content: m.content }))
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const textDecoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (talkStream.isActive()) talkStream.endMessage();
          break;
        }

        if (value) {
          const text = textDecoder.decode(value, { stream: true });
          const lines = text.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.content && talkStream.isActive()) {
                talkStream.streamMessageChunk(data.content);
              }
            } catch (e) {
              console.error("Error parsing NDJSON chunk", e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Agent chat error:', error);
      clientRef.current?.talk("I'm sorry, I'm having trouble connecting to my brain right now.");
    }
  };

  const startAvatar = async () => {
    setIsConnecting(true);
    try {
      // 1. Get Session Token
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(`${apiUrl}/avatar/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to get session token');
      }

      const { sessionToken } = await res.json();

      // 2. Init Client
      const client = createClient(sessionToken);
      clientRef.current = client;

      // 3. Stream to Video
      const videoId = 'anam-avatar-video-element';
      if (videoRef.current) {
        videoRef.current.id = videoId;
        try {
          await client.streamToVideoElement(videoId);
          setIsConnected(true);
          console.log("Anam.ai avatar connected successfully");

          // 4. Listen for User Speech
          client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (newHistory: any[]) => {
            // Check if the last message is a completed user message
            // The SDK updates history as user speaks, but we want to trigger ONLY when they are done.
            // For this simple implementation, we can just check if the last message is 'user' and different from what we last processed?
            // Actually, `handleUserMessage` handles the call logic. We just need to trigger it.
            // To avoid spamming while streaming (transcript updates), we might need debouncing or checking specific flags.
            // Assuming the SDK sends final user message here:

            const lastMsg = newHistory[newHistory.length - 1];
            if (lastMsg && lastMsg.role === 'user') {
              // Simple debounce/check mechanism could be added here if needed
              // For now, let's call the handler.
              // Note: We need to ensure we don't trigger on *our* own assistant messages being added.
              handleUserMessage(newHistory);
            }
          });

        } catch (streamError) {
          console.error("Streaming error:", streamError);
          throw streamError;
        }
      }
    } catch (e) {
      console.error("Avatar connection failed:", e);
      alert("Failed to connect avatar. Please check your API key configuration.");
    } finally {
      setIsConnecting(false);
    }
  };

  const stopAvatar = () => {
    if (clientRef.current) {
      if (clientRef.current.stop) {
        try {
          clientRef.current.stop();
        } catch (e) { console.error("Error stopping avatar:", e); }
      }
      if (clientRef.current.removeAllListeners) {
        clientRef.current.removeAllListeners();
      }
    }
    clientRef.current = null;
    setIsConnected(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current && clientRef.current.stop) {
        try {
          clientRef.current.stop();
        } catch (e) { }
      }
    }
  }, []);

  return (
    <div className={`relative flex items-center justify-center transition-all duration-500 ${isConnected ? 'w-48 h-48 my-0' : 'w-24 h-24 my-6'}`}>

      {/* AVATAR MODE */}
      {/* AVATAR LAYER (Always rendered for ref availability) */}
      <div className={`absolute inset-0 w-full h-full transition-opacity duration-700 ${isConnected ? 'opacity-100 z-20' : 'opacity-0 z-[-1] pointer-events-none'}`}>
        <div className="relative w-full h-full bg-black rounded-full overflow-hidden border-2 border-indigo-500/50 shadow-[0_0_30px_rgba(79,70,229,0.3)]">
          <video
            ref={videoRef}
            id="anam-avatar-video-element"
            autoPlay
            playsInline
            className="w-full h-full object-cover transform scale-125"
          />

          {/* Controls Overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={stopAvatar}
              className="p-2 bg-red-600/80 text-white rounded-full hover:bg-red-500 transition-transform hover:scale-110"
              title="Disconnect Avatar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Status Indicator */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 bg-black/60 backdrop-blur rounded-full border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[8px] font-bold text-gray-300 tracking-wider">LIVE</span>
          </div>
        </div>
      </div>

      {/* BLOB LAYER (Fallback) */}
      <div className={`relative w-full h-full flex items-center justify-center group transition-opacity duration-500 ${isConnected ? 'opacity-0 z-[-1]' : 'opacity-100 z-10'}`}>
        {/* Outer Glow */}
        <div className={`absolute w-full h-full rounded-full blur-xl transition-colors duration-500 ${getColor()}`} />

        {/* Core Orb */}
        <div className={`relative w-12 h-12 rounded-full transition-all duration-500 shadow-lg ${getColor()} ${getAnimation()} flex items-center justify-center`}>
          <div className="w-10 h-10 bg-white/30 rounded-full blur-sm" />
        </div>

        {/* Status Text (Existing) */}
        <div className="absolute -bottom-6 text-[10px] uppercase tracking-widest font-semibold opacity-50 dark:text-white whitespace-nowrap">
          {state}
        </div>

        {/* Connect Overlay (Hover) */}
        <button
          onClick={startAvatar}
          disabled={isConnecting}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 focus:outline-none"
          title="Connect Real-Time Avatar"
        >
          <div className="bg-black/80 backdrop-blur-sm text-white rounded-full p-2 shadow-xl border border-indigo-500/50 transform group-hover:scale-110 transition-transform">
            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Video className="w-4 h-4 text-indigo-400" />}
          </div>
        </button>
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
