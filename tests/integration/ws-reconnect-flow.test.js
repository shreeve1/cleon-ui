/**
 * Integration tests for auto-reconnect WebSocket message flow
 * Tests the full protocol: check-active → session-active → subscribe → subscribe-result
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const indexJs = readFileSync(resolve('server/index.js'), 'utf8');
const claudeJs = readFileSync(resolve('server/claude.js'), 'utf8');
const appJs = readFileSync(resolve('public/app.js'), 'utf8');

// ─── Protocol flow: check-active ─────────────────────────────────
describe('check-active message flow', () => {
  it('client sends check-active with type and sessionId', () => {
    const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
    const fnEnd = appJs.indexOf('\n}', fnStart);
    const fnBody = appJs.slice(fnStart, fnEnd);

    // Client sends { type: 'check-active', sessionId: ... }
    expect(fnBody).toContain("type: 'check-active'");
    expect(fnBody).toContain('sessionId: session.sessionId');
  });

  it('server handles check-active and responds with session-active', () => {
    const caseStart = indexJs.indexOf("case 'check-active'");
    const caseEnd = indexJs.indexOf('break;', caseStart);
    const caseBody = indexJs.slice(caseStart, caseEnd);

    // Server responds with { type: 'session-active', sessionId, active }
    expect(caseBody).toContain("type: 'session-active'");
    expect(caseBody).toContain('sessionId: msg.sessionId');
    expect(caseBody).toContain('active: isSessionActive(msg.sessionId)');
  });

  it('client handles session-active response', () => {
    expect(appJs).toMatch(/case\s*'session-active'/);
  });
});

// ─── Protocol flow: subscribe ────────────────────────────────────
describe('subscribe message flow', () => {
  it('client sends subscribe with type and sessionId after session-active', () => {
    const caseStart = appJs.indexOf("case 'session-active'");
    const caseEnd = appJs.indexOf('break;', caseStart);
    const caseBody = appJs.slice(caseStart, caseEnd);

    // Client sends subscribe when session is active
    expect(caseBody).toContain("type: 'subscribe'");
    expect(caseBody).toContain('sessionId: msg.sessionId');
  });

  it('server handles subscribe and responds with subscribe-result', () => {
    const caseStart = indexJs.indexOf("case 'subscribe'");
    const caseEnd = indexJs.indexOf('break;', caseStart);
    const caseBody = indexJs.slice(caseStart, caseEnd);

    // Server responds with { type: 'subscribe-result', sessionId, success }
    expect(caseBody).toContain("type: 'subscribe-result'");
    expect(caseBody).toContain('sessionId: msg.sessionId');
    expect(caseBody).toContain('success:');
  });

  it('server calls resubscribeSession to replace the WebSocket', () => {
    const caseStart = indexJs.indexOf("case 'subscribe'");
    const caseEnd = indexJs.indexOf('break;', caseStart);
    const caseBody = indexJs.slice(caseStart, caseEnd);

    expect(caseBody).toContain('resubscribeSession(msg.sessionId, ws)');
  });

  it('client handles subscribe-result response', () => {
    expect(appJs).toMatch(/case\s*'subscribe-result'/);
  });
});

// ─── Full reconnection protocol flow ─────────────────────────────
describe('full reconnection protocol flow', () => {
  it('all four message types exist in the protocol', () => {
    // Client → Server
    expect(appJs).toContain("type: 'check-active'");
    expect(appJs).toContain("type: 'subscribe'");

    // Server → Client
    expect(indexJs).toContain("type: 'session-active'");
    expect(indexJs).toContain("type: 'subscribe-result'");

    // Client handlers
    expect(appJs).toMatch(/case\s*'session-active'/);
    expect(appJs).toMatch(/case\s*'subscribe-result'/);

    // Server handlers
    expect(indexJs).toMatch(/case\s*'check-active'/);
    expect(indexJs).toMatch(/case\s*'subscribe'/);
  });

  it('sessionId is included in all new messages for multi-session routing', () => {
    // check-active (client → server)
    const checkActiveFn = appJs.slice(
      appJs.indexOf('function checkAndReconnectActiveSessions()'),
      appJs.indexOf('\n}', appJs.indexOf('function checkAndReconnectActiveSessions()'))
    );
    expect(checkActiveFn).toContain('sessionId:');

    // session-active (server → client)
    const sessionActiveCase = indexJs.slice(
      indexJs.indexOf("case 'check-active'"),
      indexJs.indexOf('break;', indexJs.indexOf("case 'check-active'"))
    );
    expect(sessionActiveCase).toContain('sessionId: msg.sessionId');

    // subscribe (client → server)
    const subscribeClient = appJs.slice(
      appJs.indexOf("case 'session-active'"),
      appJs.indexOf('break;', appJs.indexOf("case 'session-active'"))
    );
    expect(subscribeClient).toContain('sessionId: msg.sessionId');

    // subscribe-result (server → client)
    const subscribeServer = indexJs.slice(
      indexJs.indexOf("case 'subscribe'"),
      indexJs.indexOf('break;', indexJs.indexOf("case 'subscribe'"))
    );
    expect(subscribeServer).toContain('sessionId: msg.sessionId');
  });

  it('field names are consistent between server and client', () => {
    // session-active response: active field
    const serverCheckActive = indexJs.slice(
      indexJs.indexOf("case 'check-active'"),
      indexJs.indexOf('break;', indexJs.indexOf("case 'check-active'"))
    );
    expect(serverCheckActive).toContain('active:');

    const clientSessionActive = appJs.slice(
      appJs.indexOf("case 'session-active'"),
      appJs.indexOf('break;', appJs.indexOf("case 'session-active'"))
    );
    expect(clientSessionActive).toContain('msg.active');

    // subscribe-result response: success field
    const serverSubscribe = indexJs.slice(
      indexJs.indexOf("case 'subscribe'"),
      indexJs.indexOf('break;', indexJs.indexOf("case 'subscribe'"))
    );
    expect(serverSubscribe).toContain('success:');

    const clientSubscribeResult = appJs.slice(
      appJs.indexOf("case 'subscribe-result'"),
      appJs.indexOf('break;', appJs.indexOf("case 'subscribe-result'"))
    );
    expect(clientSubscribeResult).toContain('msg.success');
  });
});

// ─── Edge case: stream ends between check and subscribe ──────────
describe('edge case: stream ends between check and subscribe', () => {
  it('subscribe-result with success=false triggers UI re-enable', () => {
    const caseStart = appJs.indexOf("case 'subscribe-result'");
    const caseEnd = appJs.indexOf('break;', caseStart);
    const caseBody = appJs.slice(caseStart, caseEnd);

    // Should check for !msg.success
    expect(caseBody).toContain('!msg.success');
    // Should set isStreaming to false
    expect(caseBody).toContain('session.isStreaming = false');
    // Should re-enable inputs
    expect(caseBody).toContain('chatInput.disabled = false');
    expect(caseBody).toContain('sendBtn.disabled = false');
    expect(caseBody).toContain('modeBtn.disabled = false');
    expect(caseBody).toContain('attachBtn.disabled = false');
    // Should hide abort button
    expect(caseBody).toContain("abortBtn.classList.add('hidden')");
  });
});

// ─── Edge case: multiple sessions ────────────────────────────────
describe('edge case: multiple active sessions', () => {
  it('checkAndReconnectActiveSessions iterates ALL sessions', () => {
    const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
    const fnEnd = appJs.indexOf('\n}', fnStart);
    const fnBody = appJs.slice(fnStart, fnEnd);

    // Should use for...of loop over all sessions
    expect(fnBody).toMatch(/for\s*\(\s*const session of state\.sessions\)/);
  });

  it('each session with sessionId gets a check-active message', () => {
    const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
    const fnEnd = appJs.indexOf('\n}', fnStart);
    const fnBody = appJs.slice(fnStart, fnEnd);

    // Should check session.sessionId and send individual check-active
    expect(fnBody).toContain('if (session.sessionId)');
    expect(fnBody).toContain("type: 'check-active'");
  });
});

// ─── Edge case: race condition handling ──────────────────────────
describe('edge case: WS connect and session restore race condition', () => {
  it('has dual-path triggering for reconnection check', () => {
    // Path 1: ws.onopen checks sessionsRestored flag
    const onopenStart = appJs.indexOf('state.ws.onopen');
    const onopenEnd = appJs.indexOf('};', onopenStart);
    const onopenBody = appJs.slice(onopenStart, onopenEnd);

    expect(onopenBody).toContain('state.sessionsRestored');
    expect(onopenBody).toContain('checkAndReconnectActiveSessions()');

    // Path 2: restoreSessionState sets flag and calls reconnect
    const restoreStart = appJs.indexOf('async function restoreSessionState()');
    const restoreEnd = appJs.indexOf('} catch', restoreStart);
    const restoreBody = appJs.slice(restoreStart, restoreEnd);

    expect(restoreBody).toContain('state.sessionsRestored = true');
    expect(restoreBody).toContain('checkAndReconnectActiveSessions()');
  });

  it('checkAndReconnectActiveSessions guards against WS not being open', () => {
    const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
    const fnEnd = appJs.indexOf('\n}', fnStart);
    const fnBody = appJs.slice(fnStart, fnEnd);

    // Should return early if WS is not open
    expect(fnBody).toContain('!state.ws');
    expect(fnBody).toContain('readyState !== WebSocket.OPEN');
    expect(fnBody).toContain('return');
  });
});

// ─── WebSocket replacement mechanism ─────────────────────────────
describe('WebSocket replacement mechanism', () => {
  it('resubscribeSession replaces ws on the sessionInfo object', () => {
    // Check that the function modifies sessionInfo.ws
    expect(claudeJs).toMatch(/sessionInfo\.ws = newWs/);
  });

  it('processQueryStream reads from sessionInfo.ws, enabling mid-stream swap', () => {
    // Extract processQueryStream body
    const fnStart = claudeJs.indexOf('async function processQueryStream(');
    const fnEnd = claudeJs.indexOf('\n}', fnStart + 50);
    const fnBody = claudeJs.slice(fnStart, fnEnd);

    // Should use sessionInfo.ws, not the ws parameter
    expect(fnBody).toContain('sendMessage(sessionInfo.ws,');
    // Should NOT have bare sendMessage(ws, calls
    const bareMatch = fnBody.match(/sendMessage\(ws,/g);
    expect(bareMatch).toBeNull();
  });

  it('sendMessage function checks readyState before sending', () => {
    // The sendMessage function should check readyState === 1 (OPEN)
    expect(claudeJs).toMatch(/function sendMessage\(ws, data\)/);
    expect(claudeJs).toMatch(/ws\.readyState === 1/);
  });
});
