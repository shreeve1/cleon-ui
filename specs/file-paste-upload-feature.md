# Plan: Paste and Upload Files (Screenshots, TXT, PDF, MD)

## Task Description
Implement the ability to paste or drag-and-drop files into the chat input, including screenshots (images), plain text files (.txt), PDF documents (.pdf), and markdown files (.md). Pasted content should be attached to the message and sent to Claude for processing.

## Objective
Enable users to quickly attach files to their messages by pasting from clipboard (Cmd/Ctrl+V) or dragging files into the chat area. This provides a natural way to share context with Claude, similar to the native Claude Code experience.

## Problem Statement
Currently, users can only send text messages to Claude. If they want to share file content, they must:
1. Manually copy and paste file contents into the input
2. Use @-mentions to reference files on disk
3. Cannot share screenshots or images at all

This limits the ability to quickly share visual context (screenshots, diagrams) or document content without explicit file references.

## Solution Approach
Implement a multi-part solution:

1. **Frontend Event Handling**: Detect paste events (Cmd/Ctrl+V) and drag-drop events on the chat input/messages area
2. **File Processing**: Process different file types client-side where possible, upload to server when needed
3. **Attachment Preview**: Show visual previews of attached files before sending
4. **Backend Integration**: Modify chat message handler to accept attachments and pass them to Claude SDK
5. **Claude Integration**: Send images as multimodal content and files as context

## Relevant Files

### Existing Files to Modify
- `/Users/james/1-testytech/webui/public/index.html` - Add attachment preview container and drop zone indicator
- `/Users/james/1-testytech/webui/public/app.js` - Add paste/drop handlers, attachment state, preview rendering
- `/Users/james/1-testytech/webui/public/style.css` - Add styles for attachment previews and drop zone
- `/Users/james/1-testytech/webui/server/index.js` - Add file upload endpoint
- `/Users/james/1-testytech/webui/server/claude.js` - Modify handleChat to process attachments

### New Files
- `/Users/james/1-testytech/webui/server/uploads.js` - File upload handling and processing utilities

## Implementation Phases

### Phase 1: Foundation
Set up the frontend event handlers for paste and drag-drop, create basic attachment state management.

### Phase 2: Core Implementation
Implement file processing for each type (images, text, PDF, markdown), create backend upload endpoint, modify message sending to include attachments.

### Phase 3: Integration & Polish
Connect to Claude SDK with multimodal content, add preview UI, handle edge cases and errors.

## Step by Step Tasks

### 1. Add Attachment State and DOM Elements
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add attachment state to the global state object (around line 11):
```javascript
const state = {
  // ... existing state
  attachments: [] // Array of { type, name, data, preview }
};
```

Add DOM references (around line 104):
```javascript
const attachmentPreviewEl = $('#attachment-preview');
const dropZoneOverlay = $('#drop-zone-overlay');
```

### 2. Add HTML Structure for Attachments
**File**: `/Users/james/1-testytech/webui/public/index.html`

Add attachment preview area above the chat input (inside #chat-form, around line 72):
```html
<form id="chat-form">
  <div id="slash-commands" class="hidden"></div>
  <div id="file-mentions" class="hidden"></div>
  <div id="attachment-preview" class="hidden"></div>
  <!-- existing inputs -->
</form>
```

Add drop zone overlay for visual feedback (inside #main-screen, after #chat):
```html
<div id="drop-zone-overlay" class="hidden">
  <div class="drop-zone-content">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <span>Drop files here</span>
  </div>
</div>
```

### 3. Add CSS Styles for Attachments
**File**: `/Users/james/1-testytech/webui/public/style.css`

Add styles for attachment preview container:
```css
/* Attachment Preview */
#attachment-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-lighter);
}

.attachment-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  max-width: 200px;
}

.attachment-item.image {
  padding: 4px;
}

.attachment-item img {
  max-width: 80px;
  max-height: 60px;
  border-radius: 4px;
  object-fit: cover;
}

.attachment-icon {
  width: 24px;
  height: 24px;
  color: var(--neon-cyan);
}

.attachment-name {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.attachment-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  background: var(--neon-red);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.attachment-item:hover .attachment-remove {
  opacity: 1;
}

/* Drop Zone Overlay */
#drop-zone-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 15, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  backdrop-filter: blur(4px);
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  border: 2px dashed var(--neon-cyan);
  border-radius: var(--radius);
  color: var(--neon-cyan);
  animation: drop-zone-pulse 1.5s ease-in-out infinite;
}

.drop-zone-content svg {
  animation: drop-zone-bounce 1s ease-in-out infinite;
}

@keyframes drop-zone-pulse {
  0%, 100% { border-color: var(--neon-cyan); }
  50% { border-color: var(--neon-pink); }
}

@keyframes drop-zone-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
```

### 4. Implement Paste Event Handler
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add paste event listener to the document (after existing event listeners, around line 700):
```javascript
// Paste handler for files
document.addEventListener('paste', async (e) => {
  // Only handle if chat is enabled and a project is selected
  if (!state.currentProject || chatInput.disabled) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file && isAllowedFileType(file)) {
        files.push(file);
      }
    }
  }

  if (files.length > 0) {
    e.preventDefault();
    for (const file of files) {
      await processAndAddAttachment(file);
    }
  }
});

function isAllowedFileType(file) {
  const allowedTypes = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'text/plain', 'text/markdown',
    'application/pdf'
  ];
  const allowedExtensions = ['.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];

  if (allowedTypes.includes(file.type)) return true;

  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return allowedExtensions.includes(ext);
}
```

### 5. Implement Drag and Drop Handlers
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add drag and drop event listeners:
```javascript
// Drag and drop handlers
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!state.currentProject || chatInput.disabled) return;

  dragCounter++;
  if (dragCounter === 1) {
    dropZoneOverlay.classList.remove('hidden');
  }
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    dropZoneOverlay.classList.add('hidden');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropZoneOverlay.classList.add('hidden');

  if (!state.currentProject || chatInput.disabled) return;

  const files = Array.from(e.dataTransfer?.files || []);
  for (const file of files) {
    if (isAllowedFileType(file)) {
      await processAndAddAttachment(file);
    }
  }
});
```

### 6. Implement File Processing
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add file processing functions:
```javascript
async function processAndAddAttachment(file) {
  const attachment = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    name: file.name,
    type: getAttachmentType(file),
    size: file.size
  };

  if (attachment.type === 'image') {
    // Convert image to base64 for preview and sending
    attachment.data = await fileToBase64(file);
    attachment.preview = attachment.data;
    attachment.mediaType = file.type;
  } else if (attachment.type === 'text' || attachment.type === 'markdown') {
    // Read text content directly
    attachment.data = await file.text();
    attachment.preview = truncateText(attachment.data, 100);
  } else if (attachment.type === 'pdf') {
    // Upload PDF and get extracted text
    const result = await uploadFile(file);
    attachment.data = result.content;
    attachment.preview = truncateText(result.content, 100);
  }

  state.attachments.push(attachment);
  renderAttachmentPreview();
  chatInput.focus();
}

function getAttachmentType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf';
  if (file.name.endsWith('.md')) return 'markdown';
  return 'text';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${state.token}`
    },
    body: formData
  });

  if (!res.ok) {
    throw new Error('File upload failed');
  }

  return res.json();
}
```

### 7. Implement Attachment Preview Rendering
**File**: `/Users/james/1-testytech/webui/public/app.js`

Add preview rendering functions:
```javascript
function renderAttachmentPreview() {
  if (state.attachments.length === 0) {
    attachmentPreviewEl.classList.add('hidden');
    attachmentPreviewEl.innerHTML = '';
    return;
  }

  attachmentPreviewEl.classList.remove('hidden');
  attachmentPreviewEl.innerHTML = state.attachments.map(att => {
    if (att.type === 'image') {
      return `
        <div class="attachment-item image" data-id="${att.id}">
          <img src="${att.preview}" alt="${escapeAttr(att.name)}">
          <button class="attachment-remove" onclick="removeAttachment('${att.id}')">&times;</button>
        </div>
      `;
    }

    const icon = getFileIcon(att.name);
    return `
      <div class="attachment-item" data-id="${att.id}">
        <span class="attachment-icon">${icon}</span>
        <span class="attachment-name">${escapeHtml(att.name)}</span>
        <button class="attachment-remove" onclick="removeAttachment('${att.id}')">&times;</button>
      </div>
    `;
  }).join('');
}

// Make removeAttachment globally accessible
window.removeAttachment = function(id) {
  state.attachments = state.attachments.filter(att => att.id !== id);
  renderAttachmentPreview();
};
```

### 8. Modify Message Sending to Include Attachments
**File**: `/Users/james/1-testytech/webui/public/app.js`

Modify the `sendMessage` function (around line 649):
```javascript
function sendMessage(content) {
  const mode = MODES[state.modeIndex];

  const message = {
    type: 'chat',
    content: content,
    mode: mode.name,
    projectPath: state.currentProject.path,
    sessionId: state.currentSessionId,
    isNewSession: !state.currentSessionId
  };

  // Add attachments if present
  if (state.attachments.length > 0) {
    message.attachments = state.attachments.map(att => ({
      type: att.type,
      name: att.name,
      data: att.data,
      mediaType: att.mediaType
    }));
  }

  state.ws.send(JSON.stringify(message));

  // Show attachments in user message
  const displayContent = formatUserMessageWithAttachments(content, state.attachments);
  appendMessage('user', displayContent);

  // Clear attachments after sending
  state.attachments = [];
  renderAttachmentPreview();

  chatInput.value = '';
  chatInput.style.height = 'auto';

  state.isStreaming = true;
  abortBtn.classList.remove('hidden');
  chatInput.disabled = true;
  sendBtn.disabled = true;
  modeBtn.disabled = true;
}

function formatUserMessageWithAttachments(content, attachments) {
  if (attachments.length === 0) return content;

  const attachmentText = attachments.map(att => {
    if (att.type === 'image') {
      return `[Image: ${att.name}]`;
    }
    return `[${att.type.toUpperCase()}: ${att.name}]`;
  }).join(' ');

  return content ? `${content}\n\n${attachmentText}` : attachmentText;
}
```

### 9. Create Server Upload Endpoint
**File**: `/Users/james/1-testytech/webui/server/uploads.js`

Create new file for upload handling:
```javascript
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// For PDF text extraction we'll use pdf-parse
// Run: npm install pdf-parse

/**
 * Process uploaded file and extract content
 */
export async function processUpload(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.pdf') {
    return await extractPdfText(file.buffer);
  }

  if (['.txt', '.md'].includes(ext)) {
    return {
      content: file.buffer.toString('utf8'),
      type: ext === '.md' ? 'markdown' : 'text'
    };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

/**
 * Extract text from PDF buffer
 */
async function extractPdfText(buffer) {
  try {
    // Dynamic import for pdf-parse
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return {
      content: data.text,
      type: 'pdf',
      pages: data.numpages
    };
  } catch (err) {
    console.error('[Upload] PDF extraction error:', err);
    throw new Error('Failed to extract PDF content');
  }
}

/**
 * Validate file size and type
 */
export function validateFile(file) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedExtensions = ['.txt', '.md', '.pdf'];

  if (file.size > maxSize) {
    throw new Error('File too large (max 10MB)');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  return true;
}
```

### 10. Add Upload Route to Server
**File**: `/Users/james/1-testytech/webui/server/index.js`

Add file upload dependencies and route:
```javascript
// Add to imports at top
import multer from 'multer';
import { processUpload, validateFile } from './uploads.js';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Add upload endpoint (after other API routes, around line 44)
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    validateFile(req.file);
    const result = await processUpload(req.file);

    res.json(result);
  } catch (err) {
    console.error('[Upload] Error:', err);
    res.status(400).json({ error: err.message });
  }
});
```

### 11. Modify Claude Handler to Process Attachments
**File**: `/Users/james/1-testytech/webui/server/claude.js`

Modify handleChat to process attachments (around line 52):
```javascript
export async function handleChat(msg, ws) {
  const { content, projectPath, sessionId, isNewSession, mode, attachments } = msg;

  // Build prompt with attachments
  let prompt = content || '';
  let imageContent = null;

  if (attachments && attachments.length > 0) {
    const textAttachments = [];

    for (const att of attachments) {
      if (att.type === 'image') {
        // Store image for multimodal content
        imageContent = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mediaType,
            data: att.data.replace(/^data:image\/\w+;base64,/, '')
          }
        };
      } else {
        // Add text-based attachments to context
        textAttachments.push(`\n\n--- ${att.name} ---\n${att.data}`);
      }
    }

    if (textAttachments.length > 0) {
      prompt += textAttachments.join('');
    }
  }

  // Rest of function continues with modified prompt...
```

Then update the query call to support multimodal:
```javascript
  // If we have an image, use multimodal format
  const promptContent = imageContent
    ? [
        imageContent,
        { type: 'text', text: prompt }
      ]
    : prompt;

  queryInstance = query({
    prompt: promptContent,
    options
  });
```

### 12. Install Required Dependencies
**Commands**:
```bash
cd /Users/james/1-testytech/webui
npm install multer pdf-parse
```

### 13. Validate Implementation
Test the following scenarios:
- Paste an image from clipboard (screenshot) - should appear as preview
- Drag and drop a .txt file - should show file attachment
- Drag and drop a .md file - should process markdown content
- Drag and drop a .pdf file - should extract and include text
- Remove attachment by clicking X button
- Send message with multiple attachments
- Verify attachments appear in Claude's response context

## Testing Strategy

### Manual Testing Checklist
1. **Screenshot paste**: Take screenshot, Cmd+V into chat - image preview shows
2. **Image drag**: Drag .png file - preview appears, can remove
3. **Text file**: Drop .txt file - content extracted, preview shows
4. **Markdown file**: Drop .md file - parsed correctly
5. **PDF file**: Drop .pdf file - text extracted via backend
6. **Multiple files**: Drop several files at once - all attach
7. **Remove attachment**: Click X - attachment removed
8. **Send with attachment**: Message sent includes attachment context
9. **Image to Claude**: Claude can describe/analyze pasted images
10. **Disabled state**: No paste/drop when chat disabled or no project

### Edge Cases to Handle
- Very large files (>10MB) - show error
- Unsupported file types - ignore or show error
- Empty files - handle gracefully
- PDF with no extractable text - show warning
- Network error during upload - retry or show error
- Paste text (not file) - should still work normally
- Multiple rapid pastes - handle queue correctly

## Acceptance Criteria

- [ ] Pasting an image (Cmd/Ctrl+V) adds it as an attachment with preview
- [ ] Dragging files into chat area shows drop zone overlay
- [ ] Dropping supported files (.png, .jpg, .txt, .md, .pdf) creates attachments
- [ ] Attachment preview shows below slash commands, above input
- [ ] Remove button (X) removes individual attachments
- [ ] Sending message includes all attachments in Claude context
- [ ] Images are sent as multimodal content to Claude
- [ ] Text/PDF content is extracted and included as context
- [ ] Upload progress/errors are handled gracefully
- [ ] Feature is disabled when no project selected or chat disabled
- [ ] Existing paste (text) behavior still works when no files

## Validation Commands

Execute these commands to validate the task is complete:

```bash
# Install dependencies
npm install multer pdf-parse

# Start server and test
npm start

# Test upload endpoint directly
curl -X POST http://localhost:3001/api/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@test.pdf"

# Manual browser testing:
# 1. Open app in browser
# 2. Select a project
# 3. Take screenshot and paste (Cmd+V)
# 4. Verify image preview appears
# 5. Drag .txt file into chat
# 6. Verify text attachment appears
# 7. Send message and verify Claude receives context
```

## Notes

### Implementation Tips
- Base64 encoding for images keeps things simple but increases message size
- Consider adding a "processing" state while PDFs are being extracted
- The Claude SDK supports multimodal prompts via content arrays
- Limit number of attachments to prevent very large messages (suggest max 5)

### Performance Considerations
- Large images should be resized client-side before sending (max 2000px)
- PDF extraction can be slow for large documents - show progress
- Consider chunking large text files if they exceed context limits

### Security Considerations
- Validate file types on both client and server
- Sanitize filenames before display
- Don't store uploaded files permanently - process and discard
- Rate limit uploads to prevent abuse

### Future Enhancements (out of scope)
- Image resizing/compression before upload
- Clipboard paste for text with formatting
- Audio file transcription
- URL preview/scraping
- File attachment history
