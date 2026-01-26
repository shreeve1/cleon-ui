// =============================================================================
// Claude Code API Client
// =============================================================================
// Communicates with Claude Code CLI via WebSocket
// Currently supports mock mode for development
// =============================================================================

import type {
  WSClientMessage,
  WSServerMessage,
  Project,
  Skill,
  ConnectionState,
  ContentBlock,
} from '../types';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const CLI_WS_URL = import.meta.env.VITE_WS_HOST || 'ws://localhost:37287';
const MOCK_MODE = false; // Disabled - using real Claude Code CLI

// -----------------------------------------------------------------------------
// Mock Data
// -----------------------------------------------------------------------------

const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'webui',
    path: '/Users/james/1-testytech/webui',
    branch: 'main',
    createdAt: new Date('2025-01-20'),
    lastActivityAt: new Date(),
    sessionCount: 5,
  },
  {
    id: '2',
    name: 'alway-on-ai-assistant',
    path: '/Users/james/1-testytech/alway-on-ai-assistant',
    branch: 'main',
    createdAt: new Date('2025-01-15'),
    lastActivityAt: new Date('2025-01-24'),
    sessionCount: 12,
  },
  {
    id: '3',
    name: 'hyperv',
    path: '/Users/james/1-testytech/HYPERV',
    branch: 'develop',
    createdAt: new Date('2025-01-10'),
    lastActivityAt: new Date('2025-01-23'),
    sessionCount: 8,
  },
];

const MOCK_SKILLS: Skill[] = [
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

const MOCK_CONNECTION_STATE: ConnectionState = {
  status: 'connected',
  model: 'claude-sonnet-4-5-20250514',
  workingDirectory: '/Users/james/1-testytech/webui',
  branch: 'main',
};

// -----------------------------------------------------------------------------
// Event Types
// -----------------------------------------------------------------------------

export type ClientEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'message_delta'
  | 'message_complete'
  | 'tool_use'
  | 'tool_result'
  | 'projects'
  | 'status';

export interface ClientEvent {
  type: ClientEventType;
  data?: unknown;
}

export type EventListener = (event: ClientEvent) => void;

// -----------------------------------------------------------------------------
// ClaudeCodeClient Class
// -----------------------------------------------------------------------------

class ClaudeCodeClient {
  private ws: WebSocket | null = null;
  private listeners: Map<ClientEventType, Set<EventListener>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private mockMode = MOCK_MODE;
  private mockMessageIndex = 0;

  constructor() {
    if (this.mockMode) {
      console.log('[ClaudeCodeClient] Running in MOCK mode');
    }
  }

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  connect(): void {
    if (this.mockMode) {
      console.log('[ClaudeCodeClient] Mock mode - simulating connection');
      setTimeout(() => {
        this.emit('connected');
        this.emit('status', { status: MOCK_CONNECTION_STATE });
        this.emit('projects', { projects: MOCK_PROJECTS });
      }, 100);
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[ClaudeCodeClient] Already connected');
      return;
    }

    console.log(`[ClaudeCodeClient] Connecting to ${CLI_WS_URL}`);
    this.ws = new WebSocket(CLI_WS_URL);

    this.ws.onopen = () => {
      console.log('[ClaudeCodeClient] Connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
      // Request initial state
      this.send({ type: 'get_status' });
      this.send({ type: 'list_projects' });
    };

    this.ws.onclose = () => {
      console.log('[ClaudeCodeClient] Disconnected');
      this.emit('disconnected');
      this.ws = null;
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[ClaudeCodeClient] WebSocket error:', error);
      this.emit('error', { error: 'WebSocket connection error' });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSServerMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error('[ClaudeCodeClient] Failed to parse message:', error);
      }
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ClaudeCodeClient] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[ClaudeCodeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => this.connect(), delay);
  }

  // -------------------------------------------------------------------------
  // Message Sending
  // -------------------------------------------------------------------------

  send(message: WSClientMessage): void {
    if (this.mockMode) {
      this.handleMockMessage(message);
      return;
    }

    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error('[ClaudeCodeClient] Cannot send message: not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  sendMessage(text: string, projectId?: string, skillName?: string): void {
    this.send({
      type: 'chat',
      message: text,
      projectId,
      skillName,
    });
  }

  listProjects(): void {
    this.send({ type: 'list_projects' });
  }

  switchProject(projectId: string): void {
    this.send({ type: 'switch_project', projectId });
  }

  getStatus(): void {
    this.send({ type: 'get_status' });
  }

  // -------------------------------------------------------------------------
  // Message Handling
  // -------------------------------------------------------------------------

  private handleMessage(message: WSServerMessage): void {
    switch (message.type) {
      case 'message_delta':
        this.emit('message_delta', message);
        break;
      case 'message_complete':
        this.emit('message_complete', message);
        break;
      case 'tool_use':
        this.emit('tool_use', message);
        break;
      case 'tool_result':
        this.emit('tool_result', message);
        break;
      case 'projects':
        this.emit('projects', message);
        break;
      case 'status':
        this.emit('status', message);
        break;
      case 'error':
        this.emit('error', message);
        break;
      default:
        console.warn('[ClaudeCodeClient] Unknown message type:', message.type);
    }
  }

  // -------------------------------------------------------------------------
  // Mock Mode Implementation
  // -------------------------------------------------------------------------

  private handleMockMessage(message: WSClientMessage): void {
    switch (message.type) {
      case 'chat':
        this.simulateChatResponse(message);
        break;
      case 'list_projects':
        setTimeout(() => this.emit('projects', { projects: MOCK_PROJECTS }), 100);
        break;
      case 'switch_project':
        setTimeout(() => {
          const project = MOCK_PROJECTS.find(p => p.id === (message as any).projectId);
          if (project) {
            this.emit('status', {
              status: {
                ...MOCK_CONNECTION_STATE,
                workingDirectory: project.path,
                branch: project.branch,
              },
            });
          }
        }, 100);
        break;
      case 'get_status':
        setTimeout(() => this.emit('status', { status: MOCK_CONNECTION_STATE }), 100);
        break;
    }
  }

  private simulateChatMessage(message: WSClientMessage): void {
    const messageId = `msg-${Date.now()}-${this.mockMessageIndex++}`;
    const input = (message as any).message || '';
    const skillName = (message as any).skillName;

    // Simulate thinking delay
    setTimeout(() => {
      // Detect skill usage
      const skill = MOCK_SKILLS.find(s => input.startsWith(`/${s.keyword}`) || input.startsWith(`@${s.keyword}`));

      // Generate mock response based on input
      let responseText = this.generateMockResponse(input, skill || (skillName ? MOCK_SKILLS.find(s => s.keyword === skillName) : undefined));

      const content: ContentBlock[] = [{ type: 'text', text: responseText }];

      this.emit('message_delta', {
        messageId,
        delta: content,
        status: 'streaming',
      });

      setTimeout(() => {
        this.emit('message_complete', {
          messageId,
          message: {
            id: messageId,
            role: 'assistant',
            content,
            timestamp: new Date(),
            model: 'claude-sonnet-4-5-20250514',
            skillName: skill?.keyword,
            status: 'complete',
          },
        });
      }, 500);
    }, 300);
  }

  private simulateChatResponse(message: WSClientMessage): void {
    this.simulateChatMessage(message);

    // Simulate tool use for certain commands
    const input = (message as any).message || '';
    if (input.includes('list') || input.includes('ls') || input.includes('find')) {
      const messageId = `tool-${Date.now()}`;
      setTimeout(() => {
        this.emit('tool_use', {
          messageId,
          toolName: 'bash',
          toolInput: { command: input },
          status: 'running',
        });

        setTimeout(() => {
          this.emit('tool_result', {
            messageId,
            toolName: 'bash',
            output: `Mock output for: ${input}`,
            status: 'success',
          });
        }, 500);
      }, 800);
    }
  }

  private generateMockResponse(input: string, skill?: Skill): string {
    if (skill) {
      return `**${skill.name} Skill Activated**

I understand you want to use the *${skill.name}* skill. ${skill.description}

In a real implementation, this would:
1. Load the skill context from \`${skill.path}\`
2. Inject the skill instructions as system context
3. Process your request with that context

Your input: "${input.replace(`/` + skill.keyword, '').replace(`@` + skill.keyword, '').trim()}"
`;
    }

    if (input.toLowerCase().includes('hello') || input.toLowerCase().includes('hi')) {
      return "Hello! I'm Claude Code, your AI programming assistant. How can I help you today?";
    }

    if (input.toLowerCase().includes('help')) {
      return `**Claude Code WebUI - Mock Mode**

This is a mock implementation for development. Available features:

• **Skills**: Type \`/interview\`, \`/issue-tracker\`, or \`/ulw\` to activate skills
• **Projects**: Switch between different projects using the dropdown
• **Chat**: Send messages and receive simulated responses

**To connect to the real Claude Code CLI:**
1. Set the CLI WebSocket URL
2. Disable mock mode
3. Restart the application
`;
    }

    return `I received your message: "${input}"

**Mock Mode Active**
This is a simulated response. In production, this would communicate with the Claude Code CLI via WebSocket to:
• Process your request with full context
• Execute tools (bash, edit, read, grep, etc.)
• Stream responses in real-time
• Track conversation history in the project session
`;
  }

  // -------------------------------------------------------------------------
  // Event Management
  // -------------------------------------------------------------------------

  on(event: ClientEventType, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  off(event: ClientEventType, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: ClientEventType, data?: unknown): void {
    this.listeners.get(event)?.forEach(listener => listener({ type: event, data }));
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  isConnected(): boolean {
    if (this.mockMode) return true;
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSkills(): Skill[] {
    return MOCK_SKILLS;
  }

  setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
    console.log(`[ClaudeCodeClient] Mock mode ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------

export const claudeCodeClient = new ClaudeCodeClient();

// -----------------------------------------------------------------------------
// Hook Factory
// ----------------------------------------------------------------------------

export interface UseClaudeCodeReturn {
  connected: boolean;
  connectionState: ConnectionState | null;
  projects: Project[];
  skills: Skill[];
  sendMessage: (text: string, projectId?: string, skillName?: string) => void;
  listProjects: () => void;
  switchProject: (projectId: string) => void;
  getStatus: () => void;
  connect: () => void;
  disconnect: () => void;
}

export function createUseClaudeCode() {
  return function useClaudeCode(): UseClaudeCodeReturn {
    // This will be implemented as a React hook in hooks/useClaudeCode.ts
    // For now, return the client methods directly
    return {
      connected: claudeCodeClient.isConnected(),
      connectionState: MOCK_CONNECTION_STATE,
      projects: MOCK_PROJECTS,
      skills: claudeCodeClient.getSkills(),
      sendMessage: (text, projectId, skillName) => claudeCodeClient.sendMessage(text, projectId, skillName),
      listProjects: () => claudeCodeClient.listProjects(),
      switchProject: (projectId) => claudeCodeClient.switchProject(projectId),
      getStatus: () => claudeCodeClient.getStatus(),
      connect: () => claudeCodeClient.connect(),
      disconnect: () => claudeCodeClient.disconnect(),
    };
  };
}
