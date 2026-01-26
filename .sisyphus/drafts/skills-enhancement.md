# Draft: Skills Section Enhancement

## Project Context

**Tech Stack:**
- Monorepo with npm workspaces (frontend + backend)
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + WebSockets + node-pty
- Purpose: Mobile-friendly Web UI for Claude Code CLI

**Current Skills Implementation:**

### Data Structure
```typescript
interface Skill {
  name: string;        // "Interview"
  keyword: string;     // "interview"
  description: string; // Brief description
  path: string;        // Filesystem path
}
```

### Components
- `SkillButtons.tsx`: Horizontally scrollable row of skill buttons (pills)
- `useSkills.ts`: Hook for fetching skills and inserting them into input
- `App.tsx`: Renders SkillButtons above PromptInput
- `ChatMessage.tsx`: Displays which skill was used for each message

### Current Behavior
- Skills displayed as horizontal scrollable pills with `@keyword` labels
- Mock data in `proxy-client.ts` (3 skills: interview, issue-tracker, ulw)
- Clicking inserts `@keyword` into chat input
- Disabled when streaming or disconnected

---

## User Enhancement Request

**Goal**: Load skills dynamically from backend instead of mock data

**Confirmed Requirements:**
- Replace `MOCK_SKILLS` in `frontend/src/api/proxy-client.ts` with dynamic backend API call
- Backend should serve skills from Claude Code skills directory
- Frontend should fetch skills on initialization (via existing `useSkills` hook)

---

## Research Findings

### Skills Directory Structure

**Location**: `~/.claude/skills/` (Claude Code standard location)

**Skills Found**:
1. `interview/` - Interview skill (file: `SKILL.md`)
2. `issue-tracker/` - Issue tracking skill (file: `skill.md`)
3. `ulw/` - UltraWork Lite orchestrator (file: `SKILL.md`)
4. `disabled/` - Directory for disabled skills

### Skill File Format

**Structure**: Skill directories containing `SKILL.md` with YAML frontmatter

```bash
~/.claude/skills/
├── interview/
│   └── SKILL.md
├── issue-tracker/
│   └── SKILL.md
└── ulw/
    └── SKILL.md
```

**SKILL.md Format**:
```markdown
---
name: interview
description: Interview you about project plans, goals, and ideas using context from CLAUDE.md and current codebase.
---

# Skill Title

Content here...
```

**Required Fields**:
- `name`: 1-64 chars, lowercase a-z0-9 and hyphens only (becomes `/slash-command`)
- `description`: Max 1024 chars, explains what skill does and when to use it

**Optional Fields** (from official spec):
- `argument-hint`: Hint for autocomplete (e.g., `[filename]`)
- `disable-model-invocation`: boolean
- `user-invocable`: boolean (hide from `/` menu)
- `allowed-tools`: Space-delimited list of tools
- `model`: Model name to use
- `context`: `fork` (run in subagent)
- `agent`: Agent type when `context: fork`
- `metadata`: Custom key-value mapping

### Skills Locations (Priority Order)

1. **Personal skills**: `~/.claude/skills/<skill-name>/` (all projects)
2. **Project skills**: `.claude/skills/<skill-name>/` (current project only)
3. **Plugin skills**: `<plugin>/skills/<skill-name>/` (namespaced)
4. **Disabled skills**: `disabled/` subdirectory (should be excluded)

### Backend Current State
- ❌ No `/api/skills` endpoint exists
- ✅ `skillName` field exists in `SessionMessage` type (line 114 in `types.ts`)
- ❌ No skill loading or management logic
- ❌ Backend only acts as CLI wrapper, doesn't read skills directory

### Frontend Current State
- ❌ Uses `MOCK_SKILLS` array in `proxy-client.ts` (lines 186-209)
- ✅ Skill type matches expected structure (name, keyword, description, path)
- ✅ `useSkills` hook already set up for async fetching
- ❌ Frontend would need API integration to replace mock

---

## Implementation Decisions (User Confirmed)

✅ **Skills Path**: Support both personal and project-specific skills
   - Primary: `~/.claude/skills/` (all projects)
   - Secondary: `.claude/skills/` (current project only)
   - Priority: personal > project

✅ **Caching Strategy**: Watch for changes
   - Cache skills in memory for fast access
   - Auto-refresh when files change (file watching)
   - Best of both: performance + immediate updates

✅ **Error Handling**: Return empty array
   - If skills directory doesn't exist, return empty array
   - Frontend will show "No skills available"
   - No errors thrown to client

⚠️ **Missing Dependencies** (Not installed):
   - `gray-matter`: Required for YAML frontmatter parsing
   - `chokidar`: Required for file watching
   - No test framework: Jest, Vitest, or bun test (if adding tests)

---

## Technical Implementation Plan

### Backend Implementation

**New Module**: `skill-manager.ts`
- Discover skills from `~/.claude/skills/` and `.claude/skills/`
- Parse `SKILL.md` files (YAML frontmatter extraction)
- Watch for file system changes (chokidar or fs.watch)
- Cache in memory
- Provide API endpoint for frontend

**API Endpoint**: `GET /api/skills`
- Returns array of skills with fields:
  - `name`: from frontmatter
  - `keyword`: name field (used for `/@keyword`)
  - `description`: from frontmatter
  - `path`: skill directory path

**Skill Parsing**:
- Skip `disabled/` subdirectory
- Require `name` field (skip if missing)
- Require `description` field (skip if missing)
- Handle both `skill.md` and `SKILL.md` filenames
- Validate lowercase, hyphens-only for name

### Frontend Implementation

**Update**: `frontend/src/api/proxy-client.ts`
- Replace `MOCK_SKILLS` with actual API call
- New function: `fetchSkills()` that calls `GET /api/skills`
- Handle empty array gracefully

**No Changes Needed**:
- `useSkills` hook already designed for async fetching
- `SkillButtons` component already handles skills array
- Skill type structure matches expected format
