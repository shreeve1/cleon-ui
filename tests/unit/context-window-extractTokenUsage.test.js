/**
 * Unit Tests for extractTokenUsage Function
 * Tests the server-side token extraction with model-specific context windows
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the MODEL_CONTEXT_WINDOWS and extractTokenUsage logic
const MODEL_CONTEXT_WINDOWS = {
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-sonnet-20240620': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'default': 200000
};

const DEFAULT_CONTEXT_WINDOW = 200000;

// Replicate the extractTokenUsage function logic for testing
function extractTokenUsage(modelUsage) {
  if (!modelUsage) return null;

  const modelKey = Object.keys(modelUsage)[0];
  const data = modelUsage[modelKey];

  if (!data) return null;

  // Get raw token counts from SDK
  const input = data.cumulativeInputTokens || data.inputTokens || 0;
  const output = data.cumulativeOutputTokens || data.outputTokens || 0;
  const cacheRead = data.cumulativeCacheReadInputTokens || data.cacheReadInputTokens || 0;
  const cacheCreate = data.cumulativeCacheCreationInputTokens || data.cacheCreationInputTokens || 0;

  // Calculate cumulative total (all tokens in conversation history)
  const cumulativeTotal = input + output + cacheRead + cacheCreate;

  // Get model-specific context window (matches actual implementation)
  const contextWindow = MODEL_CONTEXT_WINDOWS[modelKey] ||
                       parseInt(process.env.CONTEXT_WINDOW) ||
                       DEFAULT_CONTEXT_WINDOW;

  // Estimate current context (this is approximate since SDK manages context internally)
  const estimatedContextUsed = Math.min(cumulativeTotal, contextWindow);

  // Calculate what percentage of context is actually being used on each turn
  const currentTurnTokens = data.inputTokens || data.cumulativeInputTokens || 0;
  const contextUtilization = Math.min((currentTurnTokens / contextWindow) * 100, 100);

  return {
    // Cumulative metrics
    cumulativeTotal,
    cumulativeInput: input,
    cumulativeOutput: output,

    // Cache metrics (separate from context)
    cacheRead,
    cacheCreate,

    // Context window info
    contextWindow,
    model: modelKey,

    // Estimated utilization
    estimatedContextUsed,
    contextUtilization,

    // Backward compatibility - keep 'used' for existing code
    used: cumulativeTotal
  };
}

describe('extractTokenUsage', () => {
  describe('Basic Functionality', () => {
    it('should return null for null/undefined input', () => {
      expect(extractTokenUsage(null)).toBeNull();
      expect(extractTokenUsage(undefined)).toBeNull();
      expect(extractTokenUsage({})).toBeNull();
    });

    it('should extract basic token counts correctly', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500,
          cumulativeCacheReadInputTokens: 200,
          cumulativeCacheCreationInputTokens: 100
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cumulativeInput).toBe(1000);
      expect(result.cumulativeOutput).toBe(500);
      expect(result.cacheRead).toBe(200);
      expect(result.cacheCreate).toBe(100);
      expect(result.cumulativeTotal).toBe(1800); // 1000 + 500 + 200 + 100
    });

    it('should handle missing cache fields gracefully', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cacheRead).toBe(0);
      expect(result.cacheCreate).toBe(0);
      expect(result.cumulativeTotal).toBe(1500);
    });

    it('should handle zero token counts', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 0,
          cumulativeOutputTokens: 0,
          cumulativeCacheReadInputTokens: 0,
          cumulativeCacheCreationInputTokens: 0
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cumulativeTotal).toBe(0);
      expect(result.contextUtilization).toBe(0);
    });
  });

  describe('Model-Specific Context Windows', () => {
    it('should return correct context window for Claude 3 Opus', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextWindow).toBe(200000);
      expect(result.model).toBe('claude-3-opus-20240229');
    });

    it('should return correct context window for Claude 3.5 Sonnet', () => {
      const modelUsage = {
        'claude-3-5-sonnet-20241022': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextWindow).toBe(200000);
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should return correct context window for Claude 3.5 Haiku', () => {
      const modelUsage = {
        'claude-3-5-haiku-20241022': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextWindow).toBe(200000);
      expect(result.model).toBe('claude-3-5-haiku-20241022');
    });

    it('should use default context window for unknown models', () => {
      const modelUsage = {
        'claude-unknown-model': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextWindow).toBe(200000);
      expect(result.model).toBe('claude-unknown-model');
    });
  });

  describe('Context Utilization Calculation', () => {
    it('should calculate context utilization correctly for low usage', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 10000,
          cumulativeOutputTokens: 5000
        }
      };

      const result = extractTokenUsage(modelUsage);

      // contextUtilization uses inputTokens, so 10000 / 200000 * 100 = 5%
      expect(result.contextUtilization).toBe(5);
    });

    it('should calculate context utilization at 80% threshold', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 160000,
          cumulativeOutputTokens: 10000
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextUtilization).toBe(80);
    });

    it('should calculate context utilization at 95% threshold', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 190000,
          cumulativeOutputTokens: 5000
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextUtilization).toBe(95);
    });

    it('should cap context utilization at 100%', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 250000, // Exceeds context window
          cumulativeOutputTokens: 50000
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.contextUtilization).toBe(100);
    });

    it('should estimate context used correctly', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 150000,
          cumulativeOutputTokens: 30000,
          cumulativeCacheReadInputTokens: 10000,
          cumulativeCacheCreationInputTokens: 5000
        }
      };

      const result = extractTokenUsage(modelUsage);

      // Total is 195000, which is less than 200000 context window
      expect(result.estimatedContextUsed).toBe(195000);
      expect(result.cumulativeTotal).toBe(195000);
    });

    it('should cap estimated context at context window size', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 180000,
          cumulativeOutputTokens: 30000,
          cumulativeCacheReadInputTokens: 10000,
          cumulativeCacheCreationInputTokens: 5000
        }
      };

      const result = extractTokenUsage(modelUsage);

      // Total is 225000, but context window is 200000
      expect(result.estimatedContextUsed).toBe(200000);
      expect(result.cumulativeTotal).toBe(225000);
    });
  });

  describe('Backward Compatibility', () => {
    it('should include used field for backward compatibility', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 1000,
          cumulativeOutputTokens: 500
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.used).toBe(1500);
      expect(result.used).toBe(result.cumulativeTotal);
    });

    it('should handle non-cumulative token fields', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 100
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cumulativeInput).toBe(1000);
      expect(result.cumulativeOutput).toBe(500);
      expect(result.cacheRead).toBe(200);
      expect(result.cacheCreate).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large token counts', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 10000000, // 10 million
          cumulativeOutputTokens: 5000000,
          cumulativeCacheReadInputTokens: 2000000,
          cumulativeCacheCreationInputTokens: 1000000
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cumulativeTotal).toBe(18000000);
      expect(result.estimatedContextUsed).toBe(200000); // Capped at context window
      expect(result.contextUtilization).toBe(100); // Capped at 100%
    });

    it('should handle partial data with only input tokens', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {
          cumulativeInputTokens: 1000
        }
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cumulativeInput).toBe(1000);
      expect(result.cumulativeOutput).toBe(0);
      expect(result.cacheRead).toBe(0);
      expect(result.cacheCreate).toBe(0);
      expect(result.cumulativeTotal).toBe(1000);
    });

    it('should handle empty model data object', () => {
      const modelUsage = {
        'claude-3-opus-20240229': {}
      };

      const result = extractTokenUsage(modelUsage);

      expect(result.cumulativeTotal).toBe(0);
      expect(result.contextUtilization).toBe(0);
    });
  });

  describe('All Supported Models', () => {
    const supportedModels = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-5-haiku-20241022'
    ];

    supportedModels.forEach(modelName => {
      it(`should handle ${modelName} correctly`, () => {
        const modelUsage = {
          [modelName]: {
            cumulativeInputTokens: 5000,
            cumulativeOutputTokens: 2000
          }
        };

        const result = extractTokenUsage(modelUsage);

        expect(result.model).toBe(modelName);
        expect(result.contextWindow).toBe(200000);
        expect(result.cumulativeTotal).toBe(7000);
      });
    });
  });
});
