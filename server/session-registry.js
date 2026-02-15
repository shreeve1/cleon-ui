/**
 * Session registry for persistent session tracking
 * Tracks sessions across query() calls, survives between streaming sessions
 */

// Map of sessionId -> { username, projectPath, projectName, displayName, status, createdAt, lastActiveAt }
const sessions = new Map();

/**
 * Register or update a session in the registry
 * @param {string} sessionId - The session ID
 * @param {Object} metadata - Session metadata
 * @param {string} metadata.username - Username who owns this session
 * @param {string} metadata.projectPath - Path to the project
 * @param {string} metadata.projectName - Name of the project
 * @param {string} metadata.displayName - Display name for the session
 * @param {string} [metadata.status] - Status ('idle' or 'streaming', defaults to 'streaming')
 */
export function register(sessionId, metadata) {
  const existing = sessions.get(sessionId);
  sessions.set(sessionId, {
    ...metadata,
    status: metadata.status || 'streaming',
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastActiveAt: new Date().toISOString()
  });
}

/**
 * Update the status of a session
 * @param {string} sessionId - The session ID
 * @param {string} status - New status ('idle' or 'streaming')
 */
export function setStatus(sessionId, status) {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    session.lastActiveAt = new Date().toISOString();
  }
}

/**
 * Get all sessions for a specific user
 * @param {string} username - The username
 * @returns {Array} Array of session objects with sessionId included
 */
export function getSessionsForUser(username) {
  return [...sessions.entries()]
    .filter(([, s]) => s.username === username)
    .map(([id, s]) => ({ sessionId: id, ...s }));
}

/**
 * Check if a session is currently streaming
 * @param {string} sessionId - The session ID
 * @returns {boolean} True if session status is 'streaming'
 */
export function isStreaming(sessionId) {
  return sessions.get(sessionId)?.status === 'streaming';
}

/**
 * Get a single session by ID
 * @param {string} sessionId - The session ID
 * @returns {Object|null} Session object or null if not found
 */
export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Remove a session from the registry (explicit cleanup only)
 * @param {string} sessionId - The session ID
 */
export function remove(sessionId) {
  sessions.delete(sessionId);
}
