# Plan: Dynamic Skills Loading from Backend

## Context

### Original Request
Enhance the skills section in Claude Code WebUI by loading skills dynamically from backend instead of using mock data.

### Interview Summary
**Key Discussions:**
- Currently using hardcoded `MOCK_SKILLS` in frontend (3 skills: interview, issue-tracker, ulw)
- Backend has no skills API or skill management logic
- Skills stored in `~/.claude/skills/<skill-name>/SKILL.md` with YAML frontmatter
- User wants dynamic loading from backend

**Technical Decisions:**
- Support both personal (`~/.claude/skills/`) and project (`.claude/skills/`) skills
- Cache skills in memory and watch for file system changes
- Return empty array if skills directory doesn't exist (no errors to client)
- Test strategy: Tests after implementation (not TDD)

### Research Findings
- **Skills Location**: Standard Claude Code paths: personal (`~/.claude/skills/`), project (`.claude/skills/`), plugin (`<plugin>/skills/`)
- **File Format**: Directory containing `SKILL.md` with YAML frontmatter
  - Required: `name` (1-64 chars, lowercase a-z0-9 and hyphens), `description` (max 1024 chars)
  - Optional: `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `context`, `agent`, `metadata`
- **Current Skills**: interview, issue-tracker, ulw (note: ulw has no frontmatter)
- **Disabled Skills**: Located in `disabled/` subdirectory (should be excluded)

### Metis Review - Critical Gaps Addressed

**Gap 1: Skills without frontmatter** (e.g., ulw)
**Resolution**: Derive `name` from directory name and use empty string for `description`
- Auto-resolved: Parse directory name, skip frontmatter extraction if missing

**Gap 2: Keyword field generation**
**Resolution**: `keyword` should equal directory name (not from frontmatter)
- Auto-resolved: Generate `keyword` from skill directory name

**Gap 3: Content vs metadata only**
**Resolution**: API should return metadata only (no content field)
- Auto-resolved: Exclude optional `content` field from API response

**Gap 4: Personal vs project skill priority**
**Resolution**: Personal skills take precedence (overwrites project skills with same name)
- Auto-resolved: Merge with personal skills overwriting project skills

**Gap 5: File watcher scope**
**Resolution**: Watch entire skills directories for new/deleted directories and changed SKILL.md files
- Auto-resolved: Use chokidar to watch both directories recursively

**Gap 6: Malformed skills handling**
**Resolution**: Skip silently with console warning (don't break entire API)
- Auto-resolved: Try-catch per skill, log error, continue parsing

**Guardrails Applied:**
- MUST NOT add WebSocket support for skills (REST sufficient)
- MUST NOT load skill content by default (metadata only)
- MUST NOT modify `claude-code.ts` (only `proxy-client.ts`)
- MUST NOT add new type definitions (use existing `Skill` interface)
- MUST NOT add skill CRUD operations (read-only for now)
- MUST NOT add complex caching (simple in-memory + file watcher)

---

## Work Objectives

### Core Objective
Replace mock skills data in frontend with dynamic loading from backend by implementing skill discovery, parsing, and API endpoint.

### Concrete Deliverables
- Backend: `backend/src/skill-manager.ts` (new module)
- Backend: `GET /api/skills` endpoint in `server.ts`
- Frontend: Updated `frontend/src/api/proxy-client.ts` (fetchSkills function)
- Frontend tests for skill loading
- Backend tests for skill manager

### Definition of Done
- [ ] Skills load dynamically from `~/.claude/skills/` and `.claude/skills/`
- [ ] Frontend displays all skills including those without frontmatter (e.g., ulw)
- [ ] File system changes to skills directory trigger cache refresh
- [ ] API returns empty array when no skills directory exists
- [ ] Tests pass for both backend and frontend
- [ ] No errors in console during normal operation

### Must Have
- Skill discovery from both personal and project directories
- YAML frontmatter parsing with graceful fallback for missing frontmatter
- In-memory caching with file system watching
- REST API endpoint for frontend
- Support for skills without frontmatter (derive name from directory)
- Skip `disabled/` subdirectory

### Must NOT Have (Guardrails)
- WebSocket skills endpoint
- Full skill content loading in list API
- New TypeScript type definitions
- Modifications to `claude-code.ts` (only `proxy-client.ts`)
- Skill CRUD operations (create, update, delete)
- Complex caching strategies beyond simple in-memory

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **User wants tests**: YES (Tests after implementation)
- **Framework**: None currently (will add if needed)
- **QA approach**: Tests after implementation + manual verification

### Test Implementation (After Code)

**Backend Tests**:
- Test skill discovery from personal directory
- Test skill discovery from project directory
- Test YAML frontmatter parsing (with and without frontmatter)
- Test disabled directory exclusion
- Test malformed frontmatter handling
- Test empty directory handling

**Frontend Tests**:
- Test API integration (mock fetchSkills call)
- Test loading state display
- Test error handling (empty skills array)
- Test skill buttons rendering with real data

**Manual Verification**:
- [ ] Start backend: `npm run dev:backend`
- [ ] Start frontend: `npm run dev:frontend`
- [ ] Navigate to app
- [ ] Verify all 3 skills (interview, issue-tracker, ulw) appear
- [ ] Add new test skill to `~/.claude/skills/test-skill/SKILL.md`
- [ ] Verify new skill appears automatically (file watcher)
- [ ] Disable a skill (move to `disabled/`)
- [ ] Verify skill disappears from UI
- [ ] Check browser console for errors

---

## Task Flow

```
Phase 1 (Backend)
  ├─ Task 1: Create SkillManager class
  ├─ Task 2: Add skills API endpoint
  └─ Task 3: Test SkillManager

Phase 2 (Frontend)
  ├─ Task 4: Update proxy-client to fetch skills
  └─ Task 5: Test frontend integration
```

## Parallelization

| Group | Tasks | Reason |
|-------|--------|--------|
| A | 1, 2 | Backend module and API (dependent - manager needed for endpoint) |

| Task | Depends On | Reason |
|------|------------|--------|
| 3 | 1 | Requires SkillManager to test |
| 4 | 2 | Requires API endpoint to integrate |
| 5 | 4 | Requires updated client to test |

---

## TODOs

- [ ] 1. Create SkillManager class in backend

  **What to do**:
  - Create `backend/src/skill-manager.ts`
  - Implement singleton pattern (like ProjectManager)
  - Implement `loadSkills()` method to scan `~/.claude/skills/` and `.claude/skills/`
  - Implement `listSkills()` method to return cached skills
  - Implement file watching with chokidar for cache refresh
  - Parse YAML frontmatter from SKILL.md files
  - Handle missing frontmatter gracefully (derive name from directory)
  - Skip `disabled/` subdirectory
  - Handle errors per-skill (don't break entire load)
  - Merge skills: personal overwrites project (same name)

  **Must NOT do**:
  - Load full skill content into memory
  - Add WebSocket support
  - Create new type definitions (use existing Skill interface from frontend, or create backend-specific type)

  **Parallelizable**: NO (foundation task)

  **References**:

  **Pattern References** (existing code to follow):
  - `backend/src/project-manager.ts` - Manager class pattern with singleton, listX() methods
  - `backend/src/session-manager.ts` - Manager class structure and initialization
  - `backend/src/types.ts` - Existing type definitions (add Skill type if needed)
  - `backend/src/server.ts:147-154` - REST API endpoint pattern with error handling

  **API/Type References** (contracts to implement against):
  - `frontend/src/types.ts:86-92` - Skill interface definition (name, keyword, description, content?, path)

  **Documentation References** (specs and requirements):
  - `.sisyphus/drafts/skills-enhancement.md` - Technical decisions and research
  - Claude Code skills documentation - YAML frontmatter format
  - agentskills.io specification - Skill file structure

  **External References** (libraries and frameworks):
  - Official docs: gray-matter (npm package) - YAML frontmatter parsing
  - Official docs: chokidar (npm package) - File system watching

  **WHY Each Reference Matters**:
  - `project-manager.ts` shows the established manager pattern (singleton, initialization, listX methods) that should be replicated
  - `Skill` interface defines exactly what frontend expects (name, keyword, description, path)
  - gray-matter is the standard library for parsing YAML frontmatter in markdown files
  - chokidar is the most reliable cross-platform file watcher for Node.js

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `backend/src/__tests__/skill-manager.test.ts`
  - [ ] Test covers: Skill discovery from personal directory
  - [ ] Test covers: Skill discovery from project directory
  - [ ] Test covers: YAML frontmatter parsing
  - [ ] Test covers: Missing frontmatter handling
  - [ ] Test covers: Disabled directory exclusion
  - [ ] Test covers: Malformed frontmatter handling
  - [ ] Test covers: Error handling (skip bad skills)
  - [ ] `npm test` in backend → PASS (all tests, 0 failures)

  **Manual Execution Verification (ALWAYS include, even with tests):**

  **For Backend changes:**
  - [ ] Build backend: `cd backend && npm run build`
  - [ ] Start backend: `npm run dev:backend`
  - [ ] Check console: No errors during startup
  - [ ] Test endpoint: `curl http://localhost:5175/api/skills`
  - [ ] Response contains: All 3 skills (interview, issue-tracker, ulw)
  - [ ] Verify ulw has: name="ulw", keyword="ulw", description="" (derived from directory)
  - [ ] Test missing skills dir: Temporarily rename `~/.claude/skills`, call endpoint
  - [ ] Response: Empty array `[]` (not error)

  **Evidence Required**:
  - [ ] Console output captured (showing "Skills loaded: 3" or similar)
  - [ ] curl response logged (showing JSON with skills array)
  - [ ] Screenshot saved (if adding UI for viewing skills)

  **Commit**: YES (with task 2)
  - Message: `feat(backend): add SkillManager class for dynamic skill discovery`
  - Files: `backend/src/skill-manager.ts`
  - Pre-commit: `npm test` (if tests implemented)

- [ ] 2. Add GET /api/skills endpoint to server

  **What to do**:
  - Add `GET /api/skills` route in `server.ts` (in `setupRestAPI()` method)
  - Import and instantiate SkillManager in server.ts
  - Call `skillManager.listSkills()` on endpoint request
  - Return JSON: `{ skills: Skill[] }`
  - Follow existing error handling pattern (try-catch with 500 response)

  **Must NOT do**:
  - Add WebSocket support for skills
  - Add skills CRUD operations (create, update, delete)
  - Add skill content loading

  **Parallelizable**: NO (depends on task 1)

  **References**:

  **Pattern References** (existing code to follow):
  - `backend/src/server.ts:147-154` - GET /api/projects endpoint pattern
  - `backend/src/server.ts:141-180` - setupRestAPI() method structure
  - `backend/src/server.ts:147-154` - Error handling pattern (try-catch, res.status(500).json({ error }))

  **API/Type References** (contracts to implement against):
  - `frontend/src/api/proxy-client.ts:19-26` - fetchProjects() method (similar pattern needed)
  - `frontend/src/types.ts:86-92` - Skill interface

  **Documentation References** (specs and requirements):
  - `.sisyphus/drafts/skills-enhancement.md` - API endpoint structure

  **WHY Each Reference Matters**:
  - `/api/projects` endpoint shows the exact pattern to follow for returning resource arrays
  - Existing error handling ensures consistency with other endpoints

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Integration test added to test server endpoint
  - [ ] Test covers: Successful skills list retrieval
  - [ ] Test covers: Error handling (500 if manager fails)
  - [ ] `npm test` → PASS

  **Manual Execution Verification (ALWAYS include, even with tests):**

  **For Backend changes:**
  - [ ] Build backend: `cd backend && npm run build`
  - [ ] Start backend: `npm run dev:backend`
  - [ ] Test endpoint: `curl http://localhost:5175/api/skills`
  - [ ] Response status: 200
  - [ ] Response body: `{ "skills": [...] }`
  - [ ] Response contains: 3 skills (interview, issue-tracker, ulw)
  - [ ] Verify each skill has: name, keyword, description, path

  **Evidence Required**:
  - [ ] curl response logged (showing JSON structure)
  - [ ] Console shows: "GET /api/skills 200" (or similar log)

  **Commit**: YES
  - Message: `feat(backend): add GET /api/skills endpoint`
  - Files: `backend/src/server.ts`
  - Pre-commit: `npm test`

- [ ] 3. Test SkillManager backend implementation

  **What to do**:
  - Create test file: `backend/src/__tests__/skill-manager.test.ts`
  - Test personal skills discovery
  - Test project skills discovery
  - Test YAML frontmatter parsing (with frontmatter)
  - Test missing frontmatter handling
  - Test disabled directory exclusion
  - Test malformed frontmatter handling (skip with warning)
  - Test empty skills directory (return empty array)
  - Test skill merging (personal overwrites project)

  **Must NOT do**:
  - Add WebSocket testing
  - Test skill content loading (not implementing)

  **Parallelizable**: NO (depends on task 1 and 2)

  **References**:

  **Pattern References** (existing code to follow):
  - Search for existing test files to follow test patterns
  - (If no test framework): Add test setup (Jest, Vitest, or similar)

  **Test References** (testing patterns to follow):
  - (If no test framework): Research testing in TypeScript + Node.js

  **Documentation References** (specs and requirements):
  - `.sisyphus/drafts/skills-enhancement.md` - Test requirements

  **External References** (libraries and frameworks):
  - Official docs: Jest / Vitest / bun test (depending on framework choice)

  **Acceptance Criteria**:

  **Tests after implementation**:
  - [ ] Test file created
  - [ ] All test cases pass
  - [ ] `npm test` → PASS (N tests, 0 failures)

  **Manual Execution Verification**:
  - [ ] Run tests: `cd backend && npm test`
  - [ ] All tests pass: Console shows PASS status
  - [ ] Test coverage: All critical paths covered

  **Evidence Required**:
  - [ ] Test output captured (showing X tests passed)
  - [ ] No errors in test console

  **Commit**: YES
  - Message: `test(backend): add SkillManager unit tests`
  - Files: `backend/src/__tests__/skill-manager.test.ts`
  - Pre-commit: `npm test`

- [ ] 4. Update frontend proxy-client to fetch skills from API

  **What to do**:
  - Replace `MOCK_SKILLS` in `frontend/src/api/proxy-client.ts`
  - Create `fetchSkills()` async function that calls `GET /api/skills`
  - Return `skills` from response
  - Keep existing function signature: `getSkills()` calls `fetchSkills()`
  - Handle empty array (no skills available)
  - Handle errors (return empty array on failure)
  - Remove or comment out `MOCK_SKILLS` constant

  **Must NOT do**:
  - Modify `frontend/src/api/claude-code.ts` (only modify proxy-client.ts)
  - Add new TypeScript types (use existing Skill interface)
  - Change Skill interface structure
  - Load skill content (metadata only)

  **Parallelizable**: NO (depends on task 2)

  **References**:

  **Pattern References** (existing code to follow):
  - `frontend/src/api/proxy-client.ts:19-26` - fetchProjects() async pattern
  - `frontend/src/api/proxy-client.ts:28-38` - parseMessages() pattern
  - `frontend/src/api/proxy-client.ts:186-209` - MOCK_SKILLS structure to replace

  **API/Type References** (contracts to implement against):
  - `backend/src/server.ts` - New /api/skills endpoint
  - `frontend/src/types.ts:86-92` - Skill interface

  **Documentation References** (specs and requirements):
  - `.sisyphus/drafts/skills-enhancement.md` - Frontend integration approach

  **WHY Each Reference Matters**:
  - `fetchProjects()` shows the exact async pattern to replicate for skills
  - MOCK_SKILLS shows the data structure being replaced
  - Skill interface defines the contract with backend

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `frontend/src/__tests__/proxy-client.test.ts` (or existing test file)
  - [ ] Test covers: API call to /api/skills
  - [ ] Test covers: Successful skills fetch
  - [ ] Test covers: Error handling (returns empty array)
  - [ ] `npm test` → PASS

  **Manual Execution Verification (ALWAYS include, even with tests):**

  **For Frontend changes:**
  - [ ] Build frontend: `cd frontend && npm run build`
  - [ ] Start frontend: `npm run dev:frontend`
  - [ ] Open browser to http://localhost:5173
  - [ ] Check skills section: All 3 skills visible
  - [ ] Click skill button: Inserts @keyword into input
  - [ ] Check browser console: No errors
  - [ ] Network tab: Verify GET /api/skills request succeeded
  - [ ] Add test skill to `~/.claude/skills/test/SKILL.md`
  - [ ] Verify new skill appears (file watcher + auto-refresh)
  - [ ] Rename skills dir temporarily: Shows "No skills available"
  - [ ] Restore skills dir: Skills reappear

  **Evidence Required**:
  - [ ] Screenshot showing skills section with 3 skill buttons
  - [ ] Console log showing skills array from API
  - [ ] Network tab screenshot showing successful API call
  - [ ] Screenshot showing new test skill appearing

  **Commit**: YES (with task 5)
  - Message: `feat(frontend): replace MOCK_SKILLS with dynamic API fetch`
  - Files: `frontend/src/api/proxy-client.ts`
  - Pre-commit: `npm test` (if tests implemented)

- [ ] 5. Test frontend integration end-to-end

  **What to do**:
  - Create frontend tests (if test framework exists)
  - Test useSkills hook with real API data
  - Test loading state display
  - Test error handling (empty skills)
  - Manual verification: Test full user flow

  **Must NOT do**:
  - Add new UI components
  - Modify SkillButtons component
  - Change skill display format

  **Parallelizable**: NO (depends on task 4)

  **References**:

  **Pattern References** (existing code to follow):
  - `frontend/src/hooks/useSkills.ts` - Hook structure (already async-ready)
  - `frontend/src/components/SkillButtons.tsx` - Component using skills array

  **Test References** (testing patterns to follow):
  - (If no test framework): Add test setup if needed

  **Documentation References** (specs and requirements):
  - `.sisyphus/drafts/skills-enhancement.md` - Frontend testing approach

  **Acceptance Criteria**:

  **Tests after implementation**:
  - [ ] Test file created (if test framework exists)
  - [ ] Test covers: useSkills hook with API data
  - [ ] Test covers: Loading state
  - [ ] Test covers: Empty skills array
  - [ ] `npm test` → PASS

  **Manual Execution Verification**:

  **Full Integration Test:**
  - [ ] Start both services: `npm run dev` (from root)
  - [ ] Open browser to http://localhost:5173
  - [ ] Verify: 3 skills visible (interview, issue-tracker, ulw)
  - [ ] Click "@interview" button: Inserts "@interview " into input
  - [ ] Click "@issue-tracker" button: Inserts "@issue-tracker " into input
  - [ ] Click "@ulw" button: Inserts "@ulw " into input
  - [ ] Check each button: Tooltip shows description on hover
  - [ ] Test streaming: Send message with @ulw, verify skill not disabled during stream
  - [ ] Test disconnected: Skills should be disabled when not connected
  - [ ] File system test: Add new skill to `~/.claude/skills/new-skill/SKILL.md`
  - [ ] Verify: New skill appears within 1-2 seconds (file watcher)
  - [ ] Remove skills dir: Verify "No skills available" message appears

  **Evidence Required**:
  - [ ] Screenshot: Skills section with all 3 buttons
  - [ ] Screenshot: Clicking skill button inserts @keyword
  - [ ] Screenshot: New skill appearing after file system change
  - [ ] Screenshot: Empty state when skills dir removed
  - [ ] Console output: No errors throughout testing
  - [ ] Network log: Successful /api/skills requests

  **Commit**: YES
  - Message: `test(frontend): add end-to-end skills integration tests`
  - Files: `frontend/src/__tests__/` (if tests added)
  - Pre-commit: `npm test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1+2 | `feat(backend): add dynamic skills loading with SkillManager and API` | `backend/src/skill-manager.ts`, `backend/src/server.ts` | npm test (backend) |
| 3 | `test(backend): add SkillManager unit tests` | `backend/src/__tests__/skill-manager.test.ts` | npm test (backend) |
| 4+5 | `feat(frontend): replace mock skills with dynamic API fetch` | `frontend/src/api/proxy-client.ts` | npm test (frontend) |

---

## Success Criteria

### Verification Commands
```bash
# Backend
cd backend && npm run build && npm run dev
curl http://localhost:5175/api/skills

# Frontend
cd frontend && npm run build && npm run dev
# Open browser to http://localhost:5173
```

### Final Checklist
- [ ] All skills from `~/.claude/skills/` appear in UI
- [ ] Skills without frontmatter (ulw) load with name from directory
- [ ] File watcher detects changes (new skills appear, disabled skills disappear)
- [ ] Empty skills directory shows "No skills available" (no errors)
- [ ] All backend tests pass
- [ ] All frontend tests pass (if implemented)
- [ ] No console errors in browser or terminal
- [ ] Manual verification: All 3 existing skills work correctly
