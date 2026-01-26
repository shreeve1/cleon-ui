// =============================================================================
// Claude Code WebUI - Mobile Chat Interface
// =============================================================================
// Main app component with chat-style mobile-optimized layout
// =============================================================================

import { useEffect, useState } from 'react';
import { ChatArea } from './components/ChatArea';
import { SkillButtons } from './components/SkillButtons';
import PromptInput from './components/PromptInput';
import { ProjectSelector } from './components/ProjectSelector';
import { SessionSelector } from './components/SessionSelector';
import { StatusBar } from './components/StatusBar';
import { useChat } from './hooks/useChat';
import { useProjects } from './hooks/useProjects';
import { useSkills } from './hooks/useSkills';
import { useConnection } from './hooks/useConnection';
import { useSession } from './hooks/useSession';
import type { Skill, SessionMetadata } from './types';

function App() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Try-catch for hooks
  let messages, isStreaming, sendMessage, loadMessagesFromSession, setSessionId, setProjectPath, clearMessages;
  let projects, selectedProject, selectProject;
  let skills, insertSkill;
  let connectionState, connected, connect;
  let currentSession, sessions, createSession, loadSession, deleteSession, clearCurrentSession, listSessions;

  try {
    ({
      messages,
      isStreaming,
      sendMessage,
      loadMessagesFromSession,
      setSessionId,
      setProjectPath,
      clearMessages,
    } = useChat());

    ({
      projects,
      selectedProject,
      selectProject,
    } = useProjects());

    ({
      skills,
      insertSkill,
    } = useSkills());

    ({
      connectionState,
      connected,
      connect,
    } = useConnection());

    ({
      currentSession,
      sessions,
      createSession,
      loadSession,
      deleteSession,
      clearCurrentSession,
      listSessions,
    } = useSession());
  } catch (hookError) {
    console.error('Hook error:', hookError);
    return (
      <div style={{ padding: '20px', background: 'orange', color: 'black' }}>
        HOOK ERROR: {String(hookError)}
      </div>
    );
  }

  // Connect to Claude Code CLI on mount
  useEffect(() => {
    try {
      connect();
    } catch (e) {
      console.error('Connect error:', e);
      setError(String(e));
    }
  }, [connect]);

  // Reload sessions when project changes
  useEffect(() => {
    if (selectedProject) {
      listSessions(selectedProject.path, 10);
    }
  }, [selectedProject, listSessions]);

  // Session management handlers
  const handleNewSession = async () => {
    if (!selectedProject) {
      console.warn('[App] No project selected');
      return;
    }

    try {
      const session = await createSession(selectedProject.id, selectedProject.name, selectedProject.path);
      if (session) {
        setSessionId(session.id);
        setProjectPath(selectedProject.path);
        clearMessages();
        console.log('[App] Created new session:', session.id);
      }
    } catch (e) {
      console.error('[App] Failed to create session:', e);
      setError(String(e));
    }
  };

  const handleSelectSession = async (session: SessionMetadata | null) => {
    if (!session || !selectedProject) {
      clearCurrentSession();
      setSessionId(null);
      setProjectPath(null);
      clearMessages();
      return;
    }

    try {
      const result = await loadSession(session.id, selectedProject.path);
      if (result) {
        setSessionId(session.id);
        setProjectPath(selectedProject.path);
        loadMessagesFromSession(result.messages);
        console.log('[App] Loaded session:', session.id);
      }
    } catch (e) {
      console.error('[App] Failed to load session:', e);
      setError(String(e));
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!selectedProject) {
      console.warn('[App] No project selected');
      return;
    }

    try {
      await deleteSession(sessionId, selectedProject.path);
      console.log('[App] Deleted session:', sessionId);
    } catch (e) {
      console.error('[App] Failed to delete session:', e);
    }
  };

  // Handle sending messages
  const handleSend = async (text: string) => {
    console.log('[App] handleSend called:', { text, selectedProjectId: selectedProject?.id, currentSessionId: currentSession?.id });

    try {
      // Create session if one doesn't exist
      if (!currentSession && selectedProject) {
        console.log('[App] No session exists, creating one...');
        const session = await createSession(selectedProject.id, selectedProject.name, selectedProject.path);
        if (session) {
          setSessionId(session.id);
          setProjectPath(selectedProject.path);
          console.log('[App] Created session for message:', session.id);
        }
      }

      // Check if message starts with a skill keyword
      const skillMatch = text.match(/^[@\/](\w+)/);
      const skillName = skillMatch ? skillMatch[1] : undefined;

      console.log('[App] Detected skill:', { skillName, originalText: text });

      // Send the full text (including the slash command) to Claude
      // Claude Code CLI will handle skill invocation based on the skillName parameter
      sendMessage(text, selectedProject?.id, skillName);
    } catch (e) {
      console.error('[App] Send error:', e);
      setError(String(e));
    }
  };

  // Handle skill button click - inserts skill keyword into input
  const handleSkillClick = (skill: Skill) => {
    try {
      const newText = insertSkill(skill, input);
      setInput(newText);

      // Focus the input (desktop only)
      if (window.innerWidth > 768) {
        setTimeout(() => {
          const textarea = document.querySelector('textarea');
          textarea?.focus();
        }, 100);
      }
    } catch (e) {
      console.error('Skill click error:', e);
      setError(String(e));
    }
  };

  if (error) {
    return (
      <div style={{ padding: '20px', background: 'yellow', color: 'black' }}>
        ERROR: {error}
      </div>
    );
  }

  try {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: Project and Session selectors */}
            <div className="flex items-center gap-3">
              <ProjectSelector
                projects={projects}
                selectedProject={selectedProject}
                onSelectProject={selectProject}
              />
              <SessionSelector
                sessions={sessions}
                currentSession={currentSession}
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
                onDeleteSession={handleDeleteSession}
                disabled={!selectedProject}
              />
              <button
                onClick={handleNewSession}
                disabled={!selectedProject}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                New Session
              </button>
            </div>

            {/* Right: Title/branding */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Claude Code</span>
              {/* Connection status indicator */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                connected
                  ? 'bg-green-500/10 text-green-600'
                  : connectionState.status === 'connecting'
                  ? 'bg-yellow-500/10 text-yellow-600'
                  : 'bg-destructive/10 text-destructive'
              }`}>
                {connected ? '●' : '○'}
              </span>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <ChatArea
            messages={messages}
            isStreaming={isStreaming}
          />
        </div>

        {/* Skill Buttons */}
        <SkillButtons
          skills={skills}
          onSkillClick={handleSkillClick}
          disabled={isStreaming || !connected}
        />

        {/* Input Area */}
        <PromptInput
          onSend={handleSend}
          disabled={!connected}
          isStreaming={isStreaming}
          placeholder={
            !connected
              ? 'Connecting to Claude Code...'
              : isStreaming
              ? 'Claude is working...'
              : 'Type a message...'
          }
        />

        {/* Status Bar */}
        <StatusBar
          connectionState={connectionState}
          project={selectedProject}
        />
      </div>
    );
  } catch (renderError) {
    console.error('Render error:', renderError);
    return (
      <div style={{ padding: '20px', background: 'pink', color: 'black' }}>
        RENDER ERROR: {String(renderError)}
      </div>
    );
  }
}

export default App;
