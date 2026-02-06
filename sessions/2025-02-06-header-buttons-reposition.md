# Session: Header Buttons Reposition

**Date:** 2026-02-06

## Summary

Repositioned the action buttons in Claude Lite web UI. Moved the attach (paperclip) and mode toggle buttons from the chat form to the top-right header area, while keeping the send button in the chat form at the bottom.

## Changes Made

### Frontend (public/index.html, public/style.css)

1. **Header Actions Container**
   - Added `#header-actions` div in the header (right side)
   - Contains: file-input, attach-btn, mode-btn, abort-btn
   - Uses flex layout with `margin-left: auto` to push to the right

2. **Button Relocation**
   - `#attach-btn` - Moved from chat-form to header
   - `#mode-btn` - Moved from chat-form to header
   - `#abort-btn` - Already in header, kept there
   - `#send-btn` - Kept in chat-form at bottom (not moved to header per user preference)

3. **CSS Updates**
   - Added `#header-actions` styles: flex container, 8px gap, right-aligned
   - Updated `#attach-btn` styles: 44x44px, transparent background, hover effects
   - Updated `#mode-btn` styles: 44x44px, transparent background
   - Kept `#send-btn` in chat-form: 50x50px with gradient background
   - Restored `#chat-form` flex layout with gap for textarea + send button
   - Restored `#chat-input` `flex: 1` to fill available width

### Header Layout (left to right)

1. Menu button (hamburger)
2. Session info (project name, token usage)
3. `#attach-btn` - Paperclip icon for file attachments
4. `#mode-btn` - Mode toggle (Default/Plan/Bypass)
5. `#abort-btn` - Stop button (appears during streaming)

### Chat Form Layout (bottom)

1. `#slash-commands` - Command autocomplete dropdown
2. `#file-mentions` - File mention autocomplete dropdown
3. `#attachment-preview` - Attachment thumbnails/preview
4. `#chat-input` - Full-width textarea (flex: 1)
5. `#send-btn` - Send button (right side)

## Files Modified

- `public/index.html` - Moved buttons to header, simplified chat-form
- `public/style.css` - Added header-actions styles, updated button styles

## Technical Notes

- Send button uses `form="chat-form"` attribute since it's now outside the form element
- All event listeners in app.js continue to work (IDs unchanged)
- File input moved to header but still triggers from attach button click
- Mode toggle cycling and visual states unchanged
- Abort button visibility during streaming unchanged

## Screenshots

See `/tmp/webui-fixed.png` for final layout:
- Header shows attach and mode buttons on the right
- Chat form shows full-width input with send button at bottom right
