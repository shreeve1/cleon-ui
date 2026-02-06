# Session: File Paste/Upload Feature Implementation

**Date:** 2025-02-05

## Summary

Implemented the ability to paste or drag-and-drop files (screenshots, TXT, PDF, MD) into the chat input for Claude Lite web UI.

## Features Implemented

### Frontend (public/app.js, public/index.html, public/style.css)

1. **Attachment State Management**
   - Added `attachments` array to global state
   - Tracks id, type, name, data, preview, and mediaType for each attachment

2. **Paste Event Handler**
   - Detects Cmd/Ctrl+V paste events
   - Filters for allowed file types (images, .txt, .md, .pdf)
   - Converts images to base64 for preview and sending

3. **Drag and Drop**
   - Full drag-enter/leave/over/drop event handling
   - Visual drop zone overlay with animated neon styling
   - Drag counter to handle nested elements

4. **Attach Button (Mobile Support)**
   - Added paperclip button next to mode button
   - Hidden file input with `accept="image/*,.txt,.md,.pdf"`
   - Opens native file picker on mobile (camera/photo library/files)

5. **Attachment Preview**
   - Shows thumbnails for images
   - Shows file icon + name for documents
   - Remove button (X) on hover
   - Max 5 attachments limit

6. **Message Sending**
   - Modified `sendMessage()` to include attachments in WebSocket message
   - Displays attachment indicators in user message bubble

### Backend (server/index.js, server/claude.js, server/uploads.js)

1. **File Upload Endpoint**
   - `POST /api/upload` for PDF text extraction
   - Uses multer for multipart form handling
   - 10MB file size limit

2. **PDF Processing**
   - Created `server/uploads.js` with pdf-parse integration
   - Extracts text content from PDF files

3. **Image Handling for Claude**
   - Saves images to `.claude-uploads/` directory in project
   - Instructs Claude to use Read tool to view the image
   - Cleans up temp files after query completes

4. **Text/Markdown Attachments**
   - Appends file content directly to prompt with filename header

## Dependencies Added

```bash
npm install multer pdf-parse
```

## Files Modified

- `public/app.js` - Attachment state, paste/drop handlers, preview rendering
- `public/index.html` - Attach button, file input, drop zone overlay
- `public/style.css` - Attachment preview styles, drop zone animation
- `server/index.js` - Upload endpoint with multer
- `server/claude.js` - Process attachments, save images to temp files
- `server/uploads.js` - New file for PDF text extraction
- `.gitignore` - Added `.claude-uploads/`

## Usage

### Desktop
- **Paste**: Cmd/Ctrl+V to paste screenshot from clipboard
- **Drag & Drop**: Drag files into chat area

### Mobile
- **Attach Button**: Tap paperclip icon to open file picker
- iOS/Android shows options for Camera, Photo Library, or Files

## Known Issues

- Image viewing requires Claude to use the Read tool on the temp file
- Session resumption with images initially caused crashes (fixed by saving to project directory)

## Testing Notes

1. Screenshot paste working on desktop
2. Mobile attach button triggers native file picker
3. PDF text extraction working via `/api/upload` endpoint
4. Text/markdown files read directly without server upload
5. Preview thumbnails display correctly
6. Remove button works to delete attachments before sending
