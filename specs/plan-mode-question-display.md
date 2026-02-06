# Plan: Fix Plan Mode Question Display

## Task Description
The web UI for Claude Lite has a "plan mode" feature that uses `permissionMode: 'plan'` from the Claude Agent SDK. In this mode, Claude can ask questions using the `mcp_question` tool before proceeding. Currently, the UI shows that a tool is being used but **does not display the actual questions or options**, and users **cannot respond to the questions**.

## Objective
Enable users to see and interact with questions asked by Claude in plan mode by:
1. Properly extracting and displaying question content from the SDK
2. Rendering interactive UI for question options (radio/checkbox selections)
3. Allowing users to submit their answers
4. Sending responses back through the SDK to continue the conversation

## Problem Statement
When Claude uses the `mcp_question` tool in plan mode:
1. The `transformMessage()` function in `claude.js` only generates a generic summary ("mcp_question") instead of extracting the question data
2. The frontend has no component to display questions with selectable options
3. There's no WebSocket message type for sending user responses back to Claude
4. The SDK's `query.streamInput()` method isn't being used to provide tool responses

## Solution Approach
The fix requires a round-trip implementation:

**Server → Client (displaying questions):**
1. Detect `mcp_question` tool use in `transformMessage()`
2. Extract the full question structure (`questions` array with headers, options, multiple flag)
3. Send a new message type `question` to the frontend with the question data

**Client → Server (responding to questions):**
1. Display an interactive question UI with the options
2. Capture user selections
3. Send a `question-response` WebSocket message with the selected answers
4. Server forwards this as a tool result through `query.streamInput()`

## Relevant Files
Use these files to complete the task:

- **`server/claude.js`** - Main Claude communication handler. Needs to detect `mcp_question` tool use, extract question data, and handle response input.
- **`public/app.js`** - Frontend JavaScript. Needs question UI rendering, selection handling, and response submission.
- **`public/style.css`** - Needs styles for the question display component (options, radio/checkbox, submit button).
- **`public/index.html`** - May need a container element for questions if using fixed positioning.

### New Files
None required - all changes fit within existing files.

## Implementation Phases

### Phase 1: Foundation - Server-Side Question Detection
Modify the server to recognize and properly handle the `mcp_question` tool.

### Phase 2: Core Implementation - UI and Interaction
Build the frontend components for displaying questions and capturing responses.

### Phase 3: Integration & Polish - Response Flow
Connect the response flow from frontend back through the SDK.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Understand the mcp_question Tool Structure
Research the exact structure of the `mcp_question` tool input:
- The tool input contains a `questions` array
- Each question has: `question` (text), `header` (short label), `options` (array of {label, description}), `multiple` (boolean)
- The tool result should be an array of selected labels per question

### 2. Update transformMessage() in claude.js
- Add special handling for `mcp_question` tool in the `transformMessage()` function
- Extract the full question structure from `toolUse.input.questions`
- Return a new message type: `{ type: 'question', id: toolUse.id, questions: [...] }`
- Example structure:
```javascript
if (toolUse.name === 'mcp_question') {
  return {
    type: 'question',
    id: toolUse.id,
    questions: toolUse.input.questions // Array of question objects
  };
}
```

### 3. Add handleQuestionResponse in claude.js
- Add a new function to handle question responses from the frontend
- Accept the tool use ID and user's selected answers
- Format the response as a tool_result message
- Send it through the SDK's `query.streamInput()` method
- Example:
```javascript
async function handleQuestionResponse(sessionId, toolUseId, answers) {
  const queryInstance = activeSessions.get(sessionId);
  if (!queryInstance) return false;
  
  // Create tool result message
  const toolResult = {
    type: 'user',
    message: {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: JSON.stringify(answers)
      }]
    }
  };
  
  // Send through streamInput
  // Note: May need to create an async generator or use different approach
}
```

### 4. Update WebSocket Handler in server/index.js
- Add handler for new `question-response` message type
- Call the new `handleQuestionResponse()` function
- Example:
```javascript
case 'question-response':
  await handleQuestionResponse(msg.sessionId, msg.toolUseId, msg.answers);
  break;
```

### 5. Add Question State Variables in app.js
- Add state to track pending questions:
```javascript
// In the state object
pendingQuestion: null, // { id, questions, selectedAnswers: {} }
```

### 6. Update handleClaudeMessage in app.js
- Add handling for the new `question` message type
- Store the question data in state
- Call a new `renderQuestion()` function
```javascript
if (data.type === 'question') {
  state.pendingQuestion = {
    id: data.id,
    questions: data.questions,
    selectedAnswers: {}
  };
  renderQuestion(data);
  return;
}
```

### 7. Create renderQuestion() Function in app.js
- Create function to display the question UI in the messages area
- For each question:
  - Display the question text as a header
  - Render options as clickable cards or radio/checkbox inputs
  - Support both single-select and multiple-select based on the `multiple` flag
- Add a submit button at the bottom
- Example DOM structure:
```html
<div class="message question-block">
  <div class="question-group" data-question-index="0">
    <div class="question-header">Short Label</div>
    <div class="question-text">Full question text?</div>
    <div class="question-options">
      <div class="question-option" data-label="Option 1">
        <span class="option-label">Option 1</span>
        <span class="option-desc">Description of option 1</span>
      </div>
      <!-- more options -->
    </div>
  </div>
  <button class="question-submit" disabled>Submit Answer</button>
</div>
```

### 8. Create handleOptionSelect() Function in app.js
- Handle click events on question options
- Toggle selection state (highlight selected options)
- Update `state.pendingQuestion.selectedAnswers`
- Enable the submit button when at least one answer is selected per question

### 9. Create submitQuestionResponse() Function in app.js
- Gather selected answers from state
- Format as array of labels (matching SDK expectation)
- Send WebSocket message:
```javascript
state.ws.send(JSON.stringify({
  type: 'question-response',
  sessionId: state.currentSessionId,
  toolUseId: state.pendingQuestion.id,
  answers: formattedAnswers // e.g., { 0: ["Selected Label"], 1: ["Label A", "Label B"] }
}));
```
- Clear the question from state
- Optionally show the response in the chat

### 10. Add CSS Styles for Question UI in style.css
- Style the question block container
- Style question headers and text
- Style option cards with hover and selected states
- Use neon theme colors consistent with existing design
- Style the submit button
- Example styles:
```css
.message.question-block {
  background: var(--bg-lighter);
  border-left: 3px solid var(--neon-green);
  padding: 16px;
}

.question-option {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin: 8px 0;
  transition: all 0.2s;
}

.question-option:hover {
  border-color: var(--neon-cyan);
  background: var(--bg-hover);
}

.question-option.selected {
  border-color: var(--neon-green);
  background: rgba(57, 255, 20, 0.1);
  box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
}

.question-submit {
  margin-top: 16px;
  padding: 12px 24px;
  background: var(--neon-green);
  /* etc */
}
```

### 11. Handle Question Timeout/Cancellation
- Consider what happens if the query is aborted while a question is pending
- Clear `state.pendingQuestion` when streaming ends or errors
- Disable the question UI if the session ends

### 12. Test the Complete Flow
- Start a session in plan mode
- Send a prompt that triggers Claude to ask a question
- Verify the question is displayed with all options
- Select an option and submit
- Verify the response flows back to Claude
- Verify Claude continues the conversation based on the answer

## Testing Strategy
1. **Unit Testing**: Test `transformMessage()` with mocked `mcp_question` tool use data
2. **Integration Testing**: 
   - Test full round-trip: user prompt → Claude question → user response → Claude continuation
   - Test with single-select questions
   - Test with multiple-select questions
   - Test with multiple questions in one tool call
3. **Edge Cases**:
   - Question with many options (scrolling)
   - Very long option descriptions
   - Aborting while question is pending
   - Network disconnection during question response

## Acceptance Criteria
- [ ] When Claude uses `mcp_question` in plan mode, the question text and all options are visible in the chat
- [ ] Options are interactive - users can click to select/deselect them
- [ ] Single-select questions only allow one selection at a time
- [ ] Multiple-select questions allow multiple selections
- [ ] A submit button appears and is enabled only when required selections are made
- [ ] Submitting the answer sends the response back to Claude
- [ ] Claude receives the response and continues the conversation
- [ ] The UI matches the existing neon theme styling
- [ ] Questions are cleared when the session ends or is aborted

## Validation Commands
Execute these commands to validate the task is complete:

- `node --check server/claude.js` - Verify JavaScript syntax is valid
- `node --check server/index.js` - Verify index.js syntax is valid  
- `npm start` - Start the server and manually test by:
  1. Logging in
  2. Selecting a project
  3. Switching to "Plan Mode" (green clipboard icon)
  4. Sending a prompt that causes Claude to ask a clarifying question
  5. Verifying the question displays with options
  6. Selecting an option and submitting
  7. Verifying Claude continues based on the answer

## Notes
- The `query.streamInput()` method may need special handling - check if the query generator is still active when trying to send responses
- The SDK may have specific requirements for tool result format - verify against SDK documentation
- Consider adding a "Type your own answer" option since the `mcp_question` tool supports custom answers when `custom: true` (default behavior)
- The `mcp_question` tool definition mentions answers are returned as arrays of labels, so ensure the response format matches this expectation
