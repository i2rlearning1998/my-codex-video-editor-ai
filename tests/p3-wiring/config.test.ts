// P3-WIRING W1: config additions (model params, p3 settings, campaigns, caps, combos).
import { describe, expect, it } from 'vitest';
import {
  activeCampaigns,
  capFor,
  comboModels,
  defaultConfig,
  p3Settings,
  parseConfig,
} from '../../src/platform-config';

/** A stored config written before P3: none of the new fields. */
function oldConfig(): Record<string, unknown> {
  const c = JSON.parse(JSON.stringify(defaultConfig())) as Record<
    string,
    unknown
  >;
  delete c.p3;
  delete c.campaigns;
  delete c.styleCaps;
  delete c.combos;
  for (const m of c.models as Record<string, unknown>[]) delete m.params;
  return c;
}

describe('P3-WIRING config', () => {
  it('[P3W-001] an old stored config still parses; the new fields get sample defaults', () => {
    const r = parseConfig(oldConfig());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.schemaVersion).toBe(1);
    expect(r.config.p3.sample).toBe(true);
    expect(r.config.campaigns).toEqual([]);
    expect(r.config.combos).toEqual([]);
    expect(r.config.styleCaps).toEqual({});
    expect(r.config.models.every((m) => Array.isArray(m.params))).toBe(true);
    const s = p3Settings(r.config);
    expect(s.chat.enabled).toBe(true);
    expect(s.vision.creditsPerImage).toBeGreaterThanOrEqual(0);
    expect(s.memory.keepRecent).toBeGreaterThan(0);
    expect(Object.keys(s).sort()).toEqual(
      [
        'chat',
        'entitlementTtlSeconds',
        'memory',
        'vision',
        'webhookReplayWindowSeconds',
      ].sort(),
    );
  });

  it('[P3W-001] the owner settings come from config, not code', () => {
    const c = defaultConfig();
    const raw = JSON.parse(JSON.stringify(c));
    raw.p3.vision.creditsPerImage = 7;
    raw.p3.chat.maxMessagesPerDay = 3;
    const r = parseConfig(raw);
    expect(r.ok && p3Settings(r.config).vision.creditsPerImage).toBe(7);
    expect(r.ok && p3Settings(r.config).chat.maxMessagesPerDay).toBe(3);
    // Model params are checked with the contract's schema.
    expect(c.models.find((m) => m.id === 'mock-image')!.params.length).toBe(4);
    raw.models[0].params = [{ id: '1bad', type: 'text', label: { en: 'x' } }];
    expect(parseConfig(raw).ok).toBe(false);
  });

  it('[P3W-002] a combo naming an unknown model or a role the model does not serve is refused', () => {
    const raw = JSON.parse(JSON.stringify(defaultConfig()));
    raw.combos = [{ id: 'x', name: { en: 'X' }, models: { write: 'nope' } }];
    let r = parseConfig(raw);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.join(' ')).toContain(
        'Combo x names model nope, which is not in the model list.',
      );
    raw.combos = [
      { id: 'x', name: { en: 'X' }, models: { 'studio-voice': 'mock-fast' } },
    ];
    r = parseConfig(raw);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.join(' ')).toContain(
        'that model does not do studio-voice',
      );
    const c = defaultConfig();
    expect(comboModels(c, 'offline')!.write!.id).toBe('mock-fast');
    expect(comboModels(c, 'missing')).toBeNull();
  });

  it('[P3W-003] a campaign ending before it starts is refused; active ones are read by date and plan', () => {
    const raw = JSON.parse(JSON.stringify(defaultConfig()));
    raw.campaigns = [
      {
        id: 'diwali',
        name: { en: 'Diwali' },
        startsAt: '2026-11-10T00:00:00Z',
        endsAt: '2026-11-01T00:00:00Z',
        bonusPercent: 20,
      },
    ];
    const bad = parseConfig(raw);
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.errors.join(' ')).toContain(
        'Campaign diwali ends before it starts.',
      );
    raw.campaigns[0].endsAt = '2026-11-20T00:00:00Z';
    raw.campaigns[0].plans = ['creator'];
    const r = parseConfig(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inside = new Date('2026-11-12T00:00:00Z');
    expect(activeCampaigns(r.config, inside).map((k) => k.id)).toEqual([
      'diwali',
    ]);
    expect(activeCampaigns(r.config, inside, 'free')).toEqual([]);
    expect(activeCampaigns(r.config, new Date('2026-11-25T00:00:00Z'))).toEqual(
      [],
    );
  });

  it('[P3W-004] style caps per plan; a plan without an entry has none', () => {
    const c = defaultConfig();
    expect(capFor(c, 'free').maxStyles).toBe(1);
    expect(capFor(c, 'nobody')).toEqual({
      maxStyles: null,
      maxProjects: null,
      maxChatsPerProject: null,
    });
    const raw = JSON.parse(JSON.stringify(c));
    raw.styleCaps.ghost = { maxStyles: 1 };
    expect(parseConfig(raw).ok).toBe(false);
  });
});
