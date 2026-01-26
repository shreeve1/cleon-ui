// =============================================================================
// PromptInput Component (Chat-Style)
// =============================================================================
// Chat-style input area with send button
// Mobile-optimized with touch-friendly targets
// =============================================================================

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface PromptInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export default function PromptInput({
  onSend,
  disabled = false,
  isStreaming = false,
  placeholder = 'Type a message...',
}: PromptInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Auto-focus on mount (for desktop)
  useEffect(() => {
    if (window.innerWidth > 768 && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled || isStreaming) return;

    onSend(trimmed);
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const characterCount = input.length;
  const maxLength = 5000;

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      {/* Input area */}
      <div className="flex gap-2 items-end max-w-3xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isStreaming}
            className={`
              w-full resize-none rounded-xl px-4 py-3 text-sm
              bg-muted text-foreground
              placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-primary/50
              disabled:opacity-50 disabled:cursor-not-allowed
              min-h-[44px] max-h-[150px]
              transition-all duration-150
            `}
            rows={1}
            style={{
              // Prevent zoom on iOS
              fontSize: '16px',
            }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled || isStreaming || !input.trim()}
          className={`
            px-4 py-3 rounded-xl text-sm font-medium transition-all
            min-h-[44px] min-w-[44px] touch-manipulation
            flex items-center justify-center
            ${!disabled && !isStreaming && input.trim()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 cursor-pointer'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
            }
          `}
          aria-label="Send message"
        >
          {isStreaming ? (
            // Loading/spinner icon
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            // Send icon
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Helper text */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground max-w-3xl mx-auto">
        <span>
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd> to send,
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs ml-1">Shift+Enter</kbd> for newline
        </span>
        {characterCount > maxLength * 0.8 && (
          <span className={characterCount > maxLength ? 'text-destructive' : ''}>
            {characterCount}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}
