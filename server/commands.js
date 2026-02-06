import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Parse YAML frontmatter from a markdown file content
 * @param {string} content - The markdown file content
 * @returns {Object} Parsed frontmatter as an object
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      // Remove quotes if present
      frontmatter[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return frontmatter;
}

/**
 * Parse a command file and extract metadata
 * @param {string} filePath - Path to the markdown command file
 * @returns {Promise<Object|null>} Command object or null if parsing fails
 */
async function parseCommandFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const fileName = path.basename(filePath, '.md');

    return {
      name: `/${fileName}`,
      description: frontmatter.description || `Run ${fileName} command`,
      path: filePath
    };
  } catch (err) {
    console.warn(`[Commands] Failed to parse ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Discover all command files in a directory
 * @param {string} directory - Path to scan for .md files
 * @param {string} source - Source identifier ('global' or 'project')
 * @returns {Promise<Array>} Array of command objects
 */
async function discoverCommands(directory, source) {
  const commands = [];

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(directory, entry.name);
        const command = await parseCommandFile(filePath);

        if (command) {
          commands.push({
            ...command,
            source
          });
        }
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read - that's OK
    if (err.code !== 'ENOENT') {
      console.warn(`[Commands] Error reading ${directory}:`, err.message);
    }
  }

  return commands;
}

/**
 * Get global commands from ~/.claude/commands/
 * @returns {Promise<Array>} Array of global command objects
 */
export async function getGlobalCommands() {
  const globalDir = path.join(os.homedir(), '.claude', 'commands');
  return discoverCommands(globalDir, 'global');
}

/**
 * Get project-specific commands from <projectPath>/.claude/commands/
 * @param {string} projectPath - The project's filesystem path
 * @returns {Promise<Array>} Array of project command objects
 */
export async function getProjectCommands(projectPath) {
  if (!projectPath) return [];

  const projectDir = path.join(projectPath, '.claude', 'commands');
  return discoverCommands(projectDir, 'project');
}

/**
 * Get all commands merged (global + project, with project taking precedence)
 * @param {string} projectPath - Optional project path
 * @returns {Promise<Array>} Merged array of commands
 */
export async function getAllCommands(projectPath) {
  const [globalCommands, projectCommands] = await Promise.all([
    getGlobalCommands(),
    getProjectCommands(projectPath)
  ]);

  // Create a map with global commands first, then overlay project commands
  const commandMap = new Map();

  for (const cmd of globalCommands) {
    commandMap.set(cmd.name, cmd);
  }

  // Project commands override global commands with the same name
  for (const cmd of projectCommands) {
    commandMap.set(cmd.name, cmd);
  }

  // Convert back to array and sort by name
  return Array.from(commandMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
