import { LogEntry, LogEventType } from './types';

export interface ParsedEvent {
  type: LogEventType;
  event: string;
  content: string;
  tokens?: number;
  cost?: number;
}

// Model pricing (approximate, in USD per million tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-3': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.80, output: 4.0 },
  'default': { input: 3.0, output: 15.0 }
};

// Token estimation (rough approximation: 1 token ≈ 4 characters)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// Calculate cost from tokens
const calculateCost = (tokens: number, model: string, isOutput: boolean): number => {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  const rate = isOutput ? pricing.output : pricing.input;
  return (tokens / 1000000) * rate;
};

export class OutputParser {
  private model: string;
  private totalTokens: number = 0;
  private totalCost: number = 0;

  constructor(model: string = 'claude-sonnet-4-5') {
    this.model = model;
  }

  parse(rawOutput: string, agentName: string): LogEntry[] {
    const entries: LogEntry[] = [];
    const lines = rawOutput.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsed = this.parseLine(line, agentName);
      if (parsed) {
        entries.push({
          id: this.generateId(),
          timestamp: new Date(),
          ...parsed
        });

        // Update tracking
        if (parsed.tokens) {
          this.totalTokens += parsed.tokens;
        }
        if (parsed.cost) {
          this.totalCost += parsed.cost;
        }
      }
    }

    return entries;
  }

  private parseLine(line: string, agentName: string): Omit<LogEntry, 'id' | 'timestamp'> | null {
    const trimmed = line.trim();

    // System reminders / hooks
    if (trimmed.includes('<system-reminder>')) {
      const hookMatch = trimmed.match(/SessionStart:\s*(\w+)\s+hook/);
      if (hookMatch) {
        return {
          type: 'HOOK',
          event: 'SESSION_START',
          content: trimmed,
          agentName
        };
      }

      const hookSubmitMatch = trimmed.match(/user-prompt-submit-hook/);
      if (hookSubmitMatch) {
        return {
          type: 'HOOK',
          event: 'USER_PROMPT_SUBMIT',
          content: trimmed,
          agentName
        };
      }

      return {
        type: 'HOOK',
        event: 'SYSTEM_REMINDER',
        content: trimmed,
        agentName
      };
    }

    // Tool calls
    if (trimmed.includes('tool_use') || trimmed.includes('ToolUse') || trimmed.includes('function_call')) {
      return {
        type: 'TOOL',
        event: 'TOOL_CALL',
        content: trimmed,
        agentName,
        tokens: estimateTokens(trimmed),
        cost: calculateCost(estimateTokens(trimmed), this.model, false)
      };
    }

    // Tool results
    if (trimmed.match(/^\[.*\]/) || trimmed.includes('ToolResult')) {
      return {
        type: 'TOOL',
        event: 'TOOL_RESULT',
        content: trimmed,
        agentName,
        tokens: estimateTokens(trimmed),
        cost: calculateCost(estimateTokens(trimmed), this.model, true)
      };
    }

    // Thinking indicators
    if (trimmed.toLowerCase().includes('thinking:') ||
        trimmed.toLowerCase().includes('thought:') ||
        trimmed.includes('...')) {
      return {
        type: 'THINKING',
        event: 'THINKING',
        content: trimmed,
        agentName
      };
    }

    // Error messages
    if (trimmed.toLowerCase().includes('error') || trimmed.toLowerCase().includes('failed')) {
      return {
        type: 'SYSTEM',
        event: 'ERROR',
        content: trimmed,
        agentName
      };
    }

    // Default: regular response
    return {
      type: 'RESPONSE',
      event: 'RESPONSE',
      content: trimmed,
      agentName,
      tokens: estimateTokens(trimmed),
      cost: calculateCost(estimateTokens(trimmed), this.model, true)
    };
  }

  setModel(model: string): void {
    this.model = model;
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  reset(): void {
    this.totalTokens = 0;
    this.totalCost = 0;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function estimateCost(tokens: number, model: string, isOutput: boolean): number {
  return calculateCost(tokens, model, isOutput);
}

export function estimateTextTokens(text: string): number {
  return estimateTokens(text);
}
