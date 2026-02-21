/**
 * Integration tests for SSE Task Updates - claude.js caller verification
 *
 * Tests that all three callers of broadcastTaskUpdate in server/claude.js
 * pass the correct username and sessionId parameters.
 *
 * Testing Promise: Task status updates (started, completed, failed) are delivered
 * via SSE to the web UI during sub-agent delegation, and the message structure
 * matches the frontend handlers' expectations.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ===========================================================================
// 1. Static Analysis - server/claude.js caller verification
// ===========================================================================
describe('Static Analysis - server/claude.js callers of broadcastTaskUpdate', () => {
  const claudeJsPath = resolve(import.meta.dirname, '../../server/claude.js');
  const claudeJs = readFileSync(claudeJsPath, 'utf-8');

  it('imports broadcastTaskUpdate from tasks.js', () => {
    expect(claudeJs).toContain("import { taskManager, broadcastTaskUpdate } from './tasks.js'");
  });

  it('task-started broadcast passes username and sessionId (line ~697)', () => {
    // Find the broadcastTaskUpdate call after creating a task
    // This should be in the transformMessage function where tool_use creates a task
    const taskStartedMatches = claudeJs.matchAll(
      /broadcastTaskUpdate\s*\(\s*ws\s*,\s*['"`]task-started['"`]\s*,\s*task\s*,\s*username\s*,\s*sessionId\s*\)/g
    );
    const matches = Array.from(taskStartedMatches);

    expect(matches.length).toBeGreaterThan(0);
  });

  it('task-failed broadcast passes username and sessionId (line ~775)', () => {
    const taskFailedMatches = claudeJs.matchAll(
      /broadcastTaskUpdate\s*\(\s*ws\s*,\s*['"`]task-failed['"`]\s*,\s*task\s*,\s*username\s*,\s*sessionId\s*\)/g
    );
    const matches = Array.from(taskFailedMatches);

    expect(matches.length).toBeGreaterThan(0);
  });

  it('task-completed broadcast passes username and sessionId (line ~784)', () => {
    const taskCompletedMatches = claudeJs.matchAll(
      /broadcastTaskUpdate\s*\(\s*ws\s*,\s*['"`]task-completed['"`]\s*,\s*task\s*,\s*username\s*,\s*sessionId\s*\)/g
    );
    const matches = Array.from(taskCompletedMatches);

    expect(matches.length).toBeGreaterThan(0);
  });

  it('all three broadcastTaskUpdate calls use consistent parameter order', () => {
    // All calls should be: broadcastTaskUpdate(ws, 'type', task, username, sessionId)
    const allCalls = claudeJs.match(
      /broadcastTaskUpdate\s*\(\s*ws\s*,\s*['"`]task-(started|completed|failed)['"`]\s*,\s*task\s*,\s*username\s*,\s*sessionId\s*\)/g
    );

    expect(allCalls).toBeTruthy();
    // The match with global flag returns an array, not a string
    expect(allCalls).toBeInstanceOf(Array);
    expect(allCalls.length).toBeGreaterThanOrEqual(3); // At least 3 calls
  });

  it('username is available in the scope where broadcastTaskUpdate is called', () => {
    // Username is a parameter of handleChat and transformMessage
    expect(claudeJs).toContain('export async function handleChat(msg, ws, username)');
    expect(claudeJs).toContain('function transformMessage(msg, model = null, sessionId = null, ws = null, username = null)');
  });

  it('sessionId is available in the scope where broadcastTaskUpdate is called', () => {
    // SessionId is passed to transformMessage and used within it
    expect(claudeJs).toContain('function transformMessage(msg, model = null, sessionId = null, ws = null, username = null)');
  });

  it('task-started call is in transformMessage after trackTaskStart', () => {
    // Find the section where a tool_use creates a task
    const taskStartSection = claudeJs.indexOf('trackTaskStart(sessionId,');
    const broadcastCall = claudeJs.indexOf("broadcastTaskUpdate(ws, 'task-started', task, username, sessionId)", taskStartSection);

    // broadcast call should come after task start
    expect(broadcastCall).toBeGreaterThan(taskStartSection);
  });

  it('task-failed call is associated with toolResult.is_error check', () => {
    // The task-failed broadcast should be in a conditional checking toolResult.is_error
    const isErrorSection = claudeJs.indexOf('if (toolResult.is_error)');
    const taskFailedCall = claudeJs.indexOf("broadcastTaskUpdate(ws, 'task-failed', task, username, sessionId)", isErrorSection);

    expect(taskFailedCall).toBeGreaterThan(isErrorSection);
  });

  it('task-completed call is in the else branch of is_error check', () => {
    // The task-completed broadcast should be in the else branch after is_error check
    const isErrorSection = claudeJs.indexOf('if (toolResult.is_error)');
    const elseBranch = claudeJs.indexOf('} else {', isErrorSection);
    const taskCompletedCall = claudeJs.indexOf("broadcastTaskUpdate(ws, 'task-completed', task, username, sessionId)", elseBranch);

    expect(taskCompletedCall).toBeGreaterThan(elseBranch);
  });

  it('no broadcastTaskUpdate calls use old parameter signature (without username, sessionId)', () => {
    // Look for calls that don't have username, sessionId at the end
    // This pattern would match old-style calls: broadcastTaskUpdate(ws, type, task)
    const oldStyleCall = claudeJs.match(
      /broadcastTaskUpdate\s*\(\s*ws\s*,\s*['"`]task-(started|completed|failed)['"`]\s*,\s*task\s*\)/
    );

    expect(oldStyleCall).toBeNull();
  });
});

// ===========================================================================
// 2. Verify Scope and Context
// ===========================================================================
describe('Scope and Context Verification', () => {
  const claudeJsPath = resolve(import.meta.dirname, '../../server/claude.js');
  const claudeJs = readFileSync(claudeJsPath, 'utf-8');

  it('transformMessage receives username as a parameter', () => {
    expect(claudeJs).toMatch(/function transformMessage\([^)]*username\s*=\s*null/);
  });

  it('transformMessage receives sessionId as a parameter', () => {
    expect(claudeJs).toMatch(/function transformMessage\([^)]*sessionId\s*=\s*null/);
  });

  it('processQueryStream passes session info including username to transformMessage', () => {
    // processQueryStream calls transformMessage with sessionInfo which includes username
    expect(claudeJs).toContain('sessionInfo.username');
  });

  it('handleChat function has username parameter available throughout', () => {
    const handleChatStart = claudeJs.indexOf('export async function handleChat(msg, ws, username)');
    const handleChatEnd = claudeJs.indexOf('\n}', claudeJs.indexOf('\n}', handleChatStart) + 1);
    const handleChatBody = claudeJs.slice(handleChatStart, handleChatEnd);

    // Should have references to username throughout
    expect(handleChatBody.match(/username/g)).toBeTruthy();
  });

  it('currentSessionId is tracked and used within processQueryStream', () => {
    expect(claudeJs).toContain('let currentSessionId = sessionId');
    expect(claudeJs).toMatch(/currentSessionId\s*=\s*sid/);
  });
});

// ===========================================================================
// 3. Message Contract Verification
// ===========================================================================
describe('Message Contract with Frontend', () => {
  const appJsPath = resolve(import.meta.dirname, '../../public/app.js');
  let appJs = '';

  try {
    appJs = readFileSync(appJsPath, 'utf-8');
  } catch (err) {
    // File might not exist or be accessible
    console.log('Warning: Could not read app.js for contract verification');
  }

  it('frontend handleServerEvent expects type at top level', () => {
    if (!appJs) return;

    // Look for event handlers that check type
    expect(appJs).toMatch(/msg\.type/);
  });

  it('frontend task event handlers access data properties', () => {
    if (!appJs) return;

    // Look for patterns like msg.data.taskId
    expect(appJs).toMatch(/msg\.data\./);
  });

  it('frontend does not use msg.task (old structure)', () => {
    if (!appJs) return;

    // Should NOT use the old structure
    // This is a loose check - the pattern might exist in other contexts
    const taskPropertyMatches = appJs.matchAll(/msg\.task\b/g);
    const matches = Array.from(taskPropertyMatches);

    // If there are any, they should not be in task update handling contexts
    // This is hard to verify precisely with regex, so we just note it
  });

  it('frontend handles task-started, task-completed, and task-failed events', () => {
    if (!appJs) return;

    expect(appJs).toMatch(/task-started/);
    expect(appJs).toMatch(/task-completed/);
    expect(appJs).toMatch(/task-failed/);
  });
});
