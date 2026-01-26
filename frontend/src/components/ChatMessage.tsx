// =============================================================================
// ChatMessage Component
// =============================================================================
// Renders a single chat message with support for text, code, and tool use
// =============================================================================

import type { Message, ContentBlock } from '../types';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  const formatTimestamp = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderContentBlock = (block: ContentBlock, index: number) => {
    switch (block.type) {
      case 'text':
        return <TextContent key={index} text={block.text || ''} />;

      case 'code':
        return <CodeContent key={index} code={block.code || ''} language={block.language} />;

      case 'tool_use':
        return <ToolUseContent key={index} toolName={block.toolName || ''} toolInput={block.toolInput} status={block.toolStatus} />;

      case 'tool_result':
        return <ToolResultContent key={index} toolName={block.toolName || ''} output={block.toolOutput || ''} status={block.toolStatus} />;

      default:
        return null;
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
          {message.content[0]?.text}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col mb-4 ${isUser ? 'items-end' : 'items-start'} ${isAssistant && message.skillName ? 'skill-active' : ''}`}
    >
      {/* Message header with timestamp and optional skill name */}
      <div className={`flex items-center gap-2 mb-1 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(message.timestamp)}
        </span>
        {message.skillName && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            @{message.skillName}
          </span>
        )}
        {message.model && (
          <span className="text-xs text-muted-foreground">
            {message.model}
          </span>
        )}
      </div>

      {/* Message content */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}
      >
        {message.content.map((block, index) => renderContentBlock(block, index))}

        {/* Streaming indicator */}
        {message.status === 'streaming' && (
          <span className="inline-block ml-1 animate-pulse">▊</span>
        )}
      </div>

      {/* Error indicator */}
      {message.status === 'error' && message.error && (
        <div className="text-xs text-destructive mt-1 px-1">
          {message.error}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Content Block Components
// -----------------------------------------------------------------------------

function TextContent({ text }: { text: string }) {
  // Simple markdown-like rendering (can be enhanced with a proper library)
  const lines = text.split('\n');

  return (
    <div className="text-sm whitespace-pre-wrap break-words">
      {lines.map((line, i) => {
        // Bold text
        if (line.startsWith('**') || line.includes('**')) {
          const parts = line.split('**');
          return (
            <p key={i} className="my-1">
              {parts.map((part, j) =>
                j % 2 === 1 ? <strong key={j}>{part}</strong> : part
              )}
            </p>
          );
        }
        // Italic text
        if (line.includes('*')) {
          const parts = line.split('*');
          return (
            <p key={i} className="my-1">
              {parts.map((part, j) =>
                j % 2 === 1 ? <em key={j}>{part}</em> : part
              )}
            </p>
          );
        }
        // Code inline
        if (line.includes('`')) {
          const parts = line.split('`');
          return (
            <p key={i} className="my-1">
              {parts.map((part, j) =>
                j % 2 === 1 ? (
                  <code key={j} className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono">
                    {part}
                  </code>
                ) : (
                  part
                )
              )}
            </p>
          );
        }
        // Regular paragraph
        return line.trim() ? <p key={i} className="my-1">{line}</p> : <br key={i} />;
      })}
    </div>
  );
}

function CodeContent({ code, language }: { code: string; language?: string }) {
  return (
    <div className="my-2 rounded-lg overflow-hidden">
      <div className="bg-muted-foreground/20 px-3 py-1 text-xs text-muted-foreground flex items-center justify-between">
        <span className="font-mono">{language || 'code'}</span>
      </div>
      <pre className="bg-background/50 p-3 overflow-x-auto text-xs font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ToolUseContent({
  toolName,
  toolInput,
  status,
}: {
  toolName: string;
  toolInput?: Record<string, unknown>;
  status?: 'running' | 'success' | 'error';
}) {
  return (
    <div className="my-2 border-l-2 border-primary/50 pl-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono font-semibold text-primary">
          {toolName}
        </span>
        {status === 'running' && (
          <span className="text-xs text-muted-foreground animate-pulse">Running...</span>
        )}
      </div>
      {toolInput && (
        <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto font-mono">
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultContent({
  toolName,
  output,
  status,
}: {
  toolName: string;
  output: string;
  status?: 'running' | 'success' | 'error';
}) {
  const isSuccess = status === 'success';
  return (
    <div className={`my-2 border-l-2 pl-3 ${isSuccess ? 'border-green-500' : 'border-destructive'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono">
          {toolName}
        </span>
        <span className={`text-xs ${isSuccess ? 'text-green-600' : 'text-destructive'}`}>
          {isSuccess ? '✓' : '✗'} {status || 'done'}
        </span>
      </div>
      <pre className={`text-xs bg-background/50 p-2 rounded overflow-x-auto font-mono ${isSuccess ? '' : 'text-destructive'}`}>
        {output}
      </pre>
    </div>
  );
}
