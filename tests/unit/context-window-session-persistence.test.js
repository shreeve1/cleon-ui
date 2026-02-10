/**
 * Unit Tests for Session State Persistence with Context Window Data
 * Tests saveSessionState and restoreSessionState functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock localStorage
const mockLocalStorage = {
  storage: {},
  getItem: vi.fn((key) => mockLocalStorage.storage[key] || null),
  setItem: vi.fn((key, value) => { mockLocalStorage.storage[key] = value; }),
  removeItem: vi.fn((key) => { delete mockLocalStorage.storage[key]; }),
  clear: vi.fn(() => { mockLocalStorage.storage = {}; })
};

// Mock sessions
let mockSessions;
let mockState;

// Replicate saveSessionState logic
function saveSessionState(sessions, activeSessionIndex) {
  const sessionData = sessions.map(s => ({
    sessionId: s.sessionId,
    project: s.project,
    lastTokenUsage: s.lastTokenUsage,
    lastContextWindow: s.lastContextWindow,
    model: s.model,
    cacheMetrics: s.cacheMetrics || null
  }));
  mockLocalStorage.setItem('cleon-sessions', JSON.stringify(sessionData));
  mockLocalStorage.setItem('cleon-active-session', String(activeSessionIndex));
}

// Replicate restoreSessionState logic
function restoreSessionState() {
  try {
    const saved = JSON.parse(mockLocalStorage.getItem('cleon-sessions'));
    const activeIndex = parseInt(mockLocalStorage.getItem('cleon-active-session')) || 0;
    if (!saved || saved.length === 0) return { restored: false, sessions: [], activeIndex: 0 };

    const restoredSessions = saved.map(data => ({
      sessionId: data.sessionId,
      project: data.project,
      lastTokenUsage: data.lastTokenUsage,
      lastContextWindow: data.lastContextWindow,
      model: data.model || null,
      cacheMetrics: data.cacheMetrics || null
    }));

    return { restored: true, sessions: restoredSessions, activeIndex };
  } catch (e) {
    return { restored: false, sessions: [], activeIndex: 0 };
  }
}

describe('Session State Persistence', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();

    mockSessions = [
      {
        id: 'session-1',
        sessionId: 'claude-session-abc123',
        project: { name: 'test-project', path: '/path/to/project', displayName: 'Test Project' },
        lastTokenUsage: 15000,
        lastContextWindow: 200000,
        model: 'claude-3-opus-20240229',
        cacheMetrics: { cacheRead: 5000, cacheCreate: 2000 }
      },
      {
        id: 'session-2',
        sessionId: null,
        project: { name: 'another-project', path: '/path/to/another', displayName: 'Another Project' },
        lastTokenUsage: null,
        lastContextWindow: null,
        model: null,
        cacheMetrics: null
      }
    ];

    mockState = {
      sessions: mockSessions,
      activeSessionIndex: 0
    };
  });

  describe('saveSessionState', () => {
    it('should save session data with context metrics', () => {
      saveSessionState(mockState.sessions, mockState.activeSessionIndex);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'cleon-sessions',
        expect.any(String)
      );

      const savedData = JSON.parse(mockLocalStorage.storage['cleon-sessions']);
      expect(savedData).toHaveLength(2);

      // First session should have all context data
      expect(savedData[0].sessionId).toBe('claude-session-abc123');
      expect(savedData[0].lastTokenUsage).toBe(15000);
      expect(savedData[0].lastContextWindow).toBe(200000);
      expect(savedData[0].model).toBe('claude-3-opus-20240229');
      expect(savedData[0].cacheMetrics).toEqual({ cacheRead: 5000, cacheCreate: 2000 });
    });

    it('should save null values for sessions without token usage', () => {
      saveSessionState(mockState.sessions, mockState.activeSessionIndex);

      const savedData = JSON.parse(mockLocalStorage.storage['cleon-sessions']);

      // Second session should have null values
      expect(savedData[1].lastTokenUsage).toBeNull();
      expect(savedData[1].lastContextWindow).toBeNull();
      expect(savedData[1].model).toBeNull();
      expect(savedData[1].cacheMetrics).toBeNull();
    });

    it('should save active session index', () => {
      saveSessionState(mockState.sessions, 1);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'cleon-active-session',
        '1'
      );
    });

    it('should handle sessions without cacheMetrics', () => {
      const sessionsWithoutCache = [{
        sessionId: 'test-session',
        project: { name: 'test', path: '/test', displayName: 'Test' },
        lastTokenUsage: 10000,
        lastContextWindow: 200000,
        model: 'claude-3-opus-20240229'
        // No cacheMetrics field
      }];

      saveSessionState(sessionsWithoutCache, 0);

      const savedData = JSON.parse(mockLocalStorage.storage['cleon-sessions']);
      expect(savedData[0].cacheMetrics).toBeNull();
    });

    it('should handle empty sessions array', () => {
      saveSessionState([], 0);

      const savedData = JSON.parse(mockLocalStorage.storage['cleon-sessions']);
      expect(savedData).toEqual([]);
    });
  });

  describe('restoreSessionState', () => {
    it('should restore sessions with all context data', () => {
      const savedData = [
        {
          sessionId: 'claude-session-abc123',
          project: { name: 'test-project', path: '/path/to/project', displayName: 'Test Project' },
          lastTokenUsage: 15000,
          lastContextWindow: 200000,
          model: 'claude-3-opus-20240229',
          cacheMetrics: { cacheRead: 5000, cacheCreate: 2000 }
        }
      ];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      mockLocalStorage.storage['cleon-active-session'] = '0';

      const result = restoreSessionState();

      expect(result.restored).toBe(true);
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].lastTokenUsage).toBe(15000);
      expect(result.sessions[0].lastContextWindow).toBe(200000);
      expect(result.sessions[0].model).toBe('claude-3-opus-20240229');
      expect(result.sessions[0].cacheMetrics).toEqual({ cacheRead: 5000, cacheCreate: 2000 });
    });

    it('should handle null cacheMetrics gracefully', () => {
      const savedData = [
        {
          sessionId: 'test-session',
          project: { name: 'test', path: '/test', displayName: 'Test' },
          lastTokenUsage: 10000,
          lastContextWindow: 200000,
          model: 'claude-3-opus-20240229',
          cacheMetrics: null
        }
      ];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      mockLocalStorage.storage['cleon-active-session'] = '0';

      const result = restoreSessionState();

      expect(result.sessions[0].cacheMetrics).toBeNull();
    });

    it('should handle missing cacheMetrics field (backward compatibility)', () => {
      const savedData = [
        {
          sessionId: 'test-session',
          project: { name: 'test', path: '/test', displayName: 'Test' },
          lastTokenUsage: 10000,
          lastContextWindow: 200000,
          model: 'claude-3-opus-20240229'
          // No cacheMetrics field - simulating old saved data
        }
      ];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      mockLocalStorage.storage['cleon-active-session'] = '0';

      const result = restoreSessionState();

      expect(result.sessions[0].cacheMetrics).toBeNull();
    });

    it('should handle missing model field (backward compatibility)', () => {
      const savedData = [
        {
          sessionId: 'test-session',
          project: { name: 'test', path: '/test', displayName: 'Test' },
          lastTokenUsage: 10000,
          lastContextWindow: 200000
          // No model field - simulating old saved data
        }
      ];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      mockLocalStorage.storage['cleon-active-session'] = '0';

      const result = restoreSessionState();

      expect(result.sessions[0].model).toBeNull();
    });

    it('should return restored: false for empty localStorage', () => {
      const result = restoreSessionState();

      expect(result.restored).toBe(false);
      expect(result.sessions).toEqual([]);
    });

    it('should return restored: false for invalid JSON', () => {
      mockLocalStorage.storage['cleon-sessions'] = 'invalid json';

      const result = restoreSessionState();

      expect(result.restored).toBe(false);
    });

    it('should restore active session index', () => {
      const savedData = [
        {
          sessionId: 'session-1',
          project: { name: 'test', path: '/test', displayName: 'Test' },
          lastTokenUsage: 10000,
          lastContextWindow: 200000
        },
        {
          sessionId: 'session-2',
          project: { name: 'test2', path: '/test2', displayName: 'Test 2' },
          lastTokenUsage: 20000,
          lastContextWindow: 200000
        }
      ];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      mockLocalStorage.storage['cleon-active-session'] = '1';

      const result = restoreSessionState();

      expect(result.activeIndex).toBe(1);
    });

    it('should default to 0 for missing active session index', () => {
      const savedData = [{ sessionId: 'test', project: { name: 'test', path: '/test', displayName: 'Test' } }];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      // No cleon-active-session key

      const result = restoreSessionState();

      expect(result.activeIndex).toBe(0);
    });

    it('should handle multiple sessions with mixed data', () => {
      const savedData = [
        {
          sessionId: 'active-session',
          project: { name: 'project-1', path: '/path/1', displayName: 'Project 1' },
          lastTokenUsage: 50000,
          lastContextWindow: 200000,
          model: 'claude-3-opus-20240229',
          cacheMetrics: { cacheRead: 10000, cacheCreate: 5000 }
        },
        {
          sessionId: null,
          project: { name: 'project-2', path: '/path/2', displayName: 'Project 2' },
          lastTokenUsage: null,
          lastContextWindow: null,
          model: null,
          cacheMetrics: null
        }
      ];
      mockLocalStorage.storage['cleon-sessions'] = JSON.stringify(savedData);
      mockLocalStorage.storage['cleon-active-session'] = '0';

      const result = restoreSessionState();

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].lastTokenUsage).toBe(50000);
      expect(result.sessions[0].cacheMetrics.cacheRead).toBe(10000);
      expect(result.sessions[1].lastTokenUsage).toBeNull();
      expect(result.sessions[1].cacheMetrics).toBeNull();
    });

    it('should preserve project data during save/restore cycle', () => {
      const originalSession = {
        sessionId: 'test-session',
        project: {
          name: 'my-project',
          path: '/home/user/projects/my-project',
          displayName: 'My Project'
        },
        lastTokenUsage: 25000,
        lastContextWindow: 200000,
        model: 'claude-3-5-sonnet-20241022',
        cacheMetrics: { cacheRead: 8000, cacheCreate: 3000 }
      };

      saveSessionState([originalSession], 0);
      const result = restoreSessionState();

      expect(result.sessions[0].project).toEqual(originalSession.project);
    });
  });

  describe('Round-trip Save/Restore', () => {
    it('should preserve all context data through save/restore cycle', () => {
      const originalSessions = [
        {
          sessionId: 'session-1',
          project: { name: 'project-1', path: '/path/1', displayName: 'Project 1' },
          lastTokenUsage: 15000,
          lastContextWindow: 200000,
          model: 'claude-3-opus-20240229',
          cacheMetrics: { cacheRead: 5000, cacheCreate: 2000 }
        }
      ];

      saveSessionState(originalSessions, 0);
      const result = restoreSessionState();

      expect(result.sessions[0]).toEqual({
        sessionId: 'session-1',
        project: { name: 'project-1', path: '/path/1', displayName: 'Project 1' },
        lastTokenUsage: 15000,
        lastContextWindow: 200000,
        model: 'claude-3-opus-20240229',
        cacheMetrics: { cacheRead: 5000, cacheCreate: 2000 }
      });
    });

    it('should handle very large token counts', () => {
      const originalSessions = [{
        sessionId: 'test-session',
        project: { name: 'test', path: '/test', displayName: 'Test' },
        lastTokenUsage: 10000000,
        lastContextWindow: 200000,
        model: 'claude-3-opus-20240229',
        cacheMetrics: { cacheRead: 5000000, cacheCreate: 2000000 }
      }];

      saveSessionState(originalSessions, 0);
      const result = restoreSessionState();

      expect(result.sessions[0].lastTokenUsage).toBe(10000000);
      expect(result.sessions[0].cacheMetrics.cacheRead).toBe(5000000);
    });
  });
});
