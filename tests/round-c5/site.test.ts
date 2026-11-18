// ROUND-C5 Part 1: Website & Brand in the Owner App (owner-only, CSRF,
// audited, re-authentication for dangerous changes) and what the website,
// the server and Claude do with it: banner, maintenance, legal pages, the
// config-conflict sentence, uploads checked by their bytes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from '../round-c4/helpers';
import { person } from '../round-c3/helpers';
import {
  bannerFor,
  c5,
  checkSiteContent,
  defaultConfig,
  hindiMissing,
  legalPage,
  maintenanceFor,
  navOf,
  paragraphs,
  safeHref,
  type PlatformConfig,
} from '../../src/platform-config';

let c: C4;
beforeAll(async () => {
  c = await startC4((cfg) => {
    cfg.workspace.ownerEmails = ['owner-acc@example.com'];
  });
}, 60_000);
afterAll(() => c?.close());

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360f8cf00000301010018dd8db40000000049454e44ae426082',
  'hex',
);
const site = async () =>
  (await c.owner('GET', '/api/site')).body as {
    version: number;
    brand: PlatformConfig['brand'];
    site: PlatformConfig['site'];
    hindiMissing: string[];
    history: { version: number }[];
    legalHistory: Record<string, { version: number }[]>;
  };
const live = async () =>
  (await c.s.api('/v1/config')).body.config as PlatformConfig;

describe('[RDC5-004] brand and sections', () => {
  it('[RDC5-004] a brand change (tagline, colour, favicon) saves as one config version the website reads at once; a new brand name asks for the password and code; HTML in a text is refused; a section added, copied and hidden is what the live config holds', async () => {
    const s0 = await site();
    const brand = {
      ...s0.brand,
      tagline: { en: 'Films from a sentence', hi: 'एक वाक्य से फ़िल्में' },
      colors: { ...s0.brand.colors, accent: '#ff5500' },
      faviconUrl: '/favicon-c5.png',
    };
    const sections = [
      ...s0.site.sections,
      {
        id: 'about',
        kind: 'text',
        enabled: true,
        title: { en: 'About us', hi: 'हमारे बारे में' },
        items: [],
        order: 9,
      },
      {
        id: 'about-2',
        kind: 'text',
        enabled: false,
        title: { en: 'About us', hi: 'हमारे बारे में' },
        items: [],
        order: 10,
      },
    ];
    const saved = await c.owner('POST', '/api/site', {
      body: {
        brand,
        site: { ...s0.site, sections },
        note: 'tagline',
        baseVersion: s0.version,
      },
    });
    expect(saved.status).toBe(200);
    const cfg = await live();
    expect(cfg.brand.tagline?.hi).toBe('एक वाक्य से फ़िल्में');
    expect(cfg.brand.colors.accent).toBe('#ff5500');
    expect(cfg.brand.faviconUrl).toBe('/favicon-c5.png');
    expect(cfg.site.sections.map((x) => x.id)).toContain('about-2');
    expect(cfg.site.sections.find((x) => x.id === 'about-2')!.enabled).toBe(
      false,
    );
    // A new name is dangerous: the code is asked for, nothing changes.
    const s1 = await site();
    const named = await c.owner('POST', '/api/site', {
      body: {
        brand: { ...s1.brand, name: 'Kahani' },
        site: s1.site,
        baseVersion: s1.version,
      },
    });
    expect(named.status).toBe(403);
    expect(named.body.reauth).toBe(true);
    expect((await live()).brand.name).not.toBe('Kahani');
    const ok = await c.owner('POST', '/api/site', {
      body: {
        brand: { ...s1.brand, name: 'Kahani' },
        site: s1.site,
        baseVersion: s1.version,
      },
      reauth: true,
    });
    expect(ok.status).toBe(200);
    expect((await live()).brand.name).toBe('Kahani');
    // Plain text only.
    const s2 = await site();
    const bad = await c.owner('POST', '/api/site', {
      body: {
        brand: {
          ...s2.brand,
          tagline: { en: '<script>alert(1)</script>' },
        },
        site: s2.site,
        baseVersion: s2.version,
      },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('write plain text');
    expect(c.audit().some((r) => r.action === 'site save' && r.ok)).toBe(true);
  });
});

describe('[RDC5-005] banner', () => {
  it('[RDC5-005] the banner shows only on its surfaces and inside its dates; an end before its start and a non-https link are refused; a save that changes it bumps its version so a closed banner shows again', async () => {
    const s0 = await site();
    const banner = {
      enabled: true,
      text: { en: 'New voices this week', hi: 'इस हफ़्ते नई आवाज़ें' },
      link: '#/styles',
      color: 'success' as const,
      where: ['website' as const, 'panel' as const],
      start: '2026-01-01T00:00:00.000Z',
      end: '2099-01-01T00:00:00.000Z',
      dismissible: true,
      version: 1,
    };
    const bad1 = await c.owner('POST', '/api/site', {
      body: {
        brand: s0.brand,
        site: {
          ...s0.site,
          banner: { ...banner, end: '2025-01-01T00:00:00.000Z' },
        },
        baseVersion: s0.version,
      },
    });
    expect(bad1.status).toBe(400);
    expect(bad1.body.error).toContain(
      'Banner: the end must be after the start.',
    );
    const bad2 = await c.owner('POST', '/api/site', {
      body: {
        brand: s0.brand,
        site: { ...s0.site, banner: { ...banner, link: 'http://x.example' } },
        baseVersion: s0.version,
      },
    });
    expect(bad2.status).toBe(400);
    expect(bad2.body.error).toContain('must start with https://');
    const good = await c.owner('POST', '/api/site', {
      body: {
        brand: s0.brand,
        site: { ...s0.site, banner },
        baseVersion: s0.version,
      },
    });
    expect(good.status).toBe(200);
    const cfg = await live();
    const v1 = cfg.site.banner!.version;
    expect(bannerFor(cfg.site, 'panel', Date.parse('2030-01-01'))!.key).toBe(
      `aive.banner.closed.${v1}`,
    );
    expect(bannerFor(cfg.site, 'panel', Date.parse('2025-06-01'))).toBeNull();
    expect(bannerFor(cfg.site, 'website', Date.parse('2100-01-01'))).toBeNull();
    const s1 = await site();
    await c.owner('POST', '/api/site', {
      body: {
        brand: s1.brand,
        site: {
          ...s1.site,
          banner: { ...s1.site.banner!, text: { en: 'Changed', hi: 'बदला' } },
        },
        baseVersion: s1.version,
      },
    });
    expect((await live()).site.banner!.version).toBe(v1 + 1);
  });
});

describe('[RDC5-006] maintenance', () => {
  it("[RDC5-006] maintenance on asks for the password and code; then a person's new writes and Claude's write tools are refused with the owner's sentence (503), reads still work, a running export is still counted, the owner's own account and the admin are never locked out; the editor's check reads it; off again, all works", async () => {
    const someone = await person(c.s, 'c5-person');
    const owner = c.s.token('c5-owner', { email: 'owner-acc@example.com' });
    const s0 = await site();
    const on = {
      ...s0.site,
      maintenance: { on: true, covers: ['website', 'panel', 'editor'] },
    };
    const needs = await c.owner('POST', '/api/site', {
      body: { brand: s0.brand, site: on, baseVersion: s0.version },
    });
    expect(needs.status).toBe(403);
    const ok = await c.owner('POST', '/api/site', {
      body: { brand: s0.brand, site: on, baseVersion: s0.version },
      reauth: true,
    });
    expect(ok.status).toBe(200);
    const claim = await c.s.api('/v1/workspace/claim', {
      token: someone.token,
      body: { kind: 'project', id: 'pr-c5' },
    });
    expect(claim.status).toBe(503);
    expect(claim.body.error.message).toBe(c5('maintenance-refused'));
    // Reads and running work go on.
    expect((await c.s.api('/v1/me', { token: someone.token })).status).toBe(
      200,
    );
    const exportCount = await c.s.api('/v1/exports', {
      token: someone.token,
      body: { kind: 'webm' },
    });
    expect(exportCount.status, JSON.stringify(exportCount.body)).toBe(200);
    // The owner's own account is not locked out.
    const mine = await c.s.api('/v1/workspace/claim', {
      token: owner,
      body: { kind: 'project', id: 'pr-c5-owner' },
    });
    expect(mine.status).not.toBe(503);
    // Claude: reads work, writes are refused with the same sentence.
    const read = await c.s.call(someone.client, 'list_projects', {});
    expect(read.isError).toBe(false);
    const write = await c.s.call(someone.client, 'create_project', {
      name: 'During maintenance',
    });
    expect(write.isError).toBe(true);
    expect(write.text).toBe(c5('maintenance-refused'));
    // The editor's question before a cloud save.
    const m = await c.s.api('/v1/maintenance');
    expect(m.body).toEqual({
      on: true,
      message: c5('maintenance-refused'),
      messageHi: c5('maintenance-refused', 'hi'),
    });
    // The Owner App keeps working (admin is never locked out).
    const s1 = await site();
    const off = await c.owner('POST', '/api/site', {
      body: {
        brand: s1.brand,
        site: {
          ...s1.site,
          maintenance: { ...s1.site.maintenance!, on: false },
        },
        baseVersion: s1.version,
      },
    });
    expect(off.status).toBe(200);
    expect((await c.s.api('/v1/maintenance')).body.on).toBe(false);
    expect(
      (
        await c.s.api('/v1/workspace/claim', {
          token: someone.token,
          body: { kind: 'project', id: 'pr-c5' },
        })
      ).status,
    ).not.toBe(503);
  });
});

describe('[RDC5-007] legal pages', () => {
  it('[RDC5-007] a legal page is saved with a version and date, its last 10 versions are kept, a rollback (password and code) makes a new version with the old text, and only a published page is shown; https links in its text are found, other text stays text', async () => {
    let s0 = await site();
    const page = (body: string) => ({
      id: 'privacy',
      title: { en: 'Privacy', hi: 'गोपनीयता' },
      body: { en: body, hi: `${body} (हिंदी)` },
      version: 1,
      updated: '',
      published: true,
    });
    for (let i = 1; i <= 12; i++) {
      const r = await c.owner('POST', '/api/site', {
        body: {
          brand: s0.brand,
          site: {
            ...s0.site,
            legal: [page(`Text ${i}. See https://example.com/p${i}`)],
          },
          baseVersion: s0.version,
        },
      });
      expect(r.status).toBe(200);
      s0 = await site();
    }
    const now = (await live()).site.legal![0]!;
    expect(now.version).toBe(12);
    expect(now.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s0.legalHistory.privacy!.length).toBe(10);
    expect(s0.legalHistory.privacy![0]!.version).toBe(12);
    const back = await c.owner('POST', '/api/site/legal-rollback', {
      body: { id: 'privacy', version: 5, baseVersion: s0.version },
      reauth: true,
    });
    expect(back.status).toBe(200);
    const after = (await live()).site;
    expect(after.legal![0]!.body.en).toBe('Text 5. See https://example.com/p5');
    expect(after.legal![0]!.version).toBe(13);
    expect(legalPage(after, 'privacy')).not.toBeNull();
    expect(
      legalPage(
        { ...after, legal: [{ ...after.legal![0]!, published: false }] },
        'privacy',
      ),
    ).toBeNull();
    expect(paragraphs('One https://a.example/x two.\n\nThird')).toEqual([
      [
        { text: 'One ' },
        { text: 'https://a.example/x', href: 'https://a.example/x' },
        { text: ' two.' },
      ],
      [{ text: 'Third' }],
    ]);
  });
});

describe('[RDC5-008] two Admin tabs', () => {
  it('[RDC5-008] two Admin tabs save the same config: the second one, edited from an older version, is refused with the config-conflict sentence and nothing of it is saved', async () => {
    const s0 = await site();
    const a = await c.owner('POST', '/api/site', {
      body: {
        brand: { ...s0.brand, tagline: { en: 'Tab A' } },
        site: s0.site,
        baseVersion: s0.version,
      },
    });
    expect(a.status).toBe(200);
    const b = await c.owner('POST', '/api/site', {
      body: {
        brand: { ...s0.brand, tagline: { en: 'Tab B' } },
        site: s0.site,
        baseVersion: s0.version,
      },
    });
    expect(b.status).toBe(409);
    expect(b.body.error).toBe(c5('config-conflict'));
    expect((await live()).brand.tagline?.en).toBe('Tab A');
  });
});

describe('[RDC5-009] uploads', () => {
  it('[RDC5-009] uploads are checked by their bytes: a real PNG is stored; a renamed .exe as .mp4, an SVG and a text file are refused with the wrong-type sentence; a picture over the limit gets the too-big sentence with both sizes', async () => {
    const ok = await c.owner(
      'POST',
      '/api/site/upload?kind=image&name=logo.png',
      {
        raw: PNG,
        name: 'logo.png',
      },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/\/files\/[0-9a-f]{64}\.png$/);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
    const fake = await c.owner(
      'POST',
      '/api/site/upload?kind=video&name=movie.mp4',
      {
        raw: exe,
        name: 'movie.mp4',
      },
    );
    expect(fake.status).toBe(415);
    expect(fake.body.error).toBe(
      c5('upload-wrong-type', 'en', { types: 'MP4 or WebM' }),
    );
    const svg = await c.owner(
      'POST',
      '/api/site/upload?kind=image&name=logo.svg',
      {
        raw: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
        ),
        name: 'logo.svg',
      },
    );
    expect(svg.status).toBe(415);
    const huge = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const big = await c.owner(
      'POST',
      '/api/site/upload?kind=image&name=huge.png',
      {
        raw: huge,
        name: 'huge.png',
      },
    );
    expect(big.status).toBe(413);
    expect(big.body.error).toBe(
      c5('upload-too-big', 'en', { size: '3 MB', limit: '2 MB' }),
    );
  });
});

describe('[RDC5-010] Hindi and checks (DOM-free)', () => {
  it("[RDC5-010] texts with English and no Hindi are listed for the warning; the default config has none; the checks refuse markup, unsafe links and a showcase video without a poster; navOf keeps today's one header link by default", () => {
    const d = defaultConfig();
    expect(hindiMissing(d)).toEqual([]);
    expect(checkSiteContent(d)).toEqual([]);
    expect(navOf(d.site).map((l) => l.href)).toEqual(['#/claude']);
    const x = structuredClone(d);
    x.brand.tagline = { en: 'Only English' };
    x.site.banner = {
      enabled: true,
      text: { en: 'Hi' },
      color: 'info',
      where: ['website'],
      dismissible: true,
      version: 1,
    };
    expect(hindiMissing(x)).toEqual(['Tagline', 'Banner']);
    x.site.showcase = [
      {
        id: 'a',
        title: { en: 'A' },
        videoUrl: 'https://v.example/a.mp4',
        posterUrl: '',
      },
    ];
    expect(checkSiteContent(x)).toContain(c5('video-needs-poster'));
    expect(safeHref('javascript:alert(1)')).toBe(false);
    expect(safeHref('//evil.example')).toBe(false);
    expect(safeHref('https://ok.example/a')).toBe(true);
    expect(safeHref('#/legal/terms')).toBe(true);
    expect(maintenanceFor(d.site, 'panel')).toBeNull();
  });
});

describe('[RDC5-011] owner-only routes', () => {
  it('[RDC5-011] every new route refuses a caller with no session (401) and a stale CSRF token (403), and a normal user token is not an Owner App session', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/site'],
      ['POST', '/api/site'],
      ['POST', '/api/site/rollback'],
      ['POST', '/api/site/legal-rollback'],
      ['POST', '/api/site/upload?kind=image&name=a.png'],
      ['GET', '/api/appearance'],
      ['POST', '/api/appearance'],
      ['POST', '/api/appearance/upload?name=a.png'],
      ['POST', '/api/appearance/cleanup'],
      ['GET', '/api/access'],
      ['POST', '/api/access/plans'],
      ['POST', '/api/access/features'],
      ['POST', '/api/access/override'],
      ['POST', '/api/access/cohort'],
      ['GET', '/api/access/who?feature=x'],
    ];
    for (const [m, u] of routes) {
      const body = m === 'GET' ? {} : { body: {} };
      const none = await c.owner(m, u, { cookie: null, ...body });
      expect(none.status, `${m} ${u}`).toBe(401);
      const userToken = await fetch(`${c.ownerBase}${u}`, {
        method: m,
        headers: {
          origin: c.ownerBase,
          authorization: `Bearer ${c.s.token('someone')}`,
        },
      });
      expect(userToken.status, `${m} ${u} token`).toBe(401);
      if (m !== 'GET') {
        const stale = await c.owner(m, u, { csrf: 'stale', ...body });
        expect(stale.status, `${m} ${u} csrf`).toBe(403);
      }
    }
  });
});
