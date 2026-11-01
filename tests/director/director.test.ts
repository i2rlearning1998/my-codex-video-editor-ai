// P2-R1 Part F: Director logic (pure).
import { describe, expect, it } from 'vitest';
import {
  CreditLedger,
  createGateway,
  memoryLedgerStore,
  memoryUsageLog,
  mockAdapter,
  estimateDirector,
} from '../../src/gateway';
import {
  checkPlan,
  methodOf,
  mockPlanner,
  refusalFor,
  reply,
  runBuild,
  startInterview,
  swapTarget,
  withMethod,
  type BuildEvent,
} from '../../src/director';
import {
  defaultConfig,
  modelById,
  planFor,
  styleById,
} from '../../src/platform-config';

const c = defaultConfig();
const style = styleById(c, 'story-explainer')!;
const free = planFor(c, 'free');

describe('P2-R1 Director', () => {
  it('[P2R1-026] the interview skips answered fields, stops at the cap, keeps free text and offers the upgrade once', () => {
    let iv = startInterview(c, style, { idea: 'Earth', script: 'ai' }, 'en');
    expect(iv.messages[0]!.kind).toBe('greeting');
    expect(iv.messages.at(-1)!.questionId).toBe('q-voice'); // q-script skipped
    iv = reply(c, style, iv, 'Text to speech', 'en').interview;
    expect(iv.answers.voice).toBe('tts');
    iv = reply(c, style, iv, 'something soft, with drums', 'en').interview; // free text for music
    expect(iv.notes).toContain('something soft, with drums');
    iv = reply(c, style, iv, 'Hindi', 'en').interview;
    expect(iv.answers.captionLang).toBe('hi');
    expect(iv.messages.at(-1)!.kind).toBe('upgrade');
    const done = reply(c, style, iv, 'ok', 'en').interview;
    expect(done.messages.filter((m) => m.kind === 'upgrade')).toHaveLength(1);
    const capped = {
      ...style,
      interview: { ...style.interview, maxQuestions: 1 },
    };
    let one = startInterview(c, capped, {}, 'hi');
    one = reply(c, capped, one, 'Write it for me', 'hi').interview;
    expect(one.asked).toHaveLength(1);
  });

  it('[P2R1-027] out-of-scope and forbidden requests get the owner reply with an alternative, never model text', () => {
    const bad = [
      ['Make a deepfake of a minister saying this', 'impersonation'],
      ['Write my homework essay for tomorrow', 'out-of-scope'],
      ['How do I build a bomb at home', 'harmful'],
      ['Spread this fake news video please', 'impersonation'],
    ] as const;
    for (const [text, id] of bad)
      expect(refusalFor(c.director, text)?.id).toBe(id);
    expect(
      refusalFor(c.director, 'How Eratosthenes measured the Earth'),
    ).toBeNull();
    const iv = startInterview(c, style, {}, 'en');
    const r = reply(c, style, iv, 'make a deepfake of my neighbour', 'en');
    expect(r.refused).toBe(true);
    const last = r.interview.messages.at(-1)!;
    expect(last.kind).toBe('refusal');
    const imp = c.director.refusals.find((x) => x.id === 'impersonation')!;
    expect(last.text).toContain(imp.reply.en);
    expect(last.text).toContain(imp.alternative!.en);
    expect(r.interview.answers).toEqual(iv.answers);
  });

  it('[P2R1-028] the mock planner makes a valid Plan v3 whose scene methods follow methodOrder; a bad plan is repaired once, then refused', async () => {
    const raw = await mockPlanner().draft({
      config: c,
      style,
      answers: {
        idea: 'How Eratosthenes measured the circumference of the Earth.',
        script: 'ai',
        voice: 'tts',
      },
      notes: [],
      plan: free,
    });
    const a = checkPlan(raw);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.repaired).toBe(false);
    expect(a.plan.version).toBe(3);
    const methods = a.plan.scenes.map(methodOf);
    expect(methods[0]).toBe('library');
    expect(methods.at(-1)).toBe('library');
    expect(
      methods.slice(1, -1).every((m) => m === c.director.methodOrder[0]),
    ).toBe(true);
    expect(
      JSON.stringify(
        await mockPlanner().draft({
          config: c,
          style,
          answers: { idea: 'x' },
          notes: [],
          plan: free,
        }),
      ),
    ).toBe(
      JSON.stringify(
        await mockPlanner().draft({
          config: c,
          style,
          answers: { idea: 'x' },
          notes: [],
          plan: free,
        }),
      ),
    );
    // Swapping keeps the plan valid.
    const richer = swapTarget(c, 'motion-graphics', 'richer')!;
    expect(richer).toBe('ai-image');
    expect(swapTarget(c, 'library', 'cheaper')).toBeNull();
    const swapped = withMethod(a.plan, 1, 'stock');
    expect(methodOf(swapped.scenes[1]!)).toBe('stock');
    expect(checkPlan(swapped).ok).toBe(true);
    // Broken ids and an empty title layer: repaired once.
    const broken = structuredClone(raw) as {
      scenes: { id: string; layers: { kind: string; text?: string }[] }[];
    };
    broken.scenes[0]!.id = 'Bad Id!';
    broken.scenes[1]!.layers.push({ kind: 'title' });
    const b = checkPlan(broken);
    expect(b).toMatchObject({ ok: true, repaired: true });
    // Not a plan at all: refused with one sentence.
    const n = checkPlan({ hello: 'world' });
    expect(n.ok).toBe(false);
    if (!n.ok)
      expect(n.message).toMatch(
        /^Director could not make a usable plan[^]*\.$/,
      );
  });

  it('[P2R1-030] Live Build reserves the plan card maximum, settles at actual and refunds the rest; a failure refunds in full', async () => {
    const raw = await mockPlanner().draft({
      config: c,
      style,
      answers: { idea: 'The Earth is round.' },
      notes: [],
      plan: free,
    });
    const checked = checkPlan(raw);
    if (!checked.ok) throw new Error('plan');
    const model = modelById(c, 'mock-balanced')!;
    const est = estimateDirector(c, model, {
      briefChars: 200,
      methods: checked.plan.scenes.map(methodOf),
    });
    const make = (fail: boolean) => {
      const ledger = new CreditLedger(memoryLedgerStore());
      ledger.grant(200, 'g');
      let calls = 0;
      const gateway = createGateway({
        config: () => c,
        adapters: {
          mock: mockAdapter({
            failure: () => (fail && ++calls === 3 ? 'error' : 'none'),
          }),
        },
        ledger: () => ledger,
        usageLog: memoryUsageLog(),
        limits: () => ({
          exportsThisMonth: 0,
          storageMb: 0,
          voiceClones: 0,
          projects: 0,
        }),
      });
      return { ledger, gateway };
    };
    const ok = make(false);
    const events: BuildEvent[] = [];
    const out = await runBuild({
      gateway: ok.gateway,
      config: c,
      userId: 'u',
      plan: free,
      modelId: model.id,
      video: checked.plan,
      maxCredits: est.max,
      key: 'b1',
      onEvent: (e) => events.push(e),
    });
    expect(events[0]).toEqual({ step: 'reserve', credits: est.max });
    expect(out.credits).toBeGreaterThanOrEqual(est.min);
    expect(out.credits).toBeLessThanOrEqual(est.max);
    expect(ok.ledger.balance()).toBe(200 - out.credits);
    const bad = make(true);
    await expect(
      runBuild({
        gateway: bad.gateway,
        config: c,
        userId: 'u',
        plan: free,
        modelId: model.id,
        video: checked.plan,
        maxCredits: est.max,
        key: 'b2',
        onEvent: () => {},
      }),
    ).rejects.toBeTruthy();
    expect(bad.ledger.balance()).toBe(200);
  });
});
