#!/usr/bin/env node

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { authRoutes, authenticateToken, authenticateWebSocket } from './auth.js';
import { projectRoutes } from './projects.js';
import { handleChat, handleAbort } from './claude.js';
import { getAllCommands } from './commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Express app
const app = express();
const server = http.createServer(app);

app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', authenticateToken, projectRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Commands API - get global and project slash commands
app.get('/api/commands', authenticateToken, async (req, res) => {
  try {
    const projectPath = req.query.projectPath || null;
    const commands = await getAllCommands(projectPath);
    res.json(commands);
  } catch (err) {
    console.error('[Commands] Error fetching commands:', err);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// WebSocket server
const wss = new WebSocketServer({
  server,
  verifyClient: (info) => {
    // Extract token from query string
    const url = new URL(info.req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    
    const user = authenticateWebSocket(token);
    if (!user) {
      console.log('[WS] Connection rejected: invalid token');
      return false;
    }

    // Attach user to request for later use
    info.req.user = user;
    return true;
  }
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const user = req.user;
  console.log(`[WS] Connected: ${user.username}`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'chat':
          await handleChat(msg, ws);
          break;

        case 'abort':
          const success = await handleAbort(msg.sessionId);
          ws.send(JSON.stringify({
            type: 'abort-result',
            sessionId: msg.sessionId,
            success
          }));
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.log(`[WS] Unknown message type: ${msg.type}`);
      }

    } catch (err) {
      console.error('[WS] Message handling error:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: err.message || 'Internal error'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Disconnected: ${user.username}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${user.username}:`, err.message);
  });
});

// Heartbeat to detect broken connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Claude Lite');
  console.log('  ───────────────────────────────');
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Network:  http://${HOST}:${PORT}`);
  console.log('');
  console.log('  Ready for connections');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
});
