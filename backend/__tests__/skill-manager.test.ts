import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SkillManager } from '../src/skill-manager';

const TEST_TEMP_DIR = path.join(process.cwd(), '.test-skills');
const PERSONAL_TEST_DIR = path.join(TEST_TEMP_DIR, 'personal');
const PROJECT_TEST_DIR = path.join(TEST_TEMP_DIR, 'project');

function createTestSkill(
  baseDir: string,
  skillName: string,
  frontmatter: Record<string, string> = {},
  content: string = 'Test skill content'
): string {
  const skillDir = path.join(baseDir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });

  let frontmatterStr = '';
  if (Object.keys(frontmatter).length > 0) {
    frontmatterStr = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
      frontmatterStr += `${key}: ${value}\n`;
    }
    frontmatterStr += '---\n';
  }

  const skillFile = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillFile, `${frontmatterStr}${content}`);

  return skillDir;
}

function createDisabledDir(baseDir: string): string {
  const disabledDir = path.join(baseDir, 'disabled');
  fs.mkdirSync(disabledDir, { recursive: true });
  return disabledDir;
}

function cleanupTestDirs(): void {
  if (fs.existsSync(TEST_TEMP_DIR)) {
    fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
  }
}

describe('SkillManager', () => {
  beforeEach(() => {
    cleanupTestDirs();
    fs.mkdirSync(PERSONAL_TEST_DIR, { recursive: true });
    fs.mkdirSync(PROJECT_TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupTestDirs();
  });

  describe('Personal Skills Discovery', () => {
    it('should discover skills from personal directory', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'skill-one', {
        name: 'Skill One',
        description: 'First test skill',
      });
      createTestSkill(PERSONAL_TEST_DIR, 'skill-two', {
        name: 'Skill Two',
        description: 'Second test skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(2);
      expect(skills.some((s) => s.keyword === 'skill-one')).toBe(true);
      expect(skills.some((s) => s.keyword === 'skill-two')).toBe(true);

      manager.stopWatching();
    });

    it('should return empty array when personal directory does not exist', () => {
      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(0);

      manager.stopWatching();
    });
  });

  describe('Project Skills Discovery', () => {
    it('should discover skills from project directory', () => {
      createTestSkill(PROJECT_TEST_DIR, 'project-skill', {
        name: 'Project Skill',
        description: 'A project-level skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(1);
      expect(skills[0].keyword).toBe('project-skill');

      manager.stopWatching();
    });
  });

  describe('YAML Frontmatter Parsing', () => {
    it('should parse skill with complete frontmatter', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'complete-skill', {
        name: 'Complete Skill',
        description: 'A skill with full frontmatter',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'complete-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Complete Skill');
      expect(skill?.description).toBe('A skill with full frontmatter');
      expect(skill?.keyword).toBe('complete-skill');

      manager.stopWatching();
    });

    it('should parse skill with multiline description in frontmatter', () => {
      const skillDir = path.join(PERSONAL_TEST_DIR, 'multiline-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const skillFile = path.join(skillDir, 'SKILL.md');
      const content = `---
name: Multiline Skill
description: |
  This is a multiline
  description that spans
  multiple lines
---
Skill content here`;

      fs.writeFileSync(skillFile, content);

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'multiline-skill');
      expect(skill).toBeDefined();
      expect(skill?.description).toContain('multiline');

      manager.stopWatching();
    });
  });

  describe('Missing Frontmatter Handling', () => {
    it('should use directory name when frontmatter.name is missing', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'no-name-skill', {
        description: 'Skill without name in frontmatter',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'no-name-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('no-name-skill');
      expect(skill?.keyword).toBe('no-name-skill');

      manager.stopWatching();
    });

    it('should use empty string when frontmatter.description is missing', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'no-desc-skill', {
        name: 'No Description Skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'no-desc-skill');
      expect(skill).toBeDefined();
      expect(skill?.description).toBe('');

      manager.stopWatching();
    });

    it('should use directory name as keyword regardless of frontmatter', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'my-skill', {
        name: 'Different Name',
        description: 'Test',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'my-skill');
      expect(skill).toBeDefined();
      expect(skill?.keyword).toBe('my-skill');
      expect(skill?.name).toBe('Different Name');

      manager.stopWatching();
    });

    it('should handle skill with no frontmatter at all', () => {
      const skillDir = path.join(PERSONAL_TEST_DIR, 'plain-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const skillFile = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillFile, 'Just plain content, no frontmatter');

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'plain-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('plain-skill');
      expect(skill?.description).toBe('');
      expect(skill?.keyword).toBe('plain-skill');

      manager.stopWatching();
    });
  });

  describe('Disabled Directory Exclusion', () => {
    it('should skip skills in disabled/ subdirectory', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'enabled-skill', {
        name: 'Enabled Skill',
      });

      const disabledDir = createDisabledDir(PERSONAL_TEST_DIR);
      createTestSkill(disabledDir, 'disabled-skill', {
        name: 'Disabled Skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const enabledSkill = skills.find((s) => s.keyword === 'enabled-skill');
      const disabledSkill = skills.find((s) => s.keyword === 'disabled-skill');

      expect(enabledSkill).toBeDefined();
      expect(enabledSkill?.name).toBe('Enabled Skill');
      expect(disabledSkill).toBeUndefined();

      manager.stopWatching();
    });

    it('should not load any skills if only disabled/ exists', () => {
      createDisabledDir(PERSONAL_TEST_DIR);
      createTestSkill(
        path.join(PERSONAL_TEST_DIR, 'disabled'),
        'only-disabled',
        { name: 'Only Disabled' }
      );

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const disabledSkill = skills.find((s) => s.keyword === 'only-disabled');
      expect(disabledSkill).toBeUndefined();
      expect(skills.length).toBe(0);

      manager.stopWatching();
    });
  });

  describe('Malformed Frontmatter Handling', () => {
    it('should skip skill with invalid YAML frontmatter and log warning', () => {
      const skillDir = path.join(PERSONAL_TEST_DIR, 'bad-yaml-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const skillFile = path.join(skillDir, 'SKILL.md');
      const content = `---
name: Bad YAML Skill
description: This has invalid: : : yaml
invalid syntax here
---
Content`;

      fs.writeFileSync(skillFile, content);

      createTestSkill(PERSONAL_TEST_DIR, 'good-skill', {
        name: 'Good Skill',
      });

      const warnSpy = vi.spyOn(console, 'warn');

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const goodSkill = skills.find((s) => s.keyword === 'good-skill');
      expect(goodSkill).toBeDefined();

      manager.stopWatching();
      vi.restoreAllMocks();
    });

    it('should handle skill directory without SKILL.md file', () => {
      const skillDir = path.join(PERSONAL_TEST_DIR, 'no-skill-md');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'README.md'), 'Just a readme');

      createTestSkill(PERSONAL_TEST_DIR, 'valid-skill', {
        name: 'Valid Skill',
      });

      const warnSpy = vi.spyOn(console, 'warn');

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const validSkill = skills.find((s) => s.keyword === 'valid-skill');
      expect(validSkill).toBeDefined();

      manager.stopWatching();
      vi.restoreAllMocks();
    });
  });

  describe('Empty Skills Directory', () => {
    it('should return empty array when skills directory is empty', () => {
      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(0);

      manager.stopWatching();
    });

    it('should return empty array when both directories are empty', () => {
      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(0);

      manager.stopWatching();
    });
  });

  describe('Skill Merging', () => {
    it('should merge skills from both directories', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'personal-only', {
        name: 'Personal Only',
      });
      createTestSkill(PROJECT_TEST_DIR, 'project-only', {
        name: 'Project Only',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(2);
      expect(skills.some((s) => s.keyword === 'personal-only')).toBe(true);
      expect(skills.some((s) => s.keyword === 'project-only')).toBe(true);

      manager.stopWatching();
    });

    it('should allow personal skill to override project skill with same keyword', () => {
      createTestSkill(PROJECT_TEST_DIR, 'shared-skill', {
        name: 'Project Version',
        description: 'Project description',
      });

      createTestSkill(PERSONAL_TEST_DIR, 'shared-skill', {
        name: 'Personal Version',
        description: 'Personal description',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(skills.length).toBe(1);
      const skill = skills[0];
      expect(skill.keyword).toBe('shared-skill');
      expect(skill.name).toBe('Personal Version');
      expect(skill.description).toBe('Personal description');

      manager.stopWatching();
    });

    it('should preserve project skill when personal version does not exist', () => {
      createTestSkill(PROJECT_TEST_DIR, 'project-skill', {
        name: 'Project Skill',
        description: 'Only in project',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(skills.length).toBe(1);
      expect(skills[0].keyword).toBe('project-skill');
      expect(skills[0].name).toBe('Project Skill');

      manager.stopWatching();
    });
  });

  describe('File Watcher', () => {
    it('should initialize watcher when directories exist', () => {
      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      expect(manager).toBeDefined();

      manager.stopWatching();
    });

    it('should handle stopWatching gracefully', () => {
      const logSpy = vi.spyOn(console, 'log');

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      manager.stopWatching();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stopped watching')
      );

      vi.restoreAllMocks();
    });

    it('should not crash when no directories exist', () => {
      const logSpy = vi.spyOn(console, 'log');

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(Array.isArray(skills)).toBe(true);

      manager.stopWatching();
      vi.restoreAllMocks();
    });
  });

  describe('Skill Interface Validation', () => {
    it('should return skills with all required fields', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'complete-skill', {
        name: 'Complete Skill',
        description: 'A complete skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'complete-skill');
      expect(skill).toBeDefined();
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('keyword');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('path');

      expect(typeof skill?.name).toBe('string');
      expect(typeof skill?.keyword).toBe('string');
      expect(typeof skill?.description).toBe('string');
      expect(typeof skill?.path).toBe('string');

      manager.stopWatching();
    });

    it('should set path to skill directory', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'path-test-skill', {
        name: 'Path Test',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'path-test-skill');
      expect(skill).toBeDefined();
      expect(skill?.path).toContain('path-test-skill');

      manager.stopWatching();
    });
  });

  describe('Non-Directory Entries', () => {
    it('should skip non-directory entries in skills directory', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'valid-skill', {
        name: 'Valid Skill',
      });

      fs.writeFileSync(path.join(PERSONAL_TEST_DIR, 'README.md'), '# Skills');

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      expect(skills.length).toBe(1);
      expect(skills[0].keyword).toBe('valid-skill');

      manager.stopWatching();
    });
  });

  describe('Skill Caching', () => {
    it('should cache skills and return same array on multiple calls', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'cached-skill', {
        name: 'Cached Skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills1 = manager.listSkills();
      const skills2 = manager.listSkills();

      expect(skills1).toBe(skills2);

      manager.stopWatching();
    });
  });

  describe('Skill Path Validation', () => {
    it('should set absolute path for each skill', () => {
      createTestSkill(PERSONAL_TEST_DIR, 'path-skill', {
        name: 'Path Skill',
      });

      const manager = new SkillManager(PERSONAL_TEST_DIR, PROJECT_TEST_DIR);
      const skills = manager.listSkills();

      const skill = skills.find((s) => s.keyword === 'path-skill');
      expect(skill).toBeDefined();
      expect(path.isAbsolute(skill?.path || '')).toBe(true);

      manager.stopWatching();
    });
  });
});
