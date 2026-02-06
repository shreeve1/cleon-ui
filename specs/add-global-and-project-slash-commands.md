# Plan: Add Global and Project Slash Commands

## Task Description
Add support for loading and displaying global commands (from `~/.claude/commands/`) and project-specific commands (from `<project>/.claude/commands/`) in the slash command autocomplete menu. These custom commands should auto-populate alongside the built-in commands when users type "/" in the chat input.

## Objective
When a user types "/" in the chat input, the autocomplete dropdown should show:
1. Built-in commands (existing hardcoded list)
2. Global commands loaded from `~/.claude/commands/*.md`
3. Project-specific commands loaded from `<currentProject>/.claude/commands/*.md`

Commands should be visually distinguished by their source (built-in, global, project) and the system should gracefully handle missing directories.

## Problem Statement
Currently, the webui only shows hardcoded built-in slash commands when users type "/". Claude Code supports custom commands defined as markdown files in:
- Global location: `~/.claude/commands/`
- Project location: `<project>/.claude/commands/`

These custom commands have a YAML frontmatter with `description` and optionally `allowed-tools`, which can be parsed to display meaningful information in the autocomplete.

## Solution Approach
1. Create a backend API endpoint to scan and return commands from both global and project directories
2. Parse markdown frontmatter to extract command metadata (name, description)
3. Update the frontend to fetch commands dynamically when a project is selected
4. Merge built-in, global, and project commands for display in the autocomplete
5. Add visual indicators to distinguish command sources

## Relevant Files
Use these files to complete the task:

- `public/app.js` - Frontend application with current hardcoded `SLASH_COMMANDS` array and autocomplete logic (lines 68-510)
- `server/index.js` - Express server setup, needs new route registration
- `server/projects.js` - Project-related API routes, pattern for new endpoint
- `public/style.css` - Styles for slash command dropdown

### New Files
- `server/commands.js` - New module to handle command discovery and parsing

## Implementation Phases

### Phase 1: Foundation
Create the backend infrastructure to discover and parse command files from both global and project directories.

### Phase 2: Core Implementation
Add API endpoint, update frontend to fetch commands dynamically, and integrate with existing autocomplete.

### Phase 3: Integration & Polish
Add visual distinction for command sources, handle edge cases, and ensure graceful degradation.

## Step by Step Tasks

### 1. Create Command Discovery Module
- Create `server/commands.js` with functions to:
  - `parseCommandFile(filePath)` - Read a markdown file and extract YAML frontmatter
  - `discoverCommands(directory)` - Scan a directory for `.md` files and parse them
  - `getGlobalCommands()` - Return commands from `~/.claude/commands/`
  - `getProjectCommands(projectPath)` - Return commands from `<projectPath>/.claude/commands/`
- Use a simple YAML frontmatter parser (regex-based to avoid dependencies)
- Return objects with shape: `{ name: string, description: string, source: 'global'|'project', path: string }`

### 2. Add API Endpoint for Commands
- In `server/index.js`, add new route: `GET /api/commands`
- Query params: `projectPath` (optional) - the current project's filesystem path
- Response: Array of command objects with `name`, `description`, `source`
- Merge global commands with project commands (project commands take precedence if same name)
- Handle missing directories gracefully (return empty arrays, not errors)

### 3. Update Frontend State Management
- In `public/app.js`, add `state.commands = []` to track loaded commands
- Keep `SLASH_COMMANDS` as built-in commands (rename to `BUILTIN_COMMANDS` for clarity)
- Add function `loadCommands(projectPath)` to fetch from API
- Call `loadCommands()` when a project is selected in `selectProject()`

### 4. Merge Commands for Autocomplete
- Update `handleSlashCommandInput()` to use merged command list
- Merge order: built-in commands first, then global, then project
- If duplicate names exist, prefer project > global > built-in
- Update filtering logic to search both name and description

### 5. Update Command Rendering with Source Indicators
- Modify `renderSlashCommands()` to show source badge (built-in, global, project)
- Add CSS classes: `.slash-command-source`, `.source-builtin`, `.source-global`, `.source-project`
- Update `public/style.css` with appropriate styling (small badge, different colors)

### 6. Handle Edge Cases
- Empty project path (show only built-in + global)
- Network errors during command fetch (fallback to built-in only)
- Malformed markdown files (skip with console warning)
- Large number of commands (consider limiting display to ~20)

### 7. Validate Implementation
- Test with no global commands directory
- Test with no project commands directory
- Test with both present
- Test command name collisions (project overrides global)
- Verify autocomplete filtering works across all command sources

## Testing Strategy

### Manual Testing
1. Create test commands in `~/.claude/commands/test-global.md`
2. Create project commands in `.claude/commands/test-project.md`
3. Type "/" in chat and verify all three sources appear
4. Verify filtering works for custom commands
5. Test selecting a custom command inserts it correctly

### Edge Case Testing
- Start server with no `~/.claude/commands/` directory
- Select a project with no `.claude/commands/` directory
- Create a malformed markdown file (no frontmatter)
- Test with very long command descriptions

## Acceptance Criteria
- [ ] Typing "/" shows built-in, global, and project commands
- [ ] Commands are visually distinguished by source (badge or color)
- [ ] Project commands override global commands of the same name
- [ ] Missing command directories don't cause errors
- [ ] Command descriptions from YAML frontmatter are displayed
- [ ] Selecting a custom command inserts `/command-name ` into the input
- [ ] Commands update when switching between projects

## Validation Commands
Execute these commands to validate the task is complete:

- `curl http://localhost:3001/api/commands` - Should return global commands
- `curl "http://localhost:3001/api/commands?projectPath=/path/to/project"` - Should return merged commands
- `node --check server/commands.js` - Verify no syntax errors
- `ls ~/.claude/commands/` - Verify global commands exist for testing

## Notes
- The YAML frontmatter format is:
  ```yaml
  ---
  description: Short description of the command
  allowed-tools: Bash, Read
  ---
  ```
- Command name is derived from filename (e.g., `build.md` -> `/build`)
- No external dependencies needed - use regex for simple YAML parsing
- Consider caching commands with a short TTL if performance becomes an issue
