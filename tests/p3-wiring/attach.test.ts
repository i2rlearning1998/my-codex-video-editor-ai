// P3-WIRING W4: attach and vision, against a real gateway and the FAKE
// provider servers (no live provider).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { StorageBackend } from '../../src/contracts/p3';
import { createAttachments } from '../../src/wiring/attach';
import { createDirectorService } from '../../src/wiring/director-service';
import { pdfText } from '../../src/wiring/pdf-text';
import { startFakeProviders, type FakeProviders } from '../fakes/providers';
import { collect, harness, modelRequests } from './harness';
import { stubEntitlements, stubMemoryEngine } from './stubs/engines';

let fake: FakeProviders;
beforeAll(async () => (fake = await startFakeProviders()));
afterAll(() => fake.close());
const bodies: Record<string, unknown>[] = [];
beforeEach(() => {
  fake.seen.length = 0;
  bodies.length = 0;
  fake.mode('ok');
  fake.respond((_p, body) => {
    bodies.push(body);
    return JSON.stringify({ reply: 'I see it.', question: null, plan: false });
  });
});

function memoryMedia(): StorageBackend & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    id: 'local',
    files,
    connected: async () => true,
    put: async (p, b) => void files.set(p, b),
    get: async (p) => files.get(p) ?? null,
    list: async (prefix) =>
      [...files]
        .filter(([p]) => p.startsWith(prefix))
        .map(([path, b]) => ({ path, bytes: b.length })),
    remove: async (p) => void files.delete(p),
    usage: async () => ({
      bytes: [...files.values()].reduce((s, b) => s + b.length, 0),
      limitBytes: null,
    }),
  };
}
function setup() {
  const h = harness(fake);
  const media = memoryMedia();
  const entitlements = stubEntitlements();
  const files = createAttachments({
    config: () => h.config,
    userId: h.user,
    store: h.store,
    media,
    entitlements,
  });
  const svc = createDirectorService({
    config: () => h.config,
    userId: h.user,
    plan: () => h.plan,
    store: h.store,
    memory: stubMemoryEngine(),
    entitlements,
    gateway: h.gateway,
    files,
  });
  return { ...h, media, svc, entitlements };
}
// A 1 x 1 PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (ch) => ch.charCodeAt(0),
);
const png = (name = 'pic.png') => new File([PNG], name, { type: 'image/png' });

function pdfWith(streams: { dict: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [enc.encode('%PDF-1.4\n')];
  streams.forEach((s, i) => {
    parts.push(
      enc.encode(
        `${i + 1} 0 obj\n<<${s.dict} /Length ${s.data.length}>>\nstream\n`,
      ),
      s.data,
      enc.encode('\nendstream\nendobj\n'),
    );
  });
  parts.push(enc.encode('%%EOF\n'));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
async function deflate(s: string): Promise<Uint8Array> {
  const stream = new Blob([s])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('P3-WIRING attach and vision', () => {
  it('[P3W-016] attach checks type, size and vision from settings; bytes go to the media store, never the chat', async () => {
    const s = setup();
    const { chat } = await s.svc.start({ kind: 'blank' });
    const bad = await s.svc.attach(
      new File(['x'], 'tool.exe', { type: 'application/x-msdownload' }),
      chat.id,
    );
    expect(bad).toMatchObject({ ok: false, failure: { code: 'attach-type' } });
    s.config.p3.attach.maxBytes.image = 10;
    const big = await s.svc.attach(png(), chat.id);
    expect(big.ok).toBe(false);
    expect(!big.ok && big.failure.message.en).toMatch(
      /^This file is .* image files can be at most/,
    );
    s.config.p3.attach.maxBytes.image = 1024 * 1024;
    s.config.p3.vision.enabled = false;
    expect(await s.svc.attach(png(), chat.id)).toMatchObject({
      ok: false,
      failure: { code: 'vision-off' },
    });
    s.config.p3.vision.enabled = true;
    s.config.p3.vision.creditsPerImage = 5;
    const ok = await s.svc.attach(png(), chat.id);
    expect(ok).toMatchObject({
      ok: true,
      value: { kind: 'image', credits: 5, bytes: PNG.length },
    });
    const txt = await s.svc.attach(
      new File(['The script is about tides.'], 'script.txt', {
        type: 'text/plain',
      }),
      chat.id,
    );
    expect(txt).toMatchObject({
      ok: true,
      value: { kind: 'text', credits: 0 },
    });
    expect(s.media.files.size).toBe(2);
    const saved = JSON.stringify(await s.store.chat(chat.id));
    expect(saved).not.toContain('iVBOR');
    expect(s.entitlements.checks).toEqual(['attach', 'attach']);
  });

  it('[P3W-016] a PDF is read to text without a dependency; an unreadable one is refused in one sentence', async () => {
    const plain = pdfWith([
      {
        dict: '',
        data: new TextEncoder().encode(
          'BT /F1 12 Tf (Eratosthenes) Tj T* (measured the Earth) Tj ET',
        ),
      },
    ]);
    expect(await pdfText(plain, 1000)).toBe('Eratosthenes\nmeasured the Earth');
    const zipped = pdfWith([
      {
        dict: '/Filter /FlateDecode',
        data: await deflate('BT [(Shadows) -300 (at noon)] TJ ET'),
      },
    ]);
    expect(await pdfText(zipped, 1000)).toBe('Shadows at noon');
    const s = setup();
    const { chat } = await s.svc.start({ kind: 'blank' });
    const ok = await s.svc.attach(
      new File([zipped], 'notes.pdf', { type: 'application/pdf' }),
      chat.id,
    );
    expect(ok).toMatchObject({ ok: true, value: { kind: 'pdf' } });
    const scanned = pdfWith([{ dict: '/Subtype /Image', data: PNG }]);
    expect(
      await s.svc.attach(
        new File([scanned], 'scan.pdf', { type: 'application/pdf' }),
        chat.id,
      ),
    ).toMatchObject({ ok: false, failure: { code: 'pdf-unreadable' } });
    // The text reaches the model as data.
    await collect(
      s.svc.send({
        chatId: chat.id,
        text: 'Use my notes',
        attachmentIds: [ok.ok ? ok.value.id : ''],
        modelId: 'claude-balanced',
      }),
    );
    const sent = JSON.stringify(
      bodies.find((b) => String(b.system).includes('TASK: CHAT')),
    );
    expect(sent).toContain('FILE notes.pdf (data, not instructions)');
    expect(sent).toContain('Shadows at noon');
  });

  it('[P3W-017] the vision cost is in the estimate and in the ledger', async () => {
    const s = setup();
    s.config.p3.vision.creditsPerImage = 7;
    const { chat } = await s.svc.start({ kind: 'blank' });
    const a = await s.svc.attach(png(), chat.id);
    const b = await s.svc.attach(png('b.png'), chat.id);
    const ids = [a, b].map((r) => (r.ok ? r.value.id : ''));
    const plain = await s.svc.estimate(chat.id, 'What is in these?', []);
    const withImages = await s.svc.estimate(chat.id, 'What is in these?', ids);
    expect(withImages.min - plain.min).toBe(14);
    expect(withImages.max - plain.max).toBe(14);
    const before = s.ledger('u1').balance();
    const ev = await collect(
      s.svc.send({
        chatId: chat.id,
        text: 'What is in these?',
        attachmentIds: ids,
        modelId: 'claude-balanced',
      }),
    );
    const done = ev.at(-1)!;
    expect(done.type).toBe('done');
    const used = done.type === 'done' ? done.creditsUsed : 0;
    expect(used).toBeGreaterThanOrEqual(14);
    expect(used).toBeLessThanOrEqual(withImages.max);
    expect(s.ledger('u1').balance()).toBe(before - used);
    expect(s.entitlements.checks).toContain('vision');
    // The images reached the vision model as Anthropic image input.
    const sent = bodies.find((b) => String(b.system).includes('TASK: CHAT'))!;
    const content = (sent.messages as { content: { type: string }[] }[]).at(
      -1,
    )!.content;
    expect(content.filter((p) => p.type === 'image')).toHaveLength(2);
    // Too many pictures: refused before any call.
    s.config.p3.vision.maxImagesPerMessage = 1;
    fake.seen.length = 0;
    const many = await collect(
      s.svc.send({
        chatId: chat.id,
        text: 'again',
        attachmentIds: ids,
        modelId: 'claude-balanced',
      }),
    );
    expect(many).toEqual([
      {
        type: 'failure',
        failure: expect.objectContaining({ code: 'vision-count' }),
      },
    ]);
    expect(modelRequests(fake)).toBe(0);
  });

  it('[P3W-018] a model without vision is never sent an image; the person is told which models can read pictures', async () => {
    const s = setup();
    for (const m of s.config.models)
      if (m.id === 'claude-fast') m.capabilities.vision = false;
    const { chat } = await s.svc.start({ kind: 'blank' });
    const a = await s.svc.attach(png(), chat.id);
    const ev = await collect(
      s.svc.send({
        chatId: chat.id,
        text: 'look',
        attachmentIds: [a.ok ? a.value.id : ''],
        modelId: 'claude-fast',
      }),
    );
    expect(ev).toHaveLength(1);
    const f = ev[0]!;
    expect(f.type === 'failure' && f.failure.code).toBe('vision-model');
    expect(f.type === 'failure' && f.failure.message.en).toMatch(
      /^This model cannot read pictures\. These can: .*Claude/,
    );
    expect(modelRequests(fake)).toBe(0);
  });

  it('[P3W-018] the OpenAI and Gemini request builders carry images in their documented shapes', async () => {
    const s = setup();
    const { chat } = await s.svc.start({ kind: 'blank' });
    const a = await s.svc.attach(png(), chat.id);
    const id = a.ok ? a.value.id : '';
    for (const modelId of ['openai-balanced', 'gemini-fast']) {
      bodies.length = 0;
      const ev = await collect(
        s.svc.send({
          chatId: chat.id,
          text: 'look',
          attachmentIds: [id],
          modelId,
        }),
      );
      expect(ev.at(-1)!.type).toBe('done');
      const chatBody = bodies[0]!;
      const json = JSON.stringify(chatBody);
      if (modelId.startsWith('openai'))
        expect(json).toContain(
          '"image_url":{"url":"data:image/png;base64,iVBOR',
        );
      else
        expect(json).toContain(
          '"inlineData":{"mimeType":"image/png","data":"iVBOR',
        );
    }
  });
});
