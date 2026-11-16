// ROUND-C3 Part 7 (RDC3-070): the C3 TEXTS, word for word, as defaults;
// appliesTo in both views of the one manual; the skills and their zips.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultConfig, platformConfigSchema } from '../../src/platform-config';
import { buildManual } from '../../src/director-rules/manual';
import {
  RULEBOOK_C3,
  SKILL_PLAN_STEPS_C3,
  SKILL_SETUP_ADD_C3,
  SKILL_START_4_C3,
  SKILL_TALK_C3,
} from '../../src/platform-config/texts/c3';
import { SKILL_VIDEO_DIRECTOR } from '../../src/platform-config/texts/skill-video-director';
import { SKILL_SETUP } from '../../src/platform-config/texts/skill-setup';
import { bundleFiles } from '../../scripts/mcp-bundle.mjs';

const brief = readFileSync('briefs/ROUND-C3.md', 'utf8');
const config = platformConfigSchema.parse(defaultConfig());

describe('[RDC3-070] the C3 TEXTS and who each rule is for', () => {
  it('[RDC3-070] every T1 item is in the brief word for word and in the default rulebook with its appliesTo; the Director reads both + director items as its Rulebook, Claude both + claude items as Guidance; the skills carry T2 and T3; the zips match', () => {
    expect(RULEBOOK_C3).toHaveLength(8);
    for (const r of RULEBOOK_C3) {
      expect(brief).toContain(`- ${r.id} [${r.appliesTo}]: ${r.en}`);
      expect(config.director.rulebook.find((x) => x.id === r.id)).toMatchObject(
        {
          en: r.en,
          appliesTo: r.appliesTo,
        },
      );
    }
    // Replaced items keep their place (one-question is still 4th).
    expect(config.director.rulebook[3]!.id).toBe('one-question');
    const director = buildManual(config);
    const claude = buildManual(config, { for: 'claude' });
    const text = (id: string) => RULEBOOK_C3.find((r) => r.id === id)!.en;
    expect(director).toContain(`- ${text('assets-order')}`);
    expect(claude).not.toContain(`- ${text('assets-order')}`);
    expect(claude).toContain(`- ${text('assets-claude')}`);
    expect(director).not.toContain(`- ${text('assets-claude')}`);
    expect(director).toContain(`- ${text('upgrade')}`);
    expect(claude).toContain(`- ${text('upgrade')}`);
    expect(claude).toContain('## Guidance');
    expect(director).toContain('## Rulebook');
    // The skills.
    expect(brief).toContain(SKILL_TALK_C3);
    for (const l of SKILL_PLAN_STEPS_C3) {
      expect(brief).toContain(l);
      expect(SKILL_VIDEO_DIRECTOR).toContain(l);
    }
    expect(SKILL_VIDEO_DIRECTOR).toContain(SKILL_TALK_C3);
    expect(SKILL_VIDEO_DIRECTOR).toContain(`3. Find or create the Project`);
    expect(SKILL_VIDEO_DIRECTOR).toContain(SKILL_START_4_C3);
    expect(SKILL_VIDEO_DIRECTOR).not.toContain('Ask ONE question at a time');
    expect(SKILL_SETUP.trimEnd().endsWith(SKILL_SETUP_ADD_C3)).toBe(true);
    const files = bundleFiles('https://example.org');
    const skill = files['video-director.zip']![0]![1];
    expect(skill).toContain(SKILL_START_4_C3);
    expect(files['setup.zip']![0]![1]).toContain(
      'start a NEW chat. If they cleared their browser',
    );
  });
});
