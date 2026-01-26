// =============================================================================
// useChat Hook (Real CLI Integration)
// =============================================================================
// Manages chat state and connects to Claude Code via WebSocket
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { claudeCodeClient } from '../api/claude-code';
import type { Message, SessionMessage } from '../types';

export interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (text: string, projectId?: string, skillName?: string) => void;
  clearMessages: () => void;
  getConnectionState: () => boolean;
  currentSessionId: string | null;
  currentProjectPath: string | null;
  loadMessagesFromSession: (sessionMessages: SessionMessage[]) => void;
  setSessionId: (sessionId: string | null) => void;
  setProjectPath: (projectPath: string | null) => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);

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

  // =============================================================================
  // Session Integration
  // =============================================================================

  // Load messages from a session
  const loadMessagesFromSession = useCallback((sessionMessages: SessionMessage[]) => {
    const convertedMessages: Message[] = sessionMessages.map((msg, index) => ({
      id: `session-${index}-${Date.now()}`,
      role: msg.role,
      content: typeof msg.content === 'string'
        ? [{ type: 'text' as const, text: msg.content }]
        : msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      status: 'complete' as const,
      model: msg.model,
      skillName: msg.skillName,
    }));

    setMessages(convertedMessages);
    console.log('[useChat] Loaded', convertedMessages.length, 'messages from session');
  }, []);

  // Save message to backend session
  const saveMessageToSession = useCallback(async (message: Message) => {
    if (!currentSessionId || !currentProjectPath) {
      console.warn('[useChat] Cannot save message: missing sessionId or projectPath');
      return;
    }

    try {
      // Convert Message to SessionMessage format
      const sessionMessage: SessionMessage = {
        role: message.role,
        content: message.content,
        timestamp: message.timestamp instanceof Date
          ? message.timestamp.toISOString()
          : message.timestamp,
        model: message.model,
        skillName: message.skillName,
      };

      // Send via WebSocket
      claudeCodeClient.send({
        type: 'append_message',
        sessionId: currentSessionId,
        projectPath: currentProjectPath,
        message: sessionMessage,
      });
    } catch (error) {
      console.error('[useChat] Failed to save message to session:', error);
    }
  }, [currentSessionId, currentProjectPath]);

  // Auto-save messages to session
  useEffect(() => {
    if (messages.length === 0 || !currentSessionId) {
      return;
    }

    // Save the last message if it's complete
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.status === 'complete') {
      saveMessageToSession(lastMessage);
    }
  }, [messages, currentSessionId, saveMessageToSession]);

  // Set session ID
  const setSessionId = useCallback((sessionId: string | null) => {
    setCurrentSessionId(sessionId);
  }, []);

  // Set project path
  const setProjectPath = useCallback((projectPath: string | null) => {
    setCurrentProjectPath(projectPath);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
    getConnectionState,
    currentSessionId,
    currentProjectPath,
    loadMessagesFromSession,
    setSessionId,
    setProjectPath,
  };
}
