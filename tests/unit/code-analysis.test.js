/**
 * Static code analysis tests for auto-reconnect feature
 * Verifies code structure without requiring runtime imports of heavy dependencies
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const claudeJs = readFileSync(resolve('server/claude.js'), 'utf8');
const indexJs = readFileSync(resolve('server/index.js'), 'utf8');
const appJs = readFileSync(resolve('public/app.js'), 'utf8');

// ─── server/claude.js code analysis ──────────────────────────────
describe('server/claude.js - code structure', () => {
  describe('sendMessage calls use sessionInfo.ws', () => {
    it('should have NO sendMessage(ws, ...) calls (only sendMessage(sessionInfo.ws, ...))', () => {
      // Find all sendMessage calls, excluding the function definition itself
      const lines = claudeJs.split('\n');
      const bareWsCalls = [];
      const sessionInfoWsCalls = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip the function definition line
        if (line.startsWith('function sendMessage(ws,')) continue;

        if (line.includes('sendMessage(ws,')) {
          bareWsCalls.push({ line: i + 1, content: line });
        }
        if (line.includes('sendMessage(sessionInfo.ws,')) {
          sessionInfoWsCalls.push({ line: i + 1, content: line });
        }
      }

      expect(bareWsCalls).toEqual([]);
      expect(sessionInfoWsCalls.length).toBeGreaterThanOrEqual(4);
    });

    it('should have sendMessage calls for claude-message, token-usage, claude-done, error, and session-created', () => {
      const expectedTypes = ['claude-message', 'token-usage', 'claude-done', 'error', 'session-created'];

      for (const type of expectedTypes) {
        const pattern = new RegExp(`sendMessage\\(sessionInfo\\.ws,\\s*\\{[^}]*type:\\s*'${type}'`);
        expect(claudeJs).toMatch(pattern);
      }
    });
  });

  describe('sessionInfo declaration order', () => {
    it('should declare sessionInfo BEFORE the options object', () => {
      const sessionInfoIndex = claudeJs.indexOf('const sessionInfo = {');
      const optionsIndex = claudeJs.indexOf('const options = {');

      expect(sessionInfoIndex).toBeGreaterThan(-1);
      expect(optionsIndex).toBeGreaterThan(-1);
      expect(sessionInfoIndex).toBeLessThan(optionsIndex);
    });

    it('sessionInfo should be initialized with queryInstance: null and ws', () => {
      expect(claudeJs).toMatch(/const sessionInfo = \{\s*queryInstance:\s*null,\s*ws\s*\}/);
    });
  });

  describe('resubscribeSession export', () => {
    it('should export resubscribeSession function', () => {
      expect(claudeJs).toMatch(/export function resubscribeSession\(/);
    });

    it('resubscribeSession should get sessionInfo from activeSessions and replace ws', () => {
      expect(claudeJs).toMatch(/activeSessions\.get\(sessionId\)/);
      expect(claudeJs).toMatch(/sessionInfo\.ws = newWs/);
    });
  });

  describe('processQueryStream signature', () => {
    it('should still accept sessionInfo as a parameter', () => {
      expect(claudeJs).toMatch(/async function processQueryStream\(queryInstance,\s*ws,\s*sessionInfo,\s*onSessionId\)/);
    });
  });

  describe('canUseTool uses sessionInfo.ws', () => {
    it('should use sendMessage(sessionInfo.ws, ...) inside canUseTool callback', () => {
      // Extract the canUseTool section
      const canUseToolStart = claudeJs.indexOf('canUseTool:');
      const canUseToolEnd = claudeJs.indexOf('// Allow all other tools', canUseToolStart);
      const canUseToolSection = claudeJs.slice(canUseToolStart, canUseToolEnd);

      expect(canUseToolSection).toContain('sendMessage(sessionInfo.ws,');
      expect(canUseToolSection).not.toMatch(/sendMessage\(ws,/);
    });
  });
});

// ─── server/index.js code analysis ───────────────────────────────
describe('server/index.js - code structure', () => {
  describe('imports', () => {
    it('should import isSessionActive from claude.js', () => {
      expect(indexJs).toContain('isSessionActive');
    });

    it('should import resubscribeSession from claude.js', () => {
      expect(indexJs).toContain('resubscribeSession');
    });

    it('should have a single import line with all required functions', () => {
      expect(indexJs).toMatch(/import\s*\{[^}]*handleChat[^}]*handleAbort[^}]*handleQuestionResponse[^}]*isSessionActive[^}]*resubscribeSession[^}]*\}\s*from\s*'\.\/claude\.js'/);
    });
  });

  describe('check-active handler', () => {
    it('should have a check-active case in the switch', () => {
      expect(indexJs).toMatch(/case\s*'check-active'/);
    });

    it('should respond with session-active type', () => {
      expect(indexJs).toMatch(/type:\s*'session-active'/);
    });

    it('should include sessionId in the response', () => {
      // Find the check-active case block
      const checkActiveStart = indexJs.indexOf("case 'check-active'");
      const checkActiveEnd = indexJs.indexOf('break;', checkActiveStart);
      const checkActiveBlock = indexJs.slice(checkActiveStart, checkActiveEnd);

      expect(checkActiveBlock).toContain('sessionId: msg.sessionId');
    });

    it('should call isSessionActive with msg.sessionId', () => {
      expect(indexJs).toMatch(/isSessionActive\(msg\.sessionId\)/);
    });

    it('should use direct ws.send (not sendMessage helper)', () => {
      const checkActiveStart = indexJs.indexOf("case 'check-active'");
      const checkActiveEnd = indexJs.indexOf('break;', checkActiveStart);
      const checkActiveBlock = indexJs.slice(checkActiveStart, checkActiveEnd);

      expect(checkActiveBlock).toContain('ws.send(');
    });
  });

  describe('subscribe handler', () => {
    it('should have a subscribe case in the switch', () => {
      expect(indexJs).toMatch(/case\s*'subscribe'/);
    });

    it('should respond with subscribe-result type', () => {
      expect(indexJs).toMatch(/type:\s*'subscribe-result'/);
    });

    it('should include sessionId in the response', () => {
      const subscribeStart = indexJs.indexOf("case 'subscribe'");
      const subscribeEnd = indexJs.indexOf('break;', subscribeStart);
      const subscribeBlock = indexJs.slice(subscribeStart, subscribeEnd);

      expect(subscribeBlock).toContain('sessionId: msg.sessionId');
    });

    it('should call resubscribeSession with msg.sessionId and ws', () => {
      expect(indexJs).toMatch(/resubscribeSession\(msg\.sessionId,\s*ws\)/);
    });

    it('should include success field in response', () => {
      const subscribeStart = indexJs.indexOf("case 'subscribe'");
      const subscribeEnd = indexJs.indexOf('break;', subscribeStart);
      const subscribeBlock = indexJs.slice(subscribeStart, subscribeEnd);

      expect(subscribeBlock).toContain('success:');
    });
  });
});

// ─── public/app.js code analysis ─────────────────────────────────
describe('public/app.js - code structure', () => {
  describe('state.sessionsRestored flag', () => {
    it('should have sessionsRestored in the state object', () => {
      expect(appJs).toMatch(/sessionsRestored:\s*false/);
    });
  });

  describe('checkAndReconnectActiveSessions function', () => {
    it('should define checkAndReconnectActiveSessions function', () => {
      expect(appJs).toMatch(/function checkAndReconnectActiveSessions\(\)/);
    });

    it('should check WebSocket readyState before sending', () => {
      const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
      const fnEnd = appJs.indexOf('\n}', fnStart);
      const fnBody = appJs.slice(fnStart, fnEnd);

      expect(fnBody).toContain('readyState');
      expect(fnBody).toContain('WebSocket.OPEN');
    });

    it('should iterate over state.sessions', () => {
      const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
      const fnEnd = appJs.indexOf('\n}', fnStart);
      const fnBody = appJs.slice(fnStart, fnEnd);

      expect(fnBody).toContain('state.sessions');
    });

    it('should send check-active message for sessions with sessionId', () => {
      const fnStart = appJs.indexOf('function checkAndReconnectActiveSessions()');
      const fnEnd = appJs.indexOf('\n}', fnStart);
      const fnBody = appJs.slice(fnStart, fnEnd);

      expect(fnBody).toContain("type: 'check-active'");
      expect(fnBody).toContain('session.sessionId');
    });
  });

  describe('ws.onopen calls checkAndReconnectActiveSessions', () => {
    it('should check sessionsRestored flag in onopen handler', () => {
      const onopenStart = appJs.indexOf('state.ws.onopen');
      const onopenEnd = appJs.indexOf('};', onopenStart);
      const onopenBody = appJs.slice(onopenStart, onopenEnd);

      expect(onopenBody).toContain('state.sessionsRestored');
      expect(onopenBody).toContain('checkAndReconnectActiveSessions()');
    });
  });

  describe('restoreSessionState sets flag and calls reconnect', () => {
    it('should set sessionsRestored = true in restoreSessionState', () => {
      const fnStart = appJs.indexOf('async function restoreSessionState()');
      const fnEnd = appJs.indexOf('\n}', fnStart + 100); // Skip past inner functions
      const fnBody = appJs.slice(fnStart, fnEnd);

      expect(fnBody).toContain('state.sessionsRestored = true');
    });

    it('should call checkAndReconnectActiveSessions in restoreSessionState', () => {
      const fnStart = appJs.indexOf('async function restoreSessionState()');
      const fnEnd = appJs.indexOf('\n}', fnStart + 100);
      const fnBody = appJs.slice(fnStart, fnEnd);

      expect(fnBody).toContain('checkAndReconnectActiveSessions()');
    });
  });

  describe('handleWsMessage handles session-active', () => {
    it('should have a session-active case', () => {
      expect(appJs).toMatch(/case\s*'session-active'/);
    });

    it('should set isStreaming = true on session-active', () => {
      const caseStart = appJs.indexOf("case 'session-active'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('session.isStreaming = true');
    });

    it('should send subscribe message on session-active', () => {
      const caseStart = appJs.indexOf("case 'session-active'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain("type: 'subscribe'");
    });

    it('should disable input controls for active session', () => {
      const caseStart = appJs.indexOf("case 'session-active'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('chatInput.disabled = true');
      expect(caseBody).toContain('sendBtn.disabled = true');
      expect(caseBody).toContain('modeBtn.disabled = true');
      expect(caseBody).toContain('attachBtn.disabled = true');
    });

    it('should show abort button for active session', () => {
      const caseStart = appJs.indexOf("case 'session-active'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain("abortBtn.classList.remove('hidden')");
    });
  });

  describe('handleWsMessage handles subscribe-result', () => {
    it('should have a subscribe-result case', () => {
      expect(appJs).toMatch(/case\s*'subscribe-result'/);
    });

    it('should handle failed subscribe (stream ended)', () => {
      const caseStart = appJs.indexOf("case 'subscribe-result'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('!msg.success');
      expect(caseBody).toContain('session.isStreaming = false');
    });

    it('should re-enable UI on failed subscribe', () => {
      const caseStart = appJs.indexOf("case 'subscribe-result'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('chatInput.disabled = false');
      expect(caseBody).toContain('sendBtn.disabled = false');
      expect(caseBody).toContain("abortBtn.classList.add('hidden')");
    });

    it('should log success on successful subscribe', () => {
      const caseStart = appJs.indexOf("case 'subscribe-result'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('Reconnected to active stream');
    });
  });

  describe('session-active and subscribe-result check active session index', () => {
    it('session-active should check if session is the active session before UI changes', () => {
      const caseStart = appJs.indexOf("case 'session-active'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('state.activeSessionIndex');
    });

    it('subscribe-result should check if session is the active session before UI changes', () => {
      const caseStart = appJs.indexOf("case 'subscribe-result'");
      const caseEnd = appJs.indexOf('break;', caseStart);
      const caseBody = appJs.slice(caseStart, caseEnd);

      expect(caseBody).toContain('state.activeSessionIndex');
    });
  });
});
