// =============================================================================
// Project Manager - Discovers projects from CLI storage
// =============================================================================
// Scans ~/.claude/projects/ to discover all projects and their metadata
// =============================================================================

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { readSessionsIndex, decodeProjectPath } from './cli-format-utils.js';

const PROJECTS_DIR = path.join(homedir(), '.claude', 'projects');

export interface Project {
  id: string;           // Encoded project path (e.g., "-Users-james-project")
  name: string;         // Project name (basename of path)
  path: string;         // Absolute filesystem path
  sessionCount: number; // Number of sessions in this project
  createdAt: string;    // ISO timestamp of oldest session
  lastActivityAt: string; // ISO timestamp of most recent session activity
}

export class ProjectManager {
  /**
   * Lists all projects by scanning ~/.claude/projects/
   */
  listProjects(): Project[] {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return [];
    }

    const projects: Project[] = [];
    const projectDirs = fs.readdirSync(PROJECTS_DIR);

    for (const encodedPath of projectDirs) {
      const projectDir = path.join(PROJECTS_DIR, encodedPath);

      // Skip if not a directory
      if (!fs.statSync(projectDir).isDirectory()) {
        continue;
      }

      // Read sessions-index.json to get project metadata
      const indexPath = path.join(projectDir, 'sessions-index.json');
      if (!fs.existsSync(indexPath)) {
        // Project directory exists but has no sessions yet
        // Try to decode the path to get basic info
        try {
          const projectPath = decodeProjectPath(encodedPath);
          projects.push({
            id: encodedPath,
            name: path.basename(projectPath),
            path: projectPath,
            sessionCount: 0,
            createdAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
          });
        } catch (error) {
          console.warn(`[ProjectManager] Failed to decode path: ${encodedPath}`, error);
        }
        continue;
      }

      try {
        const index = readSessionsIndex(projectDir);

        if (index.entries.length === 0) {
          // Empty project - try to decode path
          try {
            const projectPath = decodeProjectPath(encodedPath);
            projects.push({
              id: encodedPath,
              name: path.basename(projectPath),
              path: projectPath,
              sessionCount: 0,
              createdAt: new Date().toISOString(),
              lastActivityAt: new Date().toISOString(),
            });
          } catch (error) {
            console.warn(`[ProjectManager] Failed to decode path: ${encodedPath}`, error);
          }
          continue;
        }

        // Use projectPath from first entry (all entries should have same projectPath)
        const firstEntry = index.entries[0];
        const projectPath = firstEntry.projectPath;

        // Calculate oldest and newest timestamps
        const timestamps = index.entries.map(e => new Date(e.created).getTime());
        const modifiedTimestamps = index.entries.map(e => new Date(e.modified).getTime());

        const createdAt = new Date(Math.min(...timestamps)).toISOString();
        const lastActivityAt = new Date(Math.max(...modifiedTimestamps)).toISOString();

        projects.push({
          id: encodedPath,
          name: path.basename(projectPath),
          path: projectPath,
          sessionCount: index.entries.length,
          createdAt,
          lastActivityAt,
        });
      } catch (error) {
        console.error(`[ProjectManager] Failed to read project ${encodedPath}:`, error);
      }
    }

    // Sort by last activity (most recent first)
    projects.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return projects;
  }

  /**
   * Gets a specific project by ID (encoded path)
   */
  getProject(projectId: string): Project | null {
    const projects = this.listProjects();
    return projects.find(p => p.id === projectId) || null;
  }

  /**
   * Gets a project by its absolute path
   */
  getProjectByPath(projectPath: string): Project | null {
    const projects = this.listProjects();
    return projects.find(p => p.path === projectPath) || null;
  }

  /**
   * Gets project statistics
   */
  getProjectStats(): { totalProjects: number; totalSessions: number } {
    const projects = this.listProjects();
    const totalProjects = projects.length;
    const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);

    return { totalProjects, totalSessions };
  }
}

// Singleton instance
export const projectManager = new ProjectManager();
