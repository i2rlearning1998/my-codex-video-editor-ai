// ROUND-C4 Part 1: the Readymade Styles builder on the Owner App's server.
// Owner only, CSRF, re-authentication for dangerous steps, audit rows; the
// publish rules; versions and rollback; delete and restore; export and
// import; plans; and what the panel's config read and Claude see after.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from './helpers';
import { person } from '../round-c3/helpers';
import { defaultConfig, type Style } from '../../src/platform-config';
import {
  applySave,
  bt,
  canMove,
  changedFields,
  readStyleFile,
  slotReport,
  styleFile,
  unsafeTexts,
} from '../../src/director/style-builder';
import { validateStyle } from '../../src/director/style-check';
import { readZip, zipStored } from '../../owner/server/styles';

const template = {
  format: 'video-plan',
  version: 4,
  meta: { title: 'Fact: {{topic}}', language: 'en', aspect: '9:16', fps: 30 },
  captions: { enabled: false },
  scenes: [
    {
      id: 'open',
      title: '{{topic}}',
      narration: 'Here is a fact about {{topic}}.',
      durationHint: 4,
      notes: 'method:library',
      layers: [{ id: 't', kind: 'title', text: '{{topic}}', anchor: 'center' }],
    },
  ],
};
const base = (): Style => {
  const s = JSON.parse(JSON.stringify(defaultConfig().styles[0]!)) as Style;
  return {
    ...s,
    id: 'facts',
    name: { en: 'Facts', hi: 'तथ्य' },
    status: 'draft',
    planTemplate: template,
    slots: [
      { name: 'topic', kind: 'text', default: 'the sky', route: 'later' },
    ],
    tests: [],
  } as Style;
};
const passed = (...topics: string[]) =>
  topics.map((topic) => ({ topic, date: '2026-11-17', passed: true }));

describe('[RDC4-010] the builder rules (pure)', () => {
  it('[RDC4-010] status moves: never skip without a reason; Tested needs a passed test; Published needs 3 passed on 3 topics (trimmed, any case) or a 1-600 reason; an invalid Style cannot move up even with a reason; moving back always works', () => {
    const s = base();
    expect(canMove(s, 'published').ok).toBe(false);
    expect(canMove(s, 'tested')).toEqual({
      ok: false,
      message: 'Tested needs at least one passed test, or a written reason.',
    });
    const one = { ...s, tests: passed('Rain') };
    expect(canMove(one, 'tested').ok).toBe(true);
    // Two passed tests on the same topic count once.
    const two = {
      ...s,
      status: 'tested' as const,
      tests: passed('Rain', ' rain ', 'Snow'),
    };
    expect(canMove(two, 'published')).toEqual({
      ok: false,
      message: bt('publish-needs-tests', { n: 3, m: 2 }),
    });
    expect(canMove(two, 'published', 'Owner checked it by hand.').ok).toBe(
      true,
    );
    expect(canMove(two, 'published', 'x'.repeat(601)).ok).toBe(false);
    const three = { ...two, tests: passed('Rain', 'Snow', 'Wind') };
    expect(canMove(three, 'published').ok).toBe(true);
    // A failing Style: never, reason or not.
    const broken = {
      ...three,
      slots: [
        ...three.slots!,
        { name: 'unused', kind: 'text', default: '', route: 'later' },
      ],
    } as Style;
    expect(canMove(broken, 'published', 'please').ok).toBe(false);
    expect(canMove(broken, 'published', 'please')).toEqual({
      ok: false,
      message: bt('publish-blocked-invalid'),
    });
    expect(canMove({ ...three, status: 'published' }, 'draft').ok).toBe(true);
    expect(bt('publish-needs-tests', { n: 1, m: 1 }, 'hi')).toContain('1');
  });

  it('[RDC4-011] a save: version + 1; a Published Style whose template or slots change goes back to Tested with its tests kept; text, looks, art or order never change the status; the history names the changed fields', () => {
    const pub = {
      ...base(),
      status: 'published' as const,
      version: 4,
      tests: passed('A', 'B', 'C'),
    };
    const text = applySave(pub, {
      ...pub,
      blurb: { en: 'New words' },
      order: 3,
    });
    expect(text.style.status).toBe('published');
    expect(text.style.version).toBe(5);
    expect(text.changed).toEqual(['blurb', 'order']);
    const tpl = applySave(pub, {
      ...pub,
      planTemplate: { ...template, meta: { ...template.meta, aspect: '16:9' } },
    });
    expect(tpl.style.status).toBe('tested');
    expect(tpl.demoted).toBe(true);
    expect(tpl.style.tests).toHaveLength(3);
    // A save that leaves tests out never loses them.
    expect(applySave(pub, { ...pub, tests: [] }).style.tests).toHaveLength(3);
    expect(changedFields({ a: 1, b: [1] }, { a: 1, b: [2], c: 0 })).toEqual([
      'b',
      'c',
    ]);
  });

  it('[RDC4-012] the slot report names the place of a missing slot and lists the unused ones; validateStyle accepts the three legacy sample Styles and refuses a NEW Style marked Tested or Published without a template unless the owner wrote a reason', () => {
    const r = slotReport(
      {
        ...template,
        scenes: [
          template.scenes[0],
          { ...template.scenes[0], id: 'b', narration: '{{place}} is far.' },
        ],
      },
      [{ name: 'topic' }, { name: 'nobody' }],
    );
    expect(r.missing).toEqual(['place']);
    expect(r.unused).toEqual(['nobody']);
    expect(r.messages).toContain(
      'scene 2, field narration: The template uses {place} but the slot list has no slot with that name.'.replace(
        '{place}',
        '{{place}}',
      ),
    );
    expect(r.messages).toContain(
      'The slot "nobody" is in the list but the template never uses it.',
    );
    for (const st of defaultConfig().styles)
      expect(validateStyle(st).ok).toBe(true);
    const legacy = defaultConfig().styles[0]!;
    expect(validateStyle({ ...legacy, status: 'published' }).errors[0]).toMatch(
      /needs a plan template, or the owner's written reason/,
    );
    expect(
      validateStyle({
        ...legacy,
        status: 'published',
        publishOverride: 'Kept as it was.',
      }).ok,
    ).toBe(true);
  });

  it('[RDC4-013] a style file: format and version; a newer version is refused with nothing changed; a script or a link in a text is refused; a broken Style is refused; zip round trip', () => {
    const s = base();
    const file = JSON.stringify(styleFile(s));
    const ok = readStyleFile(file);
    expect(ok.ok).toBe(true);
    expect(
      readStyleFile(JSON.stringify({ ...styleFile(s), version: 2 })),
    ).toEqual({
      ok: false,
      message: bt('import-newer'),
    });
    const evil = { ...s, blurb: { en: 'Nice <script>alert(1)</script>' } };
    expect(unsafeTexts(evil as Style)).toEqual([
      'The blurb (English) holds a script.',
    ]);
    const r = readStyleFile(JSON.stringify(styleFile(evil as Style)));
    expect(r.ok).toBe(false);
    const link = { ...s, playbookText: 'See https://example.com' };
    expect(readStyleFile(JSON.stringify(styleFile(link))).ok).toBe(false);
    const broken = { ...s, slots: [] };
    expect(readStyleFile(JSON.stringify(styleFile(broken))).ok).toBe(false);
    const zip = zipStored([
      { name: 'style.json', bytes: Buffer.from(file) },
      { name: 'sample/poster.png', bytes: Buffer.from([1, 2, 3]) },
    ]);
    const back = readZip(zip);
    expect(back.get('style.json')!.toString()).toBe(file);
    expect([...back.get('sample/poster.png')!]).toEqual([1, 2, 3]);
  });
});

let c: C4;
beforeAll(async () => {
  c = await startC4();
});
afterAll(() => c.close());

const listed = async () => (await c.owner('GET', '/api/styles')).body;
const liveStyles = async () =>
  ((await c.s.api('/v1/config')).body.config as { styles: Style[] }).styles;

describe('[RDC4-014] the builder routes', () => {
  it('[RDC4-014] owner only: no cookie is refused, a stale CSRF token is refused (and audited), the user server has no such route, and a normal user token on the admin path is refused', async () => {
    expect((await c.owner('GET', '/api/styles', { cookie: null })).status).toBe(
      401,
    );
    const stale = await c.owner('POST', '/api/styles/copy', {
      body: { id: 'x' },
      csrf: 'old-token',
    });
    expect(stale.status).toBe(403);
    expect(c.audit().some((r) => r.action === 'csrf-refused')).toBe(true);
    expect((await fetch(`${c.s.url}/api/styles`)).status).toBe(404);
    const user = c.s.token('c4-user');
    const r = await fetch(
      `${c.s.url}/v1/admin/mcp/owner-projects?email=x@y.z`,
      {
        headers: { authorization: `Bearer ${user}` },
      },
    );
    expect([403, 404]).toContain(r.status);
    const viaBridge = await c.bridge.call(
      'GET',
      '/v1/admin/mcp/owner-projects?email=nobody@example.com',
      undefined,
      'owner',
    );
    expect(viaBridge.status).toBe(404);
  });

  it('[RDC4-015] the list shows every Style with status, version, passed tests, order, on/off, plans and its checks; the three samples read as legacy "Director form only"', async () => {
    const l = await listed();
    expect(l.styles.map((r: { style: Style }) => r.style.id)).toEqual(
      defaultConfig().styles.map((s) => s.id),
    );
    for (const r of l.styles) {
      expect(r.status).toBe('published');
      expect(r.check.legacy).toBe(true);
      expect(r.check.ok).toBe(true);
    }
    expect(l.plans.map((p: { id: string }) => p.id)).toEqual(
      defaultConfig().plans.map((p) => p.id),
    );
    expect(l.blocks.length).toBeGreaterThan(3);
  });

  it('[RDC4-016] New saves a Draft with version 1 and a history row; two Styles with one id are refused; an unknown kit block is refused; a status move without the code asks for it; a failed test publish is refused; three passed topics publish; editing the template sets it back to Tested', async () => {
    const s = base();
    const made = await c.owner('POST', '/api/styles/save', {
      body: { style: s, isNew: true, note: 'first' },
    });
    expect(made.status).toBe(200);
    expect(made.body.style.version).toBe(1);
    expect(made.body.style.status).toBe('draft');
    const again = await c.owner('POST', '/api/styles/save', {
      body: { style: s, isNew: true },
    });
    expect(again.status).toBe(409);
    const kit = await c.owner('POST', '/api/styles/save', {
      body: {
        style: { ...s, kit: { notes: '', blocks: ['nope-block'] } },
        id: 'facts',
      },
    });
    expect(kit.status).toBe(400);
    expect(kit.body.error).toMatch(/nope-block/);
    // Moving up needs the password and code (re-authentication).
    const noCode = await c.owner('POST', '/api/styles/status', {
      body: { id: 'facts', to: 'tested' },
    });
    expect(noCode.status).toBe(403);
    expect(noCode.body.reauth).toBe(true);
    const noTests = await c.owner('POST', '/api/styles/status', {
      body: { id: 'facts', to: 'tested' },
      reauth: true,
    });
    expect(noTests.status).toBe(400);
    await c.owner('POST', '/api/styles/tests', {
      body: {
        id: 'facts',
        tests: [
          ...passed('Rain', 'Snow'),
          { topic: 'Wind', date: '2026-11-17', passed: false },
        ],
      },
    });
    expect(
      (
        await c.owner('POST', '/api/styles/status', {
          body: { id: 'facts', to: 'tested' },
          reauth: true,
        })
      ).status,
    ).toBe(200);
    const two = await c.owner('POST', '/api/styles/status', {
      body: { id: 'facts', to: 'published' },
      reauth: true,
    });
    expect(two.status).toBe(400);
    expect(two.body.error).toBe(bt('publish-needs-tests', { n: 2, m: 2 }));
    // Tests can be corrected, never deleted.
    const del = await c.owner('POST', '/api/styles/tests', {
      body: { id: 'facts', tests: passed('Rain') },
    });
    expect(del.status).toBe(400);
    await c.owner('POST', '/api/styles/tests', {
      body: {
        id: 'facts',
        tests: [
          ...passed('Rain', 'Snow'),
          { topic: 'Wind', date: '2026-11-17', passed: true },
        ],
      },
    });
    const pub = await c.owner('POST', '/api/styles/status', {
      body: { id: 'facts', to: 'published' },
      reauth: true,
    });
    expect(pub.status).toBe(200);
    expect((await liveStyles()).find((x) => x.id === 'facts')?.status).toBe(
      'published',
    );
    // Text only: still Published. The template: back to Tested.
    const cur = (await c.owner('GET', '/api/styles/facts')).body.style as Style;
    const t1 = await c.owner('POST', '/api/styles/save', {
      body: { style: { ...cur, blurb: { en: 'Better words' } }, id: 'facts' },
    });
    expect(t1.body.style.status).toBe('published');
    const t2 = await c.owner('POST', '/api/styles/save', {
      body: {
        style: {
          ...t1.body.style,
          planTemplate: {
            ...template,
            meta: { ...template.meta, aspect: '16:9' },
          },
        },
        id: 'facts',
      },
    });
    expect(t2.body.style.status).toBe('tested');
    expect(t2.body.demoted).toBe(true);
    expect(t2.body.style.tests).toHaveLength(3);
    const audit = c.audit().map((r) => r.action);
    expect(audit).toContain('style new');
    expect(audit).toContain('style status');
  });

  it('[RDC4-017] an override needs a reason; it is stored, listed and audited; an empty reason is refused', async () => {
    const s = { ...base(), id: 'quick', tests: [] };
    await c.owner('POST', '/api/styles/save', {
      body: { style: s, isNew: true },
    });
    const empty = await c.owner('POST', '/api/styles/status', {
      body: { id: 'quick', to: 'published', override: '   ' },
      reauth: true,
    });
    expect(empty.status).toBe(400);
    const ok = await c.owner('POST', '/api/styles/status', {
      body: {
        id: 'quick',
        to: 'published',
        override: 'The owner made ten of these by hand.',
      },
      reauth: true,
    });
    expect(ok.status).toBe(200);
    const row = (await listed()).styles.find(
      (r: { style: Style }) => r.style.id === 'quick',
    );
    expect(row.style.publishOverride).toBe(
      'The owner made ten of these by hand.',
    );
    expect(
      c
        .audit()
        .some((r) => r.action === 'style override' && r.target === 'quick'),
    ).toBe(true);
  });

  it('[RDC4-018] versions: history with who, note and changed fields; Preview; Roll back makes a NEW version with the old content; a snapshot that no longer parses is refused with nothing changed', async () => {
    const h = (await c.owner('GET', '/api/styles/facts')).body.history as {
      version: number;
      changed: string[];
      who: string;
    }[];
    expect(h.length).toBeGreaterThan(3);
    expect(h[0]!.who).toBe('owner@example.com');
    const first = (await c.owner('GET', '/api/styles/facts/versions/1')).body;
    expect(first.snapshot.blurb).toEqual(base().blurb);
    const before = (await c.owner('GET', '/api/styles/facts')).body
      .style as Style;
    const back = await c.owner('POST', '/api/styles/rollback', {
      body: { id: 'facts', version: 1 },
      reauth: true,
    });
    expect(back.status).toBe(200);
    expect(back.body.style.version).toBe((before.version ?? 0) + 1);
    expect(back.body.style.blurb).toEqual(base().blurb);
    expect(back.body.style.tests).toHaveLength(3);
    // A version that can no longer be read.
    const { StyleBook } = await import('../../owner/server/styles');
    const book = new StyleBook(`${c.root}/data`);
    const b = book.read();
    b.history['style:facts']![0] = {
      ...b.history['style:facts']![0]!,
      snapshot: { id: 'facts', name: 'broken' },
    };
    book.write(b);
    const bad = await c.owner('POST', '/api/styles/rollback', {
      body: { id: 'facts', version: 1 },
      reauth: true,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe(bt('rollback-bad'));
  });

  it('[RDC4-019] Copy is a Draft with a new id and no tests; Move up and down change the gallery order; Disable hides it from the live list', async () => {
    const copy = await c.owner('POST', '/api/styles/copy', {
      body: { id: 'facts' },
    });
    expect(copy.body.style.id).toBe('facts-copy');
    expect(copy.body.style.status).toBe('draft');
    expect(copy.body.style.tests).toBeUndefined();
    const order = async () =>
      (await listed()).styles.map((r: { style: Style }) => r.style.id);
    const was = await order();
    await c.owner('POST', '/api/styles/move', {
      body: { id: was[1], dir: 'up' },
    });
    const now = await order();
    expect(now[0]).toBe(was[1]);
    expect(now[1]).toBe(was[0]);
    await c.owner('POST', '/api/styles/enable', {
      body: { id: 'facts-copy', enabled: false },
    });
    expect(
      (await liveStyles()).find((x) => x.id === 'facts-copy')?.enabled,
    ).toBe(false);
  });

  it('[RDC4-020] Delete needs the code, hides the Style, keeps a snapshot in the Deleted list and restores it as a Draft; a Project made from it keeps its style record', async () => {
    const { client } = await person(c.s, 'c4-deleter');
    await c.owner('POST', '/api/styles/tests', {
      body: { id: 'quick', tests: passed('A') },
    });
    const made = await c.s.call(client, 'create_project', {
      name: 'Uses quick',
      style_id: 'quick',
    });
    expect(made.text).toMatch(/project_id/);
    expect(
      (await c.owner('POST', '/api/styles/delete', { body: { id: 'quick' } }))
        .status,
    ).toBe(403);
    const del = await c.owner('POST', '/api/styles/delete', {
      body: { id: 'quick' },
      reauth: true,
    });
    expect(del.body.note).toBe(bt('delete-warning'));
    expect((await liveStyles()).some((x) => x.id === 'quick')).toBe(false);
    expect((await listed()).deleted.map((x: { id: string }) => x.id)).toContain(
      'quick',
    );
    // The Project still has its style record (a copy).
    const list = await c.s.call(client, 'list_projects', {});
    expect(list.text).toContain('Uses quick');
    const r = await c.owner('POST', '/api/styles/restore', {
      body: { id: 'quick' },
      reauth: true,
    });
    expect(r.body.style.status).toBe('draft');
    expect((await listed()).deleted).toHaveLength(0);
  });

  it('[RDC4-021] Export downloads a .aive-style.zip; Import refuses a newer format with nothing changed, asks on an id clash, imports as a copy or as a new version (Draft, tests cleared unless kept)', async () => {
    const exp = await c.owner('GET', '/api/styles/facts/export');
    expect(exp.headers.get('content-type')).toBe('application/zip');
    expect(exp.headers.get('content-disposition')).toContain(
      'facts.aive-style.zip',
    );
    const before = await liveStyles();
    const newer = zipStored([
      {
        name: 'style.json',
        bytes: Buffer.from(
          JSON.stringify({ format: 'aive-style', version: 9, style: base() }),
        ),
      },
    ]);
    const n = await c.owner('POST', '/api/styles/import', {
      raw: newer,
      name: 'x.aive-style.zip',
      reauth: true,
    });
    expect(n.status).toBe(400);
    expect(n.body.error).toBe(bt('import-newer'));
    expect(await liveStyles()).toEqual(before);
    const clash = await c.owner('POST', '/api/styles/import', {
      raw: exp.bytes,
      name: 'facts.aive-style.zip',
      reauth: true,
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe(bt('import-clash'));
    const copy = await c.owner('POST', '/api/styles/import?mode=copy', {
      raw: exp.bytes,
      name: 'f.zip',
      reauth: true,
    });
    expect(copy.body.style.id).toMatch(/^facts-copy/);
    expect(copy.body.style.status).toBe('draft');
    const ver = await c.owner(
      'POST',
      '/api/styles/import?mode=version&keepTests=1',
      { raw: exp.bytes, name: 'f.zip', reauth: true },
    );
    expect(ver.body.style.id).toBe('facts');
    expect(ver.body.style.status).toBe('draft');
    expect(ver.body.style.tests).toHaveLength(3);
    const evil = zipStored([
      {
        name: 'style.json',
        bytes: Buffer.from(
          JSON.stringify(
            styleFile({
              ...base(),
              id: 'evil',
              name: { en: '<script>x</script>' },
            }),
          ),
        ),
      },
    ]);
    const e = await c.owner('POST', '/api/styles/import', {
      raw: evil,
      name: 'e.zip',
      reauth: true,
    });
    expect(e.status).toBe(400);
    expect(e.body.error).toMatch(/holds a script/);
  });

  it('[RDC4-022] Check the Style: a template that is not a plan, an older plan and a missing slot each get a plain message; a good one builds a first draft offline with the layout check and a frame sketch', async () => {
    const notPlan = await c.owner('POST', '/api/styles/template', {
      body: { text: '{"hello": 1}' },
    });
    expect(notPlan.body.error).toBe(bt('template-not-plan'));
    const old = await c.owner('POST', '/api/styles/template', {
      body: { text: JSON.stringify({ ...template, version: 2 }) },
    });
    expect(old.body.error).toBe(
      'This plan is version 2; a template must be a Video Plan version 4.',
    );
    const miss = await c.owner('POST', '/api/styles/template', {
      body: {
        text: JSON.stringify({
          ...template,
          meta: { ...template.meta, title: '{{brand}}' },
        }),
        slots: [{ name: 'topic' }],
      },
    });
    expect(miss.body.slots.missing).toEqual(['brand']);
    const ok = await c.owner('POST', '/api/styles/check', {
      body: { style: base() },
    });
    expect(ok.body.ok).toBe(true);
    expect(ok.body.draft.scenes).toBe(1);
    expect(ok.body.filled.meta.title).toBe('Fact: the sky');
    expect(Array.isArray(ok.body.layout)).toBe(true);
    expect(ok.body.sketch).toContain('<svg');
    const legacy = await c.owner('POST', '/api/styles/check', {
      body: { style: defaultConfig().styles[0] },
    });
    expect(legacy.body.note).toMatch(/Director's form only/);
  });

  it('[RDC4-023] a sample upload: a real MP4/WebM or PNG/JPEG/WebP only, the type checked from the bytes, the size limit in a plain sentence', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const ok = await c.owner(
      'POST',
      '/api/styles/sample?id=facts&name=poster.png',
      { raw: png, name: 'poster.png' },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/\/files\/[0-9a-f]{64}\.png$/);
    const wrong = await c.owner(
      'POST',
      '/api/styles/sample?id=facts&name=movie.exe',
      { raw: png, name: 'movie.exe' },
    );
    expect(wrong.status).toBe(415);
    const fake = await c.owner(
      'POST',
      '/api/styles/sample?id=facts&name=movie.mp4',
      { raw: png, name: 'movie.mp4' },
    );
    expect(fake.body.error).toBe('This file is not a real .mp4 file.');
  });
});

describe('[RDC4-024] plans and the gallery truth', () => {
  it('[RDC4-024] a Style limited to a paid plan: the free person sees it locked in list_styles and create_project refuses it in one sentence; the paid person gets it', async () => {
    const st = (await c.owner('GET', '/api/styles/facts')).body.style as Style;
    const paid = defaultConfig().plans.find((p) => p.id !== 'free')!;
    await c.owner('POST', '/api/styles/save', {
      body: { style: { ...st, plans: [paid.id] }, id: 'facts' },
    });
    await c.owner('POST', '/api/styles/status', {
      body: {
        id: 'facts',
        to: 'published',
        override: 'Checked by hand again.',
      },
      reauth: true,
    });
    const free = await person(c.s, 'c4-free');
    const list = await c.s.call(free.client, 'list_styles', {});
    expect(list.text).toContain(
      `- facts: Facts (locked: This Style is part of the ${paid.name.en} plan.`,
    );
    const no = await c.s.call(free.client, 'create_project', {
      name: 'X',
      style_id: 'facts',
    });
    expect(no.text).toContain(
      `This Style is part of the ${paid.name.en} plan.`,
    );
    expect(no.text).toContain('no Project was made');
    const rich = await person(c.s, 'c4-paid');
    const prof = (await c.s.store.profile('c4-paid'))!;
    await c.s.store.saveProfile({ ...prof, plan: paid.id });
    await c.s.call(rich.client, 'get_credits');
    expect((await c.s.call(rich.client, 'list_styles', {})).text).toContain(
      '- facts: Facts.',
    );
    const yes = await c.s.call(rich.client, 'create_project', {
      name: 'Y',
      style_id: 'facts',
    });
    expect(yes.text).toMatch(/project_id/);
  });

  it("[RDC4-025] Draft → Published → back to Tested: the public config read (panel and website) and list_styles follow at once, with no restart; the owner's own account also sees the Tested one, marked", async () => {
    const st = (await c.owner('GET', '/api/styles/facts')).body.style as Style;
    await c.owner('POST', '/api/styles/save', {
      body: { style: { ...st, plans: [] }, id: 'facts' },
    });
    const pub = async () => (await liveStyles()).find((x) => x.id === 'facts');
    expect((await pub())?.status).toBe('published');
    const p = await person(c.s, 'c4-viewer');
    expect((await c.s.call(p.client, 'list_styles', {})).text).toContain(
      '- facts: Facts.',
    );
    await c.owner('POST', '/api/styles/status', {
      body: { id: 'facts', to: 'tested' },
      reauth: true,
    });
    expect((await pub())?.status).toBe('tested');
    expect((await c.s.call(p.client, 'list_styles', {})).text).not.toContain(
      '- facts:',
    );
    await c.owner('POST', '/api/styles/status', {
      body: { id: 'facts', to: 'draft' },
      reauth: true,
    });
    expect((await pub())?.status).toBe('draft');
  });
});
