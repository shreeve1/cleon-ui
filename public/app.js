// Constants
const MAX_ATTACHMENTS = 5;
const PREVIEW_TRUNCATE_LENGTH = 100;
const TOOL_COMMAND_PREVIEW_LENGTH = 80;
const WS_RECONNECT_MAX_DELAY = 30000;
const SEARCH_DEBOUNCE_MS = 300;

const MAX_SESSIONS = 5;

const state = {
  token: localStorage.getItem('token'),
  ws: null,
  wsReconnectAttempts: 0,
  notificationsEnabled: false,
  // Multi-session state
  sessions: [],              // Array of session objects
  activeSessionIndex: -1,    // Index into sessions array, -1 = none
  // UI state (shared across sessions)
  modeIndex: 2,
  currentMode: 'bypass',
  searchTimeout: null,
  customCommands: [],
  sessionsRestored: false,
  forceNewTab: false
};

// Session object factory
function createSession(project, sessionId = null) {
  return {
    id: crypto.randomUUID(),          // Internal tab ID
    sessionId: sessionId,              // Claude SDK session ID (null = new)
    project: project,                  // { name, path, displayName }
    isStreaming: false,
    pendingText: '',
    pendingQuestion: null,
    attachments: [],
    lastTokenUsage: null,
    lastContextWindow: null,
    model: null,
    hasUnread: false,
    needsHistoryLoad: false,
    containerEl: null,                 // DOM reference
    // File mention state (per-session)
    fileMentionSelectedIndex: 0,
    fileMentionQuery: '',
    fileMentionStartPos: -1,
    fileMentionDebounceTimer: null,
    slashCommandSelectedIndex: -1,
    unreadCount: 0,
    isAtBottom: true
  };
}

function getActiveSession() {
  if (state.activeSessionIndex < 0 || state.activeSessionIndex >= state.sessions.length) return null;
  return state.sessions[state.activeSessionIndex];
}

function getSessionByInternalId(id) {
  return state.sessions.find(s => s.id === id) || null;
}

function getSessionBySessionId(sessionId) {
  return state.sessions.find(s => s.sessionId === sessionId) || null;
}

function createSessionContainer(session) {
  const container = document.createElement('div');
  container.className = 'session-container';
  container.dataset.sessionId = session.id;
  document.getElementById('session-containers').appendChild(container);
  session.containerEl = container;
  container.addEventListener('scroll', () => {
    const session = state.sessions.find(s => s.containerEl === container);
    if (!session) return;
    const threshold = 100;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    session.isAtBottom = atBottom;
    if (atBottom) {
      session.unreadCount = 0;
      updateScrollFAB(session);
    }
  });
  return container;
}

function renderSessionBar() {
  if (state.sessions.length === 0) {
    sessionBarEl.classList.remove('visible');
    return;
  }
  sessionBarEl.classList.add('visible');
  sessionTabsEl.innerHTML = state.sessions.map((s, i) => `
    <button class="session-tab${i === state.activeSessionIndex ? ' active' : ''}${s.hasUnread ? ' unread' : ''}" data-index="${i}">
      <span class="session-tab-number">[${i + 1}]</span>
      <span class="session-tab-name">${escapeHtml(s.project.displayName || s.project.name)}</span>
      <span class="close-tab" title="Close session">&times;</span>
    </button>
  `).join('');
}

function switchToSession(index) {
  if (index < 0 || index >= state.sessions.length) return;
  if (index === state.activeSessionIndex) return;

  const currentSession = getActiveSession();
  if (currentSession) {
    currentSession.containerEl.classList.remove('active');
    hideSlashCommands();
    hideFileMentions();
    clearTimeout(currentSession.fileMentionDebounceTimer);
  }

  state.activeSessionIndex = index;
  const newSession = getActiveSession();

  newSession.containerEl.classList.add('active');
  newSession.hasUnread = false;

  // Lazy-load message history for restored sessions
  if (newSession.needsHistoryLoad) {
    loadSessionHistory(newSession);
  }

  if (newSession.isStreaming) {
    abortBtn.classList.remove('hidden');
    chatInput.disabled = true;
    sendBtn.disabled = true;
    modeBtn.disabled = true;
    attachBtn.disabled = true;
  } else {
    abortBtn.classList.add('hidden');
    chatInput.disabled = false;
    sendBtn.disabled = false;
    modeBtn.disabled = false;
    attachBtn.disabled = false;
  }

  projectNameEl.textContent = newSession.project.displayName || newSession.project.name;
  updateTokenUsage(newSession.lastTokenUsage, newSession.lastContextWindow, newSession);
  renderAttachmentPreview();
  updateHash(newSession.project.name, newSession.sessionId);
  renderSessionBar();
  updateScrollFAB(newSession);
  saveSessionState();
  if (!newSession.isStreaming) chatInput.focus();
}

function closeSession(index) {
  if (index < 0 || index >= state.sessions.length) return;
  const session = state.sessions[index];

  // Abort if streaming
  if (session.isStreaming && session.sessionId) {
    state.ws.send(JSON.stringify({ type: 'abort', sessionId: session.sessionId }));
  }

  // Clean up timers
  clearTimeout(session.fileMentionDebounceTimer);

  // Remove DOM container
  if (session.containerEl) session.containerEl.remove();

  // Remove from array
  state.sessions.splice(index, 1);

  // Adjust active index
  if (state.sessions.length === 0) {
    state.activeSessionIndex = -1;
    renderSessionBar();
    openSidebar();
    return;
  }

  if (index === state.activeSessionIndex) {
    // Switch to nearest session
    const newIndex = Math.min(index, state.sessions.length - 1);
    state.activeSessionIndex = -1; // Reset so switchToSession doesn't early-return
    switchToSession(newIndex);
  } else if (index < state.activeSessionIndex) {
    state.activeSessionIndex--;
    renderSessionBar();
  } else {
    renderSessionBar();
  }

  saveSessionState();
}

function saveSessionState() {
  const sessionData = state.sessions.map(s => ({
    sessionId: s.sessionId,
    project: s.project,
    lastTokenUsage: s.lastTokenUsage,
    lastContextWindow: s.lastContextWindow,
    model: s.model
  }));
  localStorage.setItem('cleon-sessions', JSON.stringify(sessionData));
  localStorage.setItem('cleon-active-session', String(state.activeSessionIndex));
}

async function restoreSessionState() {
  try {
    const saved = JSON.parse(localStorage.getItem('cleon-sessions'));
    const activeIndex = parseInt(localStorage.getItem('cleon-active-session')) || 0;
    if (!saved || saved.length === 0) return false;

    for (const data of saved) {
      const session = createSession(data.project, data.sessionId);
      session.lastTokenUsage = data.lastTokenUsage;
      session.lastContextWindow = data.lastContextWindow;
      session.model = data.model || null;
      state.sessions.push(session);
      createSessionContainer(session);
      // Mark sessions with history for lazy loading
      if (session.sessionId) {
        session.needsHistoryLoad = true;
        session.containerEl.innerHTML = '<div class="loading">Loading history</div>';
      } else {
        clearMessages(session);
      }
    }

    if (state.sessions.length > 0) {
      state.activeSessionIndex = -1;
      const targetIndex = Math.min(activeIndex, state.sessions.length - 1);
      switchToSession(targetIndex);
      enableChat();

      // Load message history for the active session
      const activeSession = getActiveSession();
      if (activeSession && activeSession.needsHistoryLoad) {
        await loadSessionHistory(activeSession);
      }

      // Update hash to match restored session (use replaceState to avoid history entry)
      if (activeSession) {
        const hash = activeSession.project.name
          ? `/project/${encodeURIComponent(activeSession.project.name)}${activeSession.sessionId ? `/session/${encodeURIComponent(activeSession.sessionId)}` : ''}`
          : '';
        if (hash) window.history.replaceState(null, '', '#' + hash);
      }
    }

    state.sessionsRestored = true;
    checkAndReconnectActiveSessions();

    return state.sessions.length > 0;
  } catch (e) {
    console.error('Failed to restore session state:', e);
    return false;
  }
}

// Mode configuration
const MODES = [
  { name: 'default', label: 'Default', color: 'var(--neon-cyan)' },
  { name: 'plan', label: 'Plan Mode', color: 'var(--neon-green)' },
  { name: 'bypass', label: 'Bypass Permissions', color: 'var(--neon-red)' }
];

// Favorites storage utilities
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('favoriteProjects') || '[]');
  } catch {
    return [];
  }
}

function toggleFavorite(projectPath) {
  const favorites = getFavorites();
  const index = favorites.indexOf(projectPath);
  if (index === -1) {
    favorites.push(projectPath);
  } else {
    favorites.splice(index, 1);
  }
  localStorage.setItem('favoriteProjects', JSON.stringify(favorites));
  return index === -1; // returns true if now favorited
}

function isFavorite(projectPath) {
  return getFavorites().includes(projectPath);
}

function parseHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  
  const projectMatch = hash.match(/^\/project\/([^/]+)(?:\/session\/([^/]+))?$/);
  if (projectMatch) {
    return {
      projectName: decodeURIComponent(projectMatch[1]),
      sessionId: projectMatch[2] ? decodeURIComponent(projectMatch[2]) : null
    };
  }
  return null;
}

function updateHash(projectName, sessionId = null) {
  let hash = '';
  if (projectName) {
    hash = `/project/${encodeURIComponent(projectName)}`;
    if (sessionId) {
      hash += `/session/${encodeURIComponent(sessionId)}`;
    }
  }
  const newUrl = hash ? '#' + hash : window.location.pathname;
  if (window.location.hash === '' && hash) {
    window.history.replaceState(null, '', newUrl);
  } else {
    window.history.pushState(null, '', newUrl);
  }
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const authScreen = $('#auth-screen');
const mainScreen = $('#main-screen');
const authForm = $('#auth-form');
const authError = $('#auth-error');
const authBtn = $('#auth-btn');
const menuBtn = $('#menu-btn');
const closeSidebarBtn = $('#close-sidebar');
const sidebar = $('#sidebar');
const sidebarOverlay = $('#sidebar-overlay');
const projectSearch = $('#project-search');
const projectList = $('#project-list');
const sessionList = $('#session-list');
const sessionsContainer = $('#sessions-container');
const backToProjectsBtn = $('#back-to-projects');
const newSessionBtn = $('#new-session-btn');
const chatForm = $('#chat-form');
const chatInput = $('#chat-input');
const sendBtn = $('#send-btn');
const modeBtn = $('#mode-btn');
const sessionContainersEl = $('#session-containers');
const sessionBarEl = $('#session-bar');
const sessionTabsEl = $('#session-tabs');
const newSessionTabBtn = $('#new-session-tab-btn');
const abortBtn = $('#abort-btn');
const projectNameEl = $('#project-name');
const tokenUsageEl = $('#token-usage');
const slashCommandsEl = $('#slash-commands');
const fileMentionsEl = $('#file-mentions');
const attachmentPreviewEl = $('#attachment-preview');
const dropZoneOverlay = $('#drop-zone-overlay');
const fileInput = $('#file-input');
const attachBtn = $('#attach-btn');
const contextMenuEl = $('#message-context-menu');
const contextBar = $('#context-bar');
const contextModel = $('#context-model');
const contextUsageFill = $('#context-usage-fill');
const contextUsageText = $('#context-usage-text');
const scrollToBottomBtn = $('#scroll-to-bottom-btn');
const unreadBadge = $('#unread-badge');

// Built-in commands (always available)
const BUILTIN_COMMANDS = [
  { name: '/compact', desc: 'Use compact mode for shorter responses', source: 'builtin' },
  { name: '/verbose', desc: 'Use verbose mode for detailed responses', source: 'builtin' },
  { name: '/clear', desc: 'Clear the current conversation', source: 'builtin' },
  { name: '/help', desc: 'Show available commands', source: 'builtin' },
  { name: '/model', desc: 'Show or change the current model', source: 'builtin' },
  { name: '/tokens', desc: 'Show current token usage', source: 'builtin' },
  { name: '/context', desc: 'Show context window information', source: 'builtin' },
  { name: '/reset', desc: 'Reset conversation context', source: 'builtin' }
];

// Built-in command handlers - commands that execute locally in the UI
// Commands not in this map (like /compact, /verbose) are sent to Claude
const BUILTIN_COMMAND_HANDLERS = {
  '/clear': handleClearCommand,
  '/reset': handleClearCommand, // Same behavior as /clear
  '/help': handleHelpCommand,
  '/tokens': handleTokensCommand,
  '/context': handleContextCommand,
  '/model': handleModelCommand
};

// Check if a message is a built-in command that should be handled locally
function isLocalBuiltinCommand(message) {
  const trimmed = message.trim();
  const command = trimmed.split(/\s+/)[0].toLowerCase();
  return command in BUILTIN_COMMAND_HANDLERS;
}

// Parse command and arguments from message
function parseCommand(message) {
  const trimmed = message.trim();
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  return { command, args };
}

// Execute a built-in command locally
function executeBuiltinCommand(command, args) {
  const handler = BUILTIN_COMMAND_HANDLERS[command];
  if (handler) {
    handler(args);
    return true;
  }
  return false;
}

// Handler for /clear and /reset commands
function handleClearCommand() {
  const session = getActiveSession();
  if (!session) {
    appendCommandMessage('Please select a project first.');
    return;
  }

  session.sessionId = null;
  updateHash(session.project.name);
  clearMessages(session);
  enableChat();
  appendCommandMessage('Session cleared. Starting fresh.', session);
  saveSessionState();
}

// Handler for /help command
function handleHelpCommand() {
  const commands = getAllCommands();

  // Group commands by source
  const builtin = commands.filter(c => c.source === 'builtin');
  const global = commands.filter(c => c.source === 'global');
  const project = commands.filter(c => c.source === 'project');

  let helpText = 'Available Commands:\n\n';

  if (builtin.length > 0) {
    helpText += 'Built-in:\n';
    for (const cmd of builtin) {
      helpText += `  ${cmd.name} - ${cmd.desc}\n`;
    }
  }

  if (global.length > 0) {
    helpText += '\nGlobal:\n';
    for (const cmd of global) {
      helpText += `  ${cmd.name} - ${cmd.desc}\n`;
    }
  }

  if (project.length > 0) {
    helpText += '\nProject:\n';
    for (const cmd of project) {
      helpText += `  ${cmd.name} - ${cmd.desc}\n`;
    }
  }

  appendCommandMessage(helpText);
}

// Handler for /tokens command
function handleTokensCommand() {
  const session = getActiveSession();
  if (!session || session.lastTokenUsage === null) {
    appendCommandMessage('No token usage data yet. Send a message first.');
    return;
  }

  const usedK = Math.round(session.lastTokenUsage / 1000);
  const totalK = Math.round(session.lastContextWindow / 1000);
  const pct = Math.round((session.lastTokenUsage / session.lastContextWindow) * 100);

  appendCommandMessage(`Token Usage: ${usedK}k / ${totalK}k (${pct}%)`);
}

// Handler for /context command
function handleContextCommand() {
  const session = getActiveSession();
  if (!session || session.lastContextWindow === null) {
    appendCommandMessage('No context data yet. Send a message first.');
    return;
  }

  const usedK = session.lastTokenUsage ? Math.round(session.lastTokenUsage / 1000) : 0;
  const totalK = Math.round(session.lastContextWindow / 1000);
  const pct = session.lastTokenUsage ? Math.round((session.lastTokenUsage / session.lastContextWindow) * 100) : 0;
  const remaining = session.lastContextWindow - (session.lastTokenUsage || 0);
  const remainingK = Math.round(remaining / 1000);

  appendCommandMessage(`Context Window: ${totalK}k tokens total\nUsed: ${usedK}k (${pct}%)\nRemaining: ${remainingK}k`);
}

// Handler for /model command
function handleModelCommand() {
  appendCommandMessage('Model: Claude (via Claude Code SDK)\nModel switching is not yet supported in the web UI.');
}

// Append a command feedback message (styled differently from assistant messages)
function appendCommandMessage(content, session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  removeWelcome(session);
  const div = document.createElement('div');
  div.className = 'message command-feedback';
  div.style.borderLeft = '3px solid var(--neon-cyan)';
  div.style.fontFamily = 'monospace';
  div.style.whiteSpace = 'pre-wrap';
  div.textContent = content;
  session.containerEl.appendChild(div);
  scrollToBottom(session);
}

// Get all commands merged (builtin + global + project)
function getAllCommands() {
  const commandMap = new Map();

  // Add built-in commands first
  for (const cmd of BUILTIN_COMMANDS) {
    commandMap.set(cmd.name, cmd);
  }

  // Custom commands (global + project) override built-in if same name
  for (const cmd of state.customCommands) {
    commandMap.set(cmd.name, {
      name: cmd.name,
      desc: cmd.description,
      source: cmd.source
    });
  }

  return Array.from(commandMap.values());
}

// Load custom commands from the API
async function loadCustomCommands(projectPath = null) {
  try {
    let url = '/api/commands';
    if (projectPath) {
      url += `?projectPath=${encodeURIComponent(projectPath)}`;
    }
    state.customCommands = await api(url);
  } catch (err) {
    console.warn('[Commands] Failed to load custom commands:', err);
    state.customCommands = [];
  }
}


async function init() {
  const status = await api('/api/auth/status').catch(() => ({ needsSetup: true }));
  
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

function showAuth() {
  authScreen.classList.remove('hidden');
  mainScreen.classList.add('hidden');
}

function showMain() {
  authScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  connectWebSocket();
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      state.notificationsEnabled = perm === 'granted';
    });
  } else if ('Notification' in window) {
    state.notificationsEnabled = Notification.permission === 'granted';
  }
  loadCustomCommands(); // Load global commands initially

  // Try to restore sessions from localStorage first
  restoreSessionState().then(restored => {
    if (!restored) {
      // Fall back to hash restoration
      restoreFromHash();
    }
  });
}

async function restoreFromHash() {
  const route = parseHash();
  if (!route) return;
  
  try {
    const { path: projectPath } = await api(`/api/projects/${encodeURIComponent(route.projectName)}/path`);
    const displayName = projectPath.split('/').pop();
    
    await selectProject(route.projectName, projectPath, displayName, true);
    closeSidebar();
    
    if (route.sessionId) {
      await resumeSession(route.sessionId, true);
    } else {
      enableChat();
    }
  } catch (err) {
    console.error('Failed to restore from hash:', err);
  }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value.trim();
  const password = $('#password').value;
  const isRegister = authForm.dataset.mode === 'register';
  
  authError.classList.add('hidden');
  authBtn.disabled = true;
  
  try {
    if (isRegister) {
      await api('/api/auth/register', { username, password });
      authBtn.textContent = 'Log In';
      authForm.dataset.mode = 'login';
      showAuthError('Account created! Please log in.');
      authBtn.disabled = false;
      return;
    }
    
    const { token } = await api('/api/auth/login', { username, password });
    state.token = token;
    localStorage.setItem('token', token);
    showMain();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    authBtn.disabled = false;
  }
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function checkAndReconnectActiveSessions() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  for (const session of state.sessions) {
    if (session.sessionId) {
      state.ws.send(JSON.stringify({
        type: 'check-active',
        sessionId: session.sessionId
      }));
    }
  }
}

function connectWebSocket() {
  if (state.ws?.readyState === WebSocket.OPEN) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}?token=${state.token}`);

  state.ws.onopen = () => {
    console.log('[WS] Connected');
    state.wsReconnectAttempts = 0;
    if (state.sessionsRestored) {
      checkAndReconnectActiveSessions();
    }
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleWsMessage(msg);
  };

  state.ws.onclose = () => {
    console.log('[WS] Disconnected');
    state.wsReconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, state.wsReconnectAttempts), 30000);
    setTimeout(connectWebSocket, delay);
  };

  state.ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

function handleWsMessage(msg) {
  let session;

  if (msg.type === 'session-created') {
    session = state.sessions.find(s => s.sessionId === null && s.isStreaming);
    if (session) {
      session.sessionId = msg.sessionId;
      saveSessionState();
    }
  } else if (msg.sessionId) {
    session = getSessionBySessionId(msg.sessionId);
  } else {
    session = getActiveSession();
  }

  if (!session && msg.type !== 'pong') {
    console.warn('[WS] Message for unknown session:', msg.sessionId);
    return;
  }

  const isInactive = session && state.sessions.indexOf(session) !== state.activeSessionIndex;

  switch (msg.type) {
    case 'session-created':
      break;
    case 'claude-message':
      handleClaudeMessage(msg.data, session);
      if (isInactive) { session.hasUnread = true; renderSessionBar(); }
      break;
    case 'claude-done':
      finishStreaming(session);
      sendNotification('Claude finished', session.project.displayName || session.project.name);
      if (isInactive) { session.hasUnread = true; renderSessionBar(); }
      break;
    case 'token-usage':
      if (msg.model && session) session.model = msg.model;
      updateTokenUsage(msg.used, msg.contextWindow, session);
      break;
    case 'abort-result':
      if (msg.success) finishStreaming(session);
      break;
    case 'question-response-result':
      break;
    case 'error':
      appendSystemMessage(`Error: ${msg.message}`, session);
      sendNotification('Error', msg.message);
      finishStreaming(session);
      if (isInactive) { session.hasUnread = true; renderSessionBar(); }
      break;
    case 'session-active':
      if (msg.active && session) {
        session.isStreaming = true;
        session.pendingText = '';
        // Send subscribe to bind this WS to the active stream
        state.ws.send(JSON.stringify({
          type: 'subscribe',
          sessionId: msg.sessionId
        }));
        // Update UI if this is the active session
        if (state.sessions.indexOf(session) === state.activeSessionIndex) {
          abortBtn.classList.remove('hidden');
          chatInput.disabled = true;
          sendBtn.disabled = true;
          modeBtn.disabled = true;
          attachBtn.disabled = true;
        }
      }
      break;
    case 'subscribe-result':
      if (session) {
        if (!msg.success) {
          // Stream ended between check and subscribe — treat as completed
          session.isStreaming = false;
          if (state.sessions.indexOf(session) === state.activeSessionIndex) {
            abortBtn.classList.add('hidden');
            chatInput.disabled = false;
            sendBtn.disabled = false;
            modeBtn.disabled = false;
            attachBtn.disabled = false;
          }
        } else {
          console.log('[WS] Reconnected to active stream:', msg.sessionId);
        }
      }
      break;
    case 'pong':
      break;
    default:
      console.debug('[WS] Unknown message type:', msg.type);
  }
}

function handleClaudeMessage(data, session) {
  if (!data) return;
  session = session || getActiveSession();
  if (!session) return;

  if (data.type === 'text') {
    session.pendingText += data.content || '';
    updateStreamingMessage(session);
    return;
  }

  if (data.type === 'question') {
    flushPendingText(session);
    session.pendingQuestion = {
      id: data.id,
      questions: data.questions,
      selectedAnswers: {}
    };
    renderQuestion(data, session);
    return;
  }

  if (data.type === 'tool_use') {
    flushPendingText(session);
    appendToolMessage(data.tool, data.summary, data.id, 'running', session);
    return;
  }

  if (data.type === 'tool_result') {
    updateToolResult(data.id, data.success, data.output, session);
    return;
  }
}

function flushPendingText(session) {
  session = session || getActiveSession();
  if (session && session.pendingText && session.containerEl) {
    const streamingEl = session.containerEl.querySelector('.message.streaming');
    if (streamingEl) {
      streamingEl.classList.remove('streaming');
      streamingEl.innerHTML = formatMarkdown(session.pendingText);
    }
    session.pendingText = '';
  }
}

function updateStreamingMessage(session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;

  let el = session.containerEl.querySelector('.message.streaming');
  if (!el) {
    el = document.createElement('div');
    el.className = 'message assistant streaming';
    session.containerEl.appendChild(el);
  }
  el.innerHTML = formatMarkdown(session.pendingText);
  scrollToBottom(session);
}

function finishStreaming(session) {
  session = session || getActiveSession();
  if (!session) return;
  session.isStreaming = false;
  flushPendingText(session);

  // Only update UI controls if this is the active session
  if (state.sessions.indexOf(session) === state.activeSessionIndex) {
    abortBtn.classList.add('hidden');
    chatInput.disabled = false;
    sendBtn.disabled = false;
    modeBtn.disabled = false;
    attachBtn.disabled = false;
  }

  // Scope question cancellation to session container
  if (session.containerEl) {
    const streamingEl = session.containerEl.querySelector('.message.streaming');
    if (streamingEl) streamingEl.classList.remove('streaming');
    if (session.pendingQuestion) {
      const questionBlock = session.containerEl.querySelector('.message.question-block:not(.submitted)');
      if (questionBlock) {
        questionBlock.classList.add('cancelled');
        const submitBtn = questionBlock.querySelector('.question-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Cancelled'; }
        questionBlock.querySelectorAll('.question-option').forEach(opt => { opt.style.pointerEvents = 'none'; });
        questionBlock.querySelectorAll('.question-custom-input').forEach(input => { input.disabled = true; });
      }
      session.pendingQuestion = null;
    }
  }
}

function appendMessage(role, content, session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  removeWelcome(session);
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = role === 'user' ? escapeHtml(content) : formatMarkdown(content);
  session.containerEl.appendChild(div);
  scrollToBottom(session);
}

function appendSystemMessage(content, session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  removeWelcome(session);
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.style.borderLeft = '3px solid var(--error)';
  div.textContent = content;
  session.containerEl.appendChild(div);
  scrollToBottom(session);
}

function getToolIcon(tool) {
  const icons = {
    'Bash': '$',
    'Read': 'R',
    'Write': 'W',
    'Edit': 'E',
    'Glob': 'G',
    'Grep': '?',
    'Task': 'T'
  };
  return icons[tool] || '*';
}

function truncateToolSummary(summary, maxLen) {
  if (!summary) return '';
  if (summary.length <= maxLen) return summary;
  return summary.slice(0, maxLen) + '...';
}

function appendToolMessage(tool, summary, id, status, session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  removeWelcome(session);
  const div = document.createElement('div');
  div.className = `message tool-pill ${status}`;
  div.dataset.toolId = id || '';
  div.innerHTML = `
    <div class="tool-pill-header">
      <span class="tool-pill-icon">${getToolIcon(tool)}</span>
      <span class="tool-pill-name">${escapeHtml(tool)}</span>
      <span class="tool-pill-summary">${escapeHtml(truncateToolSummary(summary, 50))}</span>
      <span class="tool-pill-status ${status}">${status === 'running' ? '...' : status === 'success' ? 'done' : 'fail'}</span>
      <span class="tool-pill-toggle">+</span>
    </div>
    <div class="tool-pill-output hidden"></div>
  `;
  session.containerEl.appendChild(div);
  scrollToBottom(session);
}

function updateToolResult(id, success, output, session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;

  const toolMsgs = session.containerEl.querySelectorAll('.message.tool-pill');
  let target = null;

  if (id) {
    target = session.containerEl.querySelector(`.message.tool-pill[data-tool-id="${id}"]`);
  }
  if (!target && toolMsgs.length > 0) {
    target = toolMsgs[toolMsgs.length - 1];
  }

  if (target) {
    target.classList.remove('running');
    target.classList.add(success ? 'success' : 'error');

    const statusEl = target.querySelector('.tool-pill-status');
    if (statusEl) {
      statusEl.textContent = success ? 'done' : 'fail';
      statusEl.className = `tool-pill-status ${success ? 'success' : 'error'}`;
    }

    if (output && output.trim()) {
      const outputEl = target.querySelector('.tool-pill-output');
      if (outputEl) {
        outputEl.textContent = output;
      }
    }
  }
  scrollToBottom(session);
}



function renderQuestion(data, session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  removeWelcome(session);

  const div = document.createElement('div');
  div.className = 'message question-block';
  div.dataset.questionId = data.id;

  let html = '';

  data.questions.forEach((q, qIndex) => {
    const isMultiple = q.multiSelect || q.multiple || false;

    html += `
      <div class="question-group" data-question-index="${qIndex}" data-multiple="${isMultiple}">
        <div class="question-header">${escapeHtml(q.header || '')}</div>
        <div class="question-text">${escapeHtml(q.question)}</div>
        <div class="question-options">
    `;

    if (q.options && q.options.length > 0) {
      q.options.forEach(opt => {
        html += `
          <div class="question-option" data-label="${escapeAttr(opt.label)}" data-qindex="${qIndex}">
            <span class="option-label">${escapeHtml(opt.label)}</span>
            ${opt.description ? `<span class="option-desc">${escapeHtml(opt.description)}</span>` : ''}
          </div>
        `;
      });
    }

    html += `
        </div>
        <div class="question-custom-container">
          <input type="text" class="question-custom-input" data-qindex="${qIndex}" placeholder="Type your own answer...">
        </div>
      </div>
    `;
  });

  html += `
    <button class="question-submit" disabled>Submit Answer</button>
  `;

  div.innerHTML = html;
  session.containerEl.appendChild(div);

  div.querySelectorAll('.question-option').forEach(opt => {
    opt.addEventListener('click', () => handleOptionSelect(opt));
  });

  div.querySelectorAll('.question-custom-input').forEach(input => {
    input.addEventListener('input', () => handleCustomInputChange(input));
  });

  div.querySelector('.question-submit').addEventListener('click', submitQuestionResponse);

  scrollToBottom(session);
}

function handleOptionSelect(optionEl) {
  const qIndex = parseInt(optionEl.dataset.qindex);
  const label = optionEl.dataset.label;
  const questionGroup = optionEl.closest('.question-group');
  const isMultiple = questionGroup.dataset.multiple === 'true';

  const session = getActiveSession();
  if (!session || !session.pendingQuestion) return;

  if (!session.pendingQuestion.selectedAnswers[qIndex]) {
    session.pendingQuestion.selectedAnswers[qIndex] = [];
  }

  const answers = session.pendingQuestion.selectedAnswers[qIndex];
  const existingIndex = answers.indexOf(label);

  if (isMultiple) {
    if (existingIndex >= 0) {
      answers.splice(existingIndex, 1);
      optionEl.classList.remove('selected');
    } else {
      answers.push(label);
      optionEl.classList.add('selected');
    }
  } else {
    questionGroup.querySelectorAll('.question-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    session.pendingQuestion.selectedAnswers[qIndex] = [label];
    optionEl.classList.add('selected');
  }

  const customInput = questionGroup.querySelector('.question-custom-input');
  if (customInput) {
    customInput.value = '';
  }

  updateSubmitButtonState();
}

function handleCustomInputChange(inputEl) {
  const qIndex = parseInt(inputEl.dataset.qindex);
  const value = inputEl.value.trim();
  const questionGroup = inputEl.closest('.question-group');

  const session = getActiveSession();
  if (!session || !session.pendingQuestion) return;

  questionGroup.querySelectorAll('.question-option').forEach(opt => {
    opt.classList.remove('selected');
  });

  if (value) {
    session.pendingQuestion.selectedAnswers[qIndex] = [value];
  } else {
    delete session.pendingQuestion.selectedAnswers[qIndex];
  }

  updateSubmitButtonState();
}

function updateSubmitButtonState() {
  const session = getActiveSession();
  if (!session || !session.pendingQuestion || !session.containerEl) return;

  const questionBlock = session.containerEl.querySelector(
    `.message.question-block[data-question-id="${session.pendingQuestion.id}"]`
  );
  if (!questionBlock) return;

  const submitBtn = questionBlock.querySelector('.question-submit');
  const totalQuestions = session.pendingQuestion.questions.length;
  const answeredQuestions = Object.keys(session.pendingQuestion.selectedAnswers).filter(
    key => session.pendingQuestion.selectedAnswers[key]?.length > 0
  ).length;

  submitBtn.disabled = answeredQuestions < totalQuestions;
}

function submitQuestionResponse() {
  const session = getActiveSession();
  if (!session || !session.pendingQuestion || !session.sessionId) return;

  const answers = session.pendingQuestion.selectedAnswers;

  state.ws.send(JSON.stringify({
    type: 'question-response',
    sessionId: session.sessionId,
    toolUseId: session.pendingQuestion.id,
    answers: answers
  }));

  const questionBlock = session.containerEl?.querySelector(
    `.message.question-block[data-question-id="${session.pendingQuestion.id}"]`
  );
  if (questionBlock) {
    questionBlock.classList.add('submitted');
    const submitBtn = questionBlock.querySelector('.question-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitted';
    }
    questionBlock.querySelectorAll('.question-option').forEach(opt => {
      opt.style.pointerEvents = 'none';
    });
    questionBlock.querySelectorAll('.question-custom-input').forEach(input => {
      input.disabled = true;
    });
  }

  session.pendingQuestion = null;
}

function removeWelcome(session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  const welcome = session.containerEl.querySelector('.welcome-message');
  if (welcome) welcome.remove();
}

function clearMessages(session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  session.containerEl.innerHTML = `
    <div class="welcome-message">
      <h2>New Session</h2>
      <p>Start typing to chat with Claude.</p>
    </div>
  `;
  session.pendingText = '';
}

function updateScrollFAB(session) {
  const active = getActiveSession();
  if (!session || session !== active) return;
  if (session.isAtBottom || session.unreadCount === 0) {
    scrollToBottomBtn.classList.add('hidden');
  } else {
    scrollToBottomBtn.classList.remove('hidden');
    if (session.unreadCount > 0) {
      unreadBadge.textContent = session.unreadCount;
      unreadBadge.classList.remove('hidden');
    } else {
      unreadBadge.classList.add('hidden');
    }
  }
}

function scrollToBottom(session) {
  session = session || getActiveSession();
  if (!session?.containerEl) return;
  if (session.isAtBottom !== false) {
    requestAnimationFrame(() => {
      session.containerEl.scrollTop = session.containerEl.scrollHeight;
    });
  } else {
    session.unreadCount++;
    updateScrollFAB(session);
  }
}

scrollToBottomBtn.addEventListener('click', () => {
  const session = getActiveSession();
  if (!session?.containerEl) return;
  session.containerEl.scrollTo({ top: session.containerEl.scrollHeight, behavior: 'smooth' });
  session.unreadCount = 0;
  session.isAtBottom = true;
  updateScrollFAB(session);
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = chatInput.value.trim();
  const session = getActiveSession();
  if (!content || session?.isStreaming) return;

  if (!session) {
    alert('Please select a project first (tap the menu icon)');
    return;
  }

  sendMessage(content);
});

function sendMessage(content) {
  // Check if this is a local built-in command (e.g., /clear, /help, /tokens)
  // Commands like /compact and /verbose are NOT in the handler map and will be sent to Claude
  if (isLocalBuiltinCommand(content)) {
    const { command, args } = parseCommand(content);
    executeBuiltinCommand(command, args);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    return; // Don't send to Claude
  }

  const session = getActiveSession();
  if (!session) {
    appendCommandMessage('Please create or select a session first.');
    return;
  }

  const mode = MODES[state.modeIndex];

  const message = {
    type: 'chat',
    content: content,
    mode: mode.name,
    projectPath: session.project.path,
    sessionId: session.sessionId,
    isNewSession: !session.sessionId
  };

  // Add attachments if present
  if (session.attachments.length > 0) {
    message.attachments = session.attachments.map(att => ({
      type: att.type,
      name: att.name,
      data: att.data,
      mediaType: att.mediaType
    }));
  }

  state.ws.send(JSON.stringify(message));

  // Show attachments in user message display
  const displayContent = formatUserMessageWithAttachments(content, session.attachments);
  appendMessage('user', displayContent, session);

  // Clear attachments after sending
  session.attachments = [];
  renderAttachmentPreview();

  chatInput.value = '';
  chatInput.style.height = 'auto';

  session.isStreaming = true;
  abortBtn.classList.remove('hidden');
  chatInput.disabled = true;
  sendBtn.disabled = true;
  modeBtn.disabled = true;
  attachBtn.disabled = true;
}

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
});

chatInput.addEventListener('keydown', (e) => {
  // Shift+Tab cycles through modes
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    cycleMode();
    return;
  }
  if (slashCommandsEl && !slashCommandsEl.classList.contains('hidden')) {
    if (handleSlashCommandKeydown(e)) return;
  }
  if (fileMentionsEl && !fileMentionsEl.classList.contains('hidden')) {
    if (handleFileMentionKeydown(e)) return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

chatInput.addEventListener('input', handleSlashCommandInput);
chatInput.addEventListener('input', handleFileMentionInput);
chatInput.addEventListener('blur', () => {
  setTimeout(hideSlashCommands, 150);
  setTimeout(hideFileMentions, 150);
});

// Code block copy button delegation
sessionContainersEl.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.code-copy-btn');
  if (copyBtn) {
    const wrapper = copyBtn.closest('.code-block-wrapper');
    const codeEl = wrapper?.querySelector('code');
    if (codeEl) {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    }
  }
});

// Session tab event delegation
sessionTabsEl.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.close-tab');
  if (closeBtn) {
    const tab = closeBtn.closest('.session-tab');
    closeSession(parseInt(tab.dataset.index));
    return;
  }
  const tab = e.target.closest('.session-tab');
  if (tab) {
    switchToSession(parseInt(tab.dataset.index));
  }
});

// Tool pill expand/collapse delegation
sessionContainersEl.addEventListener('click', (e) => {
  const pillHeader = e.target.closest('.tool-pill-header');
  if (pillHeader) {
    const pill = pillHeader.closest('.message.tool-pill');
    const output = pill?.querySelector('.tool-pill-output');
    const toggle = pill?.querySelector('.tool-pill-toggle');
    if (output && output.textContent.trim()) {
      output.classList.toggle('hidden');
      if (toggle) toggle.textContent = output.classList.contains('hidden') ? '+' : '-';
    }
  }
});


// Keyboard shortcuts for session switching (Ctrl+1 through Ctrl+5)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    const num = parseInt(e.key);
    if (num >= 1 && num <= MAX_SESSIONS) {
      e.preventDefault();
      const index = num - 1;
      if (index < state.sessions.length) {
        switchToSession(index);
      }
    }
  }
});

// Mobile keyboard handling - scroll input into view when focused
chatInput.addEventListener('focus', () => {
  setTimeout(() => {
    chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
});

// Visual Viewport API for better mobile keyboard handling
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (document.activeElement === chatInput) {
      chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

// Long-press to copy message
let longPressTimer = null;
let longPressTarget = null;

sessionContainersEl.addEventListener('touchstart', (e) => {
  const msgEl = e.target.closest('.message');
  if (!msgEl) return;
  longPressTarget = msgEl;
  longPressTimer = setTimeout(() => {
    showContextMenu(msgEl, e.touches[0].clientX, e.touches[0].clientY);
  }, 500);
}, { passive: true });

sessionContainersEl.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
  longPressTimer = null;
});

sessionContainersEl.addEventListener('touchmove', () => {
  clearTimeout(longPressTimer);
  longPressTimer = null;
});

// Desktop: right-click on messages
sessionContainersEl.addEventListener('contextmenu', (e) => {
  const msgEl = e.target.closest('.message');
  if (!msgEl) return;
  e.preventDefault();
  showContextMenu(msgEl, e.clientX, e.clientY);
});

function showContextMenu(msgEl, x, y) {
  longPressTarget = msgEl;
  const hasCode = msgEl.querySelector('pre code');
  const copyCodeBtn = contextMenuEl.querySelector('[data-action="copy-code"]');
  copyCodeBtn.style.display = hasCode ? '' : 'none';
  contextMenuEl.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  contextMenuEl.style.top = Math.min(y, window.innerHeight - 100) + 'px';
  contextMenuEl.classList.remove('hidden');
}

document.addEventListener('click', () => {
  contextMenuEl.classList.add('hidden');
});
document.addEventListener('touchstart', (e) => {
  if (!contextMenuEl.contains(e.target)) {
    contextMenuEl.classList.add('hidden');
  }
}, { passive: true });

contextMenuEl.addEventListener('click', (e) => {
  const action = e.target.closest('.ctx-menu-item')?.dataset.action;
  if (!action || !longPressTarget) return;

  if (action === 'copy-text') {
    navigator.clipboard.writeText(longPressTarget.textContent);
  } else if (action === 'copy-code') {
    const codeEls = longPressTarget.querySelectorAll('pre code');
    const codeText = Array.from(codeEls).map(el => el.textContent).join('\n\n');
    navigator.clipboard.writeText(codeText);
  }

  contextMenuEl.classList.add('hidden');
  longPressTarget = null;
});

function handleSlashCommandInput() {
  const value = chatInput.value;

  if (!value.startsWith('/')) {
    hideSlashCommands();
    return;
  }

  const query = value.slice(1).toLowerCase();
  const allCommands = getAllCommands();
  const filtered = allCommands.filter(cmd =>
    cmd.name.toLowerCase().includes(query) ||
    cmd.desc.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    hideSlashCommands();
    return;
  }

  renderSlashCommands(filtered);
  showSlashCommands();
}

function renderSlashCommands(commands) {
  const session = getActiveSession();
  if (session) session.slashCommandSelectedIndex = 0;

  slashCommandsEl.innerHTML = commands.map((cmd, i) => {
    const sourceClass = `source-${cmd.source || 'builtin'}`;
    const sourceLabel = cmd.source === 'global' ? 'global' : cmd.source === 'project' ? 'project' : '';
    return `
      <div class="slash-command${i === 0 ? ' selected' : ''}" data-command="${escapeAttr(cmd.name)}">
        <div class="slash-command-header">
          <span class="slash-command-name">${escapeHtml(cmd.name)}</span>
          ${sourceLabel ? `<span class="slash-command-source ${sourceClass}">${sourceLabel}</span>` : ''}
        </div>
        <div class="slash-command-desc">${escapeHtml(cmd.desc)}</div>
      </div>
    `;
  }).join('');
}

// Event delegation for slash commands (avoids memory leaks)
slashCommandsEl.addEventListener('click', (e) => {
  const commandEl = e.target.closest('.slash-command');
  if (commandEl) {
    insertSlashCommand(commandEl.dataset.command);
  }
});

function showSlashCommands() {
  slashCommandsEl.classList.remove('hidden');
}

function hideSlashCommands() {
  slashCommandsEl.classList.add('hidden');
  const session = getActiveSession();
  if (session) session.slashCommandSelectedIndex = -1;
}

function handleSlashCommandKeydown(e) {
  const session = getActiveSession();
  if (!session) return false;

  const items = slashCommandsEl.querySelectorAll('.slash-command');
  if (items.length === 0) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    session.slashCommandSelectedIndex = Math.min(session.slashCommandSelectedIndex + 1, items.length - 1);
    updateSlashCommandSelection(items);
    return true;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    session.slashCommandSelectedIndex = Math.max(session.slashCommandSelectedIndex - 1, 0);
    updateSlashCommandSelection(items);
    return true;
  }

  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const selected = items[session.slashCommandSelectedIndex];
    if (selected) {
      const command = selected.dataset.command;
      // If it's a local builtin command and Enter (not Tab), execute immediately
      if (e.key === 'Enter' && isLocalBuiltinCommand(command)) {
        hideSlashCommands();
        const { command: cmd, args } = parseCommand(command);
        executeBuiltinCommand(cmd, args);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        return true;
      }
      insertSlashCommand(command);
    }
    return true;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    hideSlashCommands();
    return true;
  }

  return false;
}

function updateSlashCommandSelection(items) {
  const session = getActiveSession();
  if (!session) return;

  items.forEach((item, i) => {
    item.classList.toggle('selected', i === session.slashCommandSelectedIndex);
  });
  items[session.slashCommandSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function insertSlashCommand(command) {
  chatInput.value = command + ' ';
  chatInput.focus();
  hideSlashCommands();
  chatInput.dispatchEvent(new Event('input'));
}

// File Mention Functions
function handleFileMentionInput() {
  const session = getActiveSession();
  if (!session) return;

  const value = chatInput.value;
  const cursorPos = chatInput.selectionStart;
  const textBeforeCursor = value.slice(0, cursorPos);
  const lastAtIndex = textBeforeCursor.lastIndexOf('@');

  // No @ found or @ is at the very end with nothing after it
  if (lastAtIndex === -1) {
    hideFileMentions();
    return;
  }

  const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

  // Check if there's whitespace after @ (which would mean @ mention is complete)
  if (textAfterAt.includes(' ')) {
    hideFileMentions();
    return;
  }

  // Check if we're at the start or after whitespace
  if (lastAtIndex > 0 && textBeforeCursor[lastAtIndex - 1] !== ' ' && textBeforeCursor[lastAtIndex - 1] !== '\n') {
    // @ is in the middle of a word, don't trigger
    hideFileMentions();
    return;
  }

  session.fileMentionQuery = textAfterAt;
  session.fileMentionStartPos = lastAtIndex;

  // Debounce the API call
  clearTimeout(session.fileMentionDebounceTimer);
  session.fileMentionDebounceTimer = setTimeout(() => {
    fetchFileMentions(session.fileMentionQuery);
  }, 300);
}

async function fetchFileMentions(query) {
  const session = getActiveSession();
  // Check if project is selected
  if (!session) {
    renderFileMentions([], 'no-project');
    showFileMentions();
    return;
  }

  try {
    const { files } = await api(`/api/projects/${encodeURIComponent(session.project.name)}/files/search?q=${encodeURIComponent(query)}`);
    renderFileMentions(files);
    showFileMentions();
  } catch (err) {
    console.error('[FileMention] Failed to fetch files:', err);
    hideFileMentions();
  }
}

function renderFileMentions(files, displayState = 'normal') {
  const session = getActiveSession();
  if (session) session.fileMentionSelectedIndex = 0;

  if (displayState === 'no-project') {
    fileMentionsEl.innerHTML = '<div class="file-mention-no-project">Select a project to search files</div>';
    return;
  }

  if (files.length === 0) {
    fileMentionsEl.innerHTML = '<div class="file-mention-empty">No files found</div>';
    return;
  }

  fileMentionsEl.innerHTML = files.map((file, i) => {
    const icon = getFileIcon(file);
    return `
      <div class="file-mention-item${i === 0 ? ' selected' : ''}" data-file="${escapeAttr(file)}">
        <span class="file-icon">${icon}</span>
        <span class="file-path">${escapeHtml(file)}</span>
      </div>
    `;
  }).join('');
}

// Event delegation for file mentions (avoids memory leaks)
fileMentionsEl.addEventListener('click', (e) => {
  const fileItem = e.target.closest('.file-mention-item');
  if (fileItem) {
    selectFileMention(fileItem.dataset.file);
  }
});

function getFileIcon(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const iconMap = {
    'js': '📜',
    'ts': '📘',
    'jsx': '⚛️',
    'tsx': '⚛️',
    'py': '🐍',
    'json': '📋',
    'md': '📝',
    'css': '🎨',
    'scss': '🎨',
    'html': '🌐',
    'svg': '🖼️',
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️',
    'yml': '⚙️',
    'yaml': '⚙️',
    'toml': '⚙️',
    'sh': '🔧',
    'bash': '🔧',
    'zsh': '🔧'
  };
  return iconMap[ext] || '📄';
}

function showFileMentions() {
  fileMentionsEl.classList.remove('hidden');
}

function hideFileMentions() {
  fileMentionsEl.classList.add('hidden');
  const session = getActiveSession();
  if (session) {
    session.fileMentionSelectedIndex = 0;
    session.fileMentionQuery = '';
    session.fileMentionStartPos = -1;
    clearTimeout(session.fileMentionDebounceTimer);
  }
}

function handleFileMentionKeydown(e) {
  const session = getActiveSession();
  if (!session) return false;

  const items = fileMentionsEl.querySelectorAll('.file-mention-item');
  if (items.length === 0) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    session.fileMentionSelectedIndex = Math.min(session.fileMentionSelectedIndex + 1, items.length - 1);
    updateFileMentionSelection(items);
    return true;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    session.fileMentionSelectedIndex = Math.max(session.fileMentionSelectedIndex - 1, 0);
    updateFileMentionSelection(items);
    return true;
  }

  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const selected = items[session.fileMentionSelectedIndex];
    if (selected) {
      selectFileMention(selected.dataset.file);
    }
    return true;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    hideFileMentions();
    return true;
  }

  return false;
}

function updateFileMentionSelection(items) {
  const session = getActiveSession();
  if (!session) return;

  items.forEach((item, i) => {
    item.classList.toggle('selected', i === session.fileMentionSelectedIndex);
  });
  items[session.fileMentionSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function selectFileMention(filePath) {
  const session = getActiveSession();
  if (!session) return;

  const value = chatInput.value;
  const before = value.slice(0, session.fileMentionStartPos);
  const after = value.slice(chatInput.selectionStart);
  const formatted = `@"${filePath}"`;

  chatInput.value = before + formatted + after;
  chatInput.focus();

  // Set cursor position after the inserted text
  const newCursorPos = session.fileMentionStartPos + formatted.length;
  chatInput.setSelectionRange(newCursorPos, newCursorPos);

  hideFileMentions();
  chatInput.dispatchEvent(new Event('input'));
}

// Mode button functions
function cycleMode() {
  state.modeIndex = (state.modeIndex + 1) % MODES.length;
  state.currentMode = MODES[state.modeIndex].name;
  updateModeButton();
}

function updateModeButton() {
  const mode = MODES[state.modeIndex];

  // Remove all mode classes
  modeBtn.classList.remove('mode-default', 'mode-plan', 'mode-bypass');

  // Add current mode class
  modeBtn.classList.add(`mode-${mode.name}`);

  // Update title/tooltip
  modeBtn.title = mode.label;
}

modeBtn.addEventListener('click', cycleMode);

newSessionTabBtn.addEventListener('click', () => {
  if (state.sessions.length >= MAX_SESSIONS) {
    alert(`Maximum ${MAX_SESSIONS} sessions reached`);
    return;
  }
  state.forceNewTab = true;
  openSidebar();
});

abortBtn.addEventListener('click', () => {
  const session = getActiveSession();
  if (session && session.sessionId && session.isStreaming) {
    state.ws.send(JSON.stringify({
      type: 'abort',
      sessionId: session.sessionId
    }));
  }
});

function openSidebar() {
  sidebar.classList.remove('hidden');
  sidebarOverlay.classList.remove('hidden');
  projectSearch.focus();
}

function closeSidebar() {
  sidebar.classList.add('hidden');
  sidebarOverlay.classList.add('hidden');
  state.forceNewTab = false;
}

menuBtn.addEventListener('click', openSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

projectSearch.addEventListener('input', () => {
  clearTimeout(state.searchTimeout);
  state.searchTimeout = setTimeout(() => searchProjects(projectSearch.value), SEARCH_DEBOUNCE_MS);
});

projectSearch.addEventListener('focus', () => {
  if (!projectSearch.value) {
    searchProjects('');
  }
});

async function searchProjects(query) {
  projectList.innerHTML = '<div class="loading">Searching</div>';
  sessionList.classList.add('hidden');
  projectList.classList.remove('hidden');
  newSessionBtn.classList.add('hidden');
  
  try {
    const projects = await api(`/api/projects/search?q=${encodeURIComponent(query)}`);
    
    if (projects.length === 0) {
      projectList.innerHTML = `
        <div class="empty-state">
          ${query ? 'No projects match your search' : 'No Claude projects found'}
        </div>
      `;
      return;
    }
    
    // Sort favorites to top
    const favorites = getFavorites();
    projects.sort((a, b) => {
      const aFav = favorites.includes(a.path);
      const bFav = favorites.includes(b.path);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });

    projectList.innerHTML = projects.map(p => {
      const favored = isFavorite(p.path);
      return `
        <div class="project-item" data-name="${escapeAttr(p.name)}" data-path="${escapeAttr(p.path)}">
          <button class="favorite-btn${favored ? ' active' : ''}" data-path="${escapeAttr(p.path)}" aria-label="${favored ? 'Unfavorite' : 'Favorite'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${favored ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <span class="session-count">${p.sessionCount}</span>
          <span class="project-name">${escapeHtml(p.displayName)}</span>
          <span class="project-path">${escapeHtml(p.path)}</span>
        </div>
      `;
    }).join('');

    // Add click handlers for favorite buttons
    projectList.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = btn.dataset.path;
        toggleFavorite(path);
        // Re-render to update order and button state
        searchProjects(projectSearch.value);
      });
    });

    projectList.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', () => {
        selectProject(el.dataset.name, el.dataset.path, el.querySelector('.project-name').textContent);
      });
    });
    
  } catch (err) {
    projectList.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
  }
}

async function selectProject(name, path, displayName, skipHashUpdate = false) {
  const project = { name, path, displayName };

  // Check if we can reuse the active session
  const forceNewTab = state.forceNewTab;
  state.forceNewTab = false;

  const activeSession = getActiveSession();
  const canReuse = activeSession && !activeSession.isStreaming && !forceNewTab;

  if (canReuse) {
    // Reuse existing session - reset all properties
    activeSession.project = { name, path, displayName };
    activeSession.sessionId = null;
    activeSession.isStreaming = false;
    activeSession.pendingText = '';
    activeSession.pendingQuestion = null;
    activeSession.attachments = [];
    activeSession.lastTokenUsage = null;
    activeSession.lastContextWindow = null;
    activeSession.hasUnread = false;
    activeSession.needsHistoryLoad = false;
    activeSession.fileMentionSelectedIndex = 0;
    activeSession.fileMentionQuery = '';
    activeSession.fileMentionStartPos = -1;
    clearTimeout(activeSession.fileMentionDebounceTimer);
    activeSession.slashCommandSelectedIndex = -1;

    // Reset DOM
    clearMessages(activeSession);

    // Update UI
    projectNameEl.textContent = displayName;
    if (!skipHashUpdate) updateHash(name);

    // Load custom commands for this project
    loadCustomCommands(path);

    // Clear token usage and attachments
    updateTokenUsage(null, null, activeSession);
    renderAttachmentPreview();

    // Update session bar to reflect new project name
    renderSessionBar();

    // Save state
    saveSessionState();

    // Load and display sessions in sidebar
    projectList.classList.add('hidden');
    sessionList.classList.remove('hidden');
    sessionsContainer.innerHTML = '<div class="loading">Loading sessions</div>';
    newSessionBtn.classList.remove('hidden');

    try {
      const sessions = await api(`/api/projects/${encodeURIComponent(name)}/sessions`);

      if (sessions.length === 0) {
        sessionsContainer.innerHTML = '<div class="empty-state">No sessions yet</div>';
      } else {
        sessionsContainer.innerHTML = sessions.map(s => `
          <div class="session-item" data-id="${escapeAttr(s.id)}">
            <span class="session-preview">${escapeHtml(s.preview)}</span>
            <span class="session-date">${formatDate(s.lastModified)}</span>
          </div>
        `).join('');

        sessionsContainer.querySelectorAll('.session-item').forEach(el => {
          el.addEventListener('click', () => resumeSession(el.dataset.id));
        });
      }
    } catch (err) {
      sessionsContainer.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
    }

    return;
  }

  // Cannot reuse - create new tab (existing behavior)

  // Check if we can add another session
  if (state.sessions.length >= MAX_SESSIONS) {
    alert(`Maximum ${MAX_SESSIONS} sessions allowed`);
    return;
  }

  // Create a new session for this project
  const session = createSession(project, null);
  state.sessions.push(session);
  createSessionContainer(session);

  // Switch to the new session (deactivate current container first since switchToSession
  // needs activeSessionIndex to find the old session)
  const prevSession = getActiveSession();
  if (prevSession) prevSession.containerEl.classList.remove('active');
  state.activeSessionIndex = -1; // Reset to force switch
  switchToSession(state.sessions.length - 1);

  projectNameEl.textContent = displayName;
  if (!skipHashUpdate) updateHash(name);

  // Load custom commands for this project
  loadCustomCommands(path);

  projectList.classList.add('hidden');
  sessionList.classList.remove('hidden');
  sessionsContainer.innerHTML = '<div class="loading">Loading sessions</div>';
  newSessionBtn.classList.remove('hidden');

  // Initialize container with welcome message
  clearMessages(session);

  try {
    const sessions = await api(`/api/projects/${encodeURIComponent(name)}/sessions`);

    if (sessions.length === 0) {
      sessionsContainer.innerHTML = '<div class="empty-state">No sessions yet</div>';
    } else {
      sessionsContainer.innerHTML = sessions.map(s => `
        <div class="session-item" data-id="${escapeAttr(s.id)}">
          <span class="session-preview">${escapeHtml(s.preview)}</span>
          <span class="session-date">${formatDate(s.lastModified)}</span>
        </div>
      `).join('');

      sessionsContainer.querySelectorAll('.session-item').forEach(el => {
        el.addEventListener('click', () => resumeSession(el.dataset.id));
      });
    }
  } catch (err) {
    sessionsContainer.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
  }

  saveSessionState();
}

async function loadSessionHistory(session) {
  if (!session.sessionId) {
    clearMessages(session);
    return;
  }

  if (session.containerEl) {
    session.containerEl.innerHTML = '<div class="loading">Loading history</div>';
  }

  try {
    const projectName = session.project.name;
    const { messages } = await api(`/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(session.sessionId)}/messages?limit=50`);

    if (session.containerEl) session.containerEl.innerHTML = '';

    if (messages.length === 0) {
      if (session.containerEl) {
        session.containerEl.innerHTML = `
          <div class="welcome-message">
            <h2>Session Resumed</h2>
            <p>Continue your conversation with Claude.</p>
          </div>
        `;
      }
    } else {
      for (const msg of messages) {
        if (msg.role === 'user') {
          appendMessage('user', msg.content, session);
        } else if (msg.role === 'assistant') {
          appendMessage('assistant', msg.content, session);
        } else if (msg.role === 'tool') {
          appendToolMessage(msg.tool, getToolSummaryFromInput(msg.tool, msg.input), null, 'success', session);
        }
      }
      // Scroll to bottom to show most recent messages
      if (session.containerEl) {
        session.containerEl.scrollTop = session.containerEl.scrollHeight;
        session.isAtBottom = true;
      }
    }
  } catch (err) {
    if (session.containerEl) {
      session.containerEl.innerHTML = `
        <div class="welcome-message">
          <h2>Session Resumed</h2>
          <p>Could not load history. Continue your conversation.</p>
        </div>
      `;
    }
    // If session/project was deleted or doesn't exist, clear the sessionId so user starts fresh
    if (err.message && (err.message.includes('Failed to load') || err.message.includes('404'))) {
      session.sessionId = null;
    }
  }

  session.needsHistoryLoad = false;
}

async function resumeSession(sessionId, skipHashUpdate = false) {
  const session = getActiveSession();
  if (!session) return;

  session.sessionId = sessionId;
  if (!skipHashUpdate) updateHash(session.project.name, sessionId);
  closeSidebar();

  await loadSessionHistory(session);

  enableChat();
  saveSessionState();
}

function getToolSummaryFromInput(tool, input) {
  if (!input) return tool;
  switch (tool) {
    case 'Bash': return `$ ${(input.command || '').slice(0, 80)}`;
    case 'Read': return `Read ${input.file_path || input.path || ''}`;
    case 'Write': return `Write ${input.file_path || input.path || ''}`;
    case 'Edit': return `Edit ${input.file_path || input.path || ''}`;
    case 'Glob': return `Find ${input.pattern || ''}`;
    case 'Grep': return `Search ${input.pattern || ''}`;
    default: return tool;
  }
}

newSessionBtn.addEventListener('click', () => {
  const session = getActiveSession();
  if (!session) return;

  session.sessionId = null;
  updateHash(session.project.name);
  clearMessages(session);
  enableChat();
  closeSidebar();
  saveSessionState();
});

backToProjectsBtn.addEventListener('click', () => {
  sessionList.classList.add('hidden');
  projectList.classList.remove('hidden');
  newSessionBtn.classList.add('hidden');
  searchProjects(projectSearch.value);
});

function enableChat() {
  chatInput.disabled = false;
  sendBtn.disabled = false;
  modeBtn.disabled = false;
  attachBtn.disabled = false;
  chatInput.focus();
}

function updateTokenUsage(used, total, session) {
  session = session || getActiveSession();
  if (session) {
    session.lastTokenUsage = used;
    session.lastContextWindow = total;
  }

  if (session && state.sessions.indexOf(session) === state.activeSessionIndex) {
    if (!used || !total) {
      contextBar.classList.add('hidden');
      tokenUsageEl.textContent = '';
      tokenUsageEl.classList.add('hidden');
      return;
    }

    const usedK = Math.round(used / 1000);
    const totalK = Math.round(total / 1000);
    const pct = Math.round((used / total) * 100);

    // Update existing token display
    tokenUsageEl.textContent = `${usedK}k / ${totalK}k (${pct}%)`;
    tokenUsageEl.classList.remove('hidden');

    if (pct > 95) {
      tokenUsageEl.style.color = 'var(--error)';
    } else if (pct > 80) {
      tokenUsageEl.style.color = 'var(--warning)';
    } else {
      tokenUsageEl.style.color = '';
    }

    // Update context bar
    contextBar.classList.remove('hidden');
    if (session.model) {
      contextModel.textContent = session.model;
      contextModel.classList.remove('hidden');
    }
    contextUsageFill.style.width = `${Math.min(pct, 100)}%`;
    contextUsageText.textContent = `${usedK}k/${totalK}k`;

    // Color the fill based on usage
    if (pct > 95) {
      contextUsageFill.style.background = 'var(--neon-red)';
    } else if (pct > 80) {
      contextUsageFill.style.background = 'var(--neon-orange)';
    } else {
      contextUsageFill.style.background = 'var(--neon-cyan)';
    }
  }
}

function sendNotification(title, body) {
  if (!state.notificationsEnabled || !document.hidden) return;
  try {
    const notif = new Notification(title, {
      body: body,
      icon: '/favicon.ico',
      tag: 'cleon-ui',
      silent: false
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (e) {
    // Ignore - notifications may not be supported in this context
  }
}

function formatMarkdown(text) {
  if (!text) return '';
  
  let html = escapeHtml(text);
  
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const displayLang = lang || 'code';
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${displayLang}</span><button class="code-copy-btn" aria-label="Copy code">Copy</button></div><pre><code class="${lang}">${code}</code></pre></div>`;
  });
  
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/\n/g, '&#10;');
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return d.toLocaleDateString();
}

async function api(url, body = null) {
  const opts = { headers: {} };
  
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
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      state.token = null;
      showAuth();
    }
    throw new Error(data.error || 'Request failed');
  }
  
  return data;
}

window.addEventListener('hashchange', () => {
  if (state.token) {
    const session = getActiveSession();
    const route = parseHash();

    // Guard against redundant reloads - only reload if hash differs from current session
    if (!session || !route) {
      restoreFromHash();
      return;
    }

    if (session.project.name !== route.projectName || session.sessionId !== route.sessionId) {
      restoreFromHash();
    }
  }
});

// ============================================
// File Paste/Drop Attachment Handling
// ============================================

// Allowed file types for attachments
function isAllowedFileType(file) {
  const allowedTypes = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'text/plain', 'text/markdown',
    'application/pdf'
  ];
  const allowedExtensions = ['.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];

  if (allowedTypes.includes(file.type)) return true;

  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return allowedExtensions.includes(ext);
}

// Determine attachment type from file
function getAttachmentType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
  if (file.name.endsWith('.md')) return 'markdown';
  return 'text';
}

// Convert file to base64 data URL
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Truncate text for preview
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// Upload file to server (for PDFs that need server-side processing)
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${state.token}`
    },
    body: formData
  });

  if (!res.ok) {
    const data = await res.json().catch(err => {
      console.error('[Upload] Failed to parse error response:', err);
      return {};
    });
    throw new Error(data.error || 'File upload failed');
  }

  return res.json();
}

// Process and add a file as an attachment
async function processAndAddAttachment(file) {
  const session = getActiveSession();
  if (!session) return;

  if (session.attachments.length >= MAX_ATTACHMENTS) {
    alert(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
    return;
  }

  const attachment = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    name: file.name,
    type: getAttachmentType(file),
    size: file.size
  };

  try {
    if (attachment.type === 'image') {
      // Convert image to base64 for preview and sending
      attachment.data = await fileToBase64(file);
      attachment.preview = attachment.data;
      attachment.mediaType = file.type;
    } else if (attachment.type === 'text' || attachment.type === 'markdown') {
      // Read text content directly
      attachment.data = await file.text();
      attachment.preview = truncateText(attachment.data, 100);
    } else if (attachment.type === 'pdf') {
      // Upload PDF and get extracted text
      const result = await uploadFile(file);
      attachment.data = result.content;
      attachment.preview = truncateText(result.content, 100);
    }

    session.attachments.push(attachment);
    renderAttachmentPreview();
    chatInput.focus();
  } catch (err) {
    console.error('[Attachment] Error processing file:', err);
    alert(`Failed to process file: ${err.message}`);
  }
}

// Render attachment preview area
function renderAttachmentPreview() {
  const session = getActiveSession();
  if (!session || session.attachments.length === 0) {
    attachmentPreviewEl.classList.add('hidden');
    attachmentPreviewEl.innerHTML = '';
    return;
  }

  attachmentPreviewEl.classList.remove('hidden');
  attachmentPreviewEl.innerHTML = session.attachments.map(att => {
    if (att.type === 'image') {
      return `
        <div class="attachment-item image" data-id="${att.id}">
          <img src="${att.preview}" alt="${escapeAttr(att.name)}">
          <button class="attachment-remove" aria-label="Remove attachment">&times;</button>
        </div>
      `;
    }

    const icon = getFileIcon(att.name);
    return `
      <div class="attachment-item" data-id="${att.id}">
        <span class="attachment-icon">${icon}</span>
        <span class="attachment-name">${escapeHtml(att.name)}</span>
        <button class="attachment-remove" aria-label="Remove attachment">&times;</button>
      </div>
    `;
  }).join('');
}

// Remove attachment by ID via event delegation
function removeAttachment(id) {
  const session = getActiveSession();
  if (session) {
    session.attachments = session.attachments.filter(att => att.id !== id);
    renderAttachmentPreview();
  }
}

// Event delegation for attachment removal
attachmentPreviewEl.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.attachment-remove');
  if (removeBtn) {
    const attachmentItem = removeBtn.closest('.attachment-item');
    if (attachmentItem) {
      removeAttachment(attachmentItem.dataset.id);
    }
  }
});

// Format user message display with attachments
function formatUserMessageWithAttachments(content, attachments) {
  if (!attachments || attachments.length === 0) return content;

  const attachmentText = attachments.map(att => {
    if (att.type === 'image') {
      return `[Image: ${att.name}]`;
    }
    return `[${att.type.toUpperCase()}: ${att.name}]`;
  }).join(' ');

  return content ? `${content}\n\n${attachmentText}` : attachmentText;
}

// Paste event handler
document.addEventListener('paste', async (e) => {
  // Only handle if chat is enabled and a project is selected
  const session = getActiveSession();
  if (!session || chatInput.disabled) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file && isAllowedFileType(file)) {
        files.push(file);
      }
    }
  }

  if (files.length > 0) {
    e.preventDefault();
    for (const file of files) {
      await processAndAddAttachment(file);
    }
  }
});

// Attach button click handler (for mobile file selection)
attachBtn.addEventListener('click', () => {
  fileInput.click();
});

// File input change handler
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (isAllowedFileType(file)) {
      await processAndAddAttachment(file);
    }
  }
  fileInput.value = ''; // Reset for re-selection
});

// Drag and drop handlers
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  const session = getActiveSession();
  if (!session || chatInput.disabled) return;

  // Check if dragging files
  if (!e.dataTransfer?.types?.includes('Files')) return;

  dragCounter++;
  if (dragCounter === 1) {
    dropZoneOverlay.classList.remove('hidden');
  }
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    dropZoneOverlay.classList.add('hidden');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropZoneOverlay.classList.add('hidden');

  const session = getActiveSession();
  if (!session || chatInput.disabled) return;

  const files = Array.from(e.dataTransfer?.files || []);
  for (const file of files) {
    if (isAllowedFileType(file)) {
      await processAndAddAttachment(file);
    }
  }
});

init();
