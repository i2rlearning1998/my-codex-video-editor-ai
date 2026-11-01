// P2-24, P2-26, P2-29, P2-30: Brief Room, Director chat, Plan card and Live
// Build. Every text, field, question, cost and limit comes from the config.
import {
  buildBrief,
  canUse,
  defaultModelFor,
  modelsForRole,
  modelAvailability,
  styleById,
  type Answers,
  type PlatformConfig,
  type Style,
} from '../../platform-config';
import {
  applyUpgrade,
  checkPlan,
  mockPlanner,
  llmPlan,
  methodOf,
  modelReply,
  reply,
  upgradeCredits,
  mediaCredits,
  runBuild,
  startInterview,
  swapTarget,
  withMethod,
  type Interview,
  type Upgrade,
} from '../../director';
import { GatewayError } from '../../gateway';
import { putHandoffFiles, fromBase64 } from '../../handoff-store';
import type { VideoPlan } from '../../video-plan';
import { HANDOFF_KEY } from '../../auth-gate';
import { h, clear, put } from '../dom';
import type { Ctx, Screen } from '../app';
import { renderForm } from '../form';
import { t } from '../strings';
import { bestModels, modelPicker, empty } from './common';

interface Flow {
  styleId: string;
  answers: Answers;
  notes: string[];
  plan?: VideoPlan;
  /** P2B-19: the model's optional upgrades and which are switched on. */
  upgrades?: Upgrade[];
  on?: Record<
    string,
    { sceneId: string; original?: VideoPlan['scenes'][number] }
  >;
}
const FLOW = (u: string) => `aive.panel.flow.${u}`;
const readFlow = (ctx: Ctx): Flow | null => {
  try {
    return JSON.parse(
      sessionStorage.getItem(FLOW(ctx.user.id)) ?? 'null',
    ) as Flow | null;
  } catch {
    return null;
  }
};
const writeFlow = (ctx: Ctx, f: Flow) =>
  sessionStorage.setItem(FLOW(ctx.user.id), JSON.stringify(f));

const roleOf = (c: PlatformConfig) => c.director.roles.write;
export function currentModel(ctx: Ctx): string {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  const saved = ctx.prefs().model;
  const usable = (id: string) =>
    modelAvailability(c, plan, id).ok && ctx.s.connected(id);
  if (saved && usable(saved)) return saved;
  // The recommended model the plan allows and the server can reach.
  const list = bestModels(ctx, modelsForRole(c, roleOf(c))).filter((m) =>
    usable(m.id),
  );
  return list[0]?.id ?? defaultModelFor(c, plan, roleOf(c))?.id ?? '';
}
/** The answers with the Brand Kit's colour and fonts (P2-37). */
function withBrand(ctx: Ctx, style: Style, a: Answers): Answers {
  const kit = ctx.prefs().brandKit;
  const plan = ctx.s.planOf(ctx.user.id);
  if (!plan.features.includes('brand-kit')) return a;
  const out = { ...a };
  const color = style.brief.fields.find((f) => f.type === 'color');
  if (color && out[color.id] === undefined && kit.colors[0])
    out[color.id] = kit.colors[0];
  return out;
}
async function draftPlan(
  ctx: Ctx,
  style: Style,
  answers: Answers,
  notes: string[],
) {
  const kit = ctx.prefs().brandKit;
  const brand =
    kit.headingFont || kit.bodyFont
      ? [`Brand fonts: ${kit.headingFont || kit.bodyFont}.`]
      : [];
  // P2B-16: the chosen model plans (the mock plans for free offline).
  return llmPlan({
    gateway: ctx.s.gateway,
    config: ctx.s.config,
    style,
    answers: withBrand(ctx, style, answers),
    notes: [...notes, ...brand],
    plan: ctx.s.planOf(ctx.user.id),
    locale: ctx.prefs().locale,
    userId: ctx.user.id,
    modelId: currentModel(ctx),
    key: `plan-${Date.now().toString(36)}`,
  });
}
/** The Brief room's estimate: the free planner's shape, never a model call. */
async function previewPlan(ctx: Ctx, style: Style, answers: Answers) {
  return checkPlan(
    await mockPlanner().draft({
      config: ctx.s.config,
      style,
      answers: withBrand(ctx, style, answers),
      notes: [],
      plan: ctx.s.planOf(ctx.user.id),
    }),
  );
}
const strength = (style: Style, a: Answers) => {
  const fields = style.brief.fields;
  const weight = (f: (typeof fields)[number]) => (f.required ? 2 : 1);
  const total = fields.reduce((s, f) => s + weight(f), 0);
  const got = fields
    .filter(
      (f) =>
        a[f.id] !== undefined &&
        a[f.id] !== '' &&
        !(Array.isArray(a[f.id]) && !(a[f.id] as unknown[]).length),
    )
    .reduce((s, f) => s + weight(f), 0);
  const p = total ? got / total : 0;
  return p >= 0.8
    ? t('brief.strong')
    : p >= 0.45
      ? t('brief.good')
      : t('brief.weak');
};

/** P2-24 Brief Room. */
export const briefScreen: Screen = async (ctx, [styleId = ''], out) => {
  const c = ctx.s.config;
  const style = styleById(c, styleId);
  if (!style || !style.enabled) {
    out.append(empty(t('plan.none')));
    return;
  }
  const plan = ctx.s.planOf(ctx.user.id);
  if (!canUse(plan, style.requires)) {
    ctx.go('styles');
    return;
  }
  const idea = new URLSearchParams(location.hash.split('?')[1] ?? '').get(
    'idea',
  );
  const saved = ctx.prefs().drafts[style.id] ?? {};
  let answers: Answers = { ...saved, ...(idea ? { idea } : {}) };
  let model = currentModel(ctx);
  const strengthEl = h('p', { class: 'strength', id: 'brief-strength' });
  const estimateEl = h('p', {
    class: 'estimate',
    id: 'brief-estimate',
    'aria-live': 'polite',
  });
  const savedEl = h('span', { class: 'muted', id: 'draft-saved' });
  let tick = 0;
  const refresh = async () => {
    const mine = ++tick;
    strengthEl.textContent = t('brief.strength', {
      label: strength(style, answers),
    });
    const checked = await previewPlan(ctx, style, answers);
    if (mine !== tick) return;
    const e = checked.ok
      ? await ctx.s
          .estimate(
            model,
            checked.plan.scenes.map(methodOf),
            JSON.stringify(buildBrief(style, answers)).length,
          )
          .catch(() => null)
      : null;
    if (mine !== tick) return;
    estimateEl.textContent =
      e && c.director.reveal.credits
        ? t('brief.estimate', { min: e.min, max: e.max })
        : '';
    estimateEl.dataset.max = String(e?.max ?? '');
  };
  const form = renderForm(style, answers, ctx.say, (a) => {
    answers = a;
    ctx.setPrefs({ drafts: { ...ctx.prefs().drafts, [style.id]: a } });
    savedEl.textContent = t('brief.draftSaved');
    void refresh();
  });
  const pickerHost = h('div');
  const paintPicker = () =>
    clear(
      pickerHost,
      modelPicker(ctx, roleOf(c), model, (id) => {
        model = id;
        ctx.setPrefs({ model: id });
        paintPicker();
        void refresh();
      }),
    );
  paintPicker();
  const next = (route: 'director' | 'plan') => {
    form.showIssues();
    if (form.issues().length && route === 'plan') {
      ctx.toast(t('brief.fix'), 'error');
      return;
    }
    writeFlow(ctx, {
      styleId: style.id,
      answers,
      notes: readFlow(ctx)?.styleId === style.id ? readFlow(ctx)!.notes : [],
    });
    ctx.go(`${route}/${style.id}`);
  };
  const usesKit =
    plan.features.includes('brand-kit') &&
    ctx.prefs().brandKit.colors.length > 0;
  put(
    out,
    h('h1', { text: t('brief.title', { style: ctx.say(style.name) }) }),
    h('p', { class: 'muted', text: ctx.say(style.blurb) }),
    usesKit
      ? h('p', { class: 'chip', id: 'brand-kit-on', text: t('brief.brandKit') })
      : null,
    h(
      'div',
      { class: 'brief-layout' },
      form.el,
      h(
        'aside',
        { class: 'brief-side' },
        strengthEl,
        pickerHost,
        estimateEl,
        savedEl,
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'button',
              id: 'talk-director',
              onclick: () => next('director'),
            },
            t('brief.talk'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'button primary',
              id: 'make-plan',
              onclick: () => next('plan'),
            },
            t('brief.plan'),
          ),
        ),
      ),
    ),
  );
  await refresh();
};

/** P2-26, P2-27 Director chat. */
export const directorScreen: Screen = async (ctx, [styleId = ''], out) => {
  const c = ctx.s.config;
  const style = styleById(c, styleId);
  const flow = readFlow(ctx);
  if (!style || !flow || flow.styleId !== style.id) {
    out.append(empty(t('plan.none')));
    return;
  }
  const locale = ctx.prefs().locale;
  let iv: Interview = startInterview(c, style, flow.answers, locale);
  const log = h('ol', { class: 'chat', id: 'chat', 'aria-live': 'polite' });
  const input = h('input', {
    type: 'text',
    id: 'chat-input',
    placeholder: t('director.placeholder'),
    'aria-label': t('director.placeholder'),
  });
  const paint = () => {
    clear(
      log,
      ...iv.messages.map((m) =>
        h('li', {
          class: `msg ${m.from} ${m.kind}`,
          'data-kind': m.kind,
          text: m.text,
        }),
      ),
    );
    const open = iv.messages.at(-1);
    if (
      open?.from === 'director' &&
      open.kind !== 'question' &&
      open.kind !== 'refusal'
    )
      log.append(
        h('li', {
          class: 'msg director done',
          'data-kind': 'done',
          text: t('director.ready'),
        }),
      );
    log.lastElementChild?.scrollIntoView({ block: 'nearest' });
  };
  // P2B-21: a connected text model helps read answers (never for refusals).
  const plan = ctx.s.planOf(ctx.user.id);
  const helper = bestModels(
    ctx,
    modelsForRole(c, c.director.roles.interview),
  ).find(
    (m) =>
      m.providerId !== 'mock' &&
      ctx.s.connected(m.id) &&
      modelAvailability(c, plan, m.id).ok,
  );
  let busy = false;
  const send = async () => {
    if (busy) return;
    busy = true;
    const said = input.value;
    const r = helper
      ? await modelReply(c, style, iv, said, locale, async (system, user) => {
          const out = await ctx.s.gateway.run({
            userId: ctx.user.id,
            plan,
            role: c.director.roles.interview,
            modelId: helper.id,
            request: {
              system,
              messages: [{ role: 'user', content: user }],
              json: true,
              maxOutputTokens: 300,
            },
            maxCredits: 50,
            key: `iv-${Date.now().toString(36)}`,
          });
          void ctx.s.sync(ctx.user.id).then(ctx.refreshTop, () => undefined);
          return out.result.text ?? '';
        }).catch(() => reply(c, style, iv, said, locale))
      : reply(c, style, iv, said, locale);
    busy = false;
    iv = r.interview;
    input.value = '';
    writeFlow(ctx, { ...flow, answers: iv.answers, notes: [...iv.notes] });
    ctx.setPrefs({ drafts: { ...ctx.prefs().drafts, [style.id]: iv.answers } });
    paint();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void send();
  });
  out.append(
    h('h1', { text: `${t('director.title')} · ${ctx.say(style.name)}` }),
    log,
    h(
      'div',
      { class: 'chat-input' },
      input,
      h(
        'button',
        {
          type: 'button',
          class: 'button',
          id: 'chat-send',
          onclick: () => void send(),
        },
        t('director.send'),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'a',
        { class: 'button', href: `#/brief/${style.id}` },
        t('common.back'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button primary',
          id: 'make-plan',
          onclick: () => {
            writeFlow(ctx, {
              ...flow,
              answers: iv.answers,
              notes: [...iv.notes],
            });
            ctx.go(`plan/${style.id}`);
          },
        },
        t('brief.plan'),
      ),
    ),
  );
  paint();
  input.focus();
};

/** P2-29 Plan card. */
export const planScreen: Screen = async (ctx, [styleId = ''], out) => {
  const c = ctx.s.config;
  const style = styleById(c, styleId);
  const flow = readFlow(ctx);
  if (!style || !flow || flow.styleId !== style.id) {
    out.append(empty(t('plan.none')));
    return;
  }
  let video = flow.plan;
  let upgrades = flow.upgrades ?? [];
  const on = { ...(flow.on ?? {}) };
  const refused = (text: string) =>
    out.append(
      h('h1', { text: t('plan.title') }),
      h('p', {
        class: 'error-state',
        role: 'alert',
        id: 'plan-refused',
        text,
      }),
      h(
        'div',
        { class: 'actions' },
        h(
          'a',
          { class: 'button', href: `#/brief/${style.id}` },
          t('common.back'),
        ),
      ),
    );
  if (!video) {
    let checked: Awaited<ReturnType<typeof draftPlan>>;
    try {
      checked = await draftPlan(ctx, style, flow.answers, flow.notes);
    } catch (e) {
      // A provider failure: the whole planning hold is given back.
      await ctx.s.sync(ctx.user.id).catch(() => undefined);
      refused(
        e instanceof GatewayError && e.code === 'shortage'
          ? t('gw.shortage', {
              need: e.detail.need ?? '',
              have: e.detail.have ?? '',
            })
          : t('gw.refused', { message: (e as Error).message }),
      );
      return;
    }
    await ctx.s.sync(ctx.user.id).catch(() => undefined);
    if (!checked.ok) {
      refused(`${t('plan.refused')} ${checked.message}`);
      return;
    }
    video = checked.plan;
    upgrades = checked.upgrades;
    writeFlow(ctx, { ...flow, plan: video, upgrades, on: {} });
  }
  const voice = flow.answers.voice === 'tts';
  const save = () => writeFlow(ctx, { ...flow, plan: video!, upgrades, on });
  const userPlan = ctx.s.planOf(ctx.user.id);
  let model = currentModel(ctx);
  const briefChars = JSON.stringify(buildBrief(style, flow.answers)).length;
  const reveal = c.director.reveal;
  const body = h('div', { class: 'plan-card', id: 'plan-card' });
  const toolName = (id: string) => {
    const tool = c.director.tools.find((x) => x.id === id);
    return tool?.name ? ctx.say(tool.name) : id;
  };
  const allowed = (m: string) => {
    const tool = c.director.tools.find((x) => x.id === m);
    return !!tool && tool.enabled && canUse(userPlan, tool.requires);
  };
  let seq = 0;
  const paint = async () => {
    const mine = ++seq;
    const v = video!;
    const base = await ctx.s
      .estimate(model, v.scenes.map(methodOf), briefChars)
      .catch(() => null);
    if (mine !== seq) return;
    // P2B-22: the AI pictures and the voice are part of the hold.
    const extra = mediaCredits(c, userPlan, v, voice, (id) =>
      ctx.s.connected(id),
    );
    const e = base
      ? { ...base, min: base.min + extra, max: base.max + extra }
      : null;
    const balance = ctx.s.ledger(ctx.user.id).balance();
    const short = !!e && e.max > balance;
    const rows = v.scenes.map((s, i) => {
      const m = methodOf(s);
      const est = e?.scenes[i];
      const swap = (dir: 'cheaper' | 'richer') => {
        const target = swapTarget(c, m, dir);
        const locked = !!target && !allowed(target);
        return h(
          'button',
          {
            type: 'button',
            class: 'button sm',
            'data-swap': dir,
            disabled: !target,
            title: locked
              ? t('plan.lockedMethod', { method: toolName(target!) })
              : undefined,
            onclick: () => {
              if (!target) return;
              if (locked) {
                ctx.toast(
                  t('plan.lockedMethod', { method: toolName(target) }),
                  'error',
                );
                ctx.go('credits');
                return;
              }
              video = withMethod(
                v,
                i,
                target,
                typeof flow.answers.accent === 'string'
                  ? flow.answers.accent
                  : undefined,
              );
              save();
              void paint();
            },
          },
          t(`plan.${dir}`),
          locked ? ' 🔒' : '',
        );
      };
      return h(
        'li',
        { class: 'scene', 'data-scene': s.id, 'data-method': m },
        h(
          'div',
          { class: 'scene-head' },
          h('strong', {
            text: `${t('plan.scene', { n: i + 1 })}: ${s.title ?? ''}`,
          }),
          reveal.methods
            ? h('span', { class: 'chip method', text: toolName(m) })
            : null,
          reveal.credits && est
            ? h('span', {
                class: 'scene-cost',
                text: t('common.range', { min: est.min, max: est.max }),
              })
            : null,
        ),
        reveal.plan
          ? h('p', { class: 'muted', text: s.narration ?? '' })
          : null,
        reveal.methods
          ? h('div', { class: 'actions' }, swap('cheaper'), swap('richer'))
          : null,
      );
    });
    clear(
      body,
      h('ol', { class: 'scenes' }, rows),
      upgrades.length
        ? h(
            'fieldset',
            { class: 'upgrades', id: 'plan-upgrades' },
            h('legend', { text: t('plan.upgrades') }),
            upgrades.map((u) => {
              const credits = upgradeCredits(c, v, u);
              const box = h('input', {
                type: 'checkbox',
                id: `upgrade-${u.id}`,
                'data-upgrade': u.id,
              });
              box.checked = !!on[u.id];
              box.addEventListener('change', () => {
                if (box.checked) {
                  const before = new Set(v.scenes.map((x) => x.id));
                  const original =
                    u.replaceScene && v.scenes[u.replaceScene.index];
                  video = applyUpgrade(v, u);
                  const added = video.scenes.find((x) => !before.has(x.id));
                  on[u.id] = {
                    sceneId: added?.id ?? (original ? original.id : ''),
                    ...(original ? { original } : {}),
                  };
                } else {
                  const st = on[u.id];
                  delete on[u.id];
                  if (st)
                    video = {
                      ...v,
                      scenes: st.original
                        ? v.scenes.map((x) =>
                            x.id === st.sceneId ? st.original! : x,
                          )
                        : v.scenes.filter((x) => x.id !== st.sceneId),
                    };
                }
                save();
                void paint();
              });
              return h(
                'label',
                { class: 'upgrade', for: `upgrade-${u.id}` },
                box,
                h('strong', { text: u.title }),
                h('span', { class: 'muted', text: u.why }),
                h('span', {
                  class: 'chip',
                  'data-credits': String(credits),
                  text: t('plan.upgradeCost', {
                    n: credits >= 0 ? `+${credits}` : String(credits),
                  }),
                }),
              );
            }),
          )
        : null,
      modelPicker(ctx, roleOf(c), model, (id) => {
        model = id;
        ctx.setPrefs({ model: id });
        void paint();
      }),
      reveal.credits && e
        ? h('p', {
            class: 'total',
            id: 'plan-total',
            'data-max': String(e.max),
            text: t('plan.total', { min: e.min, max: e.max }),
          })
        : null,
      h('p', {
        class: 'balance',
        id: 'plan-balance',
        text: t('plan.balance', { n: balance }),
      }),
      short && e
        ? h(
            'div',
            { class: 'shortage', role: 'alert', id: 'plan-shortage' },
            h('p', {
              text: t('plan.shortage', { need: e.max, have: balance }),
            }),
            h(
              'div',
              { class: 'actions' },
              h(
                'a',
                { class: 'button', href: '#/credits', id: 'shortage-topup' },
                t('plan.topUp'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'button',
                  id: 'shortage-model',
                  onclick: () => {
                    const fast = c.models.find(
                      (m) =>
                        m.roles.includes(roleOf(c)) &&
                        m.tier === 'fast' &&
                        modelAvailability(c, userPlan, m.id).ok,
                    );
                    if (fast) {
                      model = fast.id;
                      void paint();
                    }
                  },
                },
                t('plan.cheaperModel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'button',
                  id: 'shortage-scenes',
                  onclick: () => {
                    let next = v;
                    v.scenes.forEach((s, i) => {
                      let m = methodOf(s);
                      for (let k = 0; k < 6; k++) {
                        const target = swapTarget(c, m, 'cheaper');
                        if (!target || !allowed(target)) break;
                        m = target;
                      }
                      next = withMethod(next, i, m);
                    });
                    video = next;
                    save();
                    void paint();
                  },
                },
                t('plan.cheaperScenes'),
              ),
            ),
          )
        : null,
      e
        ? h('p', { class: 'muted', text: t('plan.reserveNote', { n: e.max }) })
        : null,
      h(
        'div',
        { class: 'actions' },
        h(
          'a',
          { class: 'button', href: `#/brief/${style.id}`, id: 'plan-cancel' },
          t('common.cancel'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'button primary',
            id: 'plan-approve',
            disabled: short || !e,
            onclick: () => {
              sessionStorage.setItem(
                `aive.panel.build.${ctx.user.id}`,
                JSON.stringify({
                  styleId: style.id,
                  plan: video,
                  model,
                  max: e!.max,
                  voice,
                  key: `build-${Date.now().toString(36)}`,
                }),
              );
              ctx.go('build');
            },
          },
          t('plan.approve'),
        ),
      ),
    );
  };
  out.append(
    h('h1', { text: `${t('plan.title')}: ${video.meta.title}` }),
    body,
  );
  await paint();
};

/** P2-30 Live Build. */
export const buildScreen: Screen = async (ctx, _args, out) => {
  const c = ctx.s.config;
  let job: {
    styleId: string;
    plan: VideoPlan;
    model: string;
    max: number;
    voice?: boolean;
    key: string;
  } | null = null;
  try {
    job = JSON.parse(
      sessionStorage.getItem(`aive.panel.build.${ctx.user.id}`) ?? 'null',
    );
  } catch {
    job = null;
  }
  const DONE = `aive.panel.done.${ctx.user.id}`;
  if (!job) {
    // A finished build stays here until the next one (leaving and coming
    // back still offers Open in editor).
    let done: { id: string; title: string; used: number; back: number } | null =
      null;
    try {
      done = JSON.parse(sessionStorage.getItem(DONE) ?? 'null');
    } catch {
      done = null;
    }
    if (!done || !localStorage.getItem(HANDOFF_KEY(done.id))) {
      out.append(empty(t('plan.none')));
      return;
    }
    put(
      out,
      h('h1', { text: done.title }),
      h('p', {
        class: 'build-status',
        id: 'build-status',
        'data-state': 'done',
        text: t('build.done', { used: done.used, back: done.back }),
      }),
      h(
        'div',
        { class: 'actions' },
        h(
          'a',
          {
            class: 'button primary',
            id: 'open-in-editor',
            href: `/?handoff=${encodeURIComponent(done.id)}`,
          },
          t('build.open'),
        ),
      ),
    );
    return;
  }
  const steps = h('ol', {
    class: 'steps',
    id: 'build-steps',
    'aria-live': 'polite',
  });
  const bar = h('progress', { id: 'build-progress', max: 100, value: 0 });
  const status = h('p', {
    class: 'build-status',
    id: 'build-status',
    role: 'status',
  });
  const actions = h('div', { class: 'actions' });
  const preview = h(
    'ol',
    { class: 'preview', id: 'build-preview' },
    job.plan.scenes.map((s, i) =>
      h(
        'li',
        { class: 'preview-card', 'data-state': 'waiting' },
        h('strong', { text: `${i + 1}. ${s.title ?? ''}` }),
        h('span', { class: 'muted', text: s.narration ?? '' }),
      ),
    ),
  );
  out.append(
    h('h1', { text: t('build.title') }),
    bar,
    steps,
    status,
    preview,
    actions,
  );
  const step = (text: string, kind = '') =>
    steps.append(h('li', { class: kind, text }));
  const j = job;
  try {
    const result = await runBuild({
      gateway: ctx.s.gateway,
      config: c,
      userId: ctx.user.id,
      plan: ctx.s.planOf(ctx.user.id),
      modelId: j.model,
      video: j.plan,
      maxCredits: j.max,
      key: j.key,
      voice: !!j.voice,
      connected: (id) => ctx.s.connected(id),
      onEvent: (e) => {
        void ctx.s.sync(ctx.user.id).then(ctx.refreshTop, () => undefined);
        if (e.step === 'reserve') step(t('build.reserve', { n: e.credits }));
        else if (e.step === 'scene') {
          step(t('build.scene', { i: e.index + 1, n: e.total }));
          bar.value = Math.round((e.index / e.total) * 90);
          const cards = preview.querySelectorAll<HTMLElement>('.preview-card');
          if (e.index > 0) cards[e.index - 1]!.dataset.state = 'done';
          cards[e.index]!.dataset.state = 'working';
        } else if (e.step === 'media')
          step(
            e.kind === 'voice'
              ? t('build.voice')
              : t('build.picture', { i: e.index + 1 }),
          );
        else if (e.step === 'check') step(t('build.check'));
        else if (e.step === 'done') {
          bar.value = 100;
          for (const card of preview.querySelectorAll<HTMLElement>(
            '.preview-card',
          ))
            card.dataset.state = 'done';
          status.textContent = t('build.done', {
            used: e.credits,
            back: e.refunded,
          });
          status.dataset.state = 'done';
        } else if (e.step === 'failed') {
          status.textContent = t('build.failed', {
            message: e.message,
            n: e.refunded,
          });
          status.dataset.state = 'failed';
        }
      },
    });
    sessionStorage.removeItem(`aive.panel.build.${ctx.user.id}`);
    const id = j.key;
    // P2B-23: what the models made goes to Project Media (by name) and to
    // the Asset Library; the editor moves the rows to the new project.
    if (result.files.length) {
      await putHandoffFiles(
        id,
        result.files.map((f) => ({
          name: f.name,
          type: f.type,
          bytes: fromBase64(f.base64),
        })),
      ).catch(() => undefined);
      for (const f of result.files)
        try {
          ctx.s.saveAsset({
            id: `${id}-${f.name}`,
            userId: ctx.user.id,
            projectId: `handoff:${id}`,
            kind: f.kind,
            name: f.name,
            studioId: 'director',
            // Large files stay only in Project Media (browser storage is small).
            ...(f.base64.length < 1_500_000
              ? { dataUrl: `data:${f.type};base64,${f.base64}` }
              : {}),
            bytes: Math.round((f.base64.length * 3) / 4),
            createdAt: new Date().toISOString(),
          });
        } catch {
          /* the editor still gets the file */
        }
    }
    for (const m of result.missing)
      steps.append(h('li', { class: 'note', 'data-missing': '', text: m }));
    localStorage.setItem(HANDOFF_KEY(id), JSON.stringify(result.plan));
    sessionStorage.setItem(
      DONE,
      JSON.stringify({
        id,
        title: result.plan.meta.title,
        used: result.credits,
        back: j.max - result.credits,
      }),
    );
    actions.append(
      h(
        'a',
        {
          class: 'button primary',
          id: 'open-in-editor',
          href: `/?handoff=${encodeURIComponent(id)}`,
        },
        t('build.open'),
      ),
    );
  } catch (e) {
    console.debug('[panel] build failed', e);
    if (e instanceof GatewayError && !status.dataset.state) {
      status.textContent =
        e.code === 'shortage'
          ? t('gw.shortage', {
              need: e.detail.need ?? '',
              have: e.detail.have ?? '',
            })
          : t('gw.refused', { message: e.message });
      status.dataset.state = 'failed';
    }
    await ctx.s.sync(ctx.user.id).catch(() => undefined);
    ctx.refreshTop();
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'button',
          id: 'build-retry',
          onclick: () => {
            sessionStorage.setItem(
              `aive.panel.build.${ctx.user.id}`,
              JSON.stringify({ ...j, key: `build-${Date.now().toString(36)}` }),
            );
            ctx.go('build');
            location.reload();
          },
        },
        t('build.retry'),
      ),
      h(
        'a',
        { class: 'button', href: `#/plan/${j.styleId}` },
        t('common.back'),
      ),
    );
  }
};
