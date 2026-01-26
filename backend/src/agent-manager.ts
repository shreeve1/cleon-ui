import { spawn, IPty } from 'node-pty';
import { Agent, AgentStatus, LogEntry, LogEventType } from './types.js';
import { EventEmitter } from 'events';

interface AgentProcess {
  agent: Agent;
  pty: IPty;
}

export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentProcess>;

  constructor() {
    super();
    this.agents = new Map();
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values()).map(({ agent }) => agent);
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name)?.agent;
  }

  spawnAgent(name: string, systemPrompt?: string, model?: string): Agent {
    if (this.agents.has(name)) {
      throw new Error(`Agent "${name}" already exists`);
    }

    const workingDir = process.cwd();

    // Build command args for Claude CLI
    const args = ['--print'];
    if (systemPrompt) {
      // We'll inject system prompt via stdin after spawn
    }

    const pty = spawn('claude', args, {
      name: 'xterm-color',
      cwd: workingDir,
      env: { ...process.env, CLAUDE_SYSTEM_PROMPT: systemPrompt || '' }
    });

    const now = new Date();
    const agent: Agent = {
      name,
      status: 'IDLE' as AgentStatus,
      pid: pty.pid,
      systemPrompt,
      model,
      contextTokens: 0,
      contextLimit: 200000,
      cost: 0,
      logs: [],
      createdAt: now,
      lastActivityAt: now
    };

    this.agents.set(name, { agent, pty });

    // Set up data handler for PTY output
    pty.onData((data) => {
      this.handleAgentOutput(name, data);
    });

    pty.onExit(({ exitCode }) => {
      this.handleAgentExit(name, exitCode);
    });

    // Send system prompt if provided
    if (systemPrompt) {
      pty.write(systemPrompt + '\n');
    }

    this.emit('agent_created', agent);
    return agent;
  }

  killAgent(name: string): boolean {
    const agentProcess = this.agents.get(name);
    if (!agentProcess) {
      return false;
    }

    agentProcess.pty.kill();
    this.agents.delete(name);
    this.emit('agent_deleted', name);
    return true;
  }

  sendCommand(name: string, command: string): boolean {
    const agentProcess = this.agents.get(name);
    if (!agentProcess) {
      return false;
    }

    agentProcess.pty.write(command + '\n');

    // Update agent state
    agentProcess.agent.status = 'RUNNING';
    agentProcess.agent.lastActivityAt = new Date();

    // Log the command
    this.addLogEntry(name, {
      id: this.generateId(),
      timestamp: new Date(),
      type: 'HOOK',
      event: 'USER_COMMAND',
      content: command,
      agentName: name
    });

    this.emit('agent_updated', name, agentProcess.agent);
    return true;
  }

  getAgentLogs(name: string, count: number = 100): LogEntry[] {
    const agent = this.agents.get(name)?.agent;
    if (!agent) {
      return [];
    }
    return agent.logs.slice(-count);
  }

  private handleAgentOutput(name: string, data: string): void {
    const agentProcess = this.agents.get(name);
    if (!agentProcess) {
      return;
    }

    // Update status
    agentProcess.agent.status = 'RUNNING';
    agentProcess.agent.lastActivityAt = new Date();

    // Parse output for events
    const events = this.parseOutput(data, name);

    for (const event of events) {
      this.addLogEntry(name, event);
      this.emit('log', event);
    }

    this.emit('agent_updated', name, agentProcess.agent);
  }

  private handleAgentExit(name: string, exitCode: number): void {
    const agentProcess = this.agents.get(name);
    if (!agentProcess) {
      return;
    }

    agentProcess.agent.status = exitCode === 0 ? 'STOPPED' : 'ERROR';
    agentProcess.agent.lastActivityAt = new Date();

    this.addLogEntry(name, {
      id: this.generateId(),
      timestamp: new Date(),
      type: 'SYSTEM',
      event: 'AGENT_EXIT',
      content: `Agent exited with code ${exitCode}`,
      agentName: name
    });

    this.emit('agent_updated', name, agentProcess.agent);
  }

  private addLogEntry(name: string, entry: LogEntry): void {
    const agentProcess = this.agents.get(name);
    if (!agentProcess) {
      return;
    }

    agentProcess.agent.logs.push(entry);

    // Keep only last 1000 logs per agent
    if (agentProcess.agent.logs.length > 1000) {
      agentProcess.agent.logs = agentProcess.agent.logs.slice(-1000);
    }
  }

  private parseOutput(data: string, agentName: string): LogEntry[] {
    const events: LogEntry[] = [];
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry: LogEntry = {
        id: this.generateId(),
        timestamp: new Date(),
        type: 'RESPONSE',
        event: 'OUTPUT',
        content: line,
        agentName
      };

      // Detect event patterns in Claude CLI output
      if (line.includes('<system-reminder>')) {
        entry.type = 'HOOK';
        entry.event = 'HOOK';
      } else if (line.includes('tool_use') || line.includes('ToolUse')) {
        entry.type = 'TOOL';
        entry.event = 'TOOL_CALL';
      } else if (line.includes('Thinking:') || line.includes('thought')) {
        entry.type = 'THINKING';
        entry.event = 'THINKING';
      } else if (line.match(/^\[.*\]/)) {
        // Tool call output format
        entry.type = 'TOOL';
        entry.event = 'TOOL_RESULT';
      }

      events.push(entry);
    }

    return events;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  shutdown(): void {
    for (const [name] of this.agents) {
      this.killAgent(name);
    }
  }
}

// Singleton instance
export const agentManager = new AgentManager();
