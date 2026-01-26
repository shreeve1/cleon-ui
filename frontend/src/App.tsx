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
import { StatusBar } from './components/StatusBar';
import { useChat } from './hooks/useChat';
import { useProjects } from './hooks/useProjects';
import { useSkills } from './hooks/useSkills';
import { useConnection } from './hooks/useConnection';
import type { Skill } from './types';

function App() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Try-catch for hooks
  let messages, isStreaming, sendMessage, projects, selectedProject, selectProject, skills, insertSkill, connectionState, connected, connect;

  try {
    ({
      messages,
      isStreaming,
      sendMessage,
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

  // Handle sending messages
  const handleSend = (text: string) => {
    try {
      // Check if message starts with a skill keyword
      const skillMatch = text.match(/^[@\/](\w+)\s*/);
      const skillName = skillMatch ? skillMatch[1] : undefined;
      const cleanText = skillMatch ? text.replace(/^[@\/]\w+\s*/, '') : text;

      sendMessage(cleanText, selectedProject?.id, skillName);
    } catch (e) {
      console.error('Send error:', e);
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
            {/* Left: Project selector */}
            <div className="flex items-center gap-3">
              <ProjectSelector
                projects={projects}
                selectedProject={selectedProject}
                onSelectProject={selectProject}
              />
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
