// =============================================================================
// StatusBar Component
// =============================================================================
// Displays connection status, working directory, and model info
// Mobile-optimized with compact layout
// =============================================================================

import type { ConnectionState, Project } from '../types';

interface StatusBarProps {
  connectionState: ConnectionState;
  project?: Project | null;
}

export function StatusBar({ connectionState, project }: StatusBarProps) {
  const { status, error, model, workingDirectory, branch } = connectionState;

  const getStatusIndicator = () => {
    switch (status) {
      case 'connected':
        return <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>;
      case 'connecting':
        return <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>;
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-destructive"></span>;
      default:
        return <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return error || 'Connection error';
      default:
        return 'Disconnected';
    }
  };

  // Format working directory for display
  const formatWorkingDir = (dir: string) => {
    if (!dir) return '';
    // Replace home directory with ~
    return dir.replace(/^\/Users\/[^\/]+/, '~');
  };

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-2">
      <div className="flex items-center justify-between gap-2 text-xs max-w-3xl mx-auto">
        {/* Left side: Connection status */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {getStatusIndicator()}
            <span className={status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
              {getStatusText()}
            </span>
          </div>
        </div>

        {/* Right side: Working directory, branch, model */}
        <div className="flex items-center gap-3 min-w-0 justify-end">
          {/* Working directory */}
          {workingDirectory && (
            <span className="text-muted-foreground font-mono truncate max-w-[120px]" title={workingDirectory}>
              {formatWorkingDir(workingDirectory)}
            </span>
          )}

          {/* Branch */}
          {(branch || project?.branch) && (
            <span className="text-muted-foreground truncate max-w-[80px]" title={branch || project?.branch}>
              {(branch || project?.branch)?.replace(/^refs\/heads\//, '')}
            </span>
          )}

          {/* Model */}
          {model && (
            <span className="text-muted-foreground truncate max-w-[100px]" title={model}>
              {model.replace(/^claude-/, '')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
