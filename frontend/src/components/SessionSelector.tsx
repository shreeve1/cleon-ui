// =============================================================================
// Session Selector Component
// =============================================================================
// Dropdown to select and manage conversation sessions
// =============================================================================

import { useState } from 'react';
import { SessionMetadata } from '../types';

interface SessionSelectorProps {
  sessions: SessionMetadata[];
  currentSession: SessionMetadata | null;
  onSelectSession: (session: SessionMetadata | null) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  disabled?: boolean;
}

export function SessionSelector({
  sessions,
  currentSession,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  disabled = false,
}: SessionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectSession = (session: SessionMetadata) => {
    onSelectSession(session);
    setIsOpen(false);
  };

  const handleNewSession = () => {
    onNewSession();
    setIsOpen(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (onDeleteSession && confirm('Delete this session?')) {
      onDeleteSession(sessionId);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border
          transition-colors text-sm font-medium
          ${disabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-background border-border hover:bg-accent hover:text-accent-foreground'
          }
        `}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
        <span className="truncate max-w-[150px]">
          {currentSession ? currentSession.title : 'No session'}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-background border border-border rounded-lg shadow-lg z-20">
            {/* New Session Button */}
            <button
              onClick={handleNewSession}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent transition-colors border-b border-border"
            >
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-medium">New Session</span>
            </button>

            {/* Session List */}
            {sessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No sessions yet
              </div>
            ) : (
              <div className="py-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    className={`
                      px-4 py-3 flex items-start gap-3 cursor-pointer
                      transition-colors hover:bg-accent group
                      ${currentSession?.id === session.id ? 'bg-accent/50' : ''}
                    `}
                  >
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {session.title}
                        </span>
                        {session.source === 'cli' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                            CLI
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{session.projectName}</span>
                        <span>•</span>
                        <span>{session.messageCount} msgs</span>
                        <span>•</span>
                        <span>{formatTimestamp(session.lastActivityAt)}</span>
                      </div>
                    </div>

                    {/* Delete Button */}
                    {onDeleteSession && session.source === 'webui' && (
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                      >
                        <svg
                          className="w-4 h-4 text-destructive"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
