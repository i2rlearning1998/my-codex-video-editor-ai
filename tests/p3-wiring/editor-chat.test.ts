// P3-WIRING W9: the editor chat engine on a real EditorEngine. The model is a
// scripted stand-in (one charged call each); remoteAsk is checked against the
// real gateway server with the FAKE Anthropic server behind it.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EditEvent } from '../../src/contracts/p3';
import {
  deserializeProject,
  EditorEngine,
  serializeProject,
} from '../../src/core';
import {
  createEditorChatEngine,
  remoteAsk,
  type ModelAsk,
} from '../../src/editor-chat';
import { defaultConfig } from '../../src/platform-config';
import {
  fakeBase,
  startFakeProviders,
  type FakeProviders,
} from '../fakes/providers';
import { startServer, type Started } from '../server/helpers';
import { collect } from './harness';

const engine = () =>
  new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
const PROMPT = defaultConfig().director.prompts!.edit!;
function scripted(
  answers: string[],
): ModelAsk & { calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  const ask = (async (req) => {
    calls.push({ system: req.system, user: req.user });
    return { text: answers[calls.length - 1] ?? '{}', credits: 3 };
  }) as ModelAsk & { calls: typeof calls };
  ask.calls = calls;
  return ask;
}
const setOpacity = (scene: string, value: number) =>
  JSON.stringify({
    summary: 'Make the photo half see-through',
    commands: [
      {
        type: 'SET_PROPERTY',
        compositionId: scene,
        layerId: 'layer-c',
        target: { kind: 'transform', key: 'opacity' },
        property: {
          animated: false,
          constraints: [],
          type: 'number',
          value,
          keyframes: [],
        },
      },
    ],
  });

describe('P3-WIRING editor chat engine', () => {
  it('[P3W-034] a valid proposal is checked with the editor validators and applies as ONE undo step', async () => {
    const e = engine();
    const scene = e.state.compositions[0]!.id;
    const ask = scripted([setOpacity(scene, 0.5)]);
    const chat = createEditorChatEngine({
      engine: e,
      sceneId: () => scene,
      ask,
      prompt: () => PROMPT,
    });
    const before = serializeProject(e.state);
    const ev = await collect(
      chat.send({
        text: 'Make the photo half see-through',
        selection: [{ kind: 'layer', id: 'layer-c' }],
        attachmentIds: [],
      }),
    );
    expect(ev.map((x) => x.type)).toEqual([
      'state',
      'proposal',
      'state',
      'done',
    ]);
    const p = ev[1] as Extract<EditEvent, { type: 'proposal' }>;
    expect(p).toMatchObject({
      credits: 3,
      commandCount: 1,
      summary: { en: 'Make the photo half see-through' },
    });
    // The selection reached the model as data; nothing changed yet.
    expect(ask.calls[0]!.system).toContain('LAYER {"id":"layer-c"');
    expect(serializeProject(e.state)).toBe(before);
    expect((await chat.apply(p.id)).ok).toBe(true);
    const layer = e.state.compositions[0]!.layers.find(
      (l) => l.id === 'layer-c',
    )!;
    expect(layer.transform.opacity.value).toBe(0.5);
    expect(e.undo()).toBe(true);
    expect(serializeProject(e.state)).toBe(before);
    // Applied once only.
    expect((await chat.apply(p.id)).ok).toBe(false);
  });

  it('[P3W-035] an invalid proposal is repaired once with the exact errors, then reported as one plain failure', async () => {
    const e = engine();
    const scene = e.state.compositions[0]!.id;
    // First answer: opacity 5 (the validator refuses it); repair: 0.4.
    const fixed = scripted([setOpacity(scene, 5), setOpacity(scene, 0.4)]);
    const a = createEditorChatEngine({
      engine: e,
      sceneId: () => scene,
      ask: fixed,
      prompt: () => PROMPT,
    });
    const ev = await collect(
      a.send({
        text: 'fade it',
        selection: [{ kind: 'layer', id: 'layer-c' }],
        attachmentIds: [],
      }),
    );
    expect(fixed.calls).toHaveLength(2);
    expect(fixed.calls[1]!.user).toContain('It failed these checks');
    const p = ev.find((x) => x.type === 'proposal') as Extract<
      EditEvent,
      { type: 'proposal' }
    >;
    expect(p.credits).toBe(6);
    const before = serializeProject(e.state);
    const bad = scripted([
      JSON.stringify({
        commands: [{ type: 'DELETE_COMPOSITION', compositionId: scene }],
      }),
      'not json at all',
    ]);
    const b = createEditorChatEngine({
      engine: e,
      sceneId: () => scene,
      ask: bad,
      prompt: () => PROMPT,
    });
    const ev2 = await collect(
      b.send({ text: 'delete everything', selection: [], attachmentIds: [] }),
    );
    expect(ev2.at(-1)).toEqual({
      type: 'failure',
      failure: expect.objectContaining({ code: 'bad-edit' }),
    });
    expect(bad.calls).toHaveLength(2);
    expect(bad.calls[1]!.user).toContain(
      'type "DELETE_COMPOSITION" is not allowed',
    );
    expect(serializeProject(e.state)).toBe(before);
  });

  it('[P3W-036] discarding leaves the project byte-identical; an unknown selection or a blocked plan makes no call', async () => {
    const e = engine();
    const scene = e.state.compositions[0]!.id;
    const before = serializeProject(e.state);
    const ask = scripted([setOpacity(scene, 0.2)]);
    const chat = createEditorChatEngine({
      engine: e,
      sceneId: () => scene,
      ask,
      prompt: () => PROMPT,
    });
    const ev = await collect(
      chat.send({
        text: 'fade',
        selection: [{ kind: 'clip', id: 'clip-c' }],
        attachmentIds: [],
      }),
    );
    const p = ev.find((x) => x.type === 'proposal') as Extract<
      EditEvent,
      { type: 'proposal' }
    >;
    chat.discard(p.id);
    expect(serializeProject(e.state)).toBe(before);
    expect((await chat.apply(p.id)).ok).toBe(false);
    const gone = await collect(
      chat.send({
        text: 'x',
        selection: [{ kind: 'layer', id: 'nope' }],
        attachmentIds: [],
      }),
    );
    expect(gone).toEqual([
      {
        type: 'failure',
        failure: expect.objectContaining({ code: 'selection' }),
      },
    ]);
    const blocked = createEditorChatEngine({
      engine: e,
      sceneId: () => scene,
      ask,
      prompt: () => PROMPT,
      check: async () => ({ code: 'ai-off', message: { en: 'AI is paused.' } }),
    });
    expect(
      await collect(
        blocked.send({ text: 'x', selection: [], attachmentIds: [] }),
      ),
    ).toEqual([
      {
        type: 'failure',
        failure: { code: 'ai-off', message: { en: 'AI is paused.' } },
      },
    ]);
    expect(ask.calls).toHaveLength(1);
    expect(serializeProject(e.state)).toBe(before);
  });

  describe('charged through the gateway server', () => {
    let fake: FakeProviders;
    let s: Started;
    beforeAll(async () => {
      fake = await startFakeProviders();
      s = await startServer({ ANTHROPIC_API_KEY: fake.key });
      const c = defaultConfig();
      c.providers.find((p) => p.id === 'anthropic')!.baseUrl = fakeBase(
        fake.url,
      ).anthropic;
      const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
      await s.api('/v1/config', {
        token: admin,
        body: { config: c, publish: true },
      });
    });
    afterAll(async () => {
      await s.close();
      await fake.close();
    });

    it('[P3W-037] remoteAsk charges each call on the server like any call', async () => {
      const e = engine();
      const scene = e.state.compositions[0]!.id;
      fake.respond(() => setOpacity(scene, 0.3));
      const token = s.token('22222222-0000-0000-0000-000000000000');
      const before = (await s.api('/v1/me', { token })).body.balance as number;
      const chat = createEditorChatEngine({
        engine: e,
        sceneId: () => scene,
        prompt: () => PROMPT,
        ask: remoteAsk({
          base: s.url,
          token: () => token,
          modelId: 'claude-balanced',
          maxCredits: 20,
        }),
      });
      const ev = await collect(
        chat.send({
          text: 'fade',
          selection: [{ kind: 'layer', id: 'layer-c' }],
          attachmentIds: [],
        }),
      );
      const p = ev.find((x) => x.type === 'proposal') as Extract<
        EditEvent,
        { type: 'proposal' }
      >;
      expect(p.credits).toBeGreaterThan(0);
      const after = (await s.api('/v1/me', { token })).body.balance as number;
      expect(before - after).toBe(p.credits);
      expect(JSON.stringify(ev)).not.toContain(fake.key);
    });
  });
});
