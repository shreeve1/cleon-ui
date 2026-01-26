// =============================================================================
// Session Manager - CLI Format Compatible
// =============================================================================
// Manages persistent storage for conversation sessions in CLI format
// Stores sessions in ~/.claude/projects/<encoded-project-path>/
// Compatible with Claude Code CLI session format (.jsonl)
// =============================================================================

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { SessionMetadata, SessionMessage } from './types.js';
import {
  encodeProjectPath,
  getCurrentGitBranch,
  convertWebUIMessageToCLIEntry,
  convertCLIEntryToWebUIMessage,
  readSessionsIndex,
  writeSessionsIndex,
  extractTextFromMessage,
  getLastEntryUuid,
  readSessionEntries,
  type CLISessionEntry,
  type ProjectSessionsIndex,
} from './cli-format-utils.js';

const PROJECTS_DIR = path.join(homedir(), '.claude', 'projects');
const WEBUI_SESSIONS_DIR = path.join(homedir(), '.claude', 'data', 'webui-sessions'); // Legacy location

export class SessionManager {
  constructor() {
    this.ensureDirectories();
  }

  // =============================================================================
  // Directory Setup
  // =============================================================================

  private ensureDirectories(): void {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
  }

  // =============================================================================
  // Session Creation
  // =============================================================================

  createSession(
    projectId: string,
    projectName: string,
    projectPath: string,
    userId?: string
  ): SessionMetadata {
    const sessionId = uuidv4();
    const encodedPath = encodeProjectPath(projectPath);
    const projectDir = path.join(PROJECTS_DIR, encodedPath);

    // Ensure project directory exists
    fs.mkdirSync(projectDir, { recursive: true });

    // Create empty session file
    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
    fs.writeFileSync(sessionFile, '');

    // Update or create sessions-index.json
    this.updateSessionsIndex(projectDir, projectPath, sessionId);

    const now = new Date().toISOString();
    const metadata: SessionMetadata = {
      id: sessionId,
      title: 'New conversation',
      projectId,
      projectName,
      createdAt: now,
      lastActivityAt: now,
      messageCount: 0,
      source: 'webui',
      userId,
    };

    console.log(`[SessionManager] Created session: ${sessionId} in ${projectDir}`);
    return metadata;
  }

  // =============================================================================
  // Message Persistence
  // =============================================================================

  appendMessage(sessionId: string, message: SessionMessage, projectPath: string): void {
    const encodedPath = encodeProjectPath(projectPath);
    const sessionFile = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get context for CLI format
    const gitBranch = getCurrentGitBranch(projectPath);
    const parentUuid = getLastEntryUuid(sessionFile);

    // Convert to CLI format
    const entry = convertWebUIMessageToCLIEntry(
      message,
      sessionId,
      parentUuid,
      projectPath,
      gitBranch
    );

    // Append as JSONL
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(sessionFile, line);

    // Update sessions-index.json
    const projectDir = path.join(PROJECTS_DIR, encodedPath);
    this.updateSessionsIndex(projectDir, projectPath, sessionId);

    console.log(`[SessionManager] Appended message to session: ${sessionId}`);
  }

  appendMessages(sessionId: string, messages: SessionMessage[], projectPath: string): void {
    const encodedPath = encodeProjectPath(projectPath);
    const sessionFile = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get context for CLI format
    const gitBranch = getCurrentGitBranch(projectPath);
    let parentUuid = getLastEntryUuid(sessionFile);

    // Convert each message to CLI format with proper threading
    const entries: CLISessionEntry[] = [];
    for (const message of messages) {
      const entry = convertWebUIMessageToCLIEntry(
        message,
        sessionId,
        parentUuid,
        projectPath,
        gitBranch
      );
      entries.push(entry);
      parentUuid = entry.uuid; // Next message links to this one
    }

    // Append all entries as JSONL
    const lines = entries.map(e => JSON.stringify(e) + '\n').join('');
    fs.appendFileSync(sessionFile, lines);

    // Update sessions-index.json
    const projectDir = path.join(PROJECTS_DIR, encodedPath);
    this.updateSessionsIndex(projectDir, projectPath, sessionId);

    console.log(`[SessionManager] Appended ${messages.length} messages to session: ${sessionId}`);
  }

  // =============================================================================
  // Session Loading
  // =============================================================================

  loadSession(sessionId: string, projectPath: string): SessionMessage[] {
    const encodedPath = encodeProjectPath(projectPath);
    const sessionFile = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      // Try legacy location with automatic migration
      return this.loadSessionWithFallback(sessionId, projectPath);
    }

    const entries = readSessionEntries(sessionFile);
    const messages: SessionMessage[] = [];

    for (const entry of entries) {
      const message = convertCLIEntryToWebUIMessage(entry);
      if (message) {
        messages.push(message);
      }
    }

    console.log(`[SessionManager] Loaded ${messages.length} messages from session: ${sessionId}`);
    return messages;
  }

  loadSessionMetadata(sessionId: string, projectPath?: string): SessionMetadata | null {
    if (projectPath) {
      // Search in specific project
      const encodedPath = encodeProjectPath(projectPath);
      const projectDir = path.join(PROJECTS_DIR, encodedPath);
      const index = readSessionsIndex(projectDir);
      const entry = index.entries.find(e => e.sessionId === sessionId);

      if (entry) {
        return this.convertIndexEntryToMetadata(entry);
      }
    } else {
      // Search across all projects
      const sessions = this.listSessions();
      return sessions.find(s => s.id === sessionId) || null;
    }

    return null;
  }

  // =============================================================================
  // Session Listing
  // =============================================================================

  listSessions(projectPath?: string, userId?: string, limit?: number): SessionMetadata[] {
    if (projectPath) {
      return this.listSessionsForProject(projectPath, limit);
    } else {
      return this.listSessionsAllProjects(limit);
    }
  }

  private listSessionsForProject(projectPath: string, limit?: number): SessionMetadata[] {
    const encodedPath = encodeProjectPath(projectPath);
    const projectDir = path.join(PROJECTS_DIR, encodedPath);

    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const index = readSessionsIndex(projectDir);
    const sessions = this.convertIndexEntriesToMetadata(index.entries);

    // Sort by last activity (newest first)
    sessions.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return limit ? sessions.slice(0, limit) : sessions;
  }

  private listSessionsAllProjects(limit?: number): SessionMetadata[] {
    const allSessions: SessionMetadata[] = [];

    if (!fs.existsSync(PROJECTS_DIR)) {
      return [];
    }

    const projectDirs = fs.readdirSync(PROJECTS_DIR);

    for (const dir of projectDirs) {
      const projectDir = path.join(PROJECTS_DIR, dir);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      const indexPath = path.join(projectDir, 'sessions-index.json');
      if (fs.existsSync(indexPath)) {
        const index = readSessionsIndex(projectDir);
        const sessions = this.convertIndexEntriesToMetadata(index.entries);
        allSessions.push(...sessions);
      }
    }

    // Sort by last activity (newest first)
    allSessions.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return limit ? allSessions.slice(0, limit) : allSessions;
  }

  // =============================================================================
  // Session Deletion
  // =============================================================================

  deleteSession(sessionId: string, projectPath: string): boolean {
    const encodedPath = encodeProjectPath(projectPath);
    const sessionFile = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      return false;
    }

    // Delete session file
    fs.unlinkSync(sessionFile);

    // Remove from sessions-index.json
    const projectDir = path.join(PROJECTS_DIR, encodedPath);
    const index = readSessionsIndex(projectDir);
    index.entries = index.entries.filter(e => e.sessionId !== sessionId);
    writeSessionsIndex(projectDir, index);

    console.log(`[SessionManager] Deleted session: ${sessionId}`);
    return true;
  }

  // =============================================================================
  // Session Title Update
  // =============================================================================

  updateSessionTitle(sessionId: string, title: string, projectPath: string): boolean {
    const encodedPath = encodeProjectPath(projectPath);
    const projectDir = path.join(PROJECTS_DIR, encodedPath);
    const index = readSessionsIndex(projectDir);

    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (!entry) {
      return false;
    }

    entry.summary = title;
    writeSessionsIndex(projectDir, index);

    console.log(`[SessionManager] Updated title for session: ${sessionId}`);
    return true;
  }

  // =============================================================================
  // Private: Helper Methods
  // =============================================================================

  private updateSessionsIndex(
    projectDir: string,
    projectPath: string,
    sessionId: string
  ): void {
    const index = readSessionsIndex(projectDir);
    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

    // Find or create entry
    let entry = index.entries.find(e => e.sessionId === sessionId);

    if (!entry) {
      // New session
      entry = {
        sessionId,
        fullPath: sessionFile,
        fileMtime: fs.statSync(sessionFile).mtimeMs,
        firstPrompt: '',
        summary: '',
        messageCount: 0,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        gitBranch: getCurrentGitBranch(projectPath),
        projectPath,
        isSidechain: false,
      };
      index.entries.push(entry);
    } else {
      // Update existing
      entry.modified = new Date().toISOString();
      entry.fileMtime = fs.statSync(sessionFile).mtimeMs;
    }

    // Update message count and first prompt
    const entries = readSessionEntries(sessionFile);
    const messageEntries = entries.filter(e => e.type === 'user' || e.type === 'assistant');
    entry.messageCount = messageEntries.length;

    if (messageEntries.length > 0 && !entry.firstPrompt) {
      const firstUserEntry = messageEntries.find(e => e.type === 'user' && e.message);
      if (firstUserEntry && firstUserEntry.message) {
        const webUIMessage = convertCLIEntryToWebUIMessage(firstUserEntry);
        if (webUIMessage) {
          const text = extractTextFromMessage(webUIMessage);
          entry.firstPrompt = text.slice(0, 200);
          entry.summary = text.slice(0, 50) + (text.length > 50 ? '...' : '');
        }
      }
    }

    writeSessionsIndex(projectDir, index);
  }

  private convertIndexEntriesToMetadata(entries: any[]): SessionMetadata[] {
    return entries.map(entry => this.convertIndexEntryToMetadata(entry));
  }

  private convertIndexEntryToMetadata(entry: any): SessionMetadata {
    return {
      id: entry.sessionId,
      title: entry.summary || 'New conversation',
      projectId: encodeProjectPath(entry.projectPath),
      projectName: path.basename(entry.projectPath),
      createdAt: entry.created,
      lastActivityAt: entry.modified,
      messageCount: entry.messageCount,
      source: 'cli' as const,
    };
  }

  // =============================================================================
  // Migration Support (Legacy WebUI Format)
  // =============================================================================

  private loadSessionWithFallback(sessionId: string, projectPath: string): SessionMessage[] {
    // Try legacy location
    const oldFile = path.join(WEBUI_SESSIONS_DIR, `${sessionId}.jsonl`);

    if (fs.existsSync(oldFile)) {
      console.log('[SessionManager] Found legacy session, migrating...');

      // Read old format
      const content = fs.readFileSync(oldFile, 'utf-8');
      if (!content.trim()) {
        return [];
      }

      const lines = content.trim().split('\n');
      const messages: SessionMessage[] = [];

      for (const line of lines) {
        try {
          const message = JSON.parse(line) as SessionMessage;
          messages.push(message);
        } catch (error) {
          console.error(`[SessionManager] Failed to parse legacy message:`, error);
        }
      }

      // Migrate to new format
      this.migrateLegacySession(sessionId, projectPath, messages);

      return messages;
    }

    throw new Error(`Session ${sessionId} not found`);
  }

  private migrateLegacySession(
    sessionId: string,
    projectPath: string,
    messages: SessionMessage[]
  ): void {
    const encodedPath = encodeProjectPath(projectPath);
    const projectDir = path.join(PROJECTS_DIR, encodedPath);
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
    const gitBranch = getCurrentGitBranch(projectPath);

    // Convert messages to CLI format with proper threading
    let parentUuid: string | null = null;
    const entries: CLISessionEntry[] = [];

    for (const message of messages) {
      const entry = convertWebUIMessageToCLIEntry(
        message,
        sessionId,
        parentUuid,
        projectPath,
        gitBranch
      );
      entries.push(entry);
      parentUuid = entry.uuid;
    }

    // Write to new format
    const lines = entries.map(e => JSON.stringify(e) + '\n').join('');
    fs.writeFileSync(sessionFile, lines);

    // Update sessions-index.json
    this.updateSessionsIndex(projectDir, projectPath, sessionId);

    console.log(`[SessionManager] Migrated legacy session ${sessionId} to CLI format`);
  }

  // =============================================================================
  // Session Stats
  // =============================================================================

  getSessionStats(): { totalSessions: number; totalMessages: number } {
    const sessions = this.listSessionsAllProjects();
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);

    return { totalSessions, totalMessages };
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
