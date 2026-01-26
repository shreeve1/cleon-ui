// =============================================================================
// ProjectSelector Component
// =============================================================================
// Dropdown selector for projects with mobile-friendly touch targets
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import type { Project } from '../types';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  isLoading?: boolean;
}

export function ProjectSelector({
  projects,
  selectedProject,
  onSelectProject,
  isLoading = false,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (project: Project) => {
    onSelectProject(project);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-sm
          bg-muted hover:bg-muted/80 active:bg-muted/60
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-150
          min-h-[44px] touch-manipulation
        `}
        aria-label="Select project"
        aria-expanded={isOpen}
      >
        {/* Project icon */}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>

        {/* Project name */}
        <span className="truncate max-w-[150px] font-medium">
          {isLoading ? 'Loading...' : selectedProject?.name || 'Select Project'}
        </span>

        {/* Chevron icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`h-4 w-4 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-[60vh] overflow-y-auto bg-background border border-border rounded-lg shadow-lg">
          {projects.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {isLoading ? 'Loading projects...' : 'No projects found'}
            </div>
          ) : (
            <ul role="listbox">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    onClick={() => handleSelect(project)}
                    className={`
                      w-full px-4 py-3 text-left text-sm
                      hover:bg-muted active:bg-muted/80
                      transition-colors duration-100
                      ${selectedProject?.id === project.id ? 'bg-muted/50 border-l-2 border-primary' : ''}
                    `}
                    role="option"
                    aria-selected={selectedProject?.id === project.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{project.name}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {project.path}
                        </div>
                      </div>
                      {project.branch && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {project.branch}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
