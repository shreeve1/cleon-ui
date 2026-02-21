# Feature Planning: Streaming AI Activity Status

**Date:** 2026-02-15
**Project:** /Users/james/1-testytech/cleonui

## Feature Description

Stream real-time AI agent activity status to users so they can see what the AI is currently working on instead of only seeing results after the fact. This includes:
- What the AI is thinking/planning before taking action
- Tool execution progress during long-running operations
- What the AI is about to do (preview of upcoming actions)
- Sub-steps within individual tool calls

**Visibility:** Always show all AI activity (maximum transparency)
**Detail Level:** Adaptive based on duration - brief for quick tasks, progressively more detailed for longer operations

## Implementation Decision

**Chosen Approach:** Option 1 - EventEmitter Progress Wrapper (Standard approach)

**Rationale:** This approach builds on the existing SSE + event bus architecture with minimal refactoring. It leverages the Node.js built-in EventEmitter pattern already used in the codebase (bus.js) and works naturally with the Claude SDK's async iterator pattern currently implemented. The adaptive detail mechanism is straightforward to implement using elapsed time thresholds.

## Codebase Context

**Project Overview:**
- Lightweight mobile-first web interface for Claude Code with retro neon aesthetics
- Real-time chat interface with streaming activity status, task tracking, and session persistence

**Tech Stack:**
- Node.js/Express backend with SSE (Server-Sent Events) for unidirectional streaming
- WebSocket for bidirectional communication (user interactions, aborts)
- Vanilla JavaScript frontend
- Anthropic Claude Agent SDK (@anthropic-ai/claude-agent-sdk v0.1.29)

**Current Architecture:**
- SSE endpoint: `GET /api/events?token=<jwt>`
- Event bus: In-memory pub/sub per-user (server/bus.js)
- Message buffering: Session-level buffers store last 1000 messages/5MB for late-joining clients
- Task tracking: Already tracks tool execution lifecycle (start/complete/fail) via taskManager

**Existing Event Types:**
- `claude-message` - Text responses, tool use, tool results
- `token-usage` - Model token consumption metrics
- `session-status` - Session state changes
- `task-started`, `task-completed`, `task-failed` - Tool execution lifecycle
- `question`, `plan-confirmation` - Interactive prompts

**Key Files:**
- `/Users/james/1-testytech/cleonui/server/index.js` - Express HTTP/WebSocket/SSE server
- `/Users/james/1-testytech/cleonui/server/claude.js` - Claude SDK integration, transformMessage() function
- `/Users/james/1-testytech/cleonui/server/bus.js` - Event bus (publish/subscribe)
- `/Users/james/1-testytech/cleonui/server/tasks.js` - Task lifecycle management
- `/Users/james/1-testytech/cleonui/public/app.js` - Frontend SSE client, StreamingRenderer

## Options Considered

### Option 1: EventEmitter Progress Wrapper (Standard approach) ✅

**Approach:** Enhance existing `transformMessage()` function to emit intermediate progress events through SSE infrastructure. Add synthetic "thinking" and "planning" states based on observable patterns (time between messages, tool execution sequences).

**Complexity:** Medium
**Effort:** Medium

**Pros:**
- Builds on existing SSE + event bus architecture - minimal refactoring
- Works naturally with Claude SDK's async iterator pattern already in use
- EventEmitter is Node.js built-in, no new dependencies
- Adaptive detail is straightforward: check elapsed time, emit detailed events after 5-second threshold
- Can add new event types (`agent-activity`, `tool-progress`) without breaking existing flow

**Cons:**
- Claude SDK doesn't expose internal "thinking" stages - must synthesize from timing/patterns
- Requires manual instrumentation of each tool type for sub-step tracking
- No built-in state management - track progress in variables/maps
- Limited visibility into actual AI reasoning process

**Risks:**
- Synthetic "thinking" indicators may not accurately reflect what Claude is doing
- Could spam users with too many events if not carefully throttled
- Need to handle event ordering and race conditions in SSE subscribers

### Option 2: SSE Status Channel + Skeleton Screens (Lightweight approach) ❌

**Approach:** Create new SSE event type `status-update` sending brief activity descriptions. Use skeleton screens in frontend instead of detailed progress tracking.

**Complexity:** Low
**Effort:** Quick

**Pros:**
- Simplest implementation - just one new event type
- Skeleton screens proven to feel 20-30% faster than spinners
- Low bandwidth - short status strings only
- Easy adaptive behavior: basic status by default, details after 5 seconds
- No complex state tracking needed

**Cons:**
- Less transparency - high-level status only, no detailed sub-steps
- Skeleton screens require frontend UI redesign
- Limited granularity (no percentages or sub-steps)
- May feel like "fake loading state" if not tied to actual progress

**Risks:**
- Users might still feel uninformed during long operations
- Skeleton screens can mislead if actual content structure differs
- Requires careful timing calibration

### Option 3: Activity State Machine + Timeline UI (Comprehensive approach) ❌

**Approach:** Model AI workflow as explicit states using XState (idle → reading_context → planning → executing_tools → waiting_result → synthesizing_response). Each state transition publishes rich metadata via SSE. Frontend renders timeline/progress visualization.

**Complexity:** High
**Effort:** Significant

**Pros:**
- Maximum transparency - complete workflow progression visible
- Explicit state modeling makes adding new activity types easy
- XState provides excellent debugging tools and state visualization
- Can show parallel activities (multiple tool executions)
- Rich progress data enables sophisticated UI (timelines, graphs, execution trees)
- State machine prevents impossible transitions and race conditions

**Cons:**
- Significant refactoring - wrapping SDK in state machine abstraction
- Learning curve for XState if team isn't familiar
- More complex frontend for timeline/progress visualization
- Higher bandwidth usage for rich state metadata
- May be over-engineered for actual need

**Risks:**
- State machine abstraction could complicate debugging SDK issues
- Performance overhead from state transitions and event emissions
- Complex UI could overwhelm users instead of helping
- Breaking changes if Claude SDK behavior changes

## Research Findings

### Similar Implementations

- **SSE is the de facto standard** for LLM streaming (OpenAI, Anthropic, most LLM APIs)
- **Start/delta/end pattern**: Text content streams using unique IDs with incremental deltas for each block
- **AG-UI Protocol**: Standardized event-based protocol with ~16 event types including `TOOL_CALL_ARGS` (streaming arguments as generated), `TOOL_CALL_END`, `TOOL_RESULT`
- **Vercel AI SDK**: Granular tool lifecycle hooks (`onInputStart`, `onInputDelta`, `onInputAvailable`) with custom data parts for status updates
- **Claude Extended Thinking**: Streams via SSE with `thinking_delta` events for reasoning content - requires handling both thinking and text content blocks

**Common pattern:** SSE-based streaming with structured event types (thinking/reasoning, tool execution, text deltas) sent as incremental updates. Start/delta/end lifecycle pattern for each content block with unique IDs.

**Notable tradeoffs:**
- SSE wins over WebSockets for one-way streaming (simpler, easier to scale with stateless servers)
- More granular events provide better UX but increase complexity and overhead
- Streaming events not guaranteed at constant rate - can have delays

### Technology Options

**Claude Agent SDK Built-in Events:**
- SDK returns async iterator with message types (`assistant`, `result`, `stream_event`)
- Already implemented in `/Users/james/1-testytech/cleonui/server/claude.js` via `processQueryStream()`
- Currently captures `tool_use` blocks and creates tasks with `taskManager.trackTaskStart()`
- **Limitation:** SDK doesn't expose internal "thinking" or "planning" stages - only see tool executions and text output
- Can infer complexity from tool execution duration (already tracking `toolStartTimes`)

**EventEmitter Progress Wrapper Pattern (Recommended):**
- Wrap async operations in custom EventEmitter emitting granular progress events
- Instrumentation layer around Claude SDK tracks tool execution state, emits custom events to SSE bus
- Node.js built-in `EventEmitter` (already used in `bus.js`)
- Existing `publish()` function can broadcast events to SSE subscribers
- Adaptive detail: emit basic events initially, switch to verbose if tool takes >5 seconds

**Alternative Options:**
- XState for state machine modeling (adds abstraction layer)
- Diagnostics Channels (Node.js native, lower-level API)

### User Experience Patterns

**Visual Feedback:**
- **Skeleton screens over spinners** - perceived as 20-30% faster, users happier
- **Typewriter effect** - 5ms per character (~200 chars/second) optimal for readability
- **Typing indicators** - show system is working ("searching codebase," "editing files")
- **Step-by-step progress** - create narrative users can follow, showing logical progression

**User Control:**
- **Thinking mode toggles** - Claude offers expandable "Extended thinking" section; ChatGPT has adjustable levels (Standard, Light, Extended)
- **Collapsible/expandable details** - users choose when to dig deeper
- **Transparency without overload** - every answer should include clickable sources/footnotes

**Adaptive Detail (Progressive Disclosure):**
- **Three-layer architecture** - Layer 1 (lightweight metadata), Layer 2 (full content when relevant), Layer 3 (supporting materials)
- **Brief for quick, detailed for long** - skip animations under 1 second, looped for 2-10 seconds, percent-done for 10+ seconds
- **Concise over verbose** - users prefer clear, contextually relevant feedback over lengthy explanations

**Real-World Implementations:**
- **Cursor** - shows each agent as distinct item with status, progress indicators, output logs; context pills indicate files being worked on
- **ChatGPT** - shows indicator when using plugins/browsing
- **Animation timing** - 200-500ms ideal for micro-interactions

**Pain Points to Avoid:**
- Information overload - use collapsible sections and progressive disclosure
- Persistent loading states - provide clear status updates and timeout handling
- Frozen progress bars - never stop moving; start slower, speed up near end
- Motion accessibility - respect `prefers-reduced-motion`, avoid rapid flashes
- Misleading "thinking" displays - be authentic about what you're showing (ChatGPT o1's "thinking" is described as "a smart gimmick")

## Next Steps

Run `/plan` with the chosen approach to create a detailed implementation plan.

Example:
```
/plan Implement streaming AI activity status using EventEmitter progress wrapper pattern with adaptive detail based on operation duration
```
