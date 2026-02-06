# Session: AskUserQuestion Tool Fix

**Date:** 2025-02-05
**Task Type:** Bug Fix

## Problem

The `AskUserQuestion` tool was not working properly in the web UI:
1. Questions would render briefly then immediately show "Cancelled"
2. Multiple questions would appear in rapid succession with "running" status
3. Users couldn't interact with the question UI before it was dismissed

## Root Cause

The original implementation tried to intercept `AskUserQuestion` in the message stream (`transformMessage`), but the SDK was auto-completing the tool before users could respond. The SDK doesn't automatically block on `AskUserQuestion` - it treats it like any other tool and returns a result immediately.

## Solution

Used the SDK's `canUseTool` callback to intercept `AskUserQuestion` **before** it executes:

1. **`canUseTool` callback** - Added to query options to intercept tool calls
2. **Promise-based waiting** - When `AskUserQuestion` is detected, create a Promise that waits for user input
3. **`pendingQuestionCallbacks` map** - Tracks toolUseId → { resolve, reject } for pending questions
4. **`handleQuestionResponse`** - Resolves the pending Promise when user submits an answer
5. **Return with answers** - The callback returns `{ behavior: 'allow', updatedInput: {..., answers} }`

This properly blocks the SDK's execution until the user responds.

## Files Modified

| File | Changes |
|------|---------|
| `server/claude.js` | Added `canUseTool` callback, `pendingQuestionCallbacks` map, simplified `handleQuestionResponse` |

## Key Code Changes

### server/claude.js

```javascript
// Track pending question responses
const pendingQuestionCallbacks = new Map();

// In query options:
canUseTool: async (toolName, input, { toolUseID, signal }) => {
  if (toolName === 'AskUserQuestion') {
    // Send question to frontend
    sendMessage(ws, {
      type: 'claude-message',
      sessionId: currentSessionId,
      data: {
        type: 'question',
        id: toolUseID,
        questions: input.questions || []
      }
    });

    // Wait for user response
    const answers = await new Promise((resolve, reject) => {
      pendingQuestionCallbacks.set(toolUseID, { resolve, reject });
      signal.addEventListener('abort', () => {
        pendingQuestionCallbacks.delete(toolUseID);
        reject(new Error('Question cancelled'));
      });
    });

    return {
      behavior: 'allow',
      updatedInput: { ...input, answers }
    };
  }

  // Allow all other tools
  return { behavior: 'allow', updatedInput: input };
}

// Simplified handleQuestionResponse:
export async function handleQuestionResponse(sessionId, toolUseId, answers) {
  const callback = pendingQuestionCallbacks.get(toolUseId);
  if (!callback) return false;

  pendingQuestionCallbacks.delete(toolUseId);
  callback.resolve(answers);
  return true;
}
```

## Previous Attempts (What Didn't Work)

1. **Tool name mismatch** - Changed `mcp_question` to `AskUserQuestion` (partial fix)
2. **Tracking pendingQuestionId in session** - Tried to prevent `claude-done` from being sent
3. **Using `streamInput` to send tool results** - The stream had already completed

## Architecture Notes

- The SDK's `canUseTool` callback is the proper way to intercept tools that need user interaction
- The callback blocks execution until a `PermissionResult` is returned
- `behavior: 'allow'` with `updatedInput` lets the tool proceed with modified input
- `behavior: 'deny'` with a message stops the tool and informs Claude

## Testing

1. Start server: `npm start`
2. Select a project and start a session
3. Ask Claude something that triggers `AskUserQuestion` (e.g., "interview me about my project")
4. Question should render and wait for user selection
5. Select option(s) and click "Submit Answer"
6. Claude should receive the response and continue
