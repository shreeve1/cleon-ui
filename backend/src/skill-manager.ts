// =============================================================================
// Skill Manager - Dynamic Skill Discovery
// =============================================================================
// Discovers skills from ~/.claude/skills/ and .claude/skills/
// Parses YAML frontmatter from SKILL.md files
// Watches for file system changes to refresh cache
// =============================================================================

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import matter from 'gray-matter';
import chokidar from 'chokidar';

// Skills directories
const PERSONAL_SKILLS_DIR = path.join(homedir(), '.claude', 'skills');
const PROJECT_SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');

export interface Skill {
  name: string;        // Skill name (from frontmatter or directory)
  keyword: string;     // Skill keyword (always directory name)
  description: string; // Description (from frontmatter or empty string)
  path: string;        // Absolute path to skill directory
}

export class SkillManager {
  private cachedSkills: Skill[] = [];
  private watcher: chokidar.FSWatcher | null = null;

  constructor() {
    // Initial load
    this.loadSkills();

    // Start file watching
    this.startWatching();
  }

  // =============================================================================
  // Skill Discovery
  // =============================================================================

  /**
   * Loads skills from personal and project directories
   * Merges: personal skills override project skills with same name
   */
  private loadSkills(): void {
    const personalSkills = this.discoverSkills(PERSONAL_SKILLS_DIR);
    const projectSkills = this.discoverSkills(PROJECT_SKILLS_DIR);

    // Merge: personal overwrites project
    const skillMap = new Map<string, Skill>();

    // Add project skills first
    for (const skill of projectSkills) {
      skillMap.set(skill.keyword, skill);
    }

    // Overwrite with personal skills
    for (const skill of personalSkills) {
      skillMap.set(skill.keyword, skill);
    }

    this.cachedSkills = Array.from(skillMap.values());
    console.log(`[SkillManager] Loaded ${this.cachedSkills.length} skills`);
  }

  /**
   * Discovers skills from a directory
   */
  private discoverSkills(skillsDir: string): Skill[] {
    if (!fs.existsSync(skillsDir)) {
      return [];
    }

    const skills: Skill[] = [];
    const skillDirs = fs.readdirSync(skillsDir);

    for (const dirName of skillDirs) {
      const skillDir = path.join(skillsDir, dirName);

      // Skip if not a directory
      if (!fs.statSync(skillDir).isDirectory()) {
        continue;
      }

      // Skip disabled directory
      if (dirName === 'disabled') {
        continue;
      }

      // Try to parse skill
      try {
        const skill = this.parseSkill(skillDir, dirName);
        if (skill) {
          skills.push(skill);
        }
      } catch (error) {
        console.warn(`[SkillManager] Failed to parse skill ${dirName}:`, error);
        // Continue to next skill
      }
    }

    return skills;
  }

  /**
   * Parses a skill from its directory
   */
  private parseSkill(skillDir: string, dirName: string): Skill | null {
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
      console.warn(`[SkillManager] No SKILL.md found in ${dirName}`);
      return null;
    }

    const content = fs.readFileSync(skillFile, 'utf-8');
    const { data: frontmatter } = matter(content);

    // Derive name from frontmatter or use directory name
    const name = frontmatter.name || dirName;

    // Description from frontmatter or empty string
    const description = frontmatter.description || '';

    // Keyword is always the directory name
    const keyword = dirName;

    return {
      name,
      keyword,
      description,
      path: skillDir,
    };
  }

  /**
   * Lists all cached skills
   */
  listSkills(): Skill[] {
    return this.cachedSkills;
  }

  // =============================================================================
  // File Watching
  // =============================================================================

  /**
   * Starts watching skills directories for changes
   */
  private startWatching(): void {
    const directoriesToWatch: string[] = [];

    if (fs.existsSync(PERSONAL_SKILLS_DIR)) {
      directoriesToWatch.push(PERSONAL_SKILLS_DIR);
    }
    if (fs.existsSync(PROJECT_SKILLS_DIR)) {
      directoriesToWatch.push(PROJECT_SKILLS_DIR);
    }

    if (directoriesToWatch.length === 0) {
      console.log('[SkillManager] No skills directories to watch');
      return;
    }

    console.log(`[SkillManager] Watching ${directoriesToWatch.length} skill directories`);

    this.watcher = chokidar.watch(directoriesToWatch, {
      ignored: /(^|[\/\\])\../, // Ignore hidden files
      ignoreInitial: false,
    });

    this.watcher.on('all', (event, filePath) => {
      console.log(`[SkillManager] File event: ${event} on ${filePath}`);

      // Reload skills on any change
      this.loadSkills();
    });

    this.watcher.on('error', (error) => {
      console.error('[SkillManager] Watcher error:', error);
    });
  }

  /**
   * Stops watching skills directories
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[SkillManager] Stopped watching skills directories');
    }
  }
}

// Singleton instance
export const skillManager = new SkillManager();
