# Claude Code WebUI - Real CLI Integration Plan

## Overview

Connect the mobile WebUI to Claude Code by reading/writing session files directly from `~/.claude/projects/`

## Architecture

```
WebUI ←→ Session Files (JSONL) ←→ Claude Code CLI
```

Since Claude Code CLI doesn't expose a WebSocket server, we'll:
1. **Read** from the current project's `.jsonl` session file
2. **Write** user messages to the session
3. **Poll** for updates (Claude Code CLI appends responses)
4. **Parse** tool use and responses from the stream

## Implementation Steps

### 1. Create Session File Reader
**File**: `frontend/src/api/session-reader.ts`

- Read `.jsonl` files line by line
- Parse JSON lines into Message objects
- Watch for file changes (poll every 500ms)
- Extract tool use, responses, errors

### 2. Create Session File Writer
**File**: `frontend/src/api/session-writer.ts`

- Append user messages to `.jsonl`
- Create new session files for new projects
- Handle file permissions

### 3. Create Project Scanner
**File**: `frontend/src/api/project-scanner.ts`

- Scan `~/.claude/projects/` for project directories
- Parse `sessions-index.json` for metadata
- Extract project names, paths, last activity

### 4. Create Real-time Poller
**File**: `frontend/src/hooks/useSessionPoller.ts`

- Poll session file for changes every 500ms
- Detect new assistant messages
- Parse tool use events
- Update React state

### 5. Update Hooks
- **useChat.ts**: Use session writer instead of mock client
- **useProjects.ts**: Use project scanner instead of mock data
- **useConnection.ts**: Report "connected" when session file accessible

### 6. Create Backend Proxy (Optional)
**File**: `backend/session-proxy.ts`

If file access is blocked by CORS, create a simple Node.js proxy:
- Serve session files via HTTP
- Accept message submissions via POST
- Small Express server (~100 lines)

## Session File Format

Each `.jsonl` line structure:
```json
{"type":"user","content":[...]}
{"type":"assistant","content":[...]}
{"type":"tool_use","name":"bash","input":{"command":"ls"}}
{"type":"tool_result","output":"..."}
```

## Verification

1. Send message → appears in session file
2. Claude Code CLI responds → appears in WebUI
3. Tool use visible in real-time
4. Project switching works

## Open Questions

1. **CORS**: Can frontend read `~/.claude/` files directly?
   - If no, need backend proxy

2. **Real-time**: Polling vs FileSystem API?
   - Use File System Access API if available
   - Fall back to polling

3. **Permissions**: Can we write to user's home directory?
   - May need user to select folder via File System Access API
