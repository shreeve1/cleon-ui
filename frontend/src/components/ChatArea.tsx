// =============================================================================
// ChatArea Component
// =============================================================================
// Displays the chat message list with auto-scroll to latest
// =============================================================================

import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import { ChatMessage } from './ChatMessage';

interface ChatAreaProps {
  messages: Message[];
  isStreaming: boolean;
}

export function ChatArea({ messages, isStreaming }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = true;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth"
      style={{
        scrollBehavior: 'smooth',
      }}
    >
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="max-w-md">
            <h2 className="text-xl font-semibold mb-2">Claude Code WebUI</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Your mobile-friendly interface for Claude Code
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Select a project and start chatting</p>
              <p>Use skill buttons to activate specialized modes</p>
              <p>Full tool use support (bash, edit, read, grep, etc.)</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex items-start mb-4">
              <div className="bg-muted text-foreground rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex space-x-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="text-xs text-muted-foreground">Claude is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
