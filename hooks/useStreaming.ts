/**
 * Custom Hook for Streaming Chat/Workflow with SSE
 */

import { useState, useCallback } from 'react';
import { streamChatWorkflow, streamSectionDraft } from '../lib/api-client';
import type { ChatStreamPayload } from '../lib/api-client';
import { useAgentStore } from '../stores/agentStore';
import { AgentState } from '../types';

export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { setAgentState, addAgentLog, setIsStreaming: setStoreStreaming } = useAgentStore();

  const streamChat = useCallback(
    async (
      payload: ChatStreamPayload,
      onTextChunk?: (text: string) => void,
      onComplete?: (fullText: string) => void
    ) => {
      setIsStreaming(true);
      setStoreStreaming(true);
      setAgentState(AgentState.THINKING);
      setError(null);

      let accumulatedText = '';

      try {
        for await (const event of streamChatWorkflow(payload)) {
          console.log('Stream Event:', event); // DEBUG: Trace all incoming events
          if (event.type === 'log' && event.data) {
            addAgentLog(
              event.data.source || 'System',
              event.data.message || '',
              event.data.status || 'success'
            );
          } else if (['analyzing', 'searching', 'ranking', 'generating'].includes(event.type)) {
             // Map backend lifecycle events to logs
             addAgentLog('System', event.message || event.type, 'info');
          } else if (event.type === 'found') {
             addAgentLog('System', `Found ${event.count} relevant papers.`, 'success');
          } else if (event.type === 'analyzed') {
             // Optional: log or just ignore, the 'thought' log covers the details
          } else if (event.type === 'text' && event.data) {
            accumulatedText = event.data;
            if (onTextChunk) {
              onTextChunk(event.data);
            }
          } else if (event.type === 'complete') {
            setAgentState(AgentState.IDLE);
            
            // Check for structured answer from Mock Backend
            // @ts-ignore
            if (event.answer) {
                // Formatting Structured Answer to Markdown
                // @ts-ignore
                const ans = event.answer;
                let md = `### ${ans.summary}\n\n`;
                if (ans.key_points) {
                    md += `**Key Findings:**\n${ans.key_points.map((kp: string) => `- ${kp}`).join('\n')}\n\n`;
                }
                if (ans.explanation_steps) {
                    md += `**Reasoning:**\n${ans.explanation_steps.map((step: string, i: number) => `${i+1}. ${step}`).join('\n')}\n\n`;
                }
                 if (ans.recommended_actions) {
                    md += `**Recommendations:**\n${ans.recommended_actions.map((act: string) => `- ${act}`).join('\n')}\n\n`;
                }
                if (onComplete) onComplete(md);
            } else {
                // Standard Text Mode
                if (onComplete) onComplete(accumulatedText);
            }

          } else if (event.type === 'error') {
            setError(event.message || 'Unknown error');
            setAgentState(AgentState.IDLE);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Streaming failed';
        setError(errorMessage);
        addAgentLog('System', `Error: ${errorMessage}`, 'error');
        setAgentState(AgentState.IDLE);
      } finally {
        setIsStreaming(false);
        setStoreStreaming(false);
      }

      return accumulatedText;
    },
    [setAgentState, addAgentLog, setStoreStreaming]
  );

  return { streamChat, isStreaming, error };
}

export function useStreamingDraft() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { setAgentState, addAgentLog, setIsStreaming: setStoreStreaming } = useAgentStore();

  const streamDraft = useCallback(
    async (
      payload: ChatStreamPayload,
      onTextChunk?: (chunk: string) => void,
      onComplete?: (fullText: string) => void
    ) => {
      setIsStreaming(true);
      setStoreStreaming(true);
      setAgentState(AgentState.SPEAKING);
      setError(null);

      let accumulatedText = '';

      try {
        for await (const event of streamSectionDraft(payload)) {
          if (event.type === 'start') {
            addAgentLog('Writer', event.message || 'Starting draft...', 'pending');
          } else if (event.type === 'text_chunk' && event.data) {
            accumulatedText += event.data;
            if (onTextChunk) {
              onTextChunk(event.data);
            }
          } else if (event.type === 'complete') {
            if (event.data) {
              accumulatedText = event.data;
            }
            addAgentLog('Writer', 'Draft completed', 'success');
            setAgentState(AgentState.IDLE);
            if (onComplete) {
              onComplete(accumulatedText);
            }
          } else if (event.type === 'error') {
            setError(event.message || 'Unknown error');
            setAgentState(AgentState.IDLE);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Streaming failed';
        setError(errorMessage);
        addAgentLog('System', `Error: ${errorMessage}`, 'error');
        setAgentState(AgentState.IDLE);
      } finally {
        setIsStreaming(false);
        setStoreStreaming(false);
      }

      return accumulatedText;
    },
    [setAgentState, addAgentLog, setStoreStreaming]
  );

  return { streamDraft, isStreaming, error };
}
