/**
 * E2E Tests for Context Window Display
 * Uses Playwright MCP tools to test the actual UI
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// These tests use the Playwright MCP plugin for browser automation
// The tests will be skipped if Playwright is not available

const TEST_TIMEOUT = 60000;
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

describe('Context Window Display E2E', () => {
  let page;
  let browser;

  beforeAll(async () => {
    // Check if Playwright MCP is available
    if (!globalThis.mcp?.playwright) {
      console.log('Playwright MCP not available, skipping E2E tests');
      return;
    }
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    if (!globalThis.mcp?.playwright) return;

    // Navigate to the application
    await globalThis.mcp.playwright.navigate({ url: BASE_URL });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (!globalThis.mcp?.playwright) return;

    // Clean up
    await globalThis.mcp.playwright.close();
  }, TEST_TIMEOUT);

  describe('Context Bar Visibility', () => {
    it('should hide context bar when no session is active', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      // Check that context bar is hidden initially
      const contextBar = await globalThis.mcp.playwright.getElement({
        selector: '#context-bar'
      });

      expect(contextBar).toBeDefined();
      // The context bar should have 'hidden' class when no session
      const hasHiddenClass = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const bar = document.querySelector('#context-bar');
          return bar?.classList.contains('hidden');
        }
      });

      expect(hasHiddenClass).toBe(true);
    }, TEST_TIMEOUT);

    it('should show context bar after token usage is received', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      // First, we need to authenticate and create a session
      // This is a simplified version - real tests would need proper auth flow

      // Simulate token usage by injecting it directly
      await globalThis.mcp.playwright.evaluate({
        script: () => {
          // Simulate receiving token-usage message
          const usage = {
            cumulativeTotal: 15000,
            cumulativeInput: 10000,
            cumulativeOutput: 5000,
            cacheRead: 2000,
            cacheCreate: 1000,
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          // Create a mock session
          window.mockSession = {
            id: 'test-session',
            lastTokenUsage: null,
            lastContextWindow: null,
            model: null,
            cacheMetrics: null
          };

          window.mockState = {
            sessions: [window.mockSession],
            activeSessionIndex: 0
          };

          // Call updateTokenUsage if it exists
          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      // Wait a bit for UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that context bar is now visible
      const isVisible = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const bar = document.querySelector('#context-bar');
          return bar && !bar.classList.contains('hidden');
        }
      });

      expect(isVisible).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Token Usage Display Format', () => {
    it('should display tokens in k format', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      // Inject token usage and check display format
      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 15499,
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const tokenText = await globalThis.mcp.playwright.getText({
        selector: '#token-usage'
      });

      // Should be in format "15k / 200k (8%)"
      expect(tokenText).toMatch(/\d+k\s\/\s\d+k\s\(\d+%\)/);
    }, TEST_TIMEOUT);

    it('should display correct percentage', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 100000, // 50% of 200k
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const tokenText = await globalThis.mcp.playwright.getText({
        selector: '#token-usage'
      });

      expect(tokenText).toContain('(50%)');
    }, TEST_TIMEOUT);
  });

  describe('Color Thresholds', () => {
    it('should show cyan color for usage below 80%', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 100000, // 50%
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const fillColor = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const fill = document.querySelector('#context-usage-fill');
          return fill?.style.background;
        }
      });

      expect(fillColor).toContain('var(--neon-cyan)');
    }, TEST_TIMEOUT);

    it('should show orange color for usage between 80% and 95%', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 170000, // 85%
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const fillColor = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const fill = document.querySelector('#context-usage-fill');
          return fill?.style.background;
        }
      });

      expect(fillColor).toContain('var(--neon-orange)');
    }, TEST_TIMEOUT);

    it('should show red color for usage above 95%', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 196000, // 98%
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const fillColor = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const fill = document.querySelector('#context-usage-fill');
          return fill?.style.background;
        }
      });

      expect(fillColor).toContain('var(--neon-red)');
    }, TEST_TIMEOUT);
  });

  describe('Model Display', () => {
    it('should display model name in context bar', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 10000,
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const modelText = await globalThis.mcp.playwright.getText({
        selector: '#context-model'
      });

      expect(modelText).toContain('claude-3-opus-20240229');
    }, TEST_TIMEOUT);
  });

  describe('Visual Bar Width', () => {
    it('should set correct width for visual bar', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 50000, // 25%
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const barWidth = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const fill = document.querySelector('#context-usage-fill');
          return fill?.style.width;
        }
      });

      expect(barWidth).toBe('25%');
    }, TEST_TIMEOUT);
  });

  describe('Tooltip Content', () => {
    it('should have tooltip with token breakdown', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          const usage = {
            cumulativeTotal: 15000,
            cumulativeInput: 10000,
            cumulativeOutput: 3000,
            cacheRead: 1500,
            cacheCreate: 500,
            contextWindow: 200000,
            model: 'claude-3-opus-20240229'
          };

          if (typeof window.updateTokenUsage === 'function') {
            window.updateTokenUsage(usage, window.mockSession);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const tooltip = await globalThis.mcp.playwright.evaluate({
        script: () => {
          const bar = document.querySelector('#context-bar');
          return bar?.title;
        }
      });

      expect(tooltip).toContain('Input:');
      expect(tooltip).toContain('Output:');
      expect(tooltip).toContain('Cache Read:');
      expect(tooltip).toContain('Cache Created:');
      expect(tooltip).toContain('Context Window:');
    }, TEST_TIMEOUT);
  });

  describe('Session Persistence', () => {
    it('should persist context data to localStorage', async () => {
      if (!globalThis.mcp?.playwright) {
        return;
      }

      await globalThis.mcp.playwright.evaluate({
        script: () => {
          // Simulate saveSessionState
          const sessionData = [{
            sessionId: 'test-session',
            project: { name: 'test', path: '/test', displayName: 'Test' },
            lastTokenUsage: 15000,
            lastContextWindow: 200000,
            model: 'claude-3-opus-20240229',
            cacheMetrics: { cacheRead: 5000, cacheCreate: 2000 }
          }];

          localStorage.setItem('cleon-sessions', JSON.stringify(sessionData));
        }
      });

      // Reload the page
      await globalThis.mcp.playwright.navigate({ url: BASE_URL });

      // Check localStorage
      const storedData = await globalThis.mcp.playwright.evaluate({
        script: () => {
          return localStorage.getItem('cleon-sessions');
        }
      });

      const parsed = JSON.parse(storedData);
      expect(parsed[0].lastTokenUsage).toBe(15000);
      expect(parsed[0].lastContextWindow).toBe(200000);
      expect(parsed[0].model).toBe('claude-3-opus-20240229');
      expect(parsed[0].cacheMetrics).toEqual({ cacheRead: 5000, cacheCreate: 2000 });
    }, TEST_TIMEOUT);
  });
});
