// ROUND-C3 Part 0.3 (RDC3-005): OAuth consents and codes live in the store,
// so a server restart ends neither; a consent lasts 30 minutes, a code 5
// minutes and is used once; expired ones are swept; codes are kept by hash.
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileStore } from '../../server/store';
import { createOAuth } from '../../server/mcp/oauth';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
let dir = '';
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function server(file: string, clock: { t: number }) {
  return createOAuth({
    store: fileStore(file),
    now: () => clock.t,
    secret: () => 'round-c3-secret-0123456789abcdef',
    testMode: () => false,
  });
}
async function start(o: ReturnType<typeof createOAuth>) {
  const reg = (await o.register({
    client_name: 'Claude',
    redirect_uris: [CALLBACK],
  })) as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: reg.client_id,
    redirect_uri: CALLBACK,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: 's',
  });
  return { id: await o.authorize(q), clientId: reg.client_id, verifier };
}
const tokenForm = (code: string, h: { clientId: string; verifier: string }) =>
  new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CALLBACK,
    client_id: h.clientId,
    code_verifier: h.verifier,
  });

describe('[RDC3-005] OAuth consents and codes in the store', () => {
  it('[RDC3-005] a restart keeps an open consent (30 minutes) and an issued code; a code works once, is stored only as a hash, and expired grants are swept', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'c3-oauth-'));
    const file = path.join(dir, 'data.json');
    const clock = { t: Date.parse('2026-11-16T10:00:00Z') };
    const h = await start(server(file, clock));
    // The server restarts while the person signs up and confirms the email.
    clock.t += 25 * 60_000;
    const after = server(file, clock);
    expect(await after.consentInfo(h.id)).toEqual({
      client: 'Claude',
      redirectHost: 'claude.ai',
    });
    const back = new URL(await after.consent(h.id, 'u-1', true));
    const code = back.searchParams.get('code')!;
    // The consent is single use.
    await expect(after.consent(h.id, 'u-1', true)).rejects.toThrow(/expired/);
    expect(readFileSync(file, 'utf8')).not.toContain(code);
    // Restart again before the token call: the code still works, once.
    const third = server(file, clock);
    const tok = (await third.token(tokenForm(code, h))) as {
      access_token: string;
    };
    expect(tok.access_token).toMatch(/^mcpa\./);
    await expect(server(file, clock).token(tokenForm(code, h))).rejects.toThrow(
      /used/,
    );
    // A consent left past 30 minutes has ended, and is swept.
    const late = await start(third);
    clock.t += 31 * 60_000;
    const fourth = server(file, clock);
    expect(await fourth.consentInfo(late.id)).toBeNull();
    await start(fourth); // any new authorize sweeps
    await new Promise((r) => setTimeout(r, 20));
    const data = JSON.parse(readFileSync(file, 'utf8')) as {
      mcpGrants?: Record<string, unknown>;
    };
    expect(Object.keys(data.mcpGrants ?? {})).not.toContain(
      `consent-${late.id}`,
    );
  });
  it('[RDC3-005] a code past its 5 minutes is refused', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'c3-oauth-'));
    const file = path.join(dir, 'data.json');
    const clock = { t: Date.parse('2026-11-16T10:00:00Z') };
    const o = server(file, clock);
    const h = await start(o);
    const code = new URL(await o.consent(h.id, 'u-1', true)).searchParams.get(
      'code',
    )!;
    clock.t += 6 * 60_000;
    await expect(o.token(tokenForm(code, h))).rejects.toThrow(/not valid/);
  });
});
