// P2-R1 Part B: providers, models, payments and studios in the Platform Config.
import { describe, expect, it } from 'vitest';
import {
  defaultConfig,
  defaultModelFor,
  enabledStudios,
  modelAvailability,
  modelById,
  modelsForRole,
  needsConsent,
  parseConfig,
  planFor,
  providerById,
  studioById,
  tierModels,
} from '../../src/platform-config';

describe('P2-R1 config: providers, models, payments', () => {
  it('[P2R1-004] providers name a server secret, never a key', () => {
    const c = defaultConfig();
    expect(c.providers.map((p) => p.kind).sort()).toEqual(
      ['anthropic', 'google', 'mock', 'openai', 'xai'].sort(),
    );
    expect(providerById(c, 'anthropic')?.keyRef).toBe('ANTHROPIC_API_KEY');
    const bad = defaultConfig() as unknown as {
      providers: { keyRef: string }[];
    };
    bad.providers[1]!.keyRef = 'sk-ant-api03-abc';
    const r = parseConfig(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/keyRef: the NAME/);
  });
  it('[P2R1-005] models: lookups, roles, tiers, plan gating and sample prices', () => {
    const c = defaultConfig();
    expect(c.creditRate).toBeGreaterThan(0);
    // Real providers are off until the owner adds keys; the mock serves every role.
    expect(modelsForRole(c, 'director-plan').map((m) => m.id)).toEqual([
      'mock-fast',
      'mock-balanced',
      'mock-best',
    ]);
    const free = planFor(c, 'free');
    const pro = planFor(c, 'pro');
    expect(defaultModelFor(c, free, 'director-plan')?.id).toBe('mock-balanced');
    expect(modelAvailability(c, free, 'mock-best')).toEqual({
      ok: false,
      reason: 'plan',
    });
    expect(modelAvailability(c, pro, 'mock-best')).toEqual({ ok: true });
    expect(modelAvailability(c, pro, 'claude-best')).toEqual({
      ok: false,
      reason: 'disabled',
    });
    expect(modelAvailability(c, pro, 'nope')).toEqual({
      ok: false,
      reason: 'unknown',
    });
    const t = tierModels(c, 'director-plan');
    expect([t.fast?.id, t.balanced?.id, t.best?.id]).toEqual([
      'mock-fast',
      'mock-balanced',
      'mock-best',
    ]);
    // Real adapters are untested and every price is marked a sample.
    expect(modelById(c, 'claude-balanced')).toMatchObject({
      tested: false,
      samplePrice: true,
      providerId: 'anthropic',
    });
    expect(c.models.every((m) => m.samplePrice)).toBe(true);
    // Turning a provider off hides its models.
    c.providers.find((p) => p.id === 'mock')!.enabled = false;
    expect(modelsForRole(c, 'studio-voice')).toEqual([]);
  });
  it('[P2R1-006] payments and top-ups come from config; a mock works offline', () => {
    const c = defaultConfig();
    const on = c.payments.filter((p) => p.enabled);
    expect(on.map((p) => p.kind)).toEqual(['mock']);
    expect(on[0]!.currencies).toEqual(['INR', 'USD']);
    expect(c.topUps.length).toBeGreaterThan(0);
  });
  it('[P2R1-007] studios and Director point to model roles; consent only when cloning', () => {
    const c = defaultConfig();
    expect(enabledStudios(c).map((s) => s.id)).toEqual([
      'write',
      'voice',
      'audio',
      'images',
      'video',
      'captions',
      'thumbnail',
      'youtube-pack',
    ]);
    for (const s of enabledStudios(c))
      expect(modelsForRole(c, s.role).length).toBeGreaterThan(0);
    expect(c.director.roles.plan).toBe('director-plan');
    const voice = studioById(c, 'voice')!;
    expect(needsConsent(voice, { mode: 'tts' })).toBe(false);
    expect(needsConsent(voice, { mode: 'clone' })).toBe(true);
    expect(c.director.tools.every((t) => t.costId)).toBe(true);
  });
  it('[P2R1-008] invalid configs are refused with a reason: unknown provider, role without a model, bad method', () => {
    const c = defaultConfig();
    c.models[0]!.providerId = 'ghost';
    let r = parseConfig(c);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.join(' ')).toMatch(
        /model mock-fast: unknown provider ghost/,
      );
    const d = defaultConfig();
    d.models = d.models.filter((m) => !m.roles.includes('studio-thumbnail'));
    d.director.methodOrder.push('teleport');
    r = parseConfig(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/studio thumbnail: no model serves/);
      expect(r.errors.join(' ')).toMatch(/method teleport is not a tool/);
    }
  });
});
