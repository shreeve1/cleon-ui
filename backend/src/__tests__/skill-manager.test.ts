import { describe, it, expect } from 'vitest';
import { skillManager } from '../skill-manager.js';

describe('SkillManager', () => {
  describe('Skill Discovery', () => {
    it('should load skills from ~/.claude/skills/', () => {
      const skills = skillManager.listSkills();

      expect(skills).toBeDefined();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
    });

    it('should include skills with frontmatter', () => {
      const skills = skillManager.listSkills();

      const interviewSkill = skills.find(s => s.keyword === 'interview');
      const issueTrackerSkill = skills.find(s => s.keyword === 'issue-tracker');

      expect(interviewSkill).toBeDefined();
      expect(interviewSkill?.name).toBe('interview');
      expect(interviewSkill?.description).toContain('Interview');

      expect(issueTrackerSkill).toBeDefined();
      expect(issueTrackerSkill?.name).toBe('issue-tracker');
      expect(issueTrackerSkill?.description).toContain('Track and manage issues');
    });

    it('should handle skills without frontmatter', () => {
      const skills = skillManager.listSkills();

      const ulwSkill = skills.find(s => s.keyword === 'ulw');

      expect(ulwSkill).toBeDefined();
      expect(ulwSkill?.name).toBe('ulw');
      expect(ulwSkill?.description).toBe('');
      expect(ulwSkill?.keyword).toBe('ulw');
    });
  });

  describe('Skill Structure', () => {
    it('should return skills with correct structure', () => {
      const skills = skillManager.listSkills();

      for (const skill of skills) {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('keyword');
        expect(skill).toHaveProperty('description');
        expect(skill).toHaveProperty('path');

        expect(typeof skill.name).toBe('string');
        expect(typeof skill.keyword).toBe('string');
        expect(typeof skill.description).toBe('string');
        expect(typeof skill.path).toBe('string');
      }
    });

    it('should have unique keywords', () => {
      const skills = skillManager.listSkills();

      const keywords = skills.map(s => s.keyword);
      const uniqueKeywords = [...new Set(keywords)];

      expect(keywords.length).toBe(uniqueKeywords.length);
    });
  });
});
