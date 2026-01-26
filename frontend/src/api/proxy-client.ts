// =============================================================================
// Claude Code Proxy API Client
// =============================================================================
// Connects to the proxy server to read Claude Code session files
// =============================================================================

import type {
  Project,
  Message,
  ConnectionState,
  Skill,
} from '../types';

// Dynamic API URL construction (mirrors pattern from claude-code.ts)
const getProxyAPIURL = (): string => {
  // Check environment variable override first
  if (import.meta.env.VITE_PROXY_API_URL) {
    return import.meta.env.VITE_PROXY_API_URL;
  }

  // Use current origin - works for localhost, IP addresses, and domain names
  // In production: Same origin as the page (e.g., http://10.20.20.54:5175)
  // In development: Vite dev server proxies /api to backend at port 5175
  const protocol = window.location.protocol; // 'http:' or 'https:'
  const hostname = window.location.hostname; // 'localhost' or '10.20.20.54'
  const port = window.location.port; // '5175' or '5173' (dev)

  // Construct URL: http://hostname:port/api
  return `${protocol}//${hostname}:${port}/api`;
};

const PROXY_API_URL = getProxyAPIURL();

// -----------------------------------------------------------------------------
// Projects API
// -----------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  try {
    const response = await fetch(`${PROXY_API_URL}/projects`);
    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }
    const data = await response.json();
    return data.projects || [];
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Messages API
// -----------------------------------------------------------------------------

export function parseMessages(messages: any[]): Message[] {
  return messages.map((msg: any) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
  }));
}

// -----------------------------------------------------------------------------
// Skills API
// -----------------------------------------------------------------------------

export async function fetchSkills(): Promise<Skill[]> {
  try {
    const response = await fetch(`${PROXY_API_URL}/skills`);
    if (!response.ok) {
      console.error('Failed to fetch skills:', response.status);
      return [];
    }
    const data = await response.json();
    return data.skills || [];
  } catch (error) {
    console.error('Error fetching skills:', error);
    return [];
  }
}

export function getSkills() {
  return fetchSkills();
}

// -----------------------------------------------------------------------------
// Health Check API
// -----------------------------------------------------------------------------

export async function fetchHealthStatus(): Promise<ConnectionState> {
  try {
    const response = await fetch(`${PROXY_API_URL}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    const data = await response.json();
    return {
      status: 'connected',
      model: 'claude-sonnet-4-20250514',
      workingDirectory: data.projectsDir?.replace(/^.*\.claude\/projects\/-/, '/').replace(/-/g, '/'),
      branch: 'main',
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export { fetchHealthStatus as getConnectionState };
