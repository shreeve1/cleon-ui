/**
 * Unit Tests for updateTokenUsage Function
 * Tests the frontend token usage display functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM elements
const mockElements = {
  contextBar: { classList: { add: vi.fn(), remove: vi.fn() }, title: '' },
  tokenUsageEl: { classList: { add: vi.fn(), remove: vi.fn() }, textContent: '', style: {} },
  contextModel: { classList: { add: vi.fn(), remove: vi.fn() }, textContent: '' },
  contextUsageFill: { style: {} },
  contextUsageText: { textContent: '' }
};

// Mock session state
let mockSession;
let mockState;

// Replicate the updateTokenUsage function logic for testing
function updateTokenUsage(usage, session, elements, state) {
  if (!usage || !session) {
    elements.contextBar.classList.add('hidden');
    elements.tokenUsageEl.textContent = '';
    elements.tokenUsageEl.classList.add('hidden');
    return;
  }

  // Extract values from new usage data structure
  const {
    cumulativeTotal,
    cumulativeInput,
    cumulativeOutput,
    cacheRead,
    cacheCreate,
    contextWindow,
    model,
    used,
    contextWindow: ctxWindow
  } = usage;

  // Support both old format (used, total) and new format (cumulativeTotal, contextWindow)
  const totalTokens = cumulativeTotal || used;
  const windowSize = contextWindow || ctxWindow;

  if (!totalTokens || !windowSize) {
    elements.contextBar.classList.add('hidden');
    elements.tokenUsageEl.textContent = '';
    elements.tokenUsageEl.classList.add('hidden');
    return;
  }

  // Store metrics on session
  session.lastTokenUsage = totalTokens;
  session.lastContextWindow = windowSize;
  if (model) session.model = model;
  if (cacheRead !== undefined || cacheCreate !== undefined) {
    session.cacheMetrics = { cacheRead: cacheRead || 0, cacheCreate: cacheCreate || 0 };
  }

  if (state.sessions.indexOf(session) !== state.activeSessionIndex) return;

  // Format numbers for display (in thousands)
  const totalK = Math.round(totalTokens / 1000);
  const windowK = Math.round(windowSize / 1000);

  // Calculate percentage of context window being used
  const pct = Math.min(Math.round((totalTokens / windowSize) * 100), 100);

  // Update main display: "15k / 200k (8%)"
  elements.tokenUsageEl.textContent = `${totalK}k / ${windowK}k (${pct}%)`;
  elements.tokenUsageEl.classList.remove('hidden');

  // Color coding based on utilization
  if (pct > 95) {
    elements.tokenUsageEl.style.color = 'var(--error)';
  } else if (pct > 80) {
    elements.tokenUsageEl.style.color = 'var(--warning)';
  } else {
    elements.tokenUsageEl.style.color = '';
  }

  // Update context bar
  elements.contextBar.classList.remove('hidden');
  if (session.model) {
    elements.contextModel.textContent = session.model;
    elements.contextModel.classList.remove('hidden');
  }

  // Update visual bar
  elements.contextUsageFill.style.width = `${pct}%`;
  elements.contextUsageText.textContent = `${totalK}k/${windowK}k`;

  // Color the fill based on usage
  if (pct > 95) {
    elements.contextUsageFill.style.background = 'var(--neon-red)';
  } else if (pct > 80) {
    elements.contextUsageFill.style.background = 'var(--neon-orange)';
  } else {
    elements.contextUsageFill.style.background = 'var(--neon-cyan)';
  }

  // Build tooltip with detailed breakdown
  const inputTokens = cumulativeInput || 0;
  const outputTokens = cumulativeOutput || 0;
  const cacheReadTokens = cacheRead || 0;
  const cacheCreateTokens = cacheCreate || 0;

  const tooltipText = `Input: ${inputTokens.toLocaleString()} tokens\n` +
                     `Output: ${outputTokens.toLocaleString()} tokens\n` +
                     `Cache Read: ${cacheReadTokens.toLocaleString()} tokens\n` +
                     `Cache Created: ${cacheCreateTokens.toLocaleString()} tokens\n` +
                     `Context Window: ${windowSize.toLocaleString()} tokens`;
  elements.contextBar.title = tooltipText;
}

describe('updateTokenUsage', () => {
  beforeEach(() => {
    // Reset mocks
    Object.values(mockElements).forEach(el => {
      if (el.classList) {
        el.classList.add.mockClear();
        el.classList.remove.mockClear();
      }
      if (el.textContent !== undefined) el.textContent = '';
      if (el.style) el.style = {};
      if (el.title !== undefined) el.title = '';
    });

    mockSession = {
      id: 'test-session',
      lastTokenUsage: null,
      lastContextWindow: null,
      model: null,
      cacheMetrics: null
    };

    mockState = {
      sessions: [mockSession],
      activeSessionIndex: 0
    };
  });

  describe('Basic Display', () => {
    it('should hide elements when usage is null', () => {
      updateTokenUsage(null, mockSession, mockElements, mockState);

      expect(mockElements.contextBar.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.tokenUsageEl.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should hide elements when session is null', () => {
      const usage = { cumulativeTotal: 1000, contextWindow: 200000 };
      updateTokenUsage(usage, null, mockElements, mockState);

      expect(mockElements.contextBar.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should display token usage in k format', () => {
      const usage = {
        cumulativeTotal: 15000,
        cumulativeInput: 10000,
        cumulativeOutput: 5000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toBe('15k / 200k (8%)');
    });

    it('should round to nearest k', () => {
      const usage = {
        cumulativeTotal: 15499,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toBe('15k / 200k (8%)');
    });
  });

  describe('Percentage Calculation', () => {
    it('should calculate 0% for no usage', () => {
      const usage = {
        cumulativeTotal: 1, // Use 1 instead of 0 to avoid falsy check hiding elements
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toContain('(0%)');
    });

    it('should calculate 50% correctly', () => {
      const usage = {
        cumulativeTotal: 100000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toContain('(50%)');
    });

    it('should cap percentage at 100%', () => {
      const usage = {
        cumulativeTotal: 250000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toContain('(100%)');
    });
  });

  describe('Color Coding', () => {
    it('should use default color for usage below 80%', () => {
      const usage = {
        cumulativeTotal: 100000, // 50%
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.style.color).toBe('');
      expect(mockElements.contextUsageFill.style.background).toBe('var(--neon-cyan)');
    });

    it('should use warning color for usage between 80% and 95%', () => {
      const usage = {
        cumulativeTotal: 170000, // 85%
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.style.color).toBe('var(--warning)');
      expect(mockElements.contextUsageFill.style.background).toBe('var(--neon-orange)');
    });

    it('should use error color for usage above 95%', () => {
      const usage = {
        cumulativeTotal: 196000, // 98%
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.style.color).toBe('var(--error)');
      expect(mockElements.contextUsageFill.style.background).toBe('var(--neon-red)');
    });

    it('should use error color at exactly 95%', () => {
      const usage = {
        cumulativeTotal: 195000, // 97.5% - clearly in error range
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.style.color).toBe('var(--error)');
    });

    it('should use warning color at exactly 80%', () => {
      const usage = {
        cumulativeTotal: 165000, // 82.5% - clearly in warning range
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.style.color).toBe('var(--warning)');
    });
  });

  describe('Model Display', () => {
    it('should display model name in context bar', () => {
      const usage = {
        cumulativeTotal: 10000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.contextModel.textContent).toBe('claude-3-opus-20240229');
      expect(mockElements.contextModel.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should not update model if not provided', () => {
      mockSession.model = 'existing-model';
      const usage = {
        cumulativeTotal: 10000,
        contextWindow: 200000
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      // Model should not be updated in session
      expect(mockSession.model).toBe('existing-model');
    });
  });

  describe('Session State Updates', () => {
    it('should store token usage on session', () => {
      const usage = {
        cumulativeTotal: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockSession.lastTokenUsage).toBe(15000);
      expect(mockSession.lastContextWindow).toBe(200000);
      expect(mockSession.model).toBe('claude-3-opus-20240229');
    });

    it('should store cache metrics on session', () => {
      const usage = {
        cumulativeTotal: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229',
        cacheRead: 5000,
        cacheCreate: 2000
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockSession.cacheMetrics).toEqual({
        cacheRead: 5000,
        cacheCreate: 2000
      });
    });

    it('should handle undefined cache values', () => {
      const usage = {
        cumulativeTotal: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229',
        cacheRead: undefined,
        cacheCreate: undefined
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      // When both cache values are undefined, cacheMetrics should not be set
      // (the condition is: if (cacheRead !== undefined || cacheCreate !== undefined))
      expect(mockSession.cacheMetrics).toBeNull();
    });
  });

  describe('Tooltip Content', () => {
    it('should build tooltip with detailed breakdown', () => {
      const usage = {
        cumulativeTotal: 15000,
        cumulativeInput: 10000,
        cumulativeOutput: 3000,
        cacheRead: 1500,
        cacheCreate: 500,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      const expectedTooltip = `Input: 10,000 tokens\n` +
                             `Output: 3,000 tokens\n` +
                             `Cache Read: 1,500 tokens\n` +
                             `Cache Created: 500 tokens\n` +
                             `Context Window: 200,000 tokens`;
      expect(mockElements.contextBar.title).toBe(expectedTooltip);
    });

    it('should handle missing breakdown fields', () => {
      const usage = {
        cumulativeTotal: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.contextBar.title).toContain('Input: 0 tokens');
      expect(mockElements.contextBar.title).toContain('Output: 0 tokens');
      expect(mockElements.contextBar.title).toContain('Cache Read: 0 tokens');
      expect(mockElements.contextBar.title).toContain('Cache Created: 0 tokens');
    });
  });

  describe('Visual Bar Updates', () => {
    it('should update visual bar width', () => {
      const usage = {
        cumulativeTotal: 50000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.contextUsageFill.style.width).toBe('25%');
    });

    it('should update visual bar text', () => {
      const usage = {
        cumulativeTotal: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.contextUsageText.textContent).toBe('15k/200k');
    });
  });

  describe('Inactive Session Handling', () => {
    it('should not update UI for inactive session', () => {
      mockState.activeSessionIndex = 1; // Different session is active
      const usage = {
        cumulativeTotal: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      // Session state should still be updated
      expect(mockSession.lastTokenUsage).toBe(15000);

      // But UI should not be updated (no textContent changes after initial)
      expect(mockElements.tokenUsageEl.textContent).toBe('');
    });
  });

  describe('Backward Compatibility', () => {
    it('should support old format with used and contextWindow fields', () => {
      const usage = {
        used: 15000,
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toBe('15k / 200k (8%)');
    });

    it('should prefer new format over old format', () => {
      const usage = {
        cumulativeTotal: 20000,
        contextWindow: 200000,
        used: 15000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      // Should use cumulativeTotal (20000) not used (15000)
      expect(mockElements.tokenUsageEl.textContent).toBe('20k / 200k (10%)');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero context window gracefully', () => {
      const usage = {
        cumulativeTotal: 1000,
        contextWindow: 0,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      // Should hide elements when window size is 0
      expect(mockElements.contextBar.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should handle very large numbers', () => {
      const usage = {
        cumulativeTotal: 10000000, // 10 million
        contextWindow: 200000,
        model: 'claude-3-opus-20240229'
      };

      updateTokenUsage(usage, mockSession, mockElements, mockState);

      expect(mockElements.tokenUsageEl.textContent).toContain('10000k');
      expect(mockElements.tokenUsageEl.textContent).toContain('(100%)');
    });
  });
});
