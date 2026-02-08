# Plan: Multi-Session Management with Terminal Status Bar

## Task Description
Add multi-session support to Cleon UI so users can manage up to 5 concurrent sessions within a single browser tab, eliminating the need to open multiple browser tabs. Sessions are displayed in a retro terminal-style status bar at the bottom of the screen with clickable session indicators and keyboard shortcuts for switching.

## Objective
Replace the current one-tab-per-session model with a single-tab multi-session interface. Users can create, switch between, and close up to 5 sessions without leaving the current browser tab. The UI uses a tmux-inspired bottom status bar with session indicators that matches the existing retro 80s neon aesthetic.

## Problem Statement
Currently, each Cleon UI browser tab runs exactly one session. Users who work with multiple Claude sessions must open separate browser tabs, leading to:
- Browser tab clutter and difficulty tracking sessions
- Slow context switching between different conversations/projects
- Each tab maintains its own WebSocket connection, duplicating resources
- No cross-session awareness (can't see if another session has new messages)

## Solution Approach

### Architecture Overview
1. **Frontend**: Transform the single-session state model into a multi-session array. Add a status bar UI component. Each session gets its own hidden DOM container; switching sessions toggles CSS `display` properties for instant switching.
2. **Backend**: Multiplex all sessions over a single WebSocket connection by tagging every message with a `sessionId`. The server routes responses back to the correct session.
3. **Persistence**: Save session list and active session index to `localStorage` so sessions survive page refresh.

### Core Design Decisions (from brainstorming)
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session limit | 5 max | Keeps DOM manageable for mobile devices |
| Switching mechanism | Click indicators + Ctrl+1-5 | Fast for both mouse and keyboard users |
| DOM strategy | Keep all in DOM, hide with CSS | Instant switching (~0ms vs ~200ms rehydration) |
| WebSocket | Single connection, tagged messages | Research-backed best practice, reduces resource usage |
| Inactive session messages | Queue silently, show * indicator | Non-intrusive, user checks at their own pace |
| Mobile display | Numbers only: [1]* [2]* [3] | Ultra compact for small screens |
| New session UX | Quick project selector dropdown | Leverages existing project search |
| Session persistence | localStorage on every change | Survives refresh without IndexedDB complexity |
| Close UX | X button on hover/long-press | Clean, discoverable |
| At-capacity behavior | Block with error message | Simple, predictable |

## Relevant Files
Use these files to complete the task:

### Frontend
- **public/app.js:1-32** - Constants and consolidated state object (must be restructured for multi-session)
- **public/app.js:395-421** - `connectWebSocket()` - WebSocket setup (needs session tagging)
- **public/app.js:423-450** - `handleWsMessage(msg)` - WebSocket message routing (needs sessionId routing)
- **public/app.js:452-482** - `handleClaudeMessage(data)` - Message processing (needs per-session state)
- **public/app.js:484-493** - `flushPendingText()` - Flush streaming text (needs per-session targeting)
- **public/app.js:495-504** - `updateStreamingMessage()` - Streaming display (needs per-session container)
- **public/app.js:506-514** - `finishStreaming()` - End streaming (needs per-session state)
- **public/app.js:541-558** - `appendMessage(role, content)` - Append to messages container (needs per-session targeting)
- **public/app.js:560-590** - `appendToolMessage()` - Tool message display (needs per-session targeting)
- **public/app.js:776-784** - `clearMessages()` - Clear message container (needs per-session scope)
- **public/app.js:805-856** - `sendMessage(content)` - Send chat message (needs sessionId from active session)
- **public/app.js:1268-1332** - `searchProjects(query)` - Project search (reuse for quick project selector)
- **public/app.js:1334-1368** - `selectProject()` - Project selection (needs multi-session variant)
- **public/app.js:1370-1411** - `resumeSession()` - Resume session (needs multi-session variant)
- **public/app.js:1426-1432** - `newSessionBtn` click handler (needs to create session in specific slot)
- **public/app.js:1441-1447** - `enableChat()` - Enable chat input
- **public/app.js:1449-1467** - `updateTokenUsage()` - Token display (needs per-session tracking)
- **public/index.html** - HTML structure (needs status bar element and per-session containers)
- **public/style.css** - Styles (needs status bar styles with neon theme)

### Backend
- **server/index.js:186-249** - WebSocket connection handler (needs session routing)
- **server/index.js:199-201** - `handleChat` call (needs to pass sessionId context)
- **server/claude.js:57-250** - `handleChat()` - Chat handler (already uses sessionId, needs minor updates)
- **server/claude.js:23-52** - `processQueryStream()` - Stream processing (already sends sessionId in messages)
- **server/claude.js:312-316** - `sendMessage()` - WebSocket send helper (already includes sessionId)

### New Files
None - all changes are modifications to existing files.

## Implementation Phases

### Phase 1: State Architecture Refactor
Transform the single-session state model into a multi-session model. All existing functionality must continue to work with one session before adding UI for multiple.

### Phase 2: Session Container DOM
Create per-session DOM containers for messages. Each session gets its own `<div class="session-container">` inside the chat area. Only the active session's container is visible.

### Phase 3: Status Bar UI
Add the bottom status bar with session indicators, [+] button, and close buttons. Style with neon retro theme. Wire up click handlers for switching.

### Phase 4: WebSocket Multiplexing
Tag all WebSocket messages with `sessionId`. Update the message handler to route incoming messages to the correct session's state and DOM container. Handle messages arriving for inactive sessions (queue + unread indicator).

### Phase 5: Quick Project Selector
Implement the [+] button behavior: show a dropdown/modal with recent projects for creating new sessions. Enforce the 5-session limit.

### Phase 6: Keyboard Shortcuts
Add Ctrl+1 through Ctrl+5 keyboard shortcuts for session switching. Prevent conflicts with existing browser shortcuts on platforms where Ctrl+N opens new windows.

### Phase 7: Session Persistence
Save session metadata to localStorage. Restore sessions on page refresh. Handle edge cases (stale sessions, project paths that no longer exist).

### Phase 8: Session Close
Implement the X button for closing sessions. Handle closing the active session (auto-switch). Handle closing the last session. Clean up localStorage.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to to the building, validating, testing, deploying, and other tasks.
  - This is critical. You're job is to act as a high level director of the team, not a builder.
  - You're role is to validate all work is going well and make sure the team is on track to complete the plan.
  - You'll orchestrate this by using the Task* Tools to manage coordination between the team members.
  - Communication is paramount. You'll use the Task* Tools to communicate with the team members and ensure they're on track to complete the plan.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

- Builder
  - Name: frontend-builder
  - Role: Implement status bar UI, session switching, DOM containers, keyboard shortcuts, persistence, and all frontend changes in public/app.js, public/index.html, and public/style.css
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: backend-builder
  - Role: Update WebSocket message routing in server/index.js and server/claude.js to support session-tagged multiplexing
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: code-validator
  - Role: Validate the implementation works correctly, check for regressions, verify mobile responsiveness, and ensure no state leaks between sessions
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Refactor State Object for Multi-Session
- **Task ID**: refactor-state
- **Depends On**: none
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Transform `state` object in `public/app.js:8-32` to support multiple sessions:
  ```javascript
  const MAX_SESSIONS = 5;

  const state = {
    token: localStorage.getItem('token'),
    ws: null,
    wsReconnectAttempts: 0,
    // Multi-session state
    sessions: [],              // Array of session objects
    activeSessionIndex: -1,    // Index into sessions array, -1 = none
    // UI state (shared across sessions)
    modeIndex: 2,
    currentMode: 'bypass',
    searchTimeout: null,
    customCommands: []
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
      hasUnread: false,
      containerEl: null,                 // DOM reference
      // File mention state (per-session)
      fileMentionSelectedIndex: 0,
      fileMentionQuery: '',
      fileMentionStartPos: -1,
      fileMentionDebounceTimer: null,
      slashCommandSelectedIndex: -1
    };
  }
  ```
- Add helper functions:
  - `getActiveSession()` - returns `state.sessions[state.activeSessionIndex]` or null
  - `getSessionByInternalId(id)` - find session by internal tab ID
  - `getSessionBySessionId(sessionId)` - find session by Claude SDK session ID
- Update all references to `state.currentProject` to use `getActiveSession().project`
- Update all references to `state.currentSessionId` to use `getActiveSession().sessionId`
- Update all references to `state.isStreaming` to use `getActiveSession().isStreaming`
- Update all references to `state.pendingText` to use `getActiveSession().pendingText`
- Update all references to `state.pendingQuestion` to use `getActiveSession().pendingQuestion`
- Update all references to `state.attachments` to use `getActiveSession().attachments`
- Update all references to `state.lastTokenUsage` / `state.lastContextWindow` to use `getActiveSession().*`
- Ensure the app still works with a single session after this refactor (backward compatible)

### 2. Create Per-Session DOM Containers
- **Task ID**: session-dom-containers
- **Depends On**: refactor-state
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- In `public/index.html`, add a wrapper inside `#chat` for session containers:
  ```html
  <main id="chat">
    <div id="session-containers"></div>
    <form id="chat-form">...</form>
  </main>
  ```
- Each session gets a container div:
  ```html
  <div class="session-container active" data-session-id="internal-uuid">
    <!-- Messages for this session -->
  </div>
  ```
- Update `createSession()` to create and append a new container div to `#session-containers`
- Update `appendMessage()`, `appendToolMessage()`, `appendCommandMessage()`, `clearMessages()`, `scrollToBottom()`, `updateStreamingMessage()`, `flushPendingText()` to target the active session's container instead of the global `messagesEl`
- Replace global `messagesEl` usage with `getActiveSessionContainer()` helper that returns the active session's container element
- CSS: `.session-container { display: none; }` and `.session-container.active { display: block; flex: 1; overflow-y: auto; padding: 12px; }`
- Move existing `#messages` styles to `.session-container`

### 3. Add Status Bar HTML and CSS
- **Task ID**: status-bar-ui
- **Depends On**: session-dom-containers
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Add status bar HTML in `public/index.html` between `#chat` and `#chat-form` (or as last child of `#main-screen`):
  ```html
  <div id="session-bar">
    <div id="session-tabs"></div>
    <button id="new-session-tab-btn" class="session-tab-btn" title="New session">+</button>
  </div>
  ```
- Add CSS in `public/style.css` for the status bar:
  ```css
  #session-bar {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    background: var(--bg-darker, #050508);
    border-top: 1px solid var(--neon-purple, #9d4edd);
    gap: 4px;
    min-height: 36px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .session-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--neon-purple, #9d4edd);
    border-radius: 4px;
    color: var(--neon-purple, #9d4edd);
    font-family: monospace;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    position: relative;
    transition: all 0.15s ease;
  }

  .session-tab.active {
    background: rgba(0, 243, 255, 0.1);
    border-color: var(--neon-cyan, #00f3ff);
    color: var(--neon-cyan, #00f3ff);
    box-shadow: 0 0 8px rgba(0, 243, 255, 0.3);
  }

  .session-tab.unread::after {
    content: '*';
    color: var(--neon-pink, #ff00ff);
    font-weight: bold;
    margin-left: 2px;
    animation: pulse-unread 1.5s ease-in-out infinite;
  }

  @keyframes pulse-unread {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .session-tab .close-tab {
    display: none;
    background: none;
    border: none;
    color: var(--neon-red, #ff3366);
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .session-tab:hover .close-tab {
    display: inline;
  }

  #new-session-tab-btn {
    padding: 4px 10px;
    background: transparent;
    border: 1px dashed var(--neon-green, #39ff14);
    border-radius: 4px;
    color: var(--neon-green, #39ff14);
    font-family: monospace;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  #new-session-tab-btn:hover {
    background: rgba(57, 255, 20, 0.1);
    box-shadow: 0 0 8px rgba(57, 255, 20, 0.3);
  }

  /* Mobile: numbers only */
  @media (max-width: 767px) {
    .session-tab .session-tab-name {
      display: none;
    }
    .session-tab {
      min-width: 32px;
      justify-content: center;
    }
    /* Show close on long-press via JS instead of hover */
    .session-tab .close-tab {
      display: none !important;
    }
  }
  ```
- The status bar should appear between the chat area and the input form

### 4. Implement Session Switching Logic
- **Task ID**: session-switching
- **Depends On**: status-bar-ui
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Add `switchToSession(index)` function:
  - Validate index is within bounds
  - Deactivate current session container (remove `active` class)
  - Set `state.activeSessionIndex = index`
  - Activate new session container (add `active` class)
  - Clear `hasUnread` flag on the newly active session
  - Update status bar to reflect new active state
  - Update header project name and token usage from new session's state
  - Update URL hash to reflect new session's project/sessionId
  - Focus chat input
- Add `renderSessionBar()` function:
  - Clear and rebuild `#session-tabs` content
  - For each session in `state.sessions`, create a tab element:
    ```html
    <button class="session-tab active unread" data-index="0">
      <span class="session-tab-number">[1]</span>
      <span class="session-tab-name">ProjectName</span>
      <span class="close-tab" title="Close session">&times;</span>
    </button>
    ```
  - Add click handlers for switching and closing
  - Call this whenever sessions change (create, close, switch, unread update)
- Wire up click handlers on session tabs
- Call `renderSessionBar()` whenever session list changes

### 5. Implement Keyboard Shortcuts
- **Task ID**: keyboard-shortcuts
- **Depends On**: session-switching
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Add global `keydown` event listener for Ctrl+1 through Ctrl+5:
  ```javascript
  document.addEventListener('keydown', (e) => {
    // Ctrl+1 through Ctrl+5 for session switching
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
  ```
- Ensure shortcuts don't fire when typing in text inputs (check `e.target` is not an input/textarea, OR allow since Ctrl+number doesn't conflict with text input)
- Verify no conflicts with existing keyboard handlers in `chatInput.addEventListener('keydown', ...)` at line 863

### 6. Update WebSocket Message Routing
- **Task ID**: websocket-multiplexing
- **Depends On**: refactor-state
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside steps 3-5 since it's independent logic)
- Modify `handleWsMessage(msg)` at line 423 to route by `sessionId`:
  ```javascript
  function handleWsMessage(msg) {
    // Find which session this message belongs to
    const session = msg.sessionId
      ? getSessionBySessionId(msg.sessionId)
      : getActiveSession();

    if (!session && msg.type !== 'pong') {
      console.warn('[WS] Message for unknown session:', msg.sessionId);
      return;
    }

    switch (msg.type) {
      case 'session-created':
        if (session) session.sessionId = msg.sessionId;
        break;
      case 'claude-message':
        handleClaudeMessage(msg.data, session);
        break;
      case 'claude-done':
        finishStreaming(session);
        break;
      case 'token-usage':
        updateTokenUsage(msg.used, msg.contextWindow, session);
        break;
      case 'abort-result':
        if (msg.success) finishStreaming(session);
        break;
      case 'error':
        appendSystemMessage(`Error: ${msg.message}`, session);
        finishStreaming(session);
        break;
    }
  }
  ```
- Update `handleClaudeMessage(data)` to accept a session parameter and use session-specific state
- Update `flushPendingText()`, `updateStreamingMessage()`, `finishStreaming()` to accept session parameter
- Update `appendMessage()`, `appendToolMessage()`, `appendSystemMessage()`, `appendCommandMessage()` to accept optional session parameter (default to active session)
- When a message arrives for an inactive session, set `session.hasUnread = true` and call `renderSessionBar()` to show the `*` indicator

### 7. Update sendMessage for Multi-Session
- **Task ID**: update-send-message
- **Depends On**: websocket-multiplexing
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Modify `sendMessage(content)` at line 805 to use active session state:
  ```javascript
  function sendMessage(content) {
    const session = getActiveSession();
    if (!session) {
      alert('Please create or select a session first');
      return;
    }

    // Check local builtin commands (unchanged)
    if (isLocalBuiltinCommand(content)) {
      const { command, args } = parseCommand(content);
      executeBuiltinCommand(command, args);
      chatInput.value = '';
      chatInput.style.height = 'auto';
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

    // Attachments from session
    if (session.attachments.length > 0) {
      message.attachments = session.attachments.map(att => ({
        type: att.type,
        name: att.name,
        data: att.data,
        mediaType: att.mediaType
      }));
    }

    state.ws.send(JSON.stringify(message));
    // ... rest of function using session state
  }
  ```

### 8. Implement Quick Project Selector for New Session
- **Task ID**: quick-project-selector
- **Depends On**: session-switching, update-send-message
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Add HTML for quick project selector modal/dropdown in `public/index.html`:
  ```html
  <div id="quick-project-selector" class="hidden">
    <div class="quick-selector-header">
      <input type="text" id="quick-project-search" placeholder="Search projects...">
    </div>
    <div id="quick-project-list"></div>
  </div>
  ```
- Style the selector as a dropdown anchored above the [+] button, with neon border and dark background
- When [+] is clicked:
  1. Check if `state.sessions.length >= MAX_SESSIONS`
  2. If at limit, show error message: "Maximum 5 sessions. Close a session first."
  3. Otherwise, show the quick project selector dropdown
  4. Populate with recent/favorite projects using existing `searchProjects()` logic
  5. On project selection:
     - Call `createSession(project)` to create new session object
     - Add to `state.sessions` array
     - Create DOM container
     - Switch to the new session
     - Call `renderSessionBar()`
     - Close the dropdown
     - Save to localStorage

### 9. Implement Session Close
- **Task ID**: session-close
- **Depends On**: session-switching
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside step 8)
- Add `closeSession(index)` function:
  1. If session is streaming, abort it first via WebSocket
  2. Remove session's DOM container from `#session-containers`
  3. Remove session from `state.sessions` array
  4. If closing the active session:
     - If other sessions exist, switch to session at index 0 (or the next available)
     - If no sessions remain, show a "no sessions" state or open sidebar
  5. Call `renderSessionBar()`
  6. Save to localStorage
- Wire close button clicks (desktop: click X; mobile: long-press to reveal X)
- Mobile long-press handler:
  ```javascript
  let longPressTimer;
  tab.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
      // Show close button for this tab
      tab.querySelector('.close-tab').style.display = 'inline';
    }, 500);
  });
  tab.addEventListener('touchend', () => clearTimeout(longPressTimer));
  ```

### 10. Implement localStorage Persistence
- **Task ID**: localstorage-persistence
- **Depends On**: session-close, quick-project-selector
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: false
- Add `saveSessionState()` function:
  ```javascript
  function saveSessionState() {
    const sessionData = state.sessions.map(s => ({
      sessionId: s.sessionId,
      project: s.project,
      lastTokenUsage: s.lastTokenUsage,
      lastContextWindow: s.lastContextWindow
    }));
    localStorage.setItem('cleon-sessions', JSON.stringify(sessionData));
    localStorage.setItem('cleon-active-session', String(state.activeSessionIndex));
  }
  ```
- Add `restoreSessionState()` function:
  ```javascript
  function restoreSessionState() {
    try {
      const saved = JSON.parse(localStorage.getItem('cleon-sessions'));
      const activeIndex = parseInt(localStorage.getItem('cleon-active-session')) || 0;

      if (!saved || saved.length === 0) return false;

      for (const data of saved) {
        const session = createSession(data.project, data.sessionId);
        session.lastTokenUsage = data.lastTokenUsage;
        session.lastContextWindow = data.lastContextWindow;
        state.sessions.push(session);
        // Create DOM container for session
        createSessionContainer(session);
      }

      if (state.sessions.length > 0) {
        switchToSession(Math.min(activeIndex, state.sessions.length - 1));
      }

      return state.sessions.length > 0;
    } catch {
      return false;
    }
  }
  ```
- Call `saveSessionState()` in: `createSession`, `closeSession`, `switchToSession`, `handleWsMessage` (on session-created)
- Call `restoreSessionState()` in `init()` / `showMain()` before falling back to sidebar
- Note: Message history is NOT persisted (messages come from SDK session resume). On restore, each session loads as "Session Resumed" with the ability to send new messages that resume the Claude SDK session.

### 11. Update Header for Active Session Context
- **Task ID**: update-header
- **Depends On**: session-switching
- **Assigned To**: frontend-builder
- **Agent Type**: builder
- **Parallel**: true (can run alongside other tasks)
- When switching sessions, update:
  - `projectNameEl.textContent` = active session's project displayName
  - `tokenUsageEl` = active session's token usage
  - `abortBtn` visibility = active session's `isStreaming` state
  - URL hash = active session's project/sessionId

### 12. Update Backend WebSocket Routing (Minor)
- **Task ID**: backend-ws-routing
- **Depends On**: none
- **Assigned To**: backend-builder
- **Agent Type**: builder
- **Parallel**: true (independent of frontend work)
- The backend already includes `sessionId` in most messages. Verify and ensure:
  - `server/claude.js` - `sendMessage(ws, { type: 'claude-message', sessionId: ... })` already sends sessionId (line 33-37) - VERIFIED
  - `server/claude.js` - `session-created` message includes sessionId (line 216-219) - VERIFIED
  - `server/claude.js` - `claude-done` message includes sessionId (line 225-228) - VERIFIED
  - `server/claude.js` - `token-usage` message includes sessionId (line 44-48) - VERIFIED
  - `server/index.js` - `abort-result` includes sessionId (line 205-209) - VERIFIED
  - **NEEDED**: Ensure `error` messages at line 235-238 include the `sessionId` when available:
    ```javascript
    ws.send(JSON.stringify({
      type: 'error',
      sessionId: msg.sessionId || null,  // Add sessionId
      message: err.message || 'Internal error'
    }));
    ```
  - **NEEDED**: Ensure `question-response-result` at line 218-222 includes sessionId

### 13. Validate Full Implementation
- **Task ID**: validate-all
- **Depends On**: localstorage-persistence, update-header, backend-ws-routing, keyboard-shortcuts
- **Assigned To**: code-validator
- **Agent Type**: validator
- **Parallel**: false
- Read all modified files and verify:
  1. State refactor is complete - no remaining references to old `state.currentProject`, `state.currentSessionId`, `state.isStreaming`, `state.pendingText`, etc.
  2. All `appendMessage`, `appendToolMessage`, `updateStreamingMessage` calls target the correct session container
  3. WebSocket message routing correctly identifies sessions by sessionId
  4. Status bar renders correctly with active/unread indicators
  5. Keyboard shortcuts don't conflict with existing handlers
  6. localStorage persistence saves and restores correctly
  7. Session limit enforcement works
  8. Close session handles edge cases (closing active, closing last)
  9. No JavaScript syntax errors: `node -c public/app.js`
  10. No state leaks between sessions (check for global messagesEl usage)
  11. Mobile responsive: status bar numbers-only below 768px
  12. CSS neon theme consistency

## Acceptance Criteria
- [ ] Users can create up to 5 sessions in a single browser tab
- [ ] Status bar displays at the bottom with session indicators [1] [2] [3] etc.
- [ ] Active session indicator shows with cyan glow
- [ ] Unread indicator (*) appears on sessions with new messages in pink
- [ ] Clicking a session indicator switches to that session instantly (CSS toggle)
- [ ] Ctrl+1 through Ctrl+5 switches sessions via keyboard
- [ ] [+] button shows quick project selector dropdown
- [ ] 6th session attempt shows "Maximum 5 sessions" error
- [ ] X button appears on hover (desktop) or long-press (mobile) to close sessions
- [ ] Closing active session auto-switches to another session
- [ ] Sessions persist across page refresh via localStorage
- [ ] Messages for inactive sessions are queued and rendered in hidden DOM
- [ ] Single WebSocket connection serves all sessions
- [ ] Token usage displays for the active session
- [ ] Header updates (project name, tokens) when switching sessions
- [ ] Mobile displays numbers only (no project names in tabs)
- [ ] All existing single-session features continue to work
- [ ] No JavaScript errors in browser console
- [ ] Retro neon aesthetic maintained (cyan, pink, purple, green colors with glow effects)

## Validation Commands
Execute these commands to validate the task is complete:

- `node -c public/app.js` - Verify JavaScript syntax is valid
- `node -c server/index.js` - Verify server syntax is valid
- `node -c server/claude.js` - Verify claude handler syntax is valid
- Manual test: Open web UI, create session 1, send a message
- Manual test: Click [+], select project, verify session 2 appears in status bar
- Manual test: Click [1] tab, verify instant switch back to session 1
- Manual test: Press Ctrl+2, verify switches to session 2
- Manual test: Send message in session 1, switch to session 2, verify [1]* shows unread
- Manual test: Click [1], verify unread indicator clears
- Manual test: Try to create 6th session, verify error message
- Manual test: Close session with X button, verify auto-switch
- Manual test: Refresh page, verify sessions restored
- Manual test: On mobile (< 768px), verify numbers-only display in status bar

## Notes
- The Claude SDK handles session state server-side via `.jsonl` files. The frontend only needs to track the `sessionId` to resume sessions. No message persistence is needed on the frontend.
- The `state.currentProject` pattern is deeply embedded in the codebase (~15 references). The refactor in Step 1 is the highest-risk change and should be done carefully with search-and-replace verification.
- The existing `#messages` element will be replaced by per-session containers. All functions that currently use `messagesEl` directly need to be updated to target the active session's container.
- The abort button in the header should only affect the active session. If the user switches to a different session while one is streaming, the abort button should reflect the new session's streaming state.
- For the quick project selector, reuse the existing `searchProjects()` and `api()` functions rather than creating new API endpoints.
- The URL hash (`#/project/name/session/id`) should always reflect the active session's project and session ID.

## Research References
This spec was informed by parallel research across 5 domains:
1. **Tab Management UX** - MRU ordering, vertical tabs, keyboard-first with visual fallback
2. **Session State Management** - IndexedDB vs localStorage, virtual scrolling, aggressive unloading
3. **Mobile Multi-Session Patterns** - Bottom sheets are NOT for session switching, drawers preferred, thumb-zone optimization
4. **WebSocket Multiplexing** - Single connection with message tagging, ~200 connection browser limit, application-level multiplexing
5. **Retro Terminal UI** - tmux status bar inspiration, ASCII indicators, prefix key patterns, CRT scanline consistency
