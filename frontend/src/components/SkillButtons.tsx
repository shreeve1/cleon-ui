// =============================================================================
// SkillButtons Component
// =============================================================================
// Horizontally scrollable row of skill buttons
// Tapping inserts skill keyword into input
// =============================================================================

import type { Skill } from '../types';

interface SkillButtonsProps {
  skills: Skill[];
  onSkillClick: (skill: Skill) => void;
  disabled?: boolean;
}

export function SkillButtons({ skills, onSkillClick, disabled = false }: SkillButtonsProps) {
  return (
    <div className="border-t border-border bg-background">
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        <span className="text-xs text-muted-foreground whitespace-nowrap mr-1">
          Skills:
        </span>
        {skills.length === 0 ? (
          <span className="text-xs text-muted-foreground">No skills available</span>
        ) : (
          skills.map((skill) => (
            <button
              key={skill.keyword}
              onClick={() => onSkillClick(skill)}
              disabled={disabled}
              className={`
                flex-shrink-0 px-3 py-1.5 text-sm rounded-full
                bg-secondary text-secondary-foreground
                hover:bg-secondary/80 active:bg-secondary/60
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
                min-w-[80px] touch-manipulation
                ${disabled ? '' : 'active:scale-95'}
              `}
              style={{
                minWidth: '44px',
                minHeight: '44px',
              }}
              title={skill.description}
            >
              @{skill.keyword}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
