# WebSocket Subscription Protocol

## Overview

This document describes the WebSocket subscription protocol for real-time multi-user conversation synchronization in Cleon UI.

## Design Philosophy

The subscription protocol is **dual-purpose** - serving both:

1. **Reconnection Support** (existing): Same user reconnects to an active session after network interruption
2. **Multi-User Sync** (new): Multiple users view the same session simultaneously with real-time updates

This dual-purpose approach maintains backward compatibility while enabling new functionality without introducing additional message types.

## Message Types

### Client → Server Messages

#### `subscribe`

Subscribes the current WebSocket connection to a session. This allows the client to receive all subsequent messages for that session.

**When to use:**
- After successfully connecting to the server (WebSocket open)
- When switching to a different session
- After loading session history
- When `session-active` response indicates an active session exists
- After reconnecting to an active session

**Request format:**
```json
{
  "type": "subscribe",
  "sessionId": "session-uuid-here"
}
```

**Fields:**
- `type` (string, required): Must be `"subscribe"`
- `sessionId` (string, required): The session ID to subscribe to

**Behavior:**
- If the session is active, the WebSocket is added to the session's subscriber set
- All messages sent to the session (from any client) will be broadcast to all subscribers
- The WebSocket's `subscribedSessions` Set is updated to include this sessionId
- Previous session subscriptions are automatically cleared (one active subscription per WebSocket)
- Server logs the subscription event with subscriber count

**Server response:**
```json
{
  "type": "subscribe-result",
  "success": true,
  "sessionId": "session-uuid-here"
}
```

**Fields:**
- `type` (string): `"subscribe-result"`
- `success` (boolean): `true` if subscription succeeded, `false` otherwise
- `sessionId` (string): The session ID for this subscription

**Failure cases:**
- Session is not active (`success: false`)
- Invalid session ID format (`success: false`)

### Server → Client Messages

#### `subscribe-result`

Response to a `subscribe` message, indicating success or failure.

**Format:** See response format above in `subscribe` section.

#### Session Broadcast Messages

Once subscribed, the client receives all session-related messages including:

- `claude-message`: Assistant responses (text, tool use, etc.)
- `claude-done`: End of assistant response
- `token-usage`: Token usage statistics
- `task-started`, `task-progress`, `task-completed`, `task-failed`: Task updates
- `error`: Error messages

**Important:** These messages are broadcast to ALL subscribers, not just the requesting client.

## Server-Side Implementation Notes

### WebSocket Object Extensions

The server extends WebSocket objects with a custom property:

```javascript
ws.subscribedSessions = new Set();  // Set<sessionId>
```

This tracks which sessions a WebSocket is subscribed to for cleanup on disconnect.

### Subscription State Management

The server maintains:

```javascript
sessionSubscribers: Map<sessionId, Set<WebSocket>>
```

This maps each session ID to the set of all subscribed WebSocket connections.

### Cleanup on Disconnect

When a WebSocket disconnects:

1. Iterate through `ws.subscribedSessions`
2. For each sessionId, remove the WebSocket from `sessionSubscribers.get(sessionId)`
3. Delete the session entry from `sessionSubscribers` if no subscribers remain
4. Clear `ws.subscribedSessions`

## Client-Side Implementation Notes

### State Tracking

The client should track its current subscription:

```javascript
state.currentSubscribedSessionId = null;  // string | null
```

### Auto-Subscription

The client automatically subscribes to sessions in these scenarios:

1. **After `resumeSession()` completes** - When a sessionId becomes known
2. **After `loadSessionHistory()` completes** - When viewing an existing session
3. **In `switchToSession()`** - When changing sessions
4. **During WebSocket reconnection** - In `ws.onopen` if a session is active
5. **When receiving `session-active`** - If the session is currently streaming

### Subscription Logic

```javascript
function subscribeToSession(sessionId) {
  // Validate input
  if (!sessionId) {
    console.log('[Subscribe] No sessionId - skipping subscription');
    return;
  }

  // Check WebSocket state
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    console.log('[Subscribe] WebSocket not open - cannot subscribe');
    return;
  }

  // Avoid duplicate subscriptions
  if (sessionId === state.currentSubscribedSessionId) {
    console.log('[Subscribe] Already subscribed to', sessionId);
    return;
  }

  // Send subscribe message
  console.log('[Subscribe] Subscribing to session', sessionId);
  state.ws.send(JSON.stringify({
    type: 'subscribe',
    sessionId: sessionId
  }));

  // Update tracking
  state.currentSubscribedSessionId = sessionId;
}
```

## Message Flow Examples

### Reconnection Flow (Existing Behavior)

```
Client WebSocket disconnects
    ↓
[Network interruption]
    ↓
WebSocket reconnects (ws.onopen fires)
    ↓
Client checks for active sessions
    ↓
Client sends: {"type":"check-active","sessionId":"session-123"}
    ↓
Server responds: {"type":"session-active","active":true,"sessionId":"session-123"}
    ↓
Client sends: {"type":"subscribe","sessionId":"session-123"}
    ↓
Server responds: {"type":"subscribe-result","success":true,"sessionId":"session-123"}
    ↓
Client now receives all session-123 messages
```

### Multi-User Flow (New Behavior)

```
User A opens session-123 in Browser Tab 1
    ↓
Tab 1 subscribes: {"type":"subscribe","sessionId":"session-123"}
    ↓
Server tracks: sessionSubscribers.get("session-123") = {Tab1_WS}
    ↓
User B opens session-123 in Browser Tab 2 (different user/device)
    ↓
Tab 2 subscribes: {"type":"subscribe","sessionId":"session-123"}
    ↓
Server tracks: sessionSubscribers.get("session-123") = {Tab1_WS, Tab2_WS}
    ↓
User A sends message to Claude in Tab 1
    ↓
Server processes message and broadcasts response
    ↓
Both Tab 1 and Tab 2 receive: {"type":"claude-message","sessionId":"session-123",...}
```

### Session Switch Flow

```
User currently subscribed to session-A
    ↓
User switches to session-B via UI
    ↓
Client sends: {"type":"subscribe","sessionId":"session-B"}
    ↓
Server:
  - Adds client to session-B subscribers
  - Client now in {session-A, session-B} temporarily
  - (Optional: client could send unsubscribe for session-A)
    - Actually, server auto-clears old subscription when new one arrives
    - Client just updates its tracking state
    ↓
Server responds: {"type":"subscribe-result","success":true,"sessionId":"session-B"}
    ↓
Client receives messages only for session-B
```

## Backward Compatibility

The protocol is fully backward compatible:

1. **Existing single-user flow works unchanged** - The `subscribe` message was already used for reconnection
2. **No new message types** - Extends existing behavior, doesn't introduce new types
3. **Existing `resubscribeSession` function** - Continues to work for reconnection scenarios
4. **Client behavior unchanged for non-active sessions** - Only subscribes to active/saved sessions

## Security Considerations

1. **Session validation** - Server only allows subscription to active sessions
2. **Authentication** - WebSocket connection requires valid token
3. **Session isolation** - Messages are only broadcast to subscribers of the same session
4. **No cross-session leaks** - Each session's subscriber set is isolated

## Error Handling

### Client-Side

- Skip subscription if `sessionId` is null/undefined (new unsaved sessions)
- Wait for WebSocket to be open before subscribing
- Log subscription attempts for debugging
- Handle `subscribe-result` with `success: false` gracefully

### Server-Side

- Return `success: false` if session is not active
- Clean up subscriptions on WebSocket disconnect
- Handle cases where `broadcastToSession` is called for sessions with no subscribers (silent fail)
- Log subscription/unsubscription events for monitoring

## Testing Checklist

- [ ] Single user reconnects to active session after disconnect
- [ ] Two users view same session simultaneously
- [ ] User switches between sessions (unsubscribes old, subscribes new)
- [ ] User disconnects (clean up all subscriptions)
- [ ] Message broadcast reaches all subscribers
- [ ] No duplicate messages sent to any WebSocket
- [ ] Existing tests continue to pass
