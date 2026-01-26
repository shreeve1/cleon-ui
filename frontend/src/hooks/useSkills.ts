// =============================================================================
// useSkills Hook (Real CLI Integration)
// =============================================================================
// Returns available skills from proxy or mock data
// =============================================================================

import { useState, useEffect } from 'react';
import { getSkills } from '../api/proxy-client';
import type { Skill } from '../types';

export interface UseSkillsReturn {
  skills: Skill[];
  isLoading: boolean;
  error: string | null;
  insertSkill: (skill: Skill, input: string) => string;
  getSkillByKeyword: (keyword: string) => Skill | undefined;
}

export function useSkills(): UseSkillsReturn {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const fetchedSkills = getSkills();
      setSkills(fetchedSkills);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load skills:', err);
      setError(err instanceof Error ? err.message : 'Failed to load skills');
      setIsLoading(false);
    }
  }, []);

  // Insert skill keyword into input
  const insertSkill = (skill: Skill, input: string): string => {
    const keyword = `/${skill.keyword}`;
    if (input.trim() === '') {
      return keyword + ' ';
    }
    // Check if skill is already at the start
    if (input.startsWith(keyword) || input.startsWith(`@${skill.keyword}`)) {
      return input;
    }
    return keyword + ' ' + input;
  };

  // Get skill by keyword
  const getSkillByKeyword = (keyword: string): Skill | undefined => {
    // Handle both /keyword and @keyword formats
    const cleanKeyword = keyword.replace(/^[/@]/, '');
    return skills.find(s => s.keyword === cleanKeyword);
  };

  return {
    skills,
    isLoading,
    error,
    insertSkill,
    getSkillByKeyword,
  };
}
