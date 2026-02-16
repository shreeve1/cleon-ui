/**
 * ActivityTracker - emits real-time AI activity status events via SSE
 * Publishes ephemeral agent-activity events (not buffered for replay)
 * through the event bus for live UI status indicators.
 */

const THROTTLE_MS = 500;
const THINKING_DELAY_MS = 1000;
const ADAPTIVE_DESCRIPTION_MS = 3000;
const ADAPTIVE_ELAPSED_MS = 5000;
const TOOL_PROGRESS_MIN_MS = 5000;

class ActivityTracker {
  /**
   * @param {Function} publishFn - Callback to publish events: (event) => void
   * @param {string} sessionId - Session identifier for event payloads
   */
  constructor(publishFn, sessionId) {
    this.publishFn = publishFn;
    this.sessionId = sessionId;

    // Internal state
    this.currentState = 'idle';
    this.stateStartTime = Date.now();
    this.currentToolName = null;
    this.currentToolSummary = null;
    this.lastEmitTime = 0;
    this.thinkingTimer = null;
  }

  /**
   * Transition to thinking state with a 1s delay before emitting.
   * If a tool starts within that 1s window, the timer is cancelled
   * to avoid brief "Thinking..." flicker in the UI.
   */
  startThinking() {
    this.currentState = 'thinking';
    this.stateStartTime = Date.now();
    this.currentToolName = null;
    this.currentToolSummary = null;

    // Schedule first thinking emit after delay
    this._clearThinkingTimer();
    this.thinkingTimer = setTimeout(() => {
      this.thinkingTimer = null;
      if (this.currentState === 'thinking') {
        this._emit();
      }
    }, THINKING_DELAY_MS);
  }

  /**
   * Transition to tool_executing state and emit immediately.
   * Clears any pending thinking timer to avoid stale emissions.
   * @param {string} toolName - Name of the tool being executed
   * @param {string} summary - Short summary of what the tool is doing
   */
  startTool(toolName, summary) {
    this._clearThinkingTimer();
    this.currentState = 'tool_executing';
    this.stateStartTime = Date.now();
    this.currentToolName = toolName;
    this.currentToolSummary = summary;
    this._emit();
  }

  /**
   * Emit a progress update for a long-running tool.
   * Only emits if the tool has been executing for longer than 5s.
   * @param {string} detail - Progress detail to include as description
   */
  updateToolProgress(detail) {
    if (this.currentState !== 'tool_executing') return;

    const elapsed = Date.now() - this.stateStartTime;
    if (elapsed < TOOL_PROGRESS_MIN_MS) return;

    this._emit(detail);
  }

  /**
   * Transition back to thinking after a tool completes.
   * Does not emit an idle event between consecutive tools.
   */
  completeTool() {
    this.currentState = 'thinking';
    this.stateStartTime = Date.now();
    this.currentToolName = null;
    this.currentToolSummary = null;
  }

  /**
   * Transition to idle and emit a final idle event.
   * Clears all pending timers.
   */
  finish() {
    this._clearThinkingTimer();
    this.currentState = 'idle';
    this.stateStartTime = Date.now();
    this.currentToolName = null;
    this.currentToolSummary = null;
    this._emit();
  }

  /**
   * Build and publish an agent-activity event.
   * Applies throttling (500ms minimum between emits) except for idle events.
   * Uses adaptive detail levels based on elapsed time in current state.
   * @param {string} [progressDetail] - Optional override for description
   */
  _emit(progressDetail) {
    const now = Date.now();

    // Throttle check: skip if emitting too fast (except idle, which always emits)
    if (this.currentState !== 'idle') {
      if (now - this.lastEmitTime < THROTTLE_MS) {
        return;
      }
    }

    const elapsed = now - this.stateStartTime;
    const elapsedSeconds = Math.round(elapsed / 1000);

    // Build label
    let label;
    if (this.currentState === 'idle') {
      label = 'Idle';
    } else if (this.currentState === 'thinking') {
      label = 'Thinking...';
    } else if (this.currentState === 'tool_executing' && this.currentToolName) {
      label = `Running ${this.currentToolName}`;
    } else {
      label = 'Working...';
    }

    // Build event with adaptive detail
    const event = {
      type: 'agent-activity',
      sessionId: this.sessionId,
      state: this.currentState,
      label,
    };

    // Add tool info when executing
    if (this.currentState === 'tool_executing') {
      if (this.currentToolName) {
        event.toolName = this.currentToolName;
      }
      if (this.currentToolSummary) {
        event.toolSummary = this.currentToolSummary;
      }
    }

    // Adaptive detail based on elapsed time
    if (elapsed >= ADAPTIVE_ELAPSED_MS) {
      // >5s: include description and elapsed
      event.description = progressDetail || this.currentToolSummary || this._defaultDescription();
      event.elapsed = elapsedSeconds;
    } else if (elapsed >= ADAPTIVE_DESCRIPTION_MS) {
      // 3-5s: include description only
      event.description = progressDetail || this.currentToolSummary || this._defaultDescription();
    }
    // <3s: just state and label (already set)

    this.lastEmitTime = now;
    this.publishFn(event);
  }

  /**
   * Generate a default description based on current state.
   * @returns {string}
   */
  _defaultDescription() {
    if (this.currentState === 'thinking') {
      return 'Processing your request...';
    }
    if (this.currentState === 'tool_executing' && this.currentToolName) {
      return `Executing ${this.currentToolName}`;
    }
    return '';
  }

  /**
   * Clear the pending thinking timer if one exists.
   */
  _clearThinkingTimer() {
    if (this.thinkingTimer !== null) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }
}

/**
 * Factory function to create an ActivityTracker instance.
 * @param {Function} publishFn - Callback to publish events: (event) => void
 * @param {string} sessionId - Session identifier for event payloads
 * @returns {ActivityTracker}
 */
export function createActivityTracker(publishFn, sessionId) {
  return new ActivityTracker(publishFn, sessionId);
}
