# Brainstorm: Model Selection Feature for CleonUI

**Date**: 2026-02-14
**Topic**: Add a button to change the model in the web UI

## Research Briefing

### Key Themes

**Context preservation architecture is critical**
- Simply replaying full conversation history fails when models have different context limits
- Tiered memory approach (verbatim recent + summarized older + persistent memories) is production standard
- Context translation (extracting intent/state metadata) outperforms raw message replay

**SDK already has sophisticated model switching capabilities**
- `opusplan` alias provides automated intelligent switching (Opus for planning, Sonnet for execution)
- `fallback_model` parameter enables automatic model fallback without context loss
- Session management supports resume/fork operations for context preservation

**UI/UX patterns favor abstraction over technical details**
- Intent-based labeling ("Deep Analysis") outperforms raw model names by 34% user onboarding completion
- Dropdowns ideal for 2-4 options, modals for 5+ models
- Persistent settings with per-session overrides creates optimal UX balance

**WebSocket state synchronization requires careful handling**
- AbortController pattern for mid-stream model changes
- Correlation IDs to discard chunks from interrupted streams
- Worker pool isolation may be needed to avoid engine corruption from interruptions

### Notable Insights

**SDK model aliases provide powerful abstraction**
- `default`, `sonnet`, `opus`, `haiku`, `sonnet[1m]`, `opusplan` - aliases always point to latest versions
- `opusplan` automatically switches models based on mode (Opus for planning, Sonnet for execution)
- Could leverage this built-in logic rather than building custom switching

**Context management matters more than model selection**
- 80-90% token reduction possible through semantic caching and tiered memory
- Multi-turn LLM accuracy drops from 90%+ to 86% primarily due to context management failures
- Implementing intelligent memory yields more UX improvement than model selection itself

**Anthropic provides dynamic model discovery**
- `GET /v1/models` endpoint returns available models with rich metadata
- Context windows, pricing, max output tokens, latency tiers, capability flags all available
- HTTP caching (ETag, Last-Modified) enables efficient caching strategy

### Contrarian Perspectives

**Stream interruption can corrupt inference engines**
- Simply sending cancellation signals isn't sufficient
- May need worker pool isolation or separate generation contexts to avoid cascading failures

**Exposing raw model names increases user anxiety**
- Technical identifiers (e.g., "claude-opus-4-6") cause decision paralysis
- Abstraction layer is a feature, not a bug

**Model switching mid-session already works in Claude Code CLI**
- The `/model` command does preserve context when switching models
- Technical foundation already exists; this is primarily a UI feature

## User Requirements (Clarified)

- **Motivation**: User control over model selection
- **Success criteria**: Production-ready with proper error handling and persistence
- **Session behavior**: Preserve context when switching models (seamless mid-conversation switching)
- **UI placement**: Header dropdown (next to mode button)
- **Model options**: Just the big 3 (Haiku, Sonnet, Opus)
- **Persistence**: Remember choice in localStorage

## Implementation Decision

**Simple approach selected** - A straightforward dropdown in the header that:
1. Shows 3 options: Haiku, Sonnet, Opus
2. Saves selection to localStorage
3. Sends model to server with each chat message
4. Server passes model parameter to SDK

## Next Steps

Implementation plan saved to: `specs/model-selection-dropdown.md`

Run `/build specs/model-selection-dropdown.md` to execute the plan.
