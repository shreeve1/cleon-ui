import { query } from '@anthropic-ai/claude-agent-sdk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// Constants
const DEFAULT_CONTEXT_WINDOW = 200000;
const TOOL_OUTPUT_TRUNCATE_LENGTH = 500;
const TOOL_SUMMARY_TRUNCATE_LENGTH = 100;

// Track active sessions for abort capability
const activeSessions = new Map();

// Track pending question responses - map of toolUseId -> { resolve, reject }
// Used by canUseTool callback to wait for user responses to AskUserQuestion
const pendingQuestionCallbacks = new Map();

/**
 * Process messages from a query stream
 * Used both for initial query and after question responses
 */
async function processQueryStream(queryInstance, ws, sessionInfo, onSessionId) {
  for await (const message of queryInstance) {
    // Capture session ID from first message
    if (message.session_id && onSessionId) {
      onSessionId(message.session_id);
    }

    // Transform and forward message
    const transformed = transformMessage(message);
    if (transformed) {
      sendMessage(ws, {
        type: 'claude-message',
        sessionId: message.session_id,
        data: transformed
      });
    }

    // Extract token usage from result
    if (message.type === 'result' && message.modelUsage) {
      const usage = extractTokenUsage(message.modelUsage);
      if (usage) {
        sendMessage(ws, {
          type: 'token-usage',
          sessionId: message.session_id,
          ...usage
        });
      }
    }
  }
}

/**
 * Handle incoming chat message from WebSocket
 */
export async function handleChat(msg, ws) {
  const { content, projectPath, sessionId, isNewSession, mode, attachments } = msg;

  const permissionModeMap = {
    'default': 'default',
    'plan': 'plan',
    'bypass': 'bypassPermissions'
  };
  const permissionMode = permissionModeMap[mode] || 'default';

  // Build prompt with attachments
  let prompt = content || '';
  let tempImagePaths = [];

  if (attachments && attachments.length > 0) {
    const textAttachments = [];

    for (const att of attachments) {
      if (att.type === 'image') {
        // Save image to temp file in project directory so Claude can read it
        try {
          const base64Data = att.data.replace(/^data:image\/\w+;base64,/, '');
          const ext = att.mediaType?.split('/')[1] || 'png';
          // Save in project directory for better access
          const tempDir = path.join(projectPath, '.claude-uploads');
          await fs.mkdir(tempDir, { recursive: true });
          const tempPath = path.join(tempDir, `upload-${randomUUID()}.${ext}`);
          await fs.writeFile(tempPath, Buffer.from(base64Data, 'base64'));
          tempImagePaths.push(tempPath);

          // Add instruction to read the image - use relative path from project
          const relativePath = path.relative(projectPath, tempPath);
          textAttachments.push(`\n\n[User attached an image: ${att.name}. Please use the Read tool to view the image at: ${relativePath}]`);
        } catch (err) {
          console.error('[Claude] Failed to save temp image:', err);
          textAttachments.push(`\n\n[User tried to attach an image: ${att.name}, but it failed to process]`);
        }
      } else {
        // Add text-based attachments to context
        textAttachments.push(`\n\n--- ${att.name} ---\n${att.data}`);
      }
    }

    if (textAttachments.length > 0) {
      prompt += textAttachments.join('');
    }
  }
  


  const options = {
    cwd: projectPath,
    permissionMode,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settingSources: ['project', 'user', 'local'],
    // Custom permission callback to intercept AskUserQuestion
    canUseTool: async (toolName, input, { toolUseID, signal }) => {
      // Intercept AskUserQuestion to wait for user input
      if (toolName === 'AskUserQuestion') {
        console.log(`[Claude] AskUserQuestion intercepted - toolUseId: ${toolUseID}`);

        // Send question to frontend
        sendMessage(ws, {
          type: 'claude-message',
          sessionId: currentSessionId,
          data: {
            type: 'question',
            id: toolUseID,
            questions: input.questions || []
          }
        });

        // Wait for user response
        try {
          const answers = await new Promise((resolve, reject) => {
            pendingQuestionCallbacks.set(toolUseID, { resolve, reject });

            // Handle abort signal
            signal.addEventListener('abort', () => {
              pendingQuestionCallbacks.delete(toolUseID);
              reject(new Error('Question cancelled'));
            });
          });

          console.log(`[Claude] Question answered - toolUseId: ${toolUseID}`);

          // Return allow with the answers included in updatedInput
          return {
            behavior: 'allow',
            updatedInput: {
              ...input,
              answers: answers
            }
          };
        } catch (err) {
          console.log(`[Claude] Question cancelled or error: ${err.message}`);
          return {
            behavior: 'deny',
            message: 'User cancelled the question'
          };
        }
      }

      // Allow all other tools
      return {
        behavior: 'allow',
        updatedInput: input
      };
    }
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
    console.log(`[Claude] Starting query - project: ${projectPath}, session: ${sessionId || 'NEW'}, resuming: ${!!(sessionId && !isNewSession)}`);
    if (tempImagePaths.length > 0) {
      console.log(`[Claude] Saved ${tempImagePaths.length} image(s) to temp files:`);
      tempImagePaths.forEach(p => console.log(`  - ${p}`));
    }
    console.log(`[Claude] Prompt length: ${prompt.length} chars`);

    queryInstance = query({
      prompt,
      options
    });

    const isResuming = sessionId && !isNewSession;
    if (isResuming) {
      await queryInstance.setPermissionMode(permissionMode);
    }

    // Create session info object
    const sessionInfo = {
      queryInstance,
      ws
    };

    // Track for abort
    if (currentSessionId) {
      activeSessions.set(currentSessionId, sessionInfo);
    }

    // Process streaming messages
    await processQueryStream(queryInstance, ws, sessionInfo, (sid) => {
      if (!currentSessionId) {
        currentSessionId = sid;
        activeSessions.set(currentSessionId, sessionInfo);
        sendMessage(ws, {
          type: 'session-created',
          sessionId: currentSessionId
        });
      }
    });

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

    // Clean up temp image files
    for (const tempPath of tempImagePaths) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Abort an active session
 */
export async function handleAbort(sessionId) {
  const sessionInfo = activeSessions.get(sessionId);

  if (!sessionInfo) {
    console.log(`[Claude] Abort: session ${sessionId} not found`);
    return false;
  }

  try {
    console.log(`[Claude] Aborting session: ${sessionId}`);

    if (typeof sessionInfo.queryInstance.interrupt === 'function') {
      await sessionInfo.queryInstance.interrupt();
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
 * Handle question response from frontend
 * Resolves the pending promise from the canUseTool callback
 */
export async function handleQuestionResponse(sessionId, toolUseId, answers) {
  console.log(`[Claude] Received question response for tool ${toolUseId}`);
  console.log(`[Claude] Answer payload:`, JSON.stringify(answers, null, 2));

  // Find and resolve the pending callback
  const callback = pendingQuestionCallbacks.get(toolUseId);
  if (!callback) {
    console.log(`[Claude] No pending callback found for toolUseId: ${toolUseId}`);
    return false;
  }

  // Remove from pending and resolve
  pendingQuestionCallbacks.delete(toolUseId);
  callback.resolve(answers);

  return true;
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
        // Skip AskUserQuestion - it's handled by canUseTool callback
        if (toolUse.name === 'AskUserQuestion') {
          return null;
        }

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
            TOOL_OUTPUT_TRUNCATE_LENGTH
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

// Tool summary formatters (data-driven approach)
const toolFormatters = {
  bash: (i) => `$ ${truncateOutput(i.command || i.cmd || '', TOOL_SUMMARY_TRUNCATE_LENGTH)}`,
  read: (i) => `Reading ${i.file_path || i.path || 'file'}`,
  write: (i) => `Writing ${i.file_path || i.path || 'file'}`,
  edit: (i) => `Editing ${i.file_path || i.path || 'file'}`,
  glob: (i) => `Finding ${i.pattern || 'files'}`,
  grep: (i) => `Searching: ${i.pattern || i.query || ''}`,
  todowrite: () => 'Updating todo list',
  todoread: () => 'Reading todo list',
  task: () => 'Delegating task'
};

function getToolSummary(tool, input) {
  if (!input) return tool;
  const formatter = toolFormatters[tool.toLowerCase()];
  return formatter ? formatter(input) : tool;
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
  const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || DEFAULT_CONTEXT_WINDOW;

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

// Log active sessions periodically for monitoring
setInterval(() => {
  if (activeSessions.size > 0) {
    console.log(`[Claude] Active sessions: ${activeSessions.size}`);
  }
}, 30 * 60 * 1000);
