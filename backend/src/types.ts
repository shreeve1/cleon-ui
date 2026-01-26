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

export type ClientMessage =
  | CreateAgentMessage
  | DeleteAgentMessage
  | CommandAgentMessage
  | ListAgentsMessage;

export type ServerMessage =
  | AgentCreatedMessage
  | AgentDeletedMessage
  | AgentUpdatedMessage
  | LogMessage
  | AgentsMessage;
