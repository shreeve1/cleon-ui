// =============================================================================
// useChat Hook (Real CLI Integration)
// =============================================================================
// Manages chat state and connects to Claude Code via WebSocket
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { claudeCodeClient } from '../api/claude-code';
import type { Message, ContentBlock, ClientEvent } from '../types';

export interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (text: string, projectId?: string, skillName?: string) => void;
  clearMessages: () => void;
  getConnectionState: () => boolean;
  currentSessionId: string | null;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Connect to WebSocket and set up event listeners
  useEffect(() => {
    console.log('[useChat] Connecting to Claude Code WebSocket...');
    claudeCodeClient.connect();

    // Handle message delta (streaming)
    const unsubDelta = claudeCodeClient.on('message_delta', (event) => {
      const data = event.data as any;
      console.log('[useChat] message_delta:', data);

      setIsStreaming(true);
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.id === data.messageId) {
          // Update existing message
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: data.delta,
              status: 'streaming',
            },
          ];
        } else {
          // Create new assistant message
          return [
            ...prev,
            {
              id: data.messageId,
              role: 'assistant',
              content: data.delta,
              timestamp: new Date(),
              status: 'streaming',
            } as Message,
          ];
        }
      });
    });

    // Handle message complete
    const unsubComplete = claudeCodeClient.on('message_complete', (event) => {
      const data = event.data as any;
      console.log('[useChat] message_complete:', data);

      setIsStreaming(false);
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.id === data.messageId) {
          // Update existing message with complete data
          return [
            ...prev.slice(0, -1),
            {
              ...data.message,
              timestamp: new Date(data.message.timestamp),
            },
          ];
        } else {
          // Add new complete message
          return [
            ...prev,
            {
              ...data.message,
              timestamp: new Date(data.message.timestamp),
            },
          ];
        }
      });
    });

    // Handle errors
    const unsubError = claudeCodeClient.on('error', (event) => {
      const data = event.data as any;
      console.error('[useChat] error:', data);

      setIsStreaming(false);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: [{ type: 'text', text: `Error: ${data.error}` }],
          timestamp: new Date(),
          status: 'error',
          error: data.error,
        } as Message,
      ]);
    });

    // Handle connection
    const unsubConnected = claudeCodeClient.on('connected', () => {
      console.log('[useChat] WebSocket connected');
    });

    const unsubDisconnected = claudeCodeClient.on('disconnected', () => {
      console.log('[useChat] WebSocket disconnected');
    });

    // Cleanup
    return () => {
      unsubDelta();
      unsubComplete();
      unsubError();
      unsubConnected();
      unsubDisconnected();
    };
  }, []);

  // Send message to Claude Code
  const sendMessage = useCallback((text: string, projectId?: string, skillName?: string) => {
    if (!text.trim()) return;

    console.log('[useChat] Sending message:', text);

    // Create user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: new Date(),
      status: 'complete',
    };

    // Add user message to state
    setMessages(prev => [...prev, userMessage]);

    // Set streaming state
    setIsStreaming(true);

    // Send via WebSocket
    claudeCodeClient.sendMessage(text, projectId, skillName);
  }, []);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Get connection state
  const getConnectionState = useCallback(() => {
    return currentSessionId !== null;
  }, [currentSessionId]);

  return {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
    getConnectionState,
    currentSessionId,
  };
}
