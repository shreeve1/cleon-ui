# Cleon UI - Lightweight Web Interface Specification

> **Historical Note:** This project was originally developed under the name "Claude Lite" and was rebranded to "Cleon UI" in February 2025.

## Overview

A minimal, mobile-first web interface for Claude Code. Access your Claude Code sessions from any browser - phone, tablet, or desktop.

**Primary Use Case**: Remote access to Claude Code from mobile devices over local network.

## Goals

| Metric | Target |
|--------|--------|
| Load time | <1 second |
| Dependencies | ~8 production |
| Code size | ~500 lines backend, ~400 lines frontend |
| Mobile-first | Touch-friendly, responsive |

## Core Features

| Feature | Included | Notes |
|---------|----------|-------|
| Chat interface | Yes | Mobile-first, dark mode |
| Single-user auth | Yes | One account, username + password |
| Project search | Yes | Type path to find sessions |
| Resume sessions | Yes | Continue CLI-created sessions |
| Start new sessions | Yes | Create session for any project |
| Multiple tabs | Yes | Each browser tab = one session |
| Abort button | Yes | Cancel mid-response |
| Token usage | Yes | Show context window usage |
| Dark mode | Yes | Default theme |
| bypassPermissions | Yes | No permission prompts |
| File browser | No | Not needed |
| Terminal panel | No | Tool output inline in chat |
| PTY/interactive shell | No | Huge simplification |

## Architecture

```
cleon-ui/
├── package.json
├── server/
│   ├── index.js          # Express + WebSocket (~150 lines)
│   ├── auth.js           # Single-user JWT auth (~60 lines)
│   ├── projects.js       # Project/session discovery (~120 lines)
│   └── claude.js         # SDK wrapper (~150 lines)
└── public/
    ├── index.html        # Single page, no build
    ├── app.js            # Vanilla JS (~400 lines)
    └── style.css         # Mobile-first dark theme
```

## Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.29",
    "bcrypt": "^6.0.0",
    "better-sqlite3": "^12.2.0",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "ws": "^8.14.2"
  }
}
```

**Removed from original:**
- React, Vite, build process
- node-pty, xterm.js (no PTY terminal)
- CodeMirror (no file editor)
- Chokidar (no file watching)
- Multer (no uploads)
- cors (single origin)
- mime-types (no file serving)

---

## Backend Specification

### 1. server/index.js - Main Server

```javascript
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { authenticateToken, authenticateWebSocket, authRoutes } from './auth.js';
import { projectRoutes, searchProjects } from './projects.js';
import { handleChat, handleAbort } from './claude.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Project routes (protected)
app.use('/api/projects', authenticateToken, projectRoutes);

// WebSocket server
const wss = new WebSocketServer({
  server,
  verifyClient: (info) => {
    const url = new URL(info.req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const user = authenticateWebSocket(token);
    if (!user) return false;
    info.req.user = user;
    return true;
  }
});

wss.on('connection', (ws, req) => {
  console.log(`[WS] Connected: ${req.user.username}`);
  
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.type) {
        case 'chat':
          await handleChat(msg, ws);
          break;
        case 'abort':
          await handleAbort(msg.sessionId);
          break;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
```

### 2. server/auth.js - Single-User Authentication

Single user only. Account created on first registration, subsequent registrations disabled.

```javascript
import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import path from 'path';
import os from 'os';

const router = express.Router();

// Database in ~/.cleon-ui/
const dbDir = path.join(os.homedir(), '.cleon-ui');
const db = new Database(path.join(dbDir, 'auth.db'));

// Initialize
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Check if any user exists
function hasUser() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count > 0;
}

// POST /api/auth/register - First-time setup only
router.post('/register', async (req, res) => {
  if (hasUser()) {
    return res.status(403).json({ error: 'Registration disabled. User already exists.' });
  }
  
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  
  res.json({ success: true, message: 'Account created. Please log in.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

// GET /api/auth/status - Check if setup needed
router.get('/status', (req, res) => {
  res.json({ needsSetup: !hasUser() });
});

// Middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Token required' });
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
}

export function authenticateWebSocket(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export { router as authRoutes };
```

### 3. server/projects.js - Project & Session Discovery

Search by project path. Reads from `~/.claude/projects/`.

```javascript
import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const router = express.Router();
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');

// GET /api/projects/search?q=/path/to/project
router.get('/search', async (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  
  try {
    const entries = await fs.readdir(CLAUDE_PROJECTS, { withFileTypes: true });
    const projects = [];
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      // Decode project path from directory name
      const projectPath = '/' + entry.name.replace(/-/g, '/');
      
      // Filter by search query
      if (query && !projectPath.toLowerCase().includes(query)) continue;
      
      // Get session count
      const projectDir = path.join(CLAUDE_PROJECTS, entry.name);
      const files = await fs.readdir(projectDir);
      const sessions = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
      
      projects.push({
        name: entry.name,
        path: projectPath,
        displayName: path.basename(projectPath),
        sessionCount: sessions.length
      });
    }
    
    // Sort by path
    projects.sort((a, b) => a.path.localeCompare(b.path));
    res.json(projects.slice(0, 20)); // Limit results
    
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.json([]); // No projects yet
    } else {
      throw err;
    }
  }
});

// GET /api/projects/:name/sessions
router.get('/:name/sessions', async (req, res) => {
  const projectDir = path.join(CLAUDE_PROJECTS, req.params.name);
  
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
    
    // Get file stats and sort by modification time
    const sessions = await Promise.all(jsonlFiles.map(async (file) => {
      const filePath = path.join(projectDir, file);
      const stats = await fs.stat(filePath);
      const preview = await getSessionPreview(filePath);
      
      return {
        id: path.basename(file, '.jsonl'),
        file,
        lastModified: stats.mtime.toISOString(),
        preview
      };
    }));
    
    sessions.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    res.json(sessions.slice(0, 20));
    
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.json([]);
    } else {
      throw err;
    }
  }
});

// Extract first user message as preview
async function getSessionPreview(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    
    for (const line of lines.slice(0, 50)) { // Check first 50 entries
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' || entry.message?.role === 'user') {
          let text = entry.message?.content;
          if (Array.isArray(text)) text = text[0]?.text;
          if (typeof text === 'string' && text.length > 0 && !text.startsWith('<')) {
            return text.slice(0, 100) + (text.length > 100 ? '...' : '');
          }
        }
      } catch { /* skip malformed lines */ }
    }
    return 'New session';
  } catch {
    return 'New session';
  }
}

// GET /api/projects/:name/path - Get actual project path from sessions
router.get('/:name/path', async (req, res) => {
  const projectDir = path.join(CLAUDE_PROJECTS, req.params.name);
  
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFile = files.find(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
    
    if (!jsonlFile) {
      // Fallback: decode from directory name
      return res.json({ path: '/' + req.params.name.replace(/-/g, '/') });
    }
    
    const content = await fs.readFile(path.join(projectDir, jsonlFile), 'utf8');
    const lines = content.split('\n').filter(Boolean);
    
    for (const line of lines.slice(0, 20)) {
      try {
        const entry = JSON.parse(line);
        if (entry.cwd) {
          return res.json({ path: entry.cwd });
        }
      } catch { /* skip */ }
    }
    
    // Fallback
    res.json({ path: '/' + req.params.name.replace(/-/g, '/') });
    
  } catch {
    res.json({ path: '/' + req.params.name.replace(/-/g, '/') });
  }
});

export { router as projectRoutes };
```

### 4. server/claude.js - SDK Integration

**Important**: The SDK uses an async generator pattern, not callbacks.

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Track active sessions for abort
const activeSessions = new Map();

/**
 * Handle incoming chat message
 */
export async function handleChat(msg, ws) {
  const { content, projectPath, sessionId, isNewSession } = msg;
  
  // Build SDK options
  const options = {
    cwd: projectPath,
    permissionMode: 'bypassPermissions', // Skip all permission prompts
    systemPrompt: { type: 'preset', preset: 'claude_code' }
  };
  
  // Resume existing session
  if (sessionId && !isNewSession) {
    options.resume = sessionId;
  }
  
  // Load MCP servers from ~/.claude.json if exists
  const mcpServers = await loadMcpConfig();
  if (mcpServers) {
    options.mcpServers = mcpServers;
  }
  
  let currentSessionId = sessionId;
  let queryInstance;
  
  try {
    // Create SDK query - returns async generator
    queryInstance = query({
      prompt: content,
      options
    });
    
    // Process streaming messages
    for await (const message of queryInstance) {
      // Capture session ID from first message
      if (message.session_id && !currentSessionId) {
        currentSessionId = message.session_id;
        activeSessions.set(currentSessionId, queryInstance);
        
        ws.send(JSON.stringify({
          type: 'session-created',
          sessionId: currentSessionId
        }));
      }
      
      // Forward message to client
      ws.send(JSON.stringify({
        type: 'claude-message',
        sessionId: currentSessionId,
        data: transformMessage(message)
      }));
      
      // Extract token usage from result messages
      if (message.type === 'result' && message.modelUsage) {
        const usage = extractTokenUsage(message.modelUsage);
        if (usage) {
          ws.send(JSON.stringify({
            type: 'token-usage',
            sessionId: currentSessionId,
            ...usage
          }));
        }
      }
    }
    
    // Stream complete
    ws.send(JSON.stringify({
      type: 'claude-done',
      sessionId: currentSessionId
    }));
    
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'error',
      message: err.message
    }));
  } finally {
    if (currentSessionId) {
      activeSessions.delete(currentSessionId);
    }
  }
}

/**
 * Abort an active session
 */
export async function handleAbort(sessionId) {
  const queryInstance = activeSessions.get(sessionId);
  if (queryInstance?.interrupt) {
    await queryInstance.interrupt();
    activeSessions.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Transform SDK message for frontend
 * Simplify tool outputs - show minimal info
 */
function transformMessage(msg) {
  // Text content - pass through
  if (msg.type === 'text' || msg.type === 'assistant') {
    return msg;
  }
  
  // Tool use - simplify for display
  if (msg.type === 'tool_use') {
    return {
      type: 'tool_use',
      tool: msg.name,
      // Only include essential input info
      summary: getToolSummary(msg.name, msg.input)
    };
  }
  
  // Tool result - show condensed output
  if (msg.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool: msg.name,
      success: !msg.is_error,
      // Truncate long outputs
      output: truncateOutput(msg.content, 500)
    };
  }
  
  return msg;
}

/**
 * Generate human-readable tool summary
 */
function getToolSummary(tool, input) {
  switch (tool) {
    case 'Bash':
      return `$ ${input.command}`;
    case 'Read':
      return `Reading ${input.file_path}`;
    case 'Write':
      return `Writing ${input.file_path}`;
    case 'Glob':
      return `Searching: ${input.pattern}`;
    case 'Grep':
      return `Grep: ${input.pattern}`;
    default:
      return tool;
  }
}

function truncateOutput(content, maxLength) {
  if (typeof content !== 'string') return content;
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + `\n... (${content.length - maxLength} more chars)`;
}

/**
 * Extract token usage from model usage data
 */
function extractTokenUsage(modelUsage) {
  const modelKey = Object.keys(modelUsage)[0];
  const data = modelUsage[modelKey];
  if (!data) return null;
  
  const input = data.cumulativeInputTokens || data.inputTokens || 0;
  const output = data.cumulativeOutputTokens || data.outputTokens || 0;
  const cacheRead = data.cumulativeCacheReadInputTokens || 0;
  const cacheCreate = data.cumulativeCacheCreationInputTokens || 0;
  
  return {
    used: input + output + cacheRead + cacheCreate,
    contextWindow: parseInt(process.env.CONTEXT_WINDOW) || 200000
  };
}

/**
 * Load MCP servers from ~/.claude.json
 */
async function loadMcpConfig() {
  try {
    const configPath = path.join(os.homedir(), '.claude.json');
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    return config.mcpServers || null;
  } catch {
    return null;
  }
}
```

---

## Frontend Specification

### public/index.html

Mobile-first, single page, no build step.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1a1a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>Cleon UI</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <!-- Auth Screen -->
    <div id="auth-screen" class="screen">
      <div class="auth-container">
        <h1>Cleon UI</h1>
        <form id="auth-form">
          <input type="text" id="username" placeholder="Username" autocomplete="username" required>
          <input type="password" id="password" placeholder="Password" autocomplete="current-password" required>
          <button type="submit" id="auth-btn">Log In</button>
        </form>
        <p id="auth-error" class="error hidden"></p>
      </div>
    </div>

    <!-- Main Screen -->
    <div id="main-screen" class="screen hidden">
      <!-- Header -->
      <header id="header">
        <button id="menu-btn" class="icon-btn">&#9776;</button>
        <div id="session-info">
          <span id="project-name">No project</span>
          <span id="token-usage" class="hidden">0 / 200k</span>
        </div>
        <button id="abort-btn" class="icon-btn hidden" title="Stop">&#9632;</button>
      </header>

      <!-- Sidebar (project search) -->
      <aside id="sidebar" class="hidden">
        <div class="sidebar-header">
          <input type="text" id="project-search" placeholder="Search projects...">
        </div>
        <div id="project-list"></div>
        <div id="session-list" class="hidden"></div>
        <button id="new-session-btn" class="hidden">+ New Session</button>
      </aside>

      <!-- Chat -->
      <main id="chat">
        <div id="messages"></div>
        <form id="chat-form">
          <textarea id="chat-input" placeholder="Message Claude..." rows="1"></textarea>
          <button type="submit" id="send-btn">Send</button>
        </form>
      </main>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

### public/app.js

```javascript
// State
const state = {
  token: localStorage.getItem('token'),
  ws: null,
  currentProject: null,
  currentSession: null,
  isStreaming: false,
  messages: [],
  pendingMessage: '' // For streaming assistant response
};

// DOM Elements
const $ = (sel) => document.querySelector(sel);
const authScreen = $('#auth-screen');
const mainScreen = $('#main-screen');
const authForm = $('#auth-form');
const authError = $('#auth-error');
const authBtn = $('#auth-btn');
const menuBtn = $('#menu-btn');
const sidebar = $('#sidebar');
const projectSearch = $('#project-search');
const projectList = $('#project-list');
const sessionList = $('#session-list');
const newSessionBtn = $('#new-session-btn');
const chatForm = $('#chat-form');
const chatInput = $('#chat-input');
const messagesEl = $('#messages');
const abortBtn = $('#abort-btn');
const projectName = $('#project-name');
const tokenUsage = $('#token-usage');

// Initialize
async function init() {
  // Check if setup needed
  const status = await api('/api/auth/status');
  
  if (status.needsSetup) {
    authBtn.textContent = 'Create Account';
    authForm.dataset.mode = 'register';
  }
  
  if (state.token) {
    showMain();
  } else {
    showAuth();
  }
}

// Auth
function showAuth() {
  authScreen.classList.remove('hidden');
  mainScreen.classList.add('hidden');
}

function showMain() {
  authScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  connectWebSocket();
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value;
  const password = $('#password').value;
  const isRegister = authForm.dataset.mode === 'register';
  
  try {
    if (isRegister) {
      await api('/api/auth/register', { username, password });
      authBtn.textContent = 'Log In';
      authForm.dataset.mode = 'login';
      showError('Account created. Please log in.');
      return;
    }
    
    const { token } = await api('/api/auth/login', { username, password });
    state.token = token;
    localStorage.setItem('token', token);
    showMain();
  } catch (err) {
    showError(err.message);
  }
});

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

// WebSocket
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}?token=${state.token}`);
  
  state.ws.onopen = () => console.log('[WS] Connected');
  
  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };
  
  state.ws.onclose = () => {
    console.log('[WS] Disconnected, reconnecting...');
    setTimeout(connectWebSocket, 2000);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'session-created':
      state.currentSession = msg.sessionId;
      break;
      
    case 'claude-message':
      handleClaudeMessage(msg.data);
      break;
      
    case 'claude-done':
      finishStreaming();
      break;
      
    case 'token-usage':
      updateTokenUsage(msg.used, msg.contextWindow);
      break;
      
    case 'error':
      appendMessage('assistant', `Error: ${msg.message}`);
      finishStreaming();
      break;
  }
}

function handleClaudeMessage(data) {
  // Text content
  if (data.type === 'text' || data.type === 'assistant') {
    const text = data.content || data.text || '';
    state.pendingMessage += text;
    updateStreamingMessage();
    return;
  }
  
  // Tool use - show summary inline
  if (data.type === 'tool_use') {
    // Flush any pending text first
    if (state.pendingMessage) {
      appendMessage('assistant', state.pendingMessage);
      state.pendingMessage = '';
    }
    appendToolMessage(data.tool, data.summary, 'running');
    return;
  }
  
  // Tool result
  if (data.type === 'tool_result') {
    updateLastToolMessage(data.success, data.output);
    return;
  }
}

function updateStreamingMessage() {
  let streamingEl = messagesEl.querySelector('.streaming');
  if (!streamingEl) {
    streamingEl = document.createElement('div');
    streamingEl.className = 'message assistant streaming';
    messagesEl.appendChild(streamingEl);
  }
  streamingEl.innerHTML = formatMessage(state.pendingMessage);
  scrollToBottom();
}

function finishStreaming() {
  state.isStreaming = false;
  abortBtn.classList.add('hidden');
  
  // Finalize streaming message
  const streamingEl = messagesEl.querySelector('.streaming');
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
  }
  state.pendingMessage = '';
}

// Chat
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = chatInput.value.trim();
  if (!content || state.isStreaming) return;
  
  if (!state.currentProject) {
    alert('Please select a project first');
    return;
  }
  
  // Send message
  state.ws.send(JSON.stringify({
    type: 'chat',
    content,
    projectPath: state.currentProject.path,
    sessionId: state.currentSession,
    isNewSession: !state.currentSession
  }));
  
  appendMessage('user', content);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  state.isStreaming = true;
  abortBtn.classList.remove('hidden');
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
});

// Abort
abortBtn.addEventListener('click', () => {
  if (state.currentSession) {
    state.ws.send(JSON.stringify({
      type: 'abort',
      sessionId: state.currentSession
    }));
  }
});

// Sidebar
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
});

let searchTimeout;
projectSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchProjects(projectSearch.value), 300);
});

async function searchProjects(query) {
  const projects = await api(`/api/projects/search?q=${encodeURIComponent(query)}`);
  
  projectList.innerHTML = projects.map(p => `
    <div class="project-item" data-name="${p.name}" data-path="${p.path}">
      <span class="project-name">${p.displayName}</span>
      <span class="project-path">${p.path}</span>
      <span class="session-count">${p.sessionCount} sessions</span>
    </div>
  `).join('');
  
  // Click handlers
  projectList.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => selectProject(el.dataset.name, el.dataset.path));
  });
}

async function selectProject(name, path) {
  state.currentProject = { name, path };
  projectName.textContent = path.split('/').pop();
  
  // Load sessions
  const sessions = await api(`/api/projects/${name}/sessions`);
  
  sessionList.innerHTML = sessions.map(s => `
    <div class="session-item" data-id="${s.id}">
      <span class="session-preview">${s.preview}</span>
      <span class="session-date">${formatDate(s.lastModified)}</span>
    </div>
  `).join('');
  
  sessionList.classList.remove('hidden');
  newSessionBtn.classList.remove('hidden');
  
  // Click handlers
  sessionList.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => {
      state.currentSession = el.dataset.id;
      clearMessages();
      sidebar.classList.add('hidden');
    });
  });
}

newSessionBtn.addEventListener('click', () => {
  state.currentSession = null;
  clearMessages();
  sidebar.classList.add('hidden');
});

// Message rendering
function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = formatMessage(content);
  messagesEl.appendChild(div);
  scrollToBottom();
}

function appendToolMessage(tool, summary, status) {
  const div = document.createElement('div');
  div.className = `message tool ${status}`;
  div.innerHTML = `<span class="tool-name">${tool}</span> ${escapeHtml(summary)}`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function updateLastToolMessage(success, output) {
  const toolMsgs = messagesEl.querySelectorAll('.message.tool');
  const last = toolMsgs[toolMsgs.length - 1];
  if (last) {
    last.classList.remove('running');
    last.classList.add(success ? 'success' : 'error');
    if (output) {
      last.innerHTML += `<pre class="tool-output">${escapeHtml(output)}</pre>`;
    }
  }
}

function clearMessages() {
  messagesEl.innerHTML = '';
  state.messages = [];
  state.pendingMessage = '';
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatMessage(content) {
  // Basic markdown: code blocks, inline code, bold
  return escapeHtml(content)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 86400000) { // 24h
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString();
}

function updateTokenUsage(used, total) {
  tokenUsage.textContent = `${Math.round(used/1000)}k / ${Math.round(total/1000)}k`;
  tokenUsage.classList.remove('hidden');
}

// API helper
async function api(url, body = null) {
  const opts = {
    headers: {}
  };
  
  if (state.token) {
    opts.headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  if (body) {
    opts.method = 'POST';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  
  const res = await fetch(url, opts);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  
  return data;
}

// Start
init();
```

### public/style.css

Mobile-first dark theme.

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #1a1a1a;
  --bg-light: #252525;
  --bg-lighter: #333;
  --text: #e0e0e0;
  --text-dim: #888;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --user-bg: #3b82f6;
  --success: #22c55e;
  --error: #ef4444;
  --border: #333;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

.hidden { display: none !important; }

.screen {
  height: 100%;
  width: 100%;
}

/* Auth Screen */
#auth-screen {
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-container {
  width: 100%;
  max-width: 320px;
  padding: 20px;
}

.auth-container h1 {
  text-align: center;
  margin-bottom: 24px;
  font-size: 24px;
}

#auth-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#auth-form input {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-light);
  color: var(--text);
  font-size: 16px;
}

#auth-form button {
  padding: 12px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

#auth-form button:hover {
  background: var(--accent-hover);
}

.error {
  color: var(--error);
  text-align: center;
  margin-top: 12px;
  font-size: 14px;
}

/* Main Screen */
#main-screen {
  display: flex;
  flex-direction: column;
}

/* Header */
#header {
  display: flex;
  align-items: center;
  padding: 12px;
  background: var(--bg-light);
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.icon-btn {
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 20px;
  cursor: pointer;
  border-radius: 8px;
}

.icon-btn:hover {
  background: var(--bg-lighter);
}

#session-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

#project-name {
  font-weight: 600;
  font-size: 14px;
}

#token-usage {
  font-size: 12px;
  color: var(--text-dim);
}

#abort-btn {
  color: var(--error);
}

/* Sidebar */
#sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 300px;
  max-width: 85vw;
  height: 100%;
  background: var(--bg-light);
  z-index: 100;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

#project-search {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

#project-list, #session-list {
  flex: 1;
  overflow-y: auto;
}

.project-item, .session-item {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.project-item:hover, .session-item:hover {
  background: var(--bg-lighter);
}

.project-name, .session-preview {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
}

.project-path, .session-date {
  font-size: 12px;
  color: var(--text-dim);
}

.session-count {
  float: right;
  font-size: 12px;
  color: var(--text-dim);
}

#new-session-btn {
  margin: 12px;
  padding: 12px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

/* Chat */
#chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.message {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 12px;
  max-width: 85%;
  word-wrap: break-word;
}

.message.user {
  background: var(--user-bg);
  color: white;
  margin-left: auto;
  border-bottom-right-radius: 4px;
}

.message.assistant {
  background: var(--bg-light);
  border-bottom-left-radius: 4px;
}

.message.streaming::after {
  content: '|';
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.message.tool {
  background: var(--bg-lighter);
  font-size: 13px;
  padding: 8px 12px;
  font-family: monospace;
}

.message.tool.running {
  border-left: 3px solid var(--accent);
}

.message.tool.success {
  border-left: 3px solid var(--success);
}

.message.tool.error {
  border-left: 3px solid var(--error);
}

.tool-name {
  font-weight: bold;
  margin-right: 8px;
}

.tool-output {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.message code {
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.message pre {
  background: var(--bg);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.message pre code {
  background: none;
  padding: 0;
}

/* Chat Form */
#chat-form {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: var(--bg-light);
  border-top: 1px solid var(--border);
}

#chat-input {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 16px;
  resize: none;
  min-height: 44px;
  max-height: 150px;
}

#send-btn {
  padding: 12px 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

#send-btn:hover {
  background: var(--accent-hover);
}

/* Tablet+ */
@media (min-width: 768px) {
  #sidebar {
    position: relative;
    width: 280px;
  }
  
  #main-screen {
    flex-direction: row;
  }
  
  #main-screen > #sidebar {
    display: flex;
  }
  
  #header {
    display: none;
  }
  
  .message {
    max-width: 70%;
  }
}
```

---

## API Routes Summary

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/auth/status | No | Check if setup needed |
| POST | /api/auth/register | No | Create account (first time only) |
| POST | /api/auth/login | No | Login, get JWT |
| GET | /api/projects/search?q= | Yes | Search projects by path |
| GET | /api/projects/:name/sessions | Yes | List sessions for project |
| GET | /api/projects/:name/path | Yes | Get actual project path |
| WS | /?token= | Token | Chat & streaming |

## WebSocket Protocol

### Client to Server

```javascript
// Send message (new or resume session)
{
  type: 'chat',
  content: 'Hello Claude',
  projectPath: '/home/user/myproject',
  sessionId: 'abc123',      // null for new session
  isNewSession: false
}

// Abort current stream
{
  type: 'abort',
  sessionId: 'abc123'
}
```

### Server to Client

```javascript
// New session created
{ type: 'session-created', sessionId: 'abc123' }

// Claude message (text, tool use, tool result)
{ type: 'claude-message', sessionId: 'abc123', data: {...} }

// Stream complete
{ type: 'claude-done', sessionId: 'abc123' }

// Token usage update
{ type: 'token-usage', used: 5000, contextWindow: 200000 }

// Error
{ type: 'error', message: 'Something went wrong' }
```

---

## Testing Checklist

- [ ] First visit shows registration form
- [ ] Can create account and log in
- [ ] JWT persists across refreshes
- [ ] WebSocket connects with token
- [ ] Project search returns results
- [ ] Can select project and see sessions
- [ ] Can resume existing CLI session
- [ ] Can start new session
- [ ] Messages stream in real-time
- [ ] Tool executions show inline
- [ ] Abort button stops response
- [ ] Token usage updates
- [ ] Works on mobile (touch, responsive)
- [ ] Multiple browser tabs work independently
- [ ] Sessions created here work in CLI
- [ ] CLI sessions work here

---

## Key Differences from Full Claude UI

| Aspect | Full Version | Cleon UI |
|--------|--------------|-------------|
| Frontend | React + Vite | Vanilla JS |
| Build step | Required | None |
| Dependencies | ~50 | ~6 |
| Terminal | PTY + xterm.js | None (inline output) |
| File browser | Full tree + editor | None |
| Auth | Multi-user | Single user |
| Project discovery | List all | Search by path |
| Tool display | Detailed panels | Minimal inline |
| Mobile | Responsive | Mobile-first |
