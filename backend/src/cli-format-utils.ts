import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type { SessionMessage, SessionContentBlock } from './types.js';

/**
 * CLI Session Entry Format
 * Matches the format used by Claude Code CLI in ~/.claude/projects/
 */
export interface CLISessionEntry {
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  cwd: string;
  version: string;
  gitBranch: string;
  userType: 'external' | 'skill';
  isSidechain: boolean;
  type: 'user' | 'assistant' | 'queue-operation' | 'progress';
  message?: {
    model: string;
    id: string;
    type: 'message';
    role: 'user' | 'assistant';
    content: any[];
    stop_reason: string | null;
    stop_sequence: string | null;
    usage?: {
      input_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: any;
      output_tokens: number;
      service_tier?: string;
    };
  };
  requestId?: string;
  operation?: 'enqueue' | 'dequeue';
  timestamp: string;
}

/**
 * CLI Project Sessions Index Format
 * Stored as sessions-index.json in each project directory
 */
export interface ProjectSessionsIndex {
  version: number;
  entries: Array<{
    sessionId: string;
    fullPath: string;
    fileMtime: number;
    firstPrompt: string;
    summary: string;
    messageCount: number;
    created: string;
    modified: string;
    gitBranch: string;
    projectPath: string;
    isSidechain: boolean;
  }>;
}

/**
 * Encodes a project path for use as a directory name in ~/.claude/projects/
 * Matches CLI behavior: prepend '-' and replace '/' with '-'
 * Example: /Users/james/project → -Users-james-project
 */
export function encodeProjectPath(projectPath: string): string {
  // Normalize the path first (remove trailing slashes, resolve ..)
  const normalized = path.normalize(projectPath);
  // Replace all '/' with '-' (the leading '/' becomes the leading '-')
  return normalized.replace(/\//g, '-');
}

/**
 * Decodes a project path from directory name
 * Note: This is lossy on Windows (C: vs C-), but matches CLI behavior
 */
export function decodeProjectPath(encoded: string): string {
  if (!encoded.startsWith('-')) {
    throw new Error(`Invalid encoded path: ${encoded}`);
  }
  // Replace all '-' with '/' to restore the original path
  // The leading '-' becomes the leading '/'
  return encoded.replace(/-/g, '/');
}

/**
 * Gets the current git branch for a project
 * Returns empty string if not a git repo or git is unavailable
 */
export function getCurrentGitBranch(projectPath: string): string {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return result.trim();
  } catch {
    return ''; // Not a git repo or git not available
  }
}

/**
 * Normalizes message content to CLI format
 */
function normalizeContent(content: SessionMessage['content']): any[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  // Fallback
  return [{ type: 'text', text: String(content) }];
}

/**
 * Converts a WebUI message to CLI entry format
 */
export function convertWebUIMessageToCLIEntry(
  message: SessionMessage,
  sessionId: string,
  parentUuid: string | null,
  projectPath: string,
  gitBranch: string,
  version: string = 'webui-1.0.0'
): CLISessionEntry {
  const uuid = uuidv4();
  const entry: CLISessionEntry = {
    uuid,
    parentUuid,
    sessionId,
    cwd: projectPath,
    version,
    gitBranch,
    userType: 'external',
    isSidechain: false,
    type: message.role === 'user' ? 'user' : 'assistant',
    timestamp: message.timestamp || new Date().toISOString(),
  };

  // Add message content for user/assistant types
  if (message.role === 'user' || message.role === 'assistant') {
    entry.message = {
      id: message.id || uuidv4(),
      type: 'message',
      model: message.model || 'unknown',
      role: message.role,
      content: normalizeContent(message.content),
      stop_reason: null,
      stop_sequence: null,
    };

    // Add usage info if present (for assistant messages)
    if (message.role === 'assistant' && (message as any).usage) {
      entry.message.usage = (message as any).usage;
    }
  }

  return entry;
}

/**
 * Converts a CLI entry to WebUI message format
 * Returns null for non-message entries (queue-operation, progress)
 */
export function convertCLIEntryToWebUIMessage(
  entry: CLISessionEntry
): SessionMessage | null {
  // Skip queue-operation and progress entries
  if (entry.type === 'queue-operation' || entry.type === 'progress') {
    return null;
  }

  if (!entry.message) {
    return null;
  }

  return {
    id: entry.message.id,
    role: entry.message.role,
    content: entry.message.content,
    timestamp: entry.timestamp,
    model: entry.message.model,
  };
}

/**
 * Reads the sessions index for a project directory
 */
export function readSessionsIndex(projectDir: string): ProjectSessionsIndex {
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    return {
      version: 1,
      entries: [],
    };
  }

  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[CLI Utils] Failed to parse sessions-index.json:', error);
    // Return empty index on corruption
    return { version: 1, entries: [] };
  }
}

/**
 * Writes the sessions index for a project directory
 */
export function writeSessionsIndex(
  projectDir: string,
  index: ProjectSessionsIndex
): void {
  const indexPath = path.join(projectDir, 'sessions-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Extracts text content from a message for summaries
 */
export function extractTextFromMessage(message: SessionMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    const textBlocks = message.content
      .filter((block: any) => block.type === 'text' && block.text)
      .map((block: any) => block.text);
    return textBlocks.join(' ');
  }

  return '';
}

/**
 * Reads all entries from a session JSONL file
 */
export function readSessionEntries(sessionFile: string): CLISessionEntry[] {
  if (!fs.existsSync(sessionFile)) {
    return [];
  }

  const content = fs.readFileSync(sessionFile, 'utf-8');
  if (!content.trim()) {
    return [];
  }

  const lines = content.trim().split('\n');
  const entries: CLISessionEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as CLISessionEntry;
      entries.push(entry);
    } catch (error) {
      console.error('[CLI Utils] Failed to parse entry:', error);
    }
  }

  return entries;
}

/**
 * Gets the UUID of the last entry in a session file
 * Returns null if file is empty or doesn't exist
 */
export function getLastEntryUuid(sessionFile: string): string | null {
  if (!fs.existsSync(sessionFile)) {
    return null;
  }

  const content = fs.readFileSync(sessionFile, 'utf-8');
  if (!content.trim()) {
    return null;
  }

  const lines = content.trim().split('\n');
  if (lines.length === 0) {
    return null;
  }

  try {
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    return lastEntry.uuid || null;
  } catch {
    return null;
  }
}

/**
 * Rebuilds the sessions index by scanning JSONL files
 * Useful for recovery if index is corrupted
 */
export function rebuildSessionsIndex(
  projectDir: string,
  projectPath: string
): void {
  console.log('[CLI Utils] Rebuilding sessions index for:', projectDir);

  const index: ProjectSessionsIndex = {
    version: 1,
    entries: [],
  };

  // Find all .jsonl files
  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const sessionFile = path.join(projectDir, file);
    const sessionId = path.basename(file, '.jsonl');

    try {
      const entries = readSessionEntries(sessionFile);
      if (entries.length === 0) continue;

      const stats = fs.statSync(sessionFile);
      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];

      // Extract first user message for summary
      const firstUserMessage = entries.find(
        e => e.type === 'user' && e.message
      );
      const firstPrompt = firstUserMessage?.message?.content?.[0]?.text || '';

      index.entries.push({
        sessionId,
        fullPath: sessionFile,
        fileMtime: stats.mtimeMs,
        firstPrompt: firstPrompt.slice(0, 200),
        summary: firstPrompt.slice(0, 50) + (firstPrompt.length > 50 ? '...' : ''),
        messageCount: entries.filter(e => e.type === 'user' || e.type === 'assistant').length,
        created: firstEntry.timestamp,
        modified: lastEntry.timestamp,
        gitBranch: firstEntry.gitBranch,
        projectPath,
        isSidechain: firstEntry.isSidechain,
      });
    } catch (error) {
      console.error(`[CLI Utils] Failed to process ${file}:`, error);
    }
  }

  // Sort by modified date (newest first)
  index.entries.sort((a, b) =>
    new Date(b.modified).getTime() - new Date(a.modified).getTime()
  );

  writeSessionsIndex(projectDir, index);
  console.log(`[CLI Utils] Rebuilt index with ${index.entries.length} sessions`);
}
