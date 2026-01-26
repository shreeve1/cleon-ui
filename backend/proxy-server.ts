// =============================================================================
// Claude Code Session Proxy Server
// =============================================================================
// Simple Express server that bridges the webUI to Claude Code session files
// =============================================================================

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 37287;
const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(process.env.HOME || '', '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// -----------------------------------------------------------------------------
// API Routes
// -----------------------------------------------------------------------------

// Get all projects
app.get('/api/projects', (req, res) => {
  try {
    const projects: any[] = [];

    // Read all project directories
    const projectDirs = fs.readdirSync(PROJECTS_DIR).filter(d =>
      fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory()
    );

    for (const dir of projectDirs) {
      const sessionsIndexPath = path.join(PROJECTS_DIR, dir, 'sessions-index.json');

      if (fs.existsSync(sessionsIndexPath)) {
        const indexData = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'));
        const originalPath = indexData.originalPath || dir.replace(/^-Users-/, '').replace(/-/g, '/');

        projects.push({
          id: dir,
          name: path.basename(originalPath) || dir,
          path: originalPath,
          sessions: indexData.entries || [],
          createdAt: indexData.entries?.[0]?.created,
          lastActivity: indexData.entries?.[0]?.modified,
        });
      }
    }

    res.json({ projects });
  } catch (error: any) {
    console.error('Error reading projects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session messages
app.get('/api/sessions/:sessionId/messages', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionPath = path.join(PROJECTS_DIR, sessionId, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const content = fs.readFileSync(sessionPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const messages = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    }).filter(msg => msg.type); // Filter out empty lines

    res.json({ messages });
  } catch (error: any) {
    console.error('Error reading session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send a message (append to session)
app.post('/api/sessions/:sessionId/messages', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, type = 'user' } = req.body;

    // For now, just acknowledge - the actual Claude Code CLI handles this
    // This endpoint is for when we want to inject messages into the session

    res.json({
      success: true,
      note: 'Message acknowledgment only - real integration needed'
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream session updates (Server-Sent Events)
app.get('/api/sessions/:sessionId/stream', (req, res) => {
  const { sessionId } = req.params;
  const sessionPath = path.join(PROJECTS_DIR, sessionId, `${sessionId}.jsonl`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial state
  try {
    if (fs.existsSync(sessionPath)) {
      const stats = fs.statSync(sessionPath);
      res.write(`data: ${JSON.stringify({ type: 'ready', size: stats.size })}}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session not found' })}}\n\n`);
    }
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}}\n\n`);
  }

  // Watch for file changes
  let lastSize = 0;
  try {
    lastSize = fs.existsSync(sessionPath) ? fs.statSync(sessionPath).size : 0;
  } catch {}

  const interval = setInterval(() => {
    try {
      if (!fs.existsSync(sessionPath)) {
        clearInterval(interval);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session deleted' })}}\n\n`);
        res.end();
        return;
      }

      const stats = fs.statSync(sessionPath);

      if (stats.size > lastSize) {
        // File grew, read new content
        const stream = fs.createReadStream(sessionPath, { start: lastSize, encoding: 'utf8' });

        stream.on('data', (chunk) => {
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              res.write(`data: ${JSON.stringify({ type: 'update', data })}}\n\n`);
            } catch (e) {
              // Skip unparseable lines
            }
          }
        });

        stream.on('end', () => {
          lastSize = stats.size;
        });
      }
    } catch (error: any) {
      // Ignore errors during polling
    }
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    claudeDir: CLAUDE_DIR,
    projectsDir: PROJECTS_DIR
  });
});

// -----------------------------------------------------------------------------
// WebSocket Server & CLI Integration
// -----------------------------------------------------------------------------

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Helper functions
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function extractResponseText(response: any): string {
  // Handle different Claude CLI output formats
  if (typeof response === 'string') {
    return response;
  }
  if (response.result) {
    return response.result;
  }
  if (response.message?.content) {
    return response.message.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  if (response.content) {
    return Array.isArray(response.content)
      ? response.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n')
      : String(response.content);
  }
  return JSON.stringify(response);
}

// WebSocket handlers
async function handleChatMessage(ws: WebSocket, message: any) {
  const messageId = generateMessageId();
  const userText = message.message || '';
  const projectId = message.projectId;

  console.log(`[Chat] User: ${userText.substring(0, 50)}...`);

  // Determine working directory
  let cwd = process.cwd();
  if (projectId) {
    const projectPath = path.join(PROJECTS_DIR, projectId);
    if (fs.existsSync(projectPath)) {
      const sessionsIndexPath = path.join(projectPath, 'sessions-index.json');
      if (fs.existsSync(sessionsIndexPath)) {
        try {
          const indexData = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'));
          if (indexData.originalPath && fs.existsSync(indexData.originalPath)) {
            cwd = indexData.originalPath;
          }
        } catch (e) {
          console.error('[Chat] Error reading project path:', e);
        }
      }
    }
  }

  // Spawn Claude CLI
  console.log(`[Chat] Spawning claude in: ${cwd}`);
  const claude = spawn('claude', ['--print', '--output-format', 'json'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Send user message to stdin
  claude.stdin.write(userText);
  claude.stdin.end();

  // Collect stdout
  let output = '';
  let errorOutput = '';

  claude.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });

  claude.stderr.on('data', (chunk) => {
    errorOutput += chunk.toString();
    console.error('[Claude CLI stderr]:', chunk.toString());
  });

  // Handle completion
  claude.on('close', (code) => {
    console.log(`[Chat] Claude CLI exited with code ${code}`);

    if (code !== 0) {
      ws.send(JSON.stringify({
        type: 'error',
        error: `Claude CLI exited with code ${code}: ${errorOutput || 'Unknown error'}`,
      }));
      return;
    }

    try {
      // Try to parse JSON response
      let text = '';

      if (output.trim()) {
        try {
          const response = JSON.parse(output);
          text = extractResponseText(response);
        } catch (parseError) {
          // If JSON parsing fails, use raw output
          console.log('[Chat] Non-JSON response, using raw output');
          text = output;
        }
      } else {
        text = 'Claude returned an empty response.';
      }

      console.log(`[Chat] Response: ${text.substring(0, 100)}...`);

      // Send message_complete
      ws.send(JSON.stringify({
        type: 'message_complete',
        messageId,
        message: {
          id: messageId,
          role: 'assistant',
          content: [{ type: 'text', text }],
          timestamp: new Date().toISOString(),
          model: 'claude-sonnet-4-5',
          status: 'complete',
        },
      }));
    } catch (error: any) {
      console.error('[Chat] Error processing response:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to parse Claude response: ${error.message}`,
      }));
    }
  });

  claude.on('error', (error) => {
    console.error('[Chat] Claude CLI spawn error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Claude CLI error: ${error.message}. Is Claude Code CLI installed?`,
    }));
  });
}

function handleListProjects(ws: WebSocket) {
  try {
    const projects: any[] = [];
    const projectDirs = fs.readdirSync(PROJECTS_DIR).filter(d =>
      fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory()
    );

    for (const dir of projectDirs) {
      const sessionsIndexPath = path.join(PROJECTS_DIR, dir, 'sessions-index.json');
      if (fs.existsSync(sessionsIndexPath)) {
        const indexData = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'));
        const originalPath = indexData.originalPath || dir.replace(/^-Users-/, '').replace(/-/g, '/');

        projects.push({
          id: dir,
          name: path.basename(originalPath) || dir,
          path: originalPath,
          sessions: indexData.entries || [],
          createdAt: indexData.entries?.[0]?.created,
          lastActivityAt: indexData.entries?.[0]?.modified,
          sessionCount: indexData.entries?.length || 0,
        });
      }
    }

    ws.send(JSON.stringify({ type: 'projects', projects }));
  } catch (error: any) {
    console.error('[ListProjects] Error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Failed to list projects: ${error.message}`,
    }));
  }
}

function handleGetStatus(ws: WebSocket) {
  ws.send(JSON.stringify({
    type: 'status',
    status: {
      status: 'connected',
      model: 'claude-sonnet-4-5',
      workingDirectory: process.cwd(),
      branch: 'main',
    },
  }));
}

function handleSwitchProject(ws: WebSocket, message: any) {
  const projectId = message.projectId;
  const projectPath = path.join(PROJECTS_DIR, projectId);

  if (!fs.existsSync(projectPath)) {
    ws.send(JSON.stringify({
      type: 'error',
      error: `Project not found: ${projectId}`,
    }));
    return;
  }

  try {
    const sessionsIndexPath = path.join(projectPath, 'sessions-index.json');
    if (fs.existsSync(sessionsIndexPath)) {
      const indexData = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'));
      const originalPath = indexData.originalPath || projectId;

      ws.send(JSON.stringify({
        type: 'status',
        status: {
          status: 'connected',
          model: 'claude-sonnet-4-5',
          workingDirectory: originalPath,
          branch: 'main',
        },
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'status',
        status: {
          status: 'connected',
          model: 'claude-sonnet-4-5',
          workingDirectory: projectPath,
          branch: 'main',
        },
      }));
    }
  } catch (error: any) {
    ws.send(JSON.stringify({
      type: 'error',
      error: `Failed to switch project: ${error.message}`,
    }));
  }
}

async function handleWebSocketMessage(ws: WebSocket, message: any) {
  switch (message.type) {
    case 'chat':
      await handleChatMessage(ws, message);
      break;
    case 'list_projects':
      handleListProjects(ws);
      break;
    case 'get_status':
      handleGetStatus(ws);
      break;
    case 'switch_project':
      handleSwitchProject(ws, message);
      break;
    default:
      ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${message.type}`,
      }));
  }
}

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Received: ${message.type}`);
      await handleWebSocketMessage(ws, message);
    } catch (error: any) {
      console.error('[WebSocket] Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: String(error.message || error),
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Claude Code Session Proxy running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
  console.log(`Projects directory: ${PROJECTS_DIR}`);
});
