import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { agentManager } from './agent-manager';
import {
  ClientMessage,
  ServerMessage,
  AgentCreatedMessage,
  AgentDeletedMessage,
  AgentUpdatedMessage,
  LogMessage,
  AgentsMessage
} from './types';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5175;
const WS_PATH = '/ws';

export class Server {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: Set<WebSocket>;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.clients = new Set();

    // Serve frontend static files
    const frontendDist = path.join(__dirname, '../../frontend/dist');
    this.app.use(express.static(frontendDist));

    // Fallback to index.html for SPA routing
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });

    // Setup WebSocket server
    this.wss = new WebSocketServer({ server: this.server, path: WS_PATH });

    this.setupWebSocket();
    this.setupAgentManagerListeners();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');
      this.clients.add(ws);

      // Send initial agents list
      this.sendToClient(ws, {
        type: 'agents',
        agents: agentManager.listAgents()
      } as AgentsMessage);

      ws.on('message', (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Failed to parse message:', error);
          this.sendToClient(ws, {
            type: 'log',
            entry: {
              id: Date.now().toString(),
              timestamp: new Date(),
              type: 'SYSTEM',
              event: 'ERROR',
              content: `Failed to parse message: ${error}`,
              agentName: 'system'
            }
          } as LogMessage);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  private setupAgentManagerListeners(): void {
    agentManager.on('agent_created', (agent) => {
      this.broadcast({
        type: 'agent_created',
        agent
      } as AgentCreatedMessage);
    });

    agentManager.on('agent_deleted', (name) => {
      this.broadcast({
        type: 'agent_deleted',
        name
      } as AgentDeletedMessage);
    });

    agentManager.on('agent_updated', (name, updates) => {
      this.broadcast({
        type: 'agent_updated',
        name,
        updates
      } as AgentUpdatedMessage);
    });

    agentManager.on('log', (entry) => {
      this.broadcast({
        type: 'log',
        entry
      } as LogMessage);
    });
  }

  private handleClientMessage(ws: WebSocket, message: ClientMessage): void {
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'create_agent':
        try {
          const agent = agentManager.spawnAgent(
            message.name,
            message.systemPrompt,
            message.model
          );
          console.log(`Agent "${message.name}" created`);
        } catch (error) {
          this.sendToClient(ws, {
            type: 'log',
            entry: {
              id: Date.now().toString(),
              timestamp: new Date(),
              type: 'SYSTEM',
              event: 'ERROR',
              content: `Failed to create agent: ${error}`,
              agentName: 'system'
            }
          } as LogMessage);
        }
        break;

      case 'delete_agent':
        const deleted = agentManager.killAgent(message.name);
        if (deleted) {
          console.log(`Agent "${message.name}" deleted`);
        } else {
          this.sendToClient(ws, {
            type: 'log',
            entry: {
              id: Date.now().toString(),
              timestamp: new Date(),
              type: 'SYSTEM',
              event: 'ERROR',
              content: `Agent "${message.name}" not found`,
              agentName: 'system'
            }
          } as LogMessage);
        }
        break;

      case 'command_agent':
        const sent = agentManager.sendCommand(message.name, message.command);
        if (!sent) {
          this.sendToClient(ws, {
            type: 'log',
            entry: {
              id: Date.now().toString(),
              timestamp: new Date(),
              type: 'SYSTEM',
              event: 'ERROR',
              content: `Agent "${message.name}" not found`,
              agentName: 'system'
            }
          } as LogMessage);
        }
        break;

      case 'list_agents':
        this.sendToClient(ws, {
          type: 'agents',
          agents: agentManager.listAgents()
        } as AgentsMessage);
        break;

      default:
        console.warn('Unknown message type:', (message as any).type);
    }
  }

  private sendToClient(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  start(): void {
    this.server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`WebSocket endpoint: ws://0.0.0.0:${PORT}${WS_PATH}`);
    });
  }

  stop(): void {
    agentManager.shutdown();
    this.wss.close();
    this.server.close();
    console.log('Server stopped');
  }
}
