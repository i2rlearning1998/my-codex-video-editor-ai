// ROUND-C5 Part 3: who gets a feature or a limit, in the brief's order
// (emergency and global off, a personal override that has not ended, cohort
// overrides, beta and rollout, the plan), and the Owner App's routes that
// edit it (a note is required, overrides ask for the code, a plan with
// people cannot be deleted, "Who has this?"). The server's effective plan
// is what Claude and the panel read.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from '../round-c4/helpers';
import { person } from '../round-c3/helpers';
import {
  becauseText,
  c5,
  checkOverride,
  defaultConfig,
  effectivePlan,
  emptyAccess,
  featureFor,
  limitFor,
  planFor,
  rolloutBucket,
  type AccessRules,
  type PlatformConfig,
} from '../../src/platform-config';

const cfg = (): PlatformConfig => {
  const c = defaultConfig();
  c.features = [
    {
      key: 'brand-kit',
      label: { en: 'Brand Kit', hi: 'ब्रांड किट' },
      gates: ['panel'],
      on: true,
      beta: false,
      rollout: 100,
    },
  ];
  return c;
};
const free = (c: PlatformConfig, userId = 'u1', email = 'a@x.example') => ({
  userId,
  email,
  plan: planFor(c, 'free'),
});
const T0 = Date.parse('2026-11-16T10:00:00Z');

describe('[RDC5-023] the order of the rules', () => {
  it('[RDC5-023] with nothing set the plan decides (exactly as today); global off beats everything; a personal override beats a cohort and the plan; a cohort beats the plan; an override that ended a second ago is not used; an unchecked plan feature with an override is on for that person only', () => {
    const c = cfg();
    const none = emptyAccess();
    const plain = defaultConfig();
    // Today: no registry, no rules -> the plan as it is.
    expect(effectivePlan(plain, none, free(plain), T0)).toEqual(
      planFor(plain, 'free'),
    );
    expect(featureFor(c, none, free(c), 'brand-kit', T0)).toEqual({
      on: false,
      because: { kind: 'plan', plan: 'free', on: false },
    });
    const rules: AccessRules = {
      cohorts: [{ id: 'teachers', name: 'Teachers', emails: ['a@x.example'] }],
      overrides: [
        {
          id: 'o1',
          who: 'cohort:teachers',
          feature: 'brand-kit',
          on: true,
          note: 'pilot',
          by: 'owner',
          at: '',
        },
      ],
    };
    expect(featureFor(c, rules, free(c), 'brand-kit', T0).because.kind).toBe(
      'cohort',
    );
    expect(featureFor(c, rules, free(c), 'brand-kit', T0).on).toBe(true);
    expect(
      featureFor(c, rules, free(c, 'u2', 'b@x.example'), 'brand-kit', T0).on,
    ).toBe(false);
    rules.overrides.push({
      id: 'o2',
      who: 'u1',
      feature: 'brand-kit',
      on: false,
      note: 'asked to stop',
      by: 'owner',
      at: '',
      expiresAt: new Date(T0 + 60_000).toISOString(),
    });
    expect(featureFor(c, rules, free(c), 'brand-kit', T0)).toEqual({
      on: false,
      because: { kind: 'override', id: 'o2', note: 'asked to stop', on: false },
    });
    // Ended a second ago: the cohort decides again.
    expect(featureFor(c, rules, free(c), 'brand-kit', T0 + 61_000).on).toBe(
      true,
    );
    // Global off wins over every override.
    c.features![0]!.on = false;
    expect(featureFor(c, rules, free(c), 'brand-kit', T0)).toEqual({
      on: false,
      because: { kind: 'off' },
    });
    expect(becauseText({ kind: 'off' }, c)).toBe(c5('who-has-this-off'));
    expect(
      featureFor(c, emptyAccess(), free(c), 'brand-kit', T0, true).because.kind,
    ).toBe('emergency');
  });
  it('[RDC5-023] rollout 0 percent gives nobody the feature and 100 percent gives it to everyone whose plan has it; beta gives it to the group only, plan or not; the bucket is stable per person', () => {
    const c = cfg();
    const pro = (id: string) => ({
      userId: id,
      email: `${id}@x.example`,
      plan: planFor(c, 'pro'),
    });
    const f = c.features![0]!;
    f.rollout = 0;
    for (let i = 0; i < 50; i++)
      expect(
        featureFor(c, emptyAccess(), pro(`p${i}`), 'brand-kit', T0).on,
      ).toBe(false);
    f.rollout = 100;
    for (let i = 0; i < 50; i++)
      expect(
        featureFor(c, emptyAccess(), pro(`p${i}`), 'brand-kit', T0).on,
      ).toBe(true);
    f.rollout = 30;
    f.beta = true;
    const on = Array.from(
      { length: 400 },
      (_, i) =>
        featureFor(c, emptyAccess(), free(c, `f${i}`), 'brand-kit', T0).on,
    ).filter(Boolean).length;
    expect(on).toBeGreaterThan(80);
    expect(on).toBeLessThan(160);
    expect(rolloutBucket('x', 'brand-kit')).toBe(
      rolloutBucket('x', 'brand-kit'),
    );
    const r = featureFor(c, emptyAccess(), free(c, 'f1'), 'brand-kit', T0);
    expect(becauseText(r.because, c)).toBe(
      r.on
        ? c5('who-has-this-rollout', 'en', { percent: 30 })
        : c5('who-has-this-not-yet'),
    );
    expect(becauseText({ kind: 'plan', plan: 'pro', on: true }, c)).toBe(
      c5('who-has-this-plan', 'en', { plan: planFor(c, 'pro').name.en }),
    );
  });
  it('[RDC5-023] limits: a personal override beats a group; null means no limit; a cohort of zero changes nothing; a note is required for every override', () => {
    const c = cfg();
    const rules: AccessRules = {
      cohorts: [
        { id: 'big', name: 'Big', emails: ['a@x.example'] },
        { id: 'empty', name: 'Empty', emails: [] },
      ],
      overrides: [
        {
          id: 'l1',
          who: 'cohort:big',
          limit: 'projects',
          value: 50,
          note: 'n',
          by: '',
          at: '',
        },
        {
          id: 'l2',
          who: 'cohort:empty',
          limit: 'storageMb',
          value: 1,
          note: 'n',
          by: '',
          at: '',
        },
      ],
    };
    expect(limitFor(rules, free(c), 'projects', T0)).toBe(50);
    expect(limitFor(rules, free(c), 'storageMb', T0)).toBe(
      planFor(c, 'free').limits.storageMb,
    );
    rules.overrides.push({
      id: 'l3',
      who: 'u1',
      limit: 'projects',
      value: null,
      note: 'n',
      by: '',
      at: '',
    });
    expect(limitFor(rules, free(c), 'projects', T0)).toBeNull();
    expect(
      checkOverride({ who: 'u1', feature: 'x', on: true, note: ' ' }),
    ).toEqual([c5('override-note-required')]);
  });
});

describe('[RDC5-024] the Owner App and the effect', () => {
  let c4: C4;
  beforeAll(async () => {
    c4 = await startC4();
  }, 60_000);
  afterAll(() => c4?.close());

  it('[RDC5-024] the owner gives one person a limit for an hour (the code is asked; without a note it is refused); the server, the panel (/v1/me) and Claude follow at once; Who has this lists the reason; an expired override says so; a plan with people cannot be deleted but can be archived; a removed person override is gone', async () => {
    const someone = await person(c4.s, 'c5-access');
    await c4.s.call(someone.client, 'get_credits');
    // The local token's email (tests/server/helpers.ts); /v1/me keeps it.
    const email = 'c5-acc@example.com';
    const base = await c4.s.api('/v1/me', { token: someone.token });
    expect(base.body.email).toBe(email);
    expect(base.body.features).toEqual(
      planFor(defaultConfig(), 'free').features,
    );
    // A note is required.
    const noNote = await c4.owner('POST', '/api/access/override', {
      body: { override: { who: email, limit: 'projects', value: 1, note: '' } },
      reauth: true,
    });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error).toContain(c5('override-note-required'));
    // The code is asked first.
    const ask = await c4.owner('POST', '/api/access/override', {
      body: {
        override: { who: email, limit: 'projects', value: 1, note: 'trial' },
      },
    });
    expect(ask.status).toBe(403);
    expect(ask.body.reauth).toBe(true);
    const ok = await c4.owner('POST', '/api/access/override', {
      body: {
        override: {
          who: email,
          feature: 'brand-kit',
          on: true,
          note: 'helps our pilot',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      reauth: true,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const me = await c4.s.api('/v1/me', { token: someone.token });
    expect(me.body.features).toContain('brand-kit');
    const who = await c4.owner('GET', '/api/access/who?feature=brand-kit');
    const row = who.body.people.find(
      (p: { email: string }) => p.email === email,
    );
    expect(row.on).toBe(true);
    expect(row.why).toBe('On for this person: helps our pilot');
    expect(who.body.count).toBeGreaterThanOrEqual(1);
    // A limit through Claude: projects = 0 refuses a new Project.
    await c4.owner('POST', '/api/access/override', {
      body: {
        override: { who: email, limit: 'projects', value: 0, note: 'none' },
      },
      reauth: true,
    });
    const made = await c4.s.call(someone.client, 'create_project', {
      name: 'X',
    });
    expect(made.isError).toBe(true);
    // Expired overrides are marked.
    await c4.owner('POST', '/api/access/override', {
      body: {
        override: {
          who: email,
          feature: 'brand-kit',
          on: false,
          note: 'old',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
      reauth: true,
    });
    const list = await c4.owner('GET', '/api/access');
    const old = list.body.overrides.find(
      (o: { note: string }) => o.note === 'old',
    );
    expect(old.expired).toBe(true);
    expect(list.body.expiredText).toBe(c5('override-expired'));
    // The expired one is not used: still on.
    expect(
      (await c4.s.api('/v1/me', { token: someone.token })).body.features,
    ).toContain('brand-kit');
    // A plan with people cannot be deleted; archiving is fine.
    const plans = list.body.plans as PlatformConfig['plans'];
    const del = await c4.owner('POST', '/api/access/plans', {
      body: {
        plans: plans.filter((p) => p.id !== 'free'),
        baseVersion: list.body.version,
      },
    });
    expect(del.status).toBe(400);
    expect(del.body.error).toContain('cannot be deleted');
    const arch = await c4.owner('POST', '/api/access/plans', {
      body: {
        plans: plans.map((p) =>
          p.id === 'pro' ? { ...p, archived: true } : p,
        ),
        baseVersion: list.body.version,
      },
    });
    expect(arch.status).toBe(200);
    // Remove the personal overrides: back to the plan.
    const now = await c4.owner('GET', '/api/access');
    for (const o of now.body.overrides)
      await c4.owner('POST', '/api/access/override', {
        body: { remove: o.id },
        reauth: true,
      });
    expect(
      (await c4.s.api('/v1/me', { token: someone.token })).body.features,
    ).not.toContain('brand-kit');
    expect(c4.audit().some((r) => r.action === 'access override')).toBe(true);
  });

  it("[RDC5-024] a cohort of up to 500 emails is saved (601 is refused, a bad email is named); its override reaches a member at the next /v1/me; a deleted person's override changes nobody else", async () => {
    const member = await person(c4.s, 'c5-member');
    await c4.s.call(member.client, 'get_credits');
    const email = 'c5-mem@example.com';
    await c4.s.api('/v1/me', { token: member.token });
    const tooMany = Array.from(
      { length: 501 },
      (_, i) => `p${i}@x.example`,
    ).join('\n');
    expect(
      (
        await c4.owner('POST', '/api/access/cohort', {
          body: { id: 'many', emails: tooMany },
        })
      ).status,
    ).toBe(400);
    const bad = await c4.owner('POST', '/api/access/cohort', {
      body: { id: 'pilot', emails: 'nope' },
    });
    expect(bad.body.error).toContain('These are not emails: nope');
    const saved = await c4.owner('POST', '/api/access/cohort', {
      body: { id: 'pilot', name: 'Pilot', emails: `${email}\nother@x.example` },
    });
    expect(saved.status).toBe(200);
    expect(
      (await c4.s.api('/v1/me', { token: member.token })).body.features,
    ).not.toContain('brand-kit');
    await c4.owner('POST', '/api/access/override', {
      body: {
        override: {
          who: 'cohort:pilot',
          feature: 'brand-kit',
          on: true,
          note: 'pilot group',
        },
      },
      reauth: true,
    });
    expect(
      (await c4.s.api('/v1/me', { token: member.token })).body.features,
    ).toContain('brand-kit');
    // An override for a person who no longer exists changes nobody.
    await c4.owner('POST', '/api/access/override', {
      body: {
        override: {
          who: 'deleted-person-id',
          feature: 'brand-kit',
          on: false,
          note: 'gone',
        },
      },
      reauth: true,
    });
    expect(
      (await c4.s.api('/v1/me', { token: member.token })).body.features,
    ).toContain('brand-kit');
  });
});
