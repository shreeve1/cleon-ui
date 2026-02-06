import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const router = express.Router();
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');

/**
 * GET /api/projects/search?q=/path/to/project
 * Search projects by path substring
 */
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();

  try {
    let entries;
    try {
      entries = await fs.readdir(CLAUDE_PROJECTS, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json([]); // No Claude projects yet
      }
      throw err;
    }

    const projects = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Extract actual project path from sessions or decode from name
      const projectDir = path.join(CLAUDE_PROJECTS, entry.name);
      const actualPath = await extractProjectPath(projectDir, entry.name);
      
      // Filter by search query
      if (query && !actualPath.toLowerCase().includes(query)) continue;

      // Count sessions
      const files = await fs.readdir(projectDir);
      const sessions = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

      projects.push({
        name: entry.name,
        path: actualPath,
        displayName: path.basename(actualPath),
        sessionCount: sessions.length
      });
    }

    // Sort by path
    projects.sort((a, b) => a.path.localeCompare(b.path));

    res.json(projects.slice(0, 30)); // Limit results

  } catch (err) {
    console.error('[Projects] Search error:', err);
    res.status(500).json({ error: 'Failed to search projects' });
  }
});

/**
 * GET /api/projects/:name/sessions
 * List sessions for a project, sorted by most recent
 */
router.get('/:name/sessions', async (req, res) => {
  const projectDir = path.join(CLAUDE_PROJECTS, req.params.name);

  try {
    let files;
    try {
      files = await fs.readdir(projectDir);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json([]);
      }
      throw err;
    }

    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

    // Get file stats and previews
    const sessions = await Promise.all(jsonlFiles.map(async (file) => {
      const filePath = path.join(projectDir, file);
      const stats = await fs.stat(filePath);
      const preview = await getSessionPreview(filePath);
      
      // Extract session ID from filename
      const sessionId = path.basename(file, '.jsonl');

      return {
        id: sessionId,
        file,
        lastModified: stats.mtime.toISOString(),
        preview
      };
    }));

    // Sort by most recent first
    sessions.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json(sessions.slice(0, 30));

  } catch (err) {
    console.error('[Projects] Sessions error:', err);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

/**
 * GET /api/projects/:name/sessions/:sessionId/messages
 * Get messages for a specific session
 */
router.get('/:name/sessions/:sessionId/messages', async (req, res) => {
  const { name, sessionId } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  
  try {
    const messages = await getSessionMessages(name, sessionId, limit);
    res.json({ messages });
  } catch (err) {
    console.error('[Projects] Messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/**
 * GET /api/projects/:name/path
 * Get the actual filesystem path for a project
 */
router.get('/:name/path', async (req, res) => {
  const projectDir = path.join(CLAUDE_PROJECTS, req.params.name);
  
  try {
    const actualPath = await extractProjectPath(projectDir, req.params.name);
    res.json({ path: actualPath });
  } catch (err) {
    // Fallback to decoded name
    res.json({ path: decodeProjectName(req.params.name) });
  }
});

/**
 * Extract actual project path from session files (cwd field)
 * Falls back to decoding the directory name
 */
async function extractProjectPath(projectDir, projectName) {
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFile = files.find(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

    if (!jsonlFile) {
      return decodeProjectName(projectName);
    }

    const content = await fs.readFile(path.join(projectDir, jsonlFile), 'utf8');
    const lines = content.split('\n').filter(Boolean);

    // Look for cwd field in first few entries
    for (const line of lines.slice(0, 30)) {
      try {
        const entry = JSON.parse(line);
        if (entry.cwd) {
          return entry.cwd;
        }
      } catch { /* skip malformed */ }
    }

    return decodeProjectName(projectName);

  } catch {
    return decodeProjectName(projectName);
  }
}

/**
 * Decode project name back to path
 * Note: This is lossy for paths with actual dashes
 */
function decodeProjectName(name) {
  // Handle absolute paths (start with -)
  if (name.startsWith('-')) {
    return '/' + name.slice(1).replace(/-/g, '/');
  }
  return name.replace(/-/g, '/');
}

/**
 * Extract first meaningful user message as session preview
 */
async function getSessionPreview(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines.slice(0, 50)) {
      try {
        const entry = JSON.parse(line);
        
        // Look for user messages
        if (entry.type === 'user' || entry.message?.role === 'user') {
          let text = entry.message?.content || entry.content;
          
          // Handle array format
          if (Array.isArray(text)) {
            text = text.find(t => t.type === 'text')?.text || text[0]?.text;
          }

          // Skip system/internal messages
          if (typeof text === 'string' && 
              text.length > 0 && 
              !text.startsWith('<') &&
              !text.startsWith('{') &&
              !text.includes('CRITICAL:')) {
            const preview = text.slice(0, 120);
            return preview + (text.length > 120 ? '...' : '');
          }
        }
      } catch { /* skip malformed */ }
    }

    return 'New session';

  } catch {
    return 'New session';
  }
}

async function getSessionMessages(projectName, sessionId, limit = 100) {
  const projectDir = path.join(CLAUDE_PROJECTS, projectName);
  const files = await fs.readdir(projectDir);
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
  
  const messages = [];
  
  for (const file of jsonlFiles) {
    const content = await fs.readFile(path.join(projectDir, file), 'utf8');
    const lines = content.split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId !== sessionId) continue;
        
        const msg = parseMessageEntry(entry);
        if (msg) messages.push(msg);
        
      } catch { /* skip malformed */ }
    }
  }
  
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return messages.slice(-limit);
}

function parseMessageEntry(entry) {
  const timestamp = entry.timestamp || new Date().toISOString();
  
  if (entry.type === 'user' || entry.message?.role === 'user') {
    let text = entry.message?.content;
    if (Array.isArray(text)) {
      text = text.filter(t => t.type === 'text').map(t => t.text).join('\n');
    }
    if (typeof text === 'string' && text.length > 0 && !text.startsWith('<') && !text.startsWith('{')) {
      return { role: 'user', content: text, timestamp };
    }
  }
  
  if (entry.type === 'assistant' || entry.message?.role === 'assistant') {
    const content = entry.message?.content;
    if (Array.isArray(content)) {
      const textParts = content.filter(c => c.type === 'text').map(c => c.text);
      if (textParts.length > 0) {
        return { role: 'assistant', content: textParts.join('\n'), timestamp };
      }
      
      const toolUse = content.find(c => c.type === 'tool_use');
      if (toolUse) {
        return { 
          role: 'tool', 
          tool: toolUse.name, 
          input: toolUse.input,
          timestamp 
        };
      }
    }
    if (typeof content === 'string') {
      return { role: 'assistant', content, timestamp };
    }
  }
  
  return null;
}

export { router as projectRoutes };
