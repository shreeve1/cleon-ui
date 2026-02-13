/**
 * Session subscription manager module
 * Manages WebSocket subscriptions to sessions for multi-user broadcasting
 * Prevents circular dependencies between index.js and claude.js
 */

// Map of sessionId -> Set<WebSocket>
const sessionSubscribers = new Map();

// Message replay buffer for late-joining subscribers
// Map of sessionId -> Array of stringified messages
const sessionMessageBuffers = new Map();
// Map of sessionId -> number (current byte size of buffer)
const sessionBufferBytes = new Map();

const MAX_BUFFER_SIZE = 1000;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Subscribe a WebSocket to a session
 * @param {string} sessionId - The session ID to subscribe to
 * @param {WebSocket} ws - The WebSocket connection
 */
export function subscribeToSession(sessionId, ws) {
  if (!sessionSubscribers.has(sessionId)) {
    sessionSubscribers.set(sessionId, new Set());
  }
  sessionSubscribers.get(sessionId).add(ws);

  // Track subscriptions on the WebSocket for cleanup
  ws.subscribedSessions = ws.subscribedSessions || new Set();
  ws.subscribedSessions.add(sessionId);

  const subscriberCount = sessionSubscribers.get(sessionId).size;
  console.log(`[Broadcast] Session ${sessionId} now has ${subscriberCount} subscriber${subscriberCount === 1 ? '' : 's'}`);
}

/**
 * Unsubscribe a WebSocket from a session
 * @param {string} sessionId - The session ID to unsubscribe from
 * @param {WebSocket} ws - The WebSocket connection
 */
export function unsubscribeFromSession(sessionId, ws) {
  const subscribers = sessionSubscribers.get(sessionId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      sessionSubscribers.delete(sessionId);
      console.log(`[Broadcast] Session ${sessionId} has no more subscribers`);
    } else {
      console.log(`[Broadcast] Session ${sessionId} now has ${subscribers.size} subscriber${subscribers.size === 1 ? '' : 's'}`);
    }
  }

  // Remove from WebSocket's tracked subscriptions
  if (ws.subscribedSessions) {
    ws.subscribedSessions.delete(sessionId);
  }
}

/**
 * Broadcast a message to all subscribers of a session
 * @param {string} sessionId - The session ID to broadcast to
 * @param {object} message - The message object to broadcast
 */
export function broadcastToSession(sessionId, message) {
  const messageStr = JSON.stringify(message);

  // Capture message into replay buffer if active for this session
  const buffer = sessionMessageBuffers.get(sessionId);
  if (buffer) {
    const currentBytes = sessionBufferBytes.get(sessionId) || 0;
    if (buffer.length < MAX_BUFFER_SIZE && currentBytes + messageStr.length <= MAX_BUFFER_BYTES) {
      buffer.push(messageStr);
      sessionBufferBytes.set(sessionId, currentBytes + messageStr.length);
    } else if (!buffer.overflowed) {
      buffer.overflowed = true;
      console.log(`[Broadcast] Buffer overflow for session ${sessionId} (${buffer.length} messages, ${currentBytes} bytes) - stopped buffering`);
    }
  }

  const subscribers = sessionSubscribers.get(sessionId);
  if (!subscribers || subscribers.size === 0) {
    // Silent fail - no subscribers for this session
    return;
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const ws of subscribers) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(messageStr);
        sentCount++;
      } catch (err) {
        console.error(`[Broadcast] Failed to send to subscriber:`, err.message);
        failedCount++;
      }
    }
  }

  if (sentCount > 0 || failedCount > 0) {
    console.log(`[Broadcast] Sent message to ${sentCount}/${subscribers.size} subscriber${subscribers.size === 1 ? '' : 's'} in session ${sessionId}${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
  }
}

/**
 * Get the number of subscribers for a session
 * @param {string} sessionId - The session ID
 * @returns {number} Number of subscribers
 */
export function getSubscriberCount(sessionId) {
  const subscribers = sessionSubscribers.get(sessionId);
  return subscribers ? subscribers.size : 0;
}

/**
 * Check if a WebSocket is subscribed to a session
 * @param {string} sessionId - The session ID
 * @param {WebSocket} ws - The WebSocket connection
 * @returns {boolean} True if subscribed
 */
export function isSubscribed(sessionId, ws) {
  const subscribers = sessionSubscribers.get(sessionId);
  return subscribers ? subscribers.has(ws) : false;
}

/**
 * Start buffering messages for a session
 * Called when a session begins so late-joining subscribers can catch up
 * @param {string} sessionId - The session ID to buffer
 */
export function startSessionBuffer(sessionId) {
  sessionMessageBuffers.set(sessionId, []);
  sessionBufferBytes.set(sessionId, 0);
  console.log(`[Broadcast] Started message buffer for session ${sessionId}`);
}

/**
 * Replay buffered messages to a late-joining client
 * @param {string} sessionId - The session ID to replay
 * @param {WebSocket} ws - The WebSocket connection to replay to
 */
export function replayBufferToClient(sessionId, ws) {
  const buffer = sessionMessageBuffers.get(sessionId);
  if (!buffer || buffer.length === 0) {
    return;
  }

  if (ws.readyState !== 1) {
    return;
  }

  ws.send(JSON.stringify({ type: 'replay-start', sessionId }));

  for (const messageStr of buffer) {
    if (ws.readyState === 1) {
      ws.send(messageStr);
    }
  }

  ws.send(JSON.stringify({ type: 'replay-end', sessionId }));
  console.log(`[Broadcast] Replayed ${buffer.length} buffered messages to client for session ${sessionId}`);
}

/**
 * Clear the message buffer for a session
 * @param {string} sessionId - The session ID to clear buffer for
 */
export function clearSessionBuffer(sessionId) {
  const buffer = sessionMessageBuffers.get(sessionId);
  if (buffer) {
    console.log(`[Broadcast] Cleared buffer for session ${sessionId} (${buffer.length} messages)`);
  }
  sessionMessageBuffers.delete(sessionId);
  sessionBufferBytes.delete(sessionId);
}

/**
 * Clear all subscribers for a session (used when session ends/is aborted)
 * @param {string} sessionId - The session ID to clear
 * @returns {number} Number of subscribers that were cleared
 */
export function clearSessionSubscribers(sessionId) {
  const subscribers = sessionSubscribers.get(sessionId);
  if (!subscribers) {
    return 0;
  }

  const count = subscribers.size;

  // Remove sessionId from each subscriber's tracked sessions
  for (const ws of subscribers) {
    if (ws.subscribedSessions) {
      ws.subscribedSessions.delete(sessionId);
    }
  }

  // Remove the session entry
  sessionSubscribers.delete(sessionId);

  if (count > 0) {
    console.log(`[Broadcast] Cleared ${count} subscriber${count === 1 ? '' : 's'} from ended session ${sessionId}`);
  }

  // Also clear the message replay buffer for this session
  clearSessionBuffer(sessionId);

  return count;
}
