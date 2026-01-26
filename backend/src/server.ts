import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { agentManager } from './agent-manager.js';
import { sessionManager } from './session-manager.js';
import { projectManager } from './project-manager.js';
import {
  ClientMessage,
  ServerMessage,
  AgentCreatedMessage,
  AgentDeletedMessage,
  AgentUpdatedMessage,
  LogMessage,
  AgentsMessage,
  SessionCreatedMessage,
  SessionLoadedMessage,
  SessionsListMessage,
  SessionDeletedMessage,
  SessionErrorMessage
} from './types.js';
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

    // Middleware
    this.app.use(express.json());

    // REST API endpoints (must come before static files and SPA catch-all)
    this.setupRestAPI();

    // Serve frontend static files
    const frontendDist = path.join(__dirname, '../../frontend/dist');
    this.app.use(express.static(frontendDist));

    // Fallback to index.html for SPA routing (must be last)
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

  // =============================================================================
  // REST API Endpoints
  // =============================================================================

  private setupRestAPI(): void {
    // =============================================================================
    // Project Endpoints
    // =============================================================================

    // GET /api/projects - List all projects
    this.app.get('/api/projects', (_req, res) => {
      try {
        const projects = projectManager.listProjects();
        res.json({ projects });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/projects/:id - Get specific project
    this.app.get('/api/projects/:id', (req, res) => {
      try {
        const projectId = req.params.id;
        const project = projectManager.getProject(projectId);

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        res.json({ project });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/projects/stats - Get project statistics
    this.app.get('/api/projects/stats', (_req, res) => {
      try {
        const stats = projectManager.getProjectStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/health - Health check endpoint
    this.app.get('/api/health', (_req, res) => {
      try {
        const stats = projectManager.getProjectStats();
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          projectsDir: projectManager.listProjects()[0]?.path || null,
          projectCount: stats.totalProjects,
          sessionCount: stats.totalSessions,
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: String(error)
        });
      }
    });

    // =============================================================================
    // Session Endpoints
    // =============================================================================

    // GET /api/sessions - List all sessions
    this.app.get('/api/sessions', (req, res) => {
      try {
        const projectPath = req.query.projectPath as string | undefined;
        const userId = req.query.userId as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const sessions = sessionManager.listSessions(projectPath, userId, limit);
        res.json({ sessions });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/sessions/:id - Get session details
    this.app.get('/api/sessions/:id', (req, res) => {
      try {
        const sessionId = req.params.id;
        const projectPath = req.query.projectPath as string | undefined;

        if (!projectPath) {
          return res.status(400).json({ error: 'projectPath query parameter is required' });
        }

        const messages = sessionManager.loadSession(sessionId, projectPath);
        const metadata = sessionManager.loadSessionMetadata(sessionId, projectPath);

        if (!metadata) {
          return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ sessionId, messages, metadata });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // POST /api/sessions - Create new session
    this.app.post('/api/sessions', (req, res) => {
      try {
        const { projectId, projectName, projectPath, userId } = req.body;

        if (!projectId || !projectName) {
          return res.status(400).json({ error: 'projectId and projectName are required' });
        }

        if (!projectPath) {
          return res.status(400).json({ error: 'projectPath is required' });
        }

        const session = sessionManager.createSession(projectId, projectName, projectPath, userId);
        res.json({ session });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // DELETE /api/sessions/:id - Delete session
    this.app.delete('/api/sessions/:id', (req, res) => {
      try {
        const sessionId = req.params.id;
        const projectPath = req.query.projectPath as string | undefined;

        if (!projectPath) {
          return res.status(400).json({ error: 'projectPath query parameter is required' });
        }

        const deleted = sessionManager.deleteSession(sessionId, projectPath);

        if (!deleted) {
          return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ success: true, sessionId });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // PUT /api/sessions/:id/title - Update session title
    this.app.put('/api/sessions/:id/title', (req, res) => {
      try {
        const sessionId = req.params.id;
        const { title, projectPath } = req.body;

        if (!title) {
          return res.status(400).json({ error: 'title is required' });
        }

        if (!projectPath) {
          return res.status(400).json({ error: 'projectPath is required' });
        }

        const updated = sessionManager.updateSessionTitle(sessionId, title, projectPath);

        if (!updated) {
          return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ success: true, sessionId, title });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // GET /api/sessions/stats - Get session statistics
    this.app.get('/api/sessions/stats', (_req, res) => {
      try {
        const stats = sessionManager.getSessionStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
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
    this.server.listen(PORT, () => {
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
