export type AgentStatus = 'IDLE' | 'RUNNING' | 'ERROR' | 'STOPPED';

export type LogEventType = 'HOOK' | 'RESPONSE' | 'TOOL' | 'THINKING' | 'SYSTEM';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: LogEventType;
  event: string;
  content: string;
  agentName: string;
}

export interface Agent {
  name: string;
  status: AgentStatus;
  pid?: number;
  systemPrompt?: string;
  model?: string;
  contextTokens: number;
  contextLimit: number;
  cost: number;
  logs: LogEntry[];
  createdAt: Date;
  lastActivityAt: Date;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface CreateAgentMessage extends WebSocketMessage {
  type: 'create_agent';
  name: string;
  systemPrompt?: string;
  model?: string;
}

export interface DeleteAgentMessage extends WebSocketMessage {
  type: 'delete_agent';
  name: string;
}

export interface CommandAgentMessage extends WebSocketMessage {
  type: 'command_agent';
  name: string;
  command: string;
}

export interface ListAgentsMessage extends WebSocketMessage {
  type: 'list_agents';
}

export interface AgentCreatedMessage extends WebSocketMessage {
  type: 'agent_created';
  agent: Agent;
}

export interface AgentDeletedMessage extends WebSocketMessage {
  type: 'agent_deleted';
  name: string;
}

export interface AgentUpdatedMessage extends WebSocketMessage {
  type: 'agent_updated';
  name: string;
  updates: Partial<Agent>;
}

export interface LogMessage extends WebSocketMessage {
  type: 'log';
  entry: LogEntry;
}

export interface AgentsMessage extends WebSocketMessage {
  type: 'agents';
  agents: Agent[];
}

// =============================================================================
// Session Types
// =============================================================================

export interface SessionMetadata {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  source: 'webui' | 'cli';
  userId?: string;
}

export interface SessionContentBlock {
  type: 'text' | 'code' | 'tool_use' | 'tool_result';
  text?: string;
  code?: string;
  language?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: 'success' | 'error' | 'running';
}

export interface SessionMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: SessionContentBlock[] | string;
  timestamp?: string;
  model?: string;
  skillName?: string;
}

// Session WebSocket Messages - Client to Server
export interface CreateSessionMessage extends WebSocketMessage {
  type: 'create_session';
  projectId: string;
  projectName: string;
  projectPath: string;
  userId?: string;
}

export interface LoadSessionMessage extends WebSocketMessage {
  type: 'load_session';
  sessionId: string;
  projectPath: string;
}

export interface ListSessionsMessage extends WebSocketMessage {
  type: 'list_sessions';
  userId?: string;
  projectId?: string;
  projectPath?: string;
  limit?: number;
}

export interface DeleteSessionMessage extends WebSocketMessage {
  type: 'delete_session';
  sessionId: string;
  projectPath: string;
}

export interface AppendMessageMessage extends WebSocketMessage {
  type: 'append_message';
  sessionId: string;
  projectPath: string;
  message: SessionMessage;
}

export interface UpdateSessionTitleMessage extends WebSocketMessage {
  type: 'update_session_title';
  sessionId: string;
  title: string;
  projectPath: string;
}

// Session WebSocket Messages - Server to Client
export interface SessionCreatedMessage extends WebSocketMessage {
  type: 'session_created';
  session: SessionMetadata;
}

export interface SessionLoadedMessage extends WebSocketMessage {
  type: 'session_loaded';
  sessionId: string;
  messages: SessionMessage[];
  metadata: SessionMetadata;
}

export interface SessionsListMessage extends WebSocketMessage {
  type: 'sessions_list';
  sessions: SessionMetadata[];
}

export interface SessionDeletedMessage extends WebSocketMessage {
  type: 'session_deleted';
  sessionId: string;
}

export interface SessionErrorMessage extends WebSocketMessage {
  type: 'session_error';
  error: string;
  sessionId?: string;
}

export type ClientMessage =
  | CreateAgentMessage
  | DeleteAgentMessage
  | CommandAgentMessage
  | ListAgentsMessage
  | CreateSessionMessage
  | LoadSessionMessage
  | ListSessionsMessage
  | DeleteSessionMessage
  | AppendMessageMessage
  | UpdateSessionTitleMessage;

export type ServerMessage =
  | AgentCreatedMessage
  | AgentDeletedMessage
  | AgentUpdatedMessage
  | LogMessage
  | AgentsMessage
  | SessionCreatedMessage
  | SessionLoadedMessage
  | SessionsListMessage
  | SessionDeletedMessage
  | SessionErrorMessage;
