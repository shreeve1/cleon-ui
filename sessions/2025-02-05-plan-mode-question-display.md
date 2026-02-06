# Session: Plan Mode Question Display Fix

**Date:** 2025-02-05  
**Duration:** ~30 minutes  
**Task Type:** Bug Fix / Feature Implementation

## Summary

Investigated and fixed an issue where Claude's questions in plan mode were not visible to users in the web UI. The `mcp_question` tool was being used but the questions and selection options were not displayed.

## Problem

When using `permissionMode: 'plan'` in the Claude Agent SDK:
1. Claude asks questions using the `mcp_question` tool
2. The UI only showed a generic tool message ("mcp_question") 
3. The actual question text, options, and selection UI were not rendered
4. Users had no way to respond to the questions

## Root Cause

The `transformMessage()` function in `server/claude.js` only extracted a basic summary for tools. It didn't:
- Parse the question content from `toolUse.input.questions`
- Send the question structure to the frontend
- Have any mechanism for users to respond

## Solution Implemented

### Server-Side (`server/claude.js`)
- Added special handling for `mcp_question` tool in `transformMessage()`
- Extracts full question structure (question text, header, options, multiple flag)
- Returns new message type: `{ type: 'question', id, questions }`
- Added `handleQuestionResponse()` function to send answers back via SDK's `streamInput()`

### Server-Side (`server/index.js`)
- Added `question-response` WebSocket message handler
- Routes responses to `handleQuestionResponse()`

### Frontend (`public/app.js`)
- Added `pendingQuestion` state to track active questions
- `handleClaudeMessage()` now handles `question` type
- `renderQuestion()` - Renders interactive question UI with options
- `handleOptionSelect()` - Handles option clicks (single/multiple select)
- `handleCustomInputChange()` - Handles custom text input
- `updateSubmitButtonState()` - Enables submit when all questions answered
- `submitQuestionResponse()` - Sends answers back via WebSocket
- `finishStreaming()` - Cleans up pending questions on abort/completion

### Styles (`public/style.css`)
- Added 120+ lines of neon-themed styles
- Question block with green left border
- Clickable option cards with hover/selected states
- Custom input field for typed answers
- Submit button with proper disabled states
- Submitted/cancelled visual states

## Files Modified

| File | Lines Changed |
|------|---------------|
| `server/claude.js` | +50 |
| `server/index.js` | +12 |
| `public/app.js` | +150 |
| `public/style.css` | +120 |

## Testing Notes

To test the implementation:
1. Run `npm start`
2. Log in and select a project
3. Switch to Plan Mode (green clipboard icon)
4. Send an ambiguous prompt that triggers Claude to ask a clarifying question
5. Verify the question renders with selectable options
6. Select option(s) and submit
7. Verify Claude receives the response and continues

## Related Files

- **Plan document:** `specs/plan-mode-question-display.md`
- **SDK types reference:** `node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/sdk/coreTypes.d.ts`

## Acceptance Criteria Met

- [x] Questions visible with all options in chat
- [x] Options are interactive (click to select/deselect)
- [x] Single-select questions allow one selection
- [x] Multiple-select questions allow multiple selections  
- [x] Submit button enabled when required selections made
- [x] Custom text input available for typed answers
- [x] Response sent back to Claude via SDK
- [x] UI matches existing neon theme
- [x] Questions cleaned up on abort/completion
