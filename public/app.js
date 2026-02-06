const state = {
  token: localStorage.getItem('token'),
  ws: null,
  wsReconnectAttempts: 0,
  currentProject: null,
  currentSessionId: null,
  isStreaming: false,
  pendingText: ''
};

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
const messagesEl = $('#messages');
const abortBtn = $('#abort-btn');
const projectNameEl = $('#project-name');
const tokenUsageEl = $('#token-usage');

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

function connectWebSocket() {
  if (state.ws?.readyState === WebSocket.OPEN) return;
  
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}?token=${state.token}`);
  
  state.ws.onopen = () => {
    console.log('[WS] Connected');
    state.wsReconnectAttempts = 0;
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
  switch (msg.type) {
    case 'session-created':
      state.currentSessionId = msg.sessionId;
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
      
    case 'abort-result':
      if (msg.success) finishStreaming();
      break;
      
    case 'error':
      appendSystemMessage(`Error: ${msg.message}`);
      finishStreaming();
      break;
  }
}

function handleClaudeMessage(data) {
  if (!data) return;
  
  if (data.type === 'text') {
    state.pendingText += data.content || '';
    updateStreamingMessage();
    return;
  }
  
  if (data.type === 'tool_use') {
    flushPendingText();
    appendToolMessage(data.tool, data.summary, data.id, 'running');
    return;
  }
  
  if (data.type === 'tool_result') {
    updateToolResult(data.id, data.success, data.output);
    return;
  }
}

function flushPendingText() {
  if (state.pendingText) {
    const streamingEl = messagesEl.querySelector('.message.streaming');
    if (streamingEl) {
      streamingEl.classList.remove('streaming');
      streamingEl.innerHTML = formatMarkdown(state.pendingText);
    }
    state.pendingText = '';
  }
}

function updateStreamingMessage() {
  let el = messagesEl.querySelector('.message.streaming');
  if (!el) {
    el = document.createElement('div');
    el.className = 'message assistant streaming';
    messagesEl.appendChild(el);
  }
  el.innerHTML = formatMarkdown(state.pendingText);
  scrollToBottom();
}

function finishStreaming() {
  state.isStreaming = false;
  abortBtn.classList.add('hidden');
  chatInput.disabled = false;
  sendBtn.disabled = false;
  
  flushPendingText();
  
  const streamingEl = messagesEl.querySelector('.message.streaming');
  if (streamingEl) {
    streamingEl.classList.remove('streaming');
  }
}

function appendMessage(role, content) {
  removeWelcome();
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = role === 'user' ? escapeHtml(content) : formatMarkdown(content);
  messagesEl.appendChild(div);
  scrollToBottom();
}

function appendSystemMessage(content) {
  removeWelcome();
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.style.borderLeft = '3px solid var(--error)';
  div.textContent = content;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function appendToolMessage(tool, summary, id, status) {
  removeWelcome();
  const div = document.createElement('div');
  div.className = `message tool ${status}`;
  div.dataset.toolId = id || '';
  div.innerHTML = `
    <div class="tool-header">
      <span class="tool-name">${escapeHtml(tool)}</span>
      <span class="tool-status">${status}</span>
    </div>
    <div class="tool-summary">${escapeHtml(summary || '')}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function updateToolResult(id, success, output) {
  const toolMsgs = messagesEl.querySelectorAll('.message.tool');
  let target = null;
  
  if (id) {
    target = messagesEl.querySelector(`.message.tool[data-tool-id="${id}"]`);
  }
  if (!target && toolMsgs.length > 0) {
    target = toolMsgs[toolMsgs.length - 1];
  }
  
  if (target) {
    target.classList.remove('running');
    target.classList.add(success ? 'success' : 'error');
    
    const statusEl = target.querySelector('.tool-status');
    if (statusEl) statusEl.textContent = success ? 'done' : 'failed';
    
    if (output && output.trim()) {
      const outputEl = document.createElement('div');
      outputEl.className = 'tool-output';
      outputEl.textContent = output;
      target.appendChild(outputEl);
    }
  }
  scrollToBottom();
}

function removeWelcome() {
  const welcome = messagesEl.querySelector('.welcome-message');
  if (welcome) welcome.remove();
}

function clearMessages() {
  messagesEl.innerHTML = `
    <div class="welcome-message">
      <h2>New Session</h2>
      <p>Start typing to chat with Claude.</p>
    </div>
  `;
  state.pendingText = '';
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = chatInput.value.trim();
  if (!content || state.isStreaming) return;
  
  if (!state.currentProject) {
    alert('Please select a project first (tap the menu icon)');
    return;
  }
  
  sendMessage(content);
});

function sendMessage(content) {
  state.ws.send(JSON.stringify({
    type: 'chat',
    content,
    projectPath: state.currentProject.path,
    sessionId: state.currentSessionId,
    isNewSession: !state.currentSessionId
  }));
  
  appendMessage('user', content);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  state.isStreaming = true;
  abortBtn.classList.remove('hidden');
  chatInput.disabled = true;
  sendBtn.disabled = true;
}

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

abortBtn.addEventListener('click', () => {
  if (state.currentSessionId && state.isStreaming) {
    state.ws.send(JSON.stringify({
      type: 'abort',
      sessionId: state.currentSessionId
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
}

menuBtn.addEventListener('click', openSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

let searchTimeout;
projectSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchProjects(projectSearch.value), 300);
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
    
    projectList.innerHTML = projects.map(p => `
      <div class="project-item" data-name="${escapeAttr(p.name)}" data-path="${escapeAttr(p.path)}">
        <span class="session-count">${p.sessionCount}</span>
        <span class="project-name">${escapeHtml(p.displayName)}</span>
        <span class="project-path">${escapeHtml(p.path)}</span>
      </div>
    `).join('');
    
    projectList.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', () => {
        selectProject(el.dataset.name, el.dataset.path, el.querySelector('.project-name').textContent);
      });
    });
    
  } catch (err) {
    projectList.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
  }
}

async function selectProject(name, path, displayName) {
  state.currentProject = { name, path, displayName };
  projectNameEl.textContent = displayName;
  
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
}

async function resumeSession(sessionId) {
  state.currentSessionId = sessionId;
  clearMessages();
  messagesEl.innerHTML = '<div class="loading">Loading history</div>';
  closeSidebar();
  
  try {
    const projectName = state.currentProject.name;
    const { messages } = await api(`/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/messages?limit=50`);
    
    messagesEl.innerHTML = '';
    
    if (messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="welcome-message">
          <h2>Session Resumed</h2>
          <p>Continue your conversation with Claude.</p>
        </div>
      `;
    } else {
      for (const msg of messages) {
        if (msg.role === 'user') {
          appendMessage('user', msg.content);
        } else if (msg.role === 'assistant') {
          appendMessage('assistant', msg.content);
        } else if (msg.role === 'tool') {
          appendToolMessage(msg.tool, getToolSummaryFromInput(msg.tool, msg.input), null, 'success');
        }
      }
    }
  } catch (err) {
    messagesEl.innerHTML = `
      <div class="welcome-message">
        <h2>Session Resumed</h2>
        <p>Could not load history. Continue your conversation.</p>
      </div>
    `;
  }
  
  enableChat();
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
  state.currentSessionId = null;
  clearMessages();
  enableChat();
  closeSidebar();
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
  chatInput.focus();
}

function updateTokenUsage(used, total) {
  const usedK = Math.round(used / 1000);
  const totalK = Math.round(total / 1000);
  const pct = Math.round((used / total) * 100);
  tokenUsageEl.textContent = `${usedK}k / ${totalK}k (${pct}%)`;
  tokenUsageEl.classList.remove('hidden');
  
  if (pct > 80) {
    tokenUsageEl.style.color = 'var(--warning)';
  } else if (pct > 95) {
    tokenUsageEl.style.color = 'var(--error)';
  } else {
    tokenUsageEl.style.color = '';
  }
}

function formatMarkdown(text) {
  if (!text) return '';
  
  let html = escapeHtml(text);
  
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="${lang}">${code}</code></pre>`;
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

init();
