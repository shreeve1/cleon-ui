// =============================================================================
// useProjects Hook (Real CLI Integration)
// =============================================================================
// Fetches projects from the proxy server which reads ~/.claude/projects/
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { fetchProjects } from '../api/proxy-client';
import type { Project } from '../types';

export interface UseProjectsReturn {
  projects: Project[];
  selectedProject: Project | null;
  isLoading: boolean;
  error: string | null;
  selectProject: (project: Project | null) => void;
  refreshProjects: () => void;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        setIsLoading(true);
        const fetchedProjects = await fetchProjects();

        if (cancelled) return;

        // Convert project data to our format
        const formattedProjects = fetchedProjects.map((p: any) => ({
          id: p.id,
          name: p.name,
          path: p.path,
          branch: p.gitBranch || 'main',
          createdAt: p.createdAt || new Date(),
          lastActivityAt: p.lastActivity || new Date(),
          sessionCount: p.sessions?.length || 0,
        }));

        setProjects(formattedProjects);

        // Auto-select first project (prefer current directory)
        const currentProject = formattedProjects.find((p: any) =>
          p.path.includes('webui') || p.name === 'webui'
        ) || formattedProjects[0] || null;

        setSelectedProject(currentProject);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load projects:', err);
          setError(err instanceof Error ? err.message : 'Failed to load projects');

          // Use mock data as fallback
          setProjects([{
            id: 'webui-mock',
            name: 'webui',
            path: '/Users/james/1-testytech/webui',
            branch: 'main',
            createdAt: new Date(),
            lastActivityAt: new Date(),
            sessionCount: 1,
          }]);
          setSelectedProject({
            id: 'webui-mock',
            name: 'webui',
            path: '/Users/james/1-testytech/webui',
            branch: 'main',
            createdAt: new Date(),
            lastActivityAt: new Date(),
            sessionCount: 1,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  // Select a project
  const selectProject = useCallback((project: Project | null) => {
    setSelectedProject(project);
    // Future: Send project switch command to CLI
  }, []);

  // Refresh projects list
  const refreshProjects = useCallback(() => {
    // Trigger re-mount by incrementing a counter or similar
    window.location.reload();
  }, []);

  return {
    projects,
    selectedProject,
    isLoading,
    error,
    selectProject,
    refreshProjects,
  };
}
