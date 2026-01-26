#!/usr/bin/env tsx
// =============================================================================
// Session Migration Script
// =============================================================================
// Migrates old WebUI sessions from ~/.claude/data/webui-sessions/
// to new CLI format in ~/.claude/projects/
// =============================================================================

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// Import utilities from backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendSrc = path.join(__dirname, '../backend/src');

// Dynamically import CLI format utilities
const {
  encodeProjectPath,
  getCurrentGitBranch,
  convertWebUIMessageToCLIEntry,
  writeSessionsIndex,
  readSessionsIndex,
} = await import(path.join(backendSrc, 'cli-format-utils.js'));

const OLD_DIR = path.join(homedir(), '.claude', 'data', 'webui-sessions');
const NEW_DIR = path.join(homedir(), '.claude', 'projects');

interface OldIndexEntry {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  source: string;
  userId?: string;
}

interface OldIndex {
  sessions: OldIndexEntry[];
}

async function migrateSession(
  sessionId: string,
  projectPath: string
): Promise<boolean> {
  try {
    console.log(`\nMigrating session: ${sessionId}`);

    // Read old WebUI format
    const oldFile = path.join(OLD_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(oldFile)) {
      console.error(`  ❌ Session file not found: ${oldFile}`);
      return false;
    }

    const content = fs.readFileSync(oldFile, 'utf-8');
    if (!content.trim()) {
      console.log('  ⚠️  Empty session file, skipping');
      return false;
    }

    const lines = content.trim().split('\n');
    const messages: any[] = [];

    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        messages.push(message);
      } catch (error) {
        console.error(`  ⚠️  Failed to parse message line:`, error);
      }
    }

    console.log(`  📝 Found ${messages.length} messages`);

    // Convert to CLI format
    const encodedPath = encodeProjectPath(projectPath);
    const projectDir = path.join(NEW_DIR, encodedPath);
    fs.mkdirSync(projectDir, { recursive: true });

    const newFile = path.join(projectDir, `${sessionId}.jsonl`);
    const gitBranch = getCurrentGitBranch(projectPath);

    // Convert messages to CLI format with proper threading
    let parentUuid: string | null = null;
    const entries: any[] = [];

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

    // Write new format
    const newContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(newFile, newContent);

    console.log(`  ✅ Wrote ${entries.length} entries to: ${newFile}`);

    // Update sessions-index.json
    const index = readSessionsIndex(projectDir);

    // Check if already exists
    const existing = index.entries.find((e: any) => e.sessionId === sessionId);
    if (!existing) {
      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];

      // Extract first user message for summary
      const firstUserEntry = entries.find(
        e => e.type === 'user' && e.message
      );
      const firstPrompt = firstUserEntry?.message?.content?.[0]?.text || '';

      index.entries.push({
        sessionId,
        fullPath: newFile,
        fileMtime: fs.statSync(newFile).mtimeMs,
        firstPrompt: firstPrompt.slice(0, 200),
        summary: firstPrompt.slice(0, 50) + (firstPrompt.length > 50 ? '...' : ''),
        messageCount: entries.filter(e => e.type === 'user' || e.type === 'assistant').length,
        created: firstEntry.timestamp,
        modified: lastEntry.timestamp,
        gitBranch,
        projectPath,
        isSidechain: false,
      });

      writeSessionsIndex(projectDir, index);
      console.log(`  ✅ Updated sessions-index.json`);
    } else {
      console.log(`  ℹ️  Session already in index`);
    }

    return true;
  } catch (error) {
    console.error(`  ❌ Migration failed:`, error);
    return false;
  }
}

async function migrateAllSessions(projectPath: string): Promise<void> {
  console.log('='.repeat(70));
  console.log('WebUI Session Migration Tool');
  console.log('='.repeat(70));
  console.log(`\nProject path: ${projectPath}`);
  console.log(`Old sessions dir: ${OLD_DIR}`);
  console.log(`New sessions dir: ${NEW_DIR}`);

  // Check if old directory exists
  if (!fs.existsSync(OLD_DIR)) {
    console.log('\n✅ No old sessions directory found. Nothing to migrate.');
    return;
  }

  // Read old index
  const oldIndexPath = path.join(OLD_DIR, 'index.json');
  let oldIndex: OldIndex | null = null;

  if (fs.existsSync(oldIndexPath)) {
    try {
      const content = fs.readFileSync(oldIndexPath, 'utf-8');
      oldIndex = JSON.parse(content);
      console.log(`\n📂 Found ${oldIndex.sessions.length} sessions in old index`);
    } catch (error) {
      console.error('\n⚠️  Failed to read old index:', error);
    }
  }

  // Find all session files
  const sessionFiles = fs.readdirSync(OLD_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.basename(f, '.jsonl'));

  console.log(`📄 Found ${sessionFiles.length} session files`);

  if (sessionFiles.length === 0) {
    console.log('\n✅ No sessions to migrate');
    return;
  }

  // Migrate each session
  let successCount = 0;
  let failCount = 0;

  for (const sessionId of sessionFiles) {
    const success = await migrateSession(sessionId, projectPath);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('Migration Summary');
  console.log('='.repeat(70));
  console.log(`✅ Successfully migrated: ${successCount} sessions`);
  if (failCount > 0) {
    console.log(`❌ Failed to migrate: ${failCount} sessions`);
  }
  console.log('\n💡 Tip: Old sessions are preserved in ' + OLD_DIR);
  console.log('   You can delete them manually once you verify the migration.');
  console.log('='.repeat(70));
}

// CLI Usage
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npm run migrate-sessions <projectPath>');
  console.log('');
  console.log('Example:');
  console.log('  npm run migrate-sessions /Users/james/1-testytech/webui');
  console.log('');
  console.log('This will migrate all WebUI sessions from the old format');
  console.log('to the new CLI-compatible format in ~/.claude/projects/');
  process.exit(1);
}

const projectPath = path.resolve(args[0]);

if (!fs.existsSync(projectPath)) {
  console.error(`Error: Project path does not exist: ${projectPath}`);
  process.exit(1);
}

console.log('');
await migrateAllSessions(projectPath);
console.log('');
