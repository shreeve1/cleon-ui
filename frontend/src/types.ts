// =============================================================================
// Claude Code WebUI - Mobile Chat Types
// =============================================================================

// -----------------------------------------------------------------------------
// Message Types
// -----------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant' | 'system';

export type ContentType = 'text' | 'code' | 'tool_use' | 'tool_result';

export interface ContentBlock {
  type: ContentType;
  text?: string;
  code?: string;
  language?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: 'success' | 'error' | 'running';
}

export interface Message {
  id: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: Date | string;
  model?: string;
  skillName?: string;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  error?: string;
}

// -----------------------------------------------------------------------------
// Project Types
// -----------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  path: string;
  branch?: string;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  sessionCount?: number;
}

export interface SessionIndex {
  sessions: SessionEntry[];
}

export interface SessionEntry {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  branch?: string;
}

// -----------------------------------------------------------------------------
// Skill Types
// -----------------------------------------------------------------------------

export interface Skill {
  name: string;
  keyword: string;
  description: string;
  content?: string;
  path: string;
}

// -----------------------------------------------------------------------------
// API / Connection Types
// -----------------------------------------------------------------------------

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
  model?: string;
  workingDirectory?: string;
  branch?: string;
}

// -----------------------------------------------------------------------------
// Chat State Types
// -----------------------------------------------------------------------------

export interface ChatState {
  messages: Message[];
  input: string;
  isStreaming: boolean;
  selectedProject: Project | null;
  selectedSkill: Skill | null;
}

// -----------------------------------------------------------------------------
// Event Types (for client event listeners)
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
// WebSocket Message Types (for Claude Code CLI communication)
// -----------------------------------------------------------------------------

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

// Client -> CLI
export interface WSClientMessage extends WSMessage {
  type: 'chat' | 'list_projects' | 'switch_project' | 'get_status';
}

export interface WSChatMessage extends WSClientMessage {
  type: 'chat';
  message: string;
  projectId?: string;
  skillName?: string;
}

export interface WSListProjectsMessage extends WSClientMessage {
  type: 'list_projects';
}

export interface WSSwitchProjectMessage extends WSClientMessage {
  type: 'switch_project';
  projectId: string;
}

export interface WSGetStatusMessage extends WSClientMessage {
  type: 'get_status';
}

// CLI -> Client
export interface WSServerMessage extends WSMessage {
  type: 'message_delta' | 'message_complete' | 'tool_use' | 'tool_result' | 'error' | 'projects' | 'status';
}

export interface WSMessageDelta extends WSServerMessage {
  type: 'message_delta';
  messageId: string;
  delta: ContentBlock[];
  status?: 'pending' | 'streaming' | 'complete';
}

export interface WSMessageComplete extends WSServerMessage {
  type: 'message_complete';
  messageId: string;
  message: Message;
}

export interface WSToolUse extends WSServerMessage {
  type: 'tool_use';
  messageId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  status?: 'running';
}

export interface WSToolResult extends WSServerMessage {
  type: 'tool_result';
  messageId: string;
  toolName: string;
  output: string;
  status: 'success' | 'error';
}

export interface WSErrorMessage extends WSServerMessage {
  type: 'error';
  error: string;
}

export interface WSProjectsMessage extends WSServerMessage {
  type: 'projects';
  projects: Project[];
}

export interface WSStatusMessage extends WSServerMessage {
  type: 'status';
  status: ConnectionState;
}

// -----------------------------------------------------------------------------
// Legacy Types (for backward compatibility during transition)
// -----------------------------------------------------------------------------

export type AgentStatus = 'IDLE' | 'RUNNING' | 'ERROR' | 'STOPPED';

export type LogEventType = 'HOOK' | 'RESPONSE' | 'TOOL' | 'THINKING' | 'SYSTEM';

export interface LogEntry {
  id: string;
  timestamp: Date | string;
  type: LogEventType;
  event: string;
  content: string;
  agentName: string;
}
