import { query } from '@anthropic-ai/claude-agent-sdk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Track active sessions for abort capability
const activeSessions = new Map();

/**
 * Handle incoming chat message from WebSocket
 */
export async function handleChat(msg, ws) {
  const { content, projectPath, sessionId, isNewSession } = msg;

  // Build SDK options
  const options = {
    cwd: projectPath,
    permissionMode: 'bypassPermissions',
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settingSources: ['project', 'user', 'local']
  };

  // Resume existing session (unless explicitly new)
  if (sessionId && !isNewSession) {
    options.resume = sessionId;
  }

  // Load MCP servers from ~/.claude.json
  const mcpServers = await loadMcpConfig(projectPath);
  if (mcpServers) {
    options.mcpServers = mcpServers;
  }

  let currentSessionId = sessionId;
  let queryInstance = null;

  try {
    console.log(`[Claude] Starting query - project: ${projectPath}, session: ${sessionId || 'NEW'}`);

    // Create SDK query - returns async generator
    queryInstance = query({
      prompt: content,
      options
    });

    // Track for abort
    if (currentSessionId) {
      activeSessions.set(currentSessionId, queryInstance);
    }

    // Process streaming messages
    for await (const message of queryInstance) {
      // Capture session ID from first message
      if (message.session_id && !currentSessionId) {
        currentSessionId = message.session_id;
        activeSessions.set(currentSessionId, queryInstance);

        sendMessage(ws, {
          type: 'session-created',
          sessionId: currentSessionId
        });
      }

      // Transform and forward message
      const transformed = transformMessage(message);
      if (transformed) {
        sendMessage(ws, {
          type: 'claude-message',
          sessionId: currentSessionId,
          data: transformed
        });
      }

      // Extract token usage from result
      if (message.type === 'result' && message.modelUsage) {
        const usage = extractTokenUsage(message.modelUsage);
        if (usage) {
          sendMessage(ws, {
            type: 'token-usage',
            sessionId: currentSessionId,
            ...usage
          });
        }
      }
    }

    // Stream complete
    console.log(`[Claude] Query complete - session: ${currentSessionId}`);
    sendMessage(ws, {
      type: 'claude-done',
      sessionId: currentSessionId
    });

  } catch (err) {
    console.error('[Claude] Query error:', err);
    sendMessage(ws, {
      type: 'error',
      message: err.message || 'Query failed'
    });
  } finally {
    if (currentSessionId) {
      activeSessions.delete(currentSessionId);
    }
  }
}

/**
 * Abort an active session
 */
export async function handleAbort(sessionId) {
  const queryInstance = activeSessions.get(sessionId);
  
  if (!queryInstance) {
    console.log(`[Claude] Abort: session ${sessionId} not found`);
    return false;
  }

  try {
    console.log(`[Claude] Aborting session: ${sessionId}`);
    
    if (typeof queryInstance.interrupt === 'function') {
      await queryInstance.interrupt();
    }
    
    activeSessions.delete(sessionId);
    return true;

  } catch (err) {
    console.error(`[Claude] Abort error for ${sessionId}:`, err);
    activeSessions.delete(sessionId);
    return false;
  }
}

/**
 * Check if session is active
 */
export function isSessionActive(sessionId) {
  return activeSessions.has(sessionId);
}

/**
 * Send message to WebSocket (handles stringify + error checking)
 */
function sendMessage(ws, data) {
  if (ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(data));
  }
}

/**
 * Transform SDK message for frontend display
 * Simplifies tool outputs to show minimal relevant info
 */
function transformMessage(msg) {
  if (!msg || !msg.type) return null;

  // Text content from assistant
  if (msg.type === 'assistant' && msg.message?.content) {
    const content = msg.message.content;
    
    // Extract text blocks
    if (Array.isArray(content)) {
      const texts = content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
      
      if (texts) {
        return { type: 'text', content: texts };
      }
      
      // Check for tool use blocks
      const toolUse = content.find(c => c.type === 'tool_use');
      if (toolUse) {
        return {
          type: 'tool_use',
          tool: toolUse.name,
          id: toolUse.id,
          summary: getToolSummary(toolUse.name, toolUse.input)
        };
      }
    }
    
    if (typeof content === 'string') {
      return { type: 'text', content };
    }
  }

  // User message echo (for context)
  if (msg.type === 'user') {
    return null; // Don't echo back, frontend already shows it
  }

  // Tool result
  if (msg.type === 'user' && msg.message?.content) {
    const content = msg.message.content;
    if (Array.isArray(content)) {
      const toolResult = content.find(c => c.type === 'tool_result');
      if (toolResult) {
        return {
          type: 'tool_result',
          id: toolResult.tool_use_id,
          success: !toolResult.is_error,
          output: truncateOutput(
            typeof toolResult.content === 'string' 
              ? toolResult.content 
              : JSON.stringify(toolResult.content),
            500
          )
        };
      }
    }
  }

  // Result message (end of turn)
  if (msg.type === 'result') {
    return null; // Handled separately for token usage
  }

  return null;
}

/**
 * Generate human-readable tool summary
 */
function getToolSummary(tool, input) {
  if (!input) return tool;

  switch (tool) {
    case 'Bash':
    case 'bash':
      return `$ ${truncateOutput(input.command || input.cmd || '', 100)}`;
    
    case 'Read':
    case 'read':
      return `Reading ${input.file_path || input.path || 'file'}`;
    
    case 'Write':
    case 'write':
      return `Writing ${input.file_path || input.path || 'file'}`;
    
    case 'Edit':
    case 'edit':
      return `Editing ${input.file_path || input.path || 'file'}`;
    
    case 'Glob':
    case 'glob':
      return `Finding ${input.pattern || 'files'}`;
    
    case 'Grep':
    case 'grep':
      return `Searching: ${input.pattern || input.query || ''}`;
    
    case 'TodoWrite':
      return 'Updating todo list';
    
    case 'TodoRead':
      return 'Reading todo list';
    
    case 'Task':
      return `Delegating task`;
    
    default:
      return tool;
  }
}

/**
 * Truncate long output for display
 */
function truncateOutput(content, maxLength) {
  if (typeof content !== 'string') return String(content);
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + `\n... (${content.length - maxLength} more chars)`;
}

/**
 * Extract token usage from SDK modelUsage
 */
function extractTokenUsage(modelUsage) {
  if (!modelUsage) return null;

  const modelKey = Object.keys(modelUsage)[0];
  const data = modelUsage[modelKey];
  
  if (!data) return null;

  const input = data.cumulativeInputTokens || data.inputTokens || 0;
  const output = data.cumulativeOutputTokens || data.outputTokens || 0;
  const cacheRead = data.cumulativeCacheReadInputTokens || data.cacheReadInputTokens || 0;
  const cacheCreate = data.cumulativeCacheCreationInputTokens || data.cacheCreationInputTokens || 0;

  const used = input + output + cacheRead + cacheCreate;
  const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || 200000;

  return { used, contextWindow };
}

/**
 * Load MCP server config from ~/.claude.json
 */
async function loadMcpConfig(projectPath) {
  try {
    const configPath = path.join(os.homedir(), '.claude.json');
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);

    let mcpServers = {};

    // Global MCP servers
    if (config.mcpServers) {
      mcpServers = { ...config.mcpServers };
    }

    // Project-specific MCP servers
    if (config.claudeProjects && projectPath) {
      const projectConfig = config.claudeProjects[projectPath];
      if (projectConfig?.mcpServers) {
        mcpServers = { ...mcpServers, ...projectConfig.mcpServers };
      }
    }

    return Object.keys(mcpServers).length > 0 ? mcpServers : null;

  } catch {
    return null;
  }
}

// Cleanup stale sessions periodically (every 30 min)
setInterval(() => {
  const staleTime = 2 * 60 * 60 * 1000; // 2 hours
  const now = Date.now();
  
  for (const [sessionId, instance] of activeSessions.entries()) {
    // Can't easily track start time, just log count
  }
  
  if (activeSessions.size > 0) {
    console.log(`[Claude] Active sessions: ${activeSessions.size}`);
  }
}, 30 * 60 * 1000);
