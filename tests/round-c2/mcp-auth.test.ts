// ROUND-C2 Part 2: the connector's endpoint, OAuth 2.1, the switches, the
// tool annotations and the one manual. The SDK client plays Claude against
// the server in this process.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildManual } from '../../src/director-rules/manual';
import { REFERENCES } from '../../src/director-rules/references.gen';
import { defaultConfig, platformConfigSchema } from '../../src/platform-config';
import { planPrompt } from '../../src/director/llm-planner';
import { referencesSource } from '../../scripts/mcp-references.mjs';
import { CHAPTERS, chapterDoc } from '../../scripts/creator-playbook-docs.mjs';
import { CALLBACK, startC2, type C2 } from './helpers';

let s: C2;
beforeAll(async () => {
  s = await startC2();
});
afterAll(() => s.close());

const form = (url: string, body: Record<string, string>) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
const register = async (uris = [CALLBACK]) =>
  fetch(`${s.url}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: uris }),
  });
async function codeFor(person: string, clientId: string, redirect = CALLBACK) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
  });
  const auth = await fetch(`${s.url}/oauth/authorize?${q}`, {
    redirect: 'manual',
  });
  const request = /request=([0-9a-f-]+)/.exec(
    auth.headers.get('location') ?? '',
  )?.[1];
  const ok = await s.api('/v1/mcp/consent', {
    token: s.token(person),
    body: { request, allow: true },
  });
  return {
    verifier,
    code: new URL(ok.body.redirect as string).searchParams.get('code')!,
  };
}

describe('[RDC2-002] the endpoint', () => {
  it('[RDC2-002] POST /mcp is stateless (no session id); GET and DELETE answer 405; without a token 401 with resource_metadata', async () => {
    const { access } = await s.connect('person-ep');
    const client = await s.claude(access);
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(20);
    // A second client works the same (no session kept between requests).
    const again = await s.claude(access);
    expect((await again.listTools()).tools.length).toBe(tools.tools.length);
    for (const method of ['GET', 'DELETE']) {
      const r = await fetch(`${s.url}/mcp`, {
        method,
        headers: { authorization: `Bearer ${access}` },
      });
      expect(r.status).toBe(405);
    }
    const none = await fetch(`${s.url}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toMatch(
      /Bearer resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/,
    );
    const r = await fetch(`${s.url}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('mcp-session-id')).toBeNull();
    await client.close();
    await again.close();
  });
});

describe('[RDC2-003] OAuth 2.1', () => {
  it('[RDC2-003] metadata, registration, code + PKCE S256, tokens hashed in the store, refresh rotates', async () => {
    const pr = await (
      await fetch(`${s.url}/.well-known/oauth-protected-resource/mcp`)
    ).json();
    expect(pr).toMatchObject({
      resource: `${s.url}/mcp`,
      authorization_servers: [s.url],
      scopes_supported: ['mcp'],
    });
    const as = await (
      await fetch(`${s.url}/.well-known/oauth-authorization-server`)
    ).json();
    expect(as).toMatchObject({
      issuer: s.url,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
    expect(as.scopes_supported).toContain('offline_access');
    const { access, refresh, clientId } = await s.connect('person-oauth');
    expect(access).toMatch(/^mcpa\./);
    const rows = await s.store.mcpConnections();
    const row = rows.find((c) => c.clientId === clientId)!;
    expect(row.userId).toBe('person-oauth');
    // Only hashes are stored.
    expect(JSON.stringify(rows)).not.toContain(access);
    expect(JSON.stringify(rows)).not.toContain(refresh);
    const r1 = await form(`${s.url}/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
    });
    expect(r1.status).toBe(200);
    const t1 = (await r1.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(t1.refresh_token).not.toBe(refresh);
    // The old refresh token is gone (rotation), with invalid_grant.
    const r2 = await form(`${s.url}/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: refresh,
    });
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { error: string }).error).toBe(
      'invalid_grant',
    );
    // The new access token works; the old one no longer does.
    expect(
      (await (await s.claude(t1.access_token)).listTools()).tools.length,
    ).toBeGreaterThan(5);
    await expect(s.claude(access)).rejects.toThrow();
  });
  it('[RDC2-003] the consent page data names the client and the redirect host; Cancel sends access_denied back', async () => {
    const reg = (await (await register()).json()) as { client_id: string };
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: CALLBACK,
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
      state: 's1',
    });
    const auth = await fetch(`${s.url}/oauth/authorize?${q}`, {
      redirect: 'manual',
    });
    expect(auth.status).toBe(302);
    expect(auth.headers.get('location')).toMatch(
      /\/panel\/#\/connect-claude\?request=/,
    );
    const request = /request=([0-9a-f-]+)/.exec(
      auth.headers.get('location')!,
    )![1];
    const info = await s.api(`/v1/mcp/consent?request=${request}`, {
      token: s.token('p-consent'),
    });
    expect(info.body).toEqual({ client: 'Claude', redirectHost: 'claude.ai' });
    const no = await s.api('/v1/mcp/consent', {
      token: s.token('p-consent'),
      body: { request, allow: false },
    });
    expect(no.body.redirect).toBe(`${CALLBACK}?state=s1&error=access_denied`);
    // The request is used up.
    const again = await s.api('/v1/mcp/consent', {
      token: s.token('p-consent'),
      body: { request, allow: true },
    });
    expect(again.status).toBe(400);
  });
});

describe('[RDC2-004] OAuth refusals', () => {
  it('[RDC2-004] a wrong redirect URI, a replayed code, a wrong PKCE verifier, an expired and a revoked token are refused; the token refusal is one sentence asking to reconnect', async () => {
    // Registration with a foreign redirect is refused.
    const bad = await register(['https://evil.example/cb']);
    expect(bad.status).toBe(400);
    const reg = (await (await register()).json()) as { client_id: string };
    // Authorize with a redirect that is not registered: a plain 400, never a redirect.
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: 'https://evil.example/cb',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    });
    const a = await fetch(`${s.url}/oauth/authorize?${q}`, {
      redirect: 'manual',
    });
    expect(a.status).toBe(400);
    expect(a.headers.get('location')).toBeNull();
    // Wrong verifier.
    const one = await codeFor('p-refuse', reg.client_id);
    const wrong = await form(`${s.url}/oauth/token`, {
      grant_type: 'authorization_code',
      code: one.code,
      redirect_uri: CALLBACK,
      client_id: reg.client_id,
      code_verifier: randomBytes(32).toString('base64url'),
    });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toBe(
      'invalid_grant',
    );
    // Replayed code: the first use works, the second is refused and ends it.
    const two = await codeFor('p-refuse', reg.client_id);
    const body = {
      grant_type: 'authorization_code',
      code: two.code,
      redirect_uri: CALLBACK,
      client_id: reg.client_id,
      code_verifier: two.verifier,
    };
    const first = await form(`${s.url}/oauth/token`, body);
    expect(first.status).toBe(200);
    const token = ((await first.json()) as { access_token: string })
      .access_token;
    const replay = await form(`${s.url}/oauth/token`, body);
    expect(replay.status).toBe(400);
    const refused = await fetch(`${s.url}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(refused.status).toBe(401);
    expect(
      ((await refused.json()) as { error: { message: string } }).error.message,
    ).toMatch(/Ask the person to connect it again/);
    // Revoked (RFC 7009) and from Door 4.
    const live = await s.connect('p-revoke');
    expect(
      (await form(`${s.url}/oauth/revoke`, { token: live.refresh })).status,
    ).toBe(200);
    await expect(s.claude(live.access)).rejects.toThrow();
    const live2 = await s.connect('p-revoke');
    const list = await s.api('/v1/mcp/connections', {
      token: s.token('p-revoke'),
    });
    expect(list.body.connections).toHaveLength(1);
    await s.api('/v1/mcp/connections/revoke', {
      token: s.token('p-revoke'),
      body: {},
    });
    await expect(s.claude(live2.access)).rejects.toThrow();
    // Expired: the access token's time has passed.
    const old = await s.connect('p-expired');
    const rows = await s.store.mcpConnections('p-expired');
    await s.store.saveMcpConnection({
      ...rows[0]!,
      accessExp: Date.now() - 1000,
    });
    const exp = await fetch(`${s.url}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${old.access}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(exp.status).toBe(401);
  });
});

describe('[RDC2-005] the developer token', () => {
  it('[RDC2-005] works only when MCP_DEV_TOKEN is set, and never with AUTH_MODE=supabase unless explicitly allowed', async () => {
    const tok = 'dev-token-0123456789abcdef';
    const call = (url: string) =>
      fetch(`${url}/mcp`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tok}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
    expect((await call(s.url)).status).toBe(401);
    const on = await startC2({ MCP_DEV_TOKEN: tok });
    expect((await call(on.url)).status).toBe(200);
    await on.close();
    // A Supabase build: the env alone is not enough.
    const { createMcpMount } = await import('../../server/mcp/mount');
    const hosted = createMcpMount({
      env: { AUTH_MODE: 'supabase', MCP_DEV_TOKEN: tok },
      now: Date.now,
      store: s.store,
      config: async () => defaultConfig(),
      authenticate: async () => {
        throw new Error('no');
      },
      services: {} as never,
    });
    const res = {
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      statusCode: 0,
      end() {},
    };
    await expect(
      hosted.handle(
        {
          method: 'POST',
          headers: { authorization: `Bearer ${tok}` },
          url: '/mcp',
        } as never,
        res as never,
        '/mcp',
      ),
    ).rejects.toThrow(/not connected|connect it again/);
  });
});

describe('[RDC2-006] tool annotations', () => {
  it('[RDC2-006] every tool has a title, the four safety hints, and a description that says what it does, when to use it and what comes next', async () => {
    await s.publish((c) => {
      c.mcp.proofTools = true;
    });
    const { access } = await s.connect('person-ann');
    const tools = (await (await s.claude(access)).listTools()).tools;
    const names = tools.map((t) => t.name);
    for (const n of [
      'start_here',
      'get_reference',
      'get_credits',
      'list_projects',
      'create_project',
      'list_videos',
      'create_video',
      'get_brief_fields',
      'save_brief',
      'search_media',
      'search_web',
      'fetch_page',
      'list_library',
      'import_media',
      'validate_plan',
      'submit_plan',
      'get_plan_cost',
      'approve_plan',
      'edit_video',
      'read_video',
      'check_video',
      'read_memory',
      'update_video_sheet',
      'export_video',
      'export_done',
      'submit_frames',
      'get_frames',
      'proof_export_card',
    ])
      expect(names).toContain(n);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.annotations?.title).toBe(t.title);
      for (const k of [
        'readOnlyHint',
        'destructiveHint',
        'idempotentHint',
        'openWorldHint',
      ])
        expect(
          typeof (t.annotations as Record<string, unknown>)[k],
          `${t.name}.${k}`,
        ).toBe('boolean');
      expect(t.description, t.name).toMatch(
        /\. Use only when the user is making, editing or exporting a video with this platform\. Next: /,
      );
    }
    // The card's tools are app-only; export_video shows the card.
    const meta = (n: string) =>
      (tools.find((t) => t.name === n)!._meta ?? {}) as {
        ui?: { visibility?: string[]; resourceUri?: string };
      };
    expect(meta('submit_frames').ui?.visibility).toEqual(['app']);
    expect(meta('export_done').ui?.visibility).toEqual(['app']);
    expect(meta('export_video').ui?.resourceUri).toBe(
      'ui://aive/export-card.html',
    );
    await s.publish(() => {});
  });
});

describe('[RDC2-007] one manual for both Directors', () => {
  it('[RDC2-007] start_here returns buildManual byte for byte, and the Director plan prompt carries the same text; an Admin edit changes both', async () => {
    const config = defaultConfig();
    config.mediaProviders = config.mediaProviders; // published copy below
    const { access } = await s.connect('person-manual');
    const client = await s.claude(access);
    const live = (await s.api('/v1/config')).body; // public copy
    void live;
    const here = await s.call(client, 'start_here', {
      video_type: 'explainer',
    });
    const published = (await s.api('/v1/config', { token: s.admin })).body
      .config;
    const parsed = platformConfigSchema.parse(published);
    const balance = (
      await s.api('/v1/balance', { token: s.token('person-manual') })
    ).body.balance as number;
    const plan = parsed.plans.find((p) => p.id === 'free') ?? parsed.plans[0]!;
    const manual = buildManual(parsed, {
      // ROUND-C3: start_here is Claude's view of the one manual.
      for: 'claude',
      videoType: 'explainer',
      person: {
        planName: plan.name.en,
        credits: balance,
        limits: {
          exportsPerMonth: plan.limits.exportsPerMonth,
          maxExportHeight: plan.limits.maxExportHeight,
          projects: plan.limits.projects,
          videosPerProject: plan.limits.videosPerProject,
        },
      },
    });
    expect(here.text).toBe(manual);
    // Without the person part (the Director plans before a person is known),
    // the Director's prompt holds exactly buildManual(config, type).
    const style = parsed.styles[0]!;
    const prompt = planPrompt({
      config: parsed,
      style,
      answers: {},
      notes: [],
      plan,
      locale: 'en',
      videoType: 'explainer',
    });
    expect(prompt.system).toContain(
      buildManual(parsed, { videoType: 'explainer' }),
    );
    // The texts the owner edits reach both.
    expect(manual).toContain(
      'Help only with making, editing and improving videos on AI-Native.',
    );
    expect(manual).toContain('### 03-look-and-feel');
    expect(manual).toContain(
      '(motion-graphics explainer, 9:16 or 16:9, 45 s to 5 min)',
    );
    expect(manual).not.toMatch(/fakestock|Fake Stock|pexels|pixabay/i);
    await s.publish((c) => {
      c.director.rulebook[0]!.en = 'OWNER RULE CHANGED.';
    });
    const again = await s.call(client, 'start_here', {});
    expect(again.text).toContain('- OWNER RULE CHANGED.');
    const p2 = planPrompt({
      config: platformConfigSchema.parse(
        (await s.api('/v1/config', { token: s.admin })).body.config,
      ),
      style,
      answers: {},
      notes: [],
      plan,
      locale: 'en',
    });
    expect(p2.system).toContain('- OWNER RULE CHANGED.');
    await s.publish(() => {});
  });
});

describe('[RDC2-008] references and docs are generated, not copied', () => {
  it('[RDC2-008] get_reference serves the docs as generated; docs/creator-playbook 01 to 06 equal the config defaults', async () => {
    const want = referencesSource();
    expect(readFileSync('src/director-rules/references.gen.ts', 'utf8')).toBe(
      want,
    );
    expect(REFERENCES['plan-format']).toBe(
      readFileSync('docs/video-plan.md', 'utf8'),
    );
    for (const [id, title] of CHAPTERS)
      expect(readFileSync(`docs/creator-playbook/${id}.md`, 'utf8')).toBe(
        chapterDoc(id, title),
      );
    const { access } = await s.connect('person-ref');
    const r = await s.call(await s.claude(access), 'get_reference', {
      topic: 'camera',
    });
    expect(r.text).toBe(
      readFileSync('docs/camera.md', 'utf8').replaceAll(
        '[platform]',
        'AI-Native',
      ),
    );
  });
});

describe('[RDC2-009] Platform Config: mcp, creator playbook and the TEXTS', () => {
  it('[RDC2-009] old configs parse with defaults; the rulebook keeps old ids and adds T1 (at most 60, 600 chars); playbooks, chapters and the authoring guide are the TEXTS', () => {
    const c = defaultConfig();
    expect(c.mcp).toEqual({
      enabled: true,
      proofTools: false,
      tools: {},
      exportMaxSeconds: 120,
      ratePerMinute: 60,
      // ROUND-C3 (2.4, 4.4): added with defaults.
      addMediaMaxMb: 8,
      importMaxMb: 200,
      whatsNew: '',
    });
    expect(Object.keys(c.director.creatorPlaybook)).toEqual([
      '01-audience-and-goal',
      '02-story-and-script',
      '03-look-and-feel',
      '04-media-and-sound',
      '05-camera-and-motion',
      '06-review-and-publish',
    ]);
    const ids = c.director.rulebook.map((r) => r.id);
    for (const old of [
      'never-refuse-makeable',
      'design-new',
      'check-layout',
      'providers-by-kind',
      'no-code-to-user',
      'what-to-say',
      'tier-order',
    ])
      expect(ids).toContain(old);
    expect(ids.slice(0, 3)).toEqual([
      'scope',
      'free-talk',
      'restate-before-cost',
    ]);
    expect(ids.length).toBeLessThanOrEqual(60);
    expect(c.director.rulebook.every((r) => r.en.length <= 600)).toBe(true);
    expect(c.director.rulebook.find((r) => r.id === 'tier-order')!.en).toMatch(
      /^For a new graphic use Tier A/,
    );
    expect(c.director.authoring.guide).toMatch(
      /^You may define new graphics inside a plan/,
    );
    expect(c.director.playbooks.story).toBe(
      readFileSync(
        'docs/creator-playbook/08-story-comic-explainer.md',
        'utf8',
      ).trim(),
    );
    // A config saved before Round C2 (no mcp, no creatorPlaybook) still parses.
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown> & {
      director: Record<string, unknown>;
    };
    delete old.mcp;
    delete old.director.creatorPlaybook;
    const parsed = platformConfigSchema.parse(old);
    expect(parsed.mcp.enabled).toBe(true);
    expect(Object.keys(parsed.director.creatorPlaybook)).toHaveLength(6);
    // Limits are enforced.
    const bad = JSON.parse(JSON.stringify(c));
    bad.director.creatorPlaybook['01-audience-and-goal'] = 'x'.repeat(20001);
    expect(platformConfigSchema.safeParse(bad).success).toBe(false);
  });
});
