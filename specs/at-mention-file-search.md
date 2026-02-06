# Plan: @-Mention File Search in Chat Input

## Task Description
Add the ability to use the `@` sign in the chat input to search and reference files within the current project. When a user types `@`, a dropdown should appear showing matching files from the project. Selecting a file inserts a reference that Claude can use to read the file.

## Objective
Implement an @-mention file autocomplete feature that allows users to quickly reference files in their project while typing in the chat input. This improves the UX by making it easier to include file context in conversations with Claude.

## Problem Statement
Currently, users must manually type out file paths when they want Claude to read or reference a file. This is error-prone and inconvenient, especially for deep directory structures. Users need a quick way to search and select files directly from the chat input.

## Solution Approach
Follow the existing slash command autocomplete pattern already implemented in the codebase. The solution involves:

1. **Backend**: Create a new API endpoint to search files within the current project using glob patterns
2. **Frontend**: Implement input detection for `@` character, fetch matching files, and display a dropdown
3. **Integration**: Insert selected file references into the chat input in a format Claude can understand

The implementation mirrors the existing slash command system (lines 498-602 in app.js) but adapts it for file search.

## Relevant Files

### Existing Files to Modify
- `/Users/james/1-testytech/webui/server/index.js` - Add new API endpoint for file search
- `/Users/james/1-testytech/webui/public/app.js` - Add @-mention detection, dropdown handling, and file search logic
- `/Users/james/1-testytech/webui/public/style.css` - Add styles for the file mention dropdown (can reuse slash command styles)
- `/Users/james/1-testytech/webui/public/index.html` - Add container element for file mention dropdown

### New Files
- None required

## Implementation Phases

### Phase 1: Backend API
Create the file search endpoint that uses glob to find files matching the user's query.

### Phase 2: Frontend Core
Implement the @-mention detection, dropdown rendering, and keyboard navigation following the slash command pattern.

### Phase 3: Integration & Polish
Wire up the file selection to insert file references, handle edge cases, and ensure smooth UX.

## Step by Step Tasks

### 1. Add File Search API Endpoint
**File**: `/Users/james/1-testytech/webui/server/index.js`

- Add a new GET endpoint `/api/projects/:project/files/search`
- Accept query parameter `q` for the search term
- Use the `Glob` tool (via MCP or direct file system) to search for files
- Return array of file paths relative to project root
- Limit results to 20 files for performance
- Only search within the current project directory

Example response:
```json
{
  "files": [
    "src/components/Button.js",
    "src/components/Button.test.js",
    "src/utils/buttons.js"
  ]
}
```

### 2. Add HTML Container for File Mention Dropdown
**File**: `/Users/james/1-testytech/webui/public/index.html`

- Add a new div inside the chat form, similar to `#slash-commands`
- Position it above the input textarea
- Give it an ID like `#file-mentions`
- Add `hidden` class by default

```html
<form id="chat-form">
  <div id="slash-commands" class="hidden"></div>
  <div id="file-mentions" class="hidden"></div>
  <!-- existing content -->
</form>
```

### 3. Add CSS Styles for File Mention Dropdown
**File**: `/Users/james/1-testytech/webui/public/style.css`

- Add styles for `#file-mentions` container (similar to `#slash-commands` lines 742-812)
- Style for `.file-mention-item` with hover and selected states
- Include file icon or indicator for visual distinction
- Ensure dropdown appears above input like slash commands

Key styles to add:
- Position absolute, bottom: 100% (above input)
- Max height with overflow-y: auto
- Selected item highlighting
- File path display with proper truncation

### 4. Add State and DOM References in app.js
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add to the existing DOM element references (around line 102):
```javascript
const fileMentionsEl = document.getElementById('file-mentions');
```

Add state variables (around line 151):
```javascript
let fileMentionSelectedIndex = 0;
let fileMentionQuery = '';
let fileMentionStartPos = -1;
```

### 5. Implement @ Detection and Query Extraction
**File**: `/Users/james/1-testytech/webui/public/app.js`

Create a function `handleFileMentionInput()` similar to `handleSlashCommandInput()` (line 498):

- Check if input contains `@` character
- Find the position of the `@` that triggered (handle multiple @ signs)
- Extract the query string between `@` and cursor position or whitespace
- If query is valid, call `fetchFileMentions(query)`
- Debounce the API call (300ms) to avoid excessive requests

Logic for finding active @ mention:
```javascript
const cursorPos = chatInput.selectionStart;
const textBeforeCursor = value.slice(0, cursorPos);
const lastAtIndex = textBeforeCursor.lastIndexOf('@');

if (lastAtIndex === -1) return;

const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
// Check if there's whitespace (which would mean @ is complete)
if (textAfterAt.includes(' ')) return;

fileMentionQuery = textAfterAt;
fileMentionStartPos = lastAtIndex;
```

### 6. Implement File Search API Call
**File**: `/Users/james/1-testytech/webui/public/app.js`

Create function `fetchFileMentions(query)`:

- Check if `state.currentProject` is set (required for file search)
- Make fetch request to `/api/projects/${state.currentProject}/files/search?q=${encodeURIComponent(query)}`
- Handle loading state (optional spinner)
- On success, call `renderFileMentions(files)`
- On error, hide dropdown and log error
- Debounce this function to prevent API spam

### 7. Implement File Mention Rendering
**File**: `/Users/james/1-testytech/webui/public/app.js`

Create function `renderFileMentions(files)` similar to `renderSlashCommands()` (line 522):

- Reset `fileMentionSelectedIndex` to 0
- Map files to HTML with file path display
- Show file icon or folder indicator
- Highlight selected item
- Add click handlers for selection
- Show "No files found" message if empty

Template structure:
```javascript
fileMentionsEl.innerHTML = files.map((file, i) => `
  <div class="file-mention-item${i === 0 ? ' selected' : ''}" data-file="${escapeAttr(file)}">
    <span class="file-icon">📄</span>
    <span class="file-path">${escapeHtml(file)}</span>
  </div>
`).join('');
```

### 8. Implement Keyboard Navigation
**File**: `/Users/james/1-testytech/webui/public/app.js`

Create function `handleFileMentionKeydown(e)` similar to `handleSlashCommandKeydown()` (line 554):

- Handle ArrowDown/ArrowUp to navigate items
- Handle Enter/Tab to select current item
- Handle Escape to close dropdown
- Return true if key was handled (to prevent default)

Add to existing keydown handler (around line 472):
```javascript
if (fileMentionsEl && !fileMentionsEl.classList.contains('hidden')) {
  if (handleFileMentionKeydown(e)) return;
}
```

### 9. Implement File Selection and Insertion
**File**: `/Users/james/1-testytech/webui/public/app.js`

Create function `selectFileMention(filePath)`:

- Get current input value
- Replace text from `fileMentionStartPos` to cursor with formatted file reference
- Format: `@/path/to/file` or wrap in brackets for clarity
- Update input value
- Hide dropdown
- Restore cursor position after inserted text
- Focus back on input

Example insertion:
```javascript
const before = value.slice(0, fileMentionStartPos);
const after = value.slice(chatInput.selectionStart);
const formatted = `@"${filePath}"`;
chatInput.value = before + formatted + after;
```

### 10. Handle Blur and Cleanup
**File**: `/Users/james/1-testytech/webui/public/app.js`

- Add blur handler to hide file mentions dropdown
- Use setTimeout to allow click events on dropdown items to fire first
- Clear file mention state when hiding

```javascript
chatInput.addEventListener('blur', () => {
  setTimeout(() => {
    hideFileMentions();
  }, 150);
});
```

### 11. Wire Up Event Listeners
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add event listeners alongside existing ones (around line 472):

```javascript
// File mention handlers
chatInput.addEventListener('input', handleFileMentionInput);
```

Ensure the input handler is called alongside slash command handler.

### 12. Validate Implementation
- Type `@` in chat input - dropdown should appear with recent/popular files
- Type `@src` - should filter to files matching "src"
- Use arrow keys to navigate - selected item should highlight
- Press Enter - file reference should be inserted
- Press Escape - dropdown should close
- Click on file item - should select and insert
- Test with no project selected - should show helpful message

## Testing Strategy

### Manual Testing Checklist
1. **Basic functionality**: Type `@` and see file dropdown
2. **Search filtering**: Type `@button` shows only matching files
3. **Keyboard navigation**: Arrow keys, Enter, Escape work correctly
4. **Mouse selection**: Clicking file item inserts reference
5. **Multiple @ signs**: `@file1 @file2` handles both correctly
6. **Cursor positioning**: Inserted text maintains proper cursor position
7. **No project state**: Shows appropriate message when no project selected
8. **Empty results**: Shows "No files found" when query matches nothing
9. **Rapid typing**: Debounce prevents excessive API calls
10. **Blur behavior**: Dropdown closes when clicking outside

### Edge Cases to Handle
- User types `@` then deletes it - dropdown should hide
- User types `@` then presses space - mention is cancelled
- User switches projects while dropdown open - clear and refetch
- API error - gracefully handle and show error state
- Very long file paths - truncate with ellipsis
- Special characters in filenames - properly escape for HTML

## Acceptance Criteria

- [ ] Typing `@` in chat input opens a dropdown with file suggestions
- [ ] File dropdown shows files from the current project only
- [ ] Typing after `@` filters files in real-time (debounced)
- [ ] Up/Down arrow keys navigate the file list
- [ ] Enter or Tab selects the highlighted file
- [ ] Escape closes the dropdown without selection
- [ ] Clicking a file item selects it
- [ ] Selected file is inserted as `@"path/to/file"` format
- [ ] Dropdown closes when input loses focus
- [ ] Works alongside existing slash command feature
- [ ] No errors in browser console during normal usage
- [ ] Gracefully handles case when no project is selected

## Validation Commands

Execute these commands to validate the task is complete:

```bash
# Test backend API
curl "http://localhost:3000/api/projects/test-project/files/search?q=src"

# Verify no syntax errors in frontend
# Open browser console and check for errors when:
# 1. Typing @ in chat input
# 2. Navigating file dropdown with arrows
# 3. Selecting a file

# Test that existing slash commands still work
# Type /compact and verify it still functions
```

## Notes

### Implementation Tips
- Reuse as much of the slash command code as possible - the patterns are nearly identical
- The `fileMentionStartPos` variable is critical for knowing where to insert the selected file
- Consider caching file list for the current project to reduce API calls
- The debounce timeout of 300ms provides a good balance between responsiveness and API load

### Security Considerations
- Ensure file search is scoped to the current project only
- Validate project parameter to prevent directory traversal
- Sanitize file paths before returning to frontend

### Future Enhancements (out of scope)
- Recent files section at top of dropdown
- File type icons based on extension
- Folder tree view instead of flat list
- Multi-file selection with checkboxes
