// =============================================================================
// useSession Hook
// =============================================================================
// Manages session state and persistence with CLI format support
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { SessionMetadata, SessionMessage } from '../types';

const API_BASE = '';  // Same origin as frontend
const STORAGE_KEY = 'claude_webui_current_session';

export interface UseSessionReturn {
  currentSession: SessionMetadata | null;
  sessions: SessionMetadata[];
  isLoading: boolean;
  error: string | null;
  createSession: (projectId: string, projectName: string, projectPath: string) => Promise<SessionMetadata | null>;
  loadSession: (sessionId: string, projectPath: string) => Promise<{ messages: SessionMessage[]; metadata: SessionMetadata } | null>;
  deleteSession: (sessionId: string, projectPath: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string, projectPath: string) => Promise<boolean>;
  listSessions: (projectPath?: string, limit?: number) => Promise<void>;
  clearCurrentSession: () => void;
}

export function useSession(): UseSessionReturn {
  const [currentSession, setCurrentSession] = useState<SessionMetadata | null>(null);
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current session from localStorage on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem(STORAGE_KEY);
    const savedProjectPath = localStorage.getItem(STORAGE_KEY + '_projectPath');
    if (savedSessionId && savedProjectPath) {
      loadSessionMetadata(savedSessionId, savedProjectPath);
    }
    listSessions(undefined, 10); // Load recent sessions
  }, []);

  // Save current session to localStorage
  useEffect(() => {
    if (currentSession) {
      localStorage.setItem(STORAGE_KEY, currentSession.id);
      // Note: projectPath needs to be saved separately
      // This will be handled by the component that calls createSession/loadSession
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + '_projectPath');
    }
  }, [currentSession]);

  // =============================================================================
  // Create Session
  // =============================================================================

  const createSession = useCallback(async (
    projectId: string,
    projectName: string,
    projectPath: string
  ): Promise<SessionMetadata | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectName,
          projectPath,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create session: ${response.statusText}`);
      }

      const data = await response.json();
      const session = data.session as SessionMetadata;

      setCurrentSession(session);
      setSessions(prev => [session, ...prev]);

      // Save projectPath for this session
      localStorage.setItem(STORAGE_KEY + '_projectPath', projectPath);

      console.log('[useSession] Created session:', session.id);
      return session;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error('[useSession] Create session error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // =============================================================================
  // Load Session
  // =============================================================================

  const loadSession = useCallback(async (
    sessionId: string,
    projectPath: string
  ): Promise<{ messages: SessionMessage[]; metadata: SessionMetadata } | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/api/sessions/${sessionId}?projectPath=${encodeURIComponent(projectPath)}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load session: ${response.statusText}`);
      }

      const data = await response.json();
      const { messages, metadata } = data;

      setCurrentSession(metadata);

      // Save projectPath for this session
      localStorage.setItem(STORAGE_KEY + '_projectPath', projectPath);

      console.log('[useSession] Loaded session:', sessionId, 'with', messages.length, 'messages');
      return { messages, metadata };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error('[useSession] Load session error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // =============================================================================
  // Load Session Metadata Only
  // =============================================================================

  const loadSessionMetadata = useCallback(async (sessionId: string, projectPath: string): Promise<void> => {
    try {
      const url = `${API_BASE}/api/sessions/${sessionId}?projectPath=${encodeURIComponent(projectPath)}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn('[useSession] Session not found:', sessionId);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + '_projectPath');
        return;
      }

      const data = await response.json();
      setCurrentSession(data.metadata);
    } catch (err) {
      console.error('[useSession] Load metadata error:', err);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + '_projectPath');
    }
  }, []);

  // =============================================================================
  // Delete Session
  // =============================================================================

  const deleteSession = useCallback(async (sessionId: string, projectPath: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/api/sessions/${sessionId}?projectPath=${encodeURIComponent(projectPath)}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete session: ${response.statusText}`);
      }

      // Remove from state
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // Clear current session if it was deleted
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
      }

      console.log('[useSession] Deleted session:', sessionId);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error('[useSession] Delete session error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentSession]);

  // =============================================================================
  // Update Session Title
  // =============================================================================

  const updateSessionTitle = useCallback(async (
    sessionId: string,
    title: string,
    projectPath: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/title`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, projectPath }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update session title: ${response.statusText}`);
      }

      // Update in state
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? { ...s, title } : s)
      );

      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, title } : null);
      }

      console.log('[useSession] Updated session title:', sessionId);
      return true;
    } catch (err) {
      console.error('[useSession] Update title error:', err);
      return false;
    }
  }, [currentSession]);

  // =============================================================================
  // List Sessions
  // =============================================================================

  const listSessions = useCallback(async (projectPath?: string, limit?: number): Promise<void> => {
    try {
      let url = `${API_BASE}/api/sessions?`;
      const params = new URLSearchParams();

      if (projectPath) params.append('projectPath', projectPath);
      if (limit) params.append('limit', limit.toString());

      url += params.toString();

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to list sessions: ${response.statusText}`);
      }

      const data = await response.json();
      setSessions(data.sessions || []);

      console.log('[useSession] Listed sessions:', data.sessions?.length || 0, 'for project:', projectPath);
    } catch (err) {
      console.error('[useSession] List sessions error:', err);
    }
  }, []);

  // =============================================================================
  // Clear Current Session
  // =============================================================================

  const clearCurrentSession = useCallback(() => {
    setCurrentSession(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY + '_projectPath');
  }, []);

  return {
    currentSession,
    sessions,
    isLoading,
    error,
    createSession,
    loadSession,
    deleteSession,
    updateSessionTitle,
    listSessions,
    clearCurrentSession,
  };
}
