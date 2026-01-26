// =============================================================================
// Claude Code Proxy API Client
// =============================================================================
// Connects to the proxy server to read Claude Code session files
// =============================================================================

import type {
  Project,
  Message,
  ContentBlock,
  ConnectionState,
} from '../types';

const PROXY_API_URL = import.meta.env.VITE_PROXY_API_URL || 'http://localhost:37287/api';

// -----------------------------------------------------------------------------
// Project API
// -----------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${PROXY_API_URL}/projects`);
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  const data = await response.json();
  return data.projects;
}

// -----------------------------------------------------------------------------
// Session/Message API
// -----------------------------------------------------------------------------

export async function fetchSessionMessages(sessionId: string): Promise<Message[]> {
  const response = await fetch(`${PROXY_API_URL}/sessions/${sessionId}/messages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }
  const data = await response.json();
  return parseMessages(data.messages);
}

// Parse raw session data into our Message format
function parseMessages(rawMessages: any[]): Message[] {
  const messages: Message[] = [];
  let currentAssistantMessage: Message | null = null;

  for (const item of rawMessages) {
    if (!item.type) continue;

    switch (item.type) {
      case 'user':
        messages.push({
          id: `user-${item.timestamp || Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'user',
          content: [{ type: 'text', text: item.message?.content?.[0]?.text || '' }],
          timestamp: item.timestamp || new Date(),
          status: 'complete',
        });
        break;

      case 'assistant':
        currentAssistantMessage = {
          id: `assistant-${item.timestamp || Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: [],
          timestamp: item.timestamp || new Date(),
          model: item.model || 'claude-sonnet-4-20250514',
          status: 'complete',
        };
        messages.push(currentAssistantMessage);

        // Parse content blocks
        if (item.message?.content) {
          for (const contentBlock of item.message.content) {
            if (contentBlock.type === 'text') {
              currentAssistantMessage.content.push({
                type: 'text',
                text: contentBlock.text,
              });
            } else if (contentBlock.type === 'tool_use') {
              currentAssistantMessage.content.push({
                type: 'tool_use',
                toolName: contentBlock.name,
                toolInput: contentBlock.input,
                toolStatus: 'running',
              });
            } else if (contentBlock.type === 'tool_result') {
              // Find the last tool_use and update it
              const lastToolUse = [...currentAssistantMessage.content].reverse().find(c => c.type === 'tool_use');
              if (lastToolUse) {
                lastToolUse.toolStatus = 'success';
              }
              // Add tool result
              currentAssistantMessage.content.push({
                type: 'tool_result',
                toolName: contentBlock.name,
                toolOutput: contentBlock.result || contentBlock.content,
                toolStatus: contentBlock.isError ? 'error' : 'success',
              });
            }
          }
        }
        currentAssistantMessage.status = 'complete';
        break;

      case 'progress':
        // Handle hook progress events (could be displayed as system messages)
        if (item.data?.type === 'hook_progress' || item.data?.type === 'SessionStart') {
          const hookName = item.data?.hookName || item.data?.command || 'System';
          messages.push({
            id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'system',
            content: [{ type: 'text', text: `[${hookName}]` }],
            timestamp: item.timestamp || new Date(),
          });
        }
        break;
    }
  }

  return messages;
}

// -----------------------------------------------------------------------------
// Streaming API (Server-Sent Events)
// -----------------------------------------------------------------------------

export function streamSessionUpdates(
  sessionId: string,
  callbacks: {
    onUpdate?: (data: any) => void;
    onError?: (error: string) => void;
  }
): () => void {
  const eventSource = new EventSource(`${PROXY_API_URL}/sessions/${sessionId}/stream`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      callbacks.onUpdate?.(data);
    } catch (e) {
      callbacks.onError?.('Parse error');
    }
  };

  eventSource.onerror = () => {
    callbacks.onError?.('Connection lost');
    eventSource.close();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

// -----------------------------------------------------------------------------
// Connection State
// -----------------------------------------------------------------------------

export async function getConnectionState(): Promise<ConnectionState> {
  try {
    const response = await fetch(`${PROXY_API_URL}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    const data = await response.json();
    return {
      status: 'connected',
      model: 'claude-sonnet-4-20250514',
      workingDirectory: data.projectsDir?.replace(/^.*\.claude\/projects\/-/, '/').replace(/-/g, '/'),
      branch: 'main',
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// -----------------------------------------------------------------------------
// Skills (read from filesystem via proxy would be implemented here)
// -----------------------------------------------------------------------------

// For now, use mock skills since we can't read the skills directory from browser
export const MOCK_SKILLS = [
  {
    name: 'Interview',
    keyword: 'interview',
    description: 'Interview you about project plans and goals',
    path: '/Users/james/.claude/skills/interview/skill.md',
  },
  {
    name: 'Issue Tracker',
    keyword: 'issue-tracker',
    description: 'Track and manage issues across conversations',
    path: '/Users/james/.claude/skills/issue-tracker/skill.md',
  },
  {
    name: 'UltraWork Lite',
    keyword: 'ulw',
    description: 'Orchestrate multi-agent workflows',
    path: '/Users/james/.claude/skills/ulw/skill.md',
  },
];

export function getSkills() {
  return MOCK_SKILLS;
}
