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
  checkPlan,
  methodOf,
  mockPlanner,
  reply,
  runBuild,
  startInterview,
  swapTarget,
  withMethod,
  type Interview,
} from '../../director';
import { estimateDirector, GatewayError } from '../../gateway';
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
  const c = ctx.s.config;
  const kit = ctx.prefs().brandKit;
  const brand =
    kit.headingFont || kit.bodyFont
      ? [`Brand fonts: ${kit.headingFont || kit.bodyFont}.`]
      : [];
  const raw = await mockPlanner().draft({
    config: c,
    style,
    answers: withBrand(ctx, style, answers),
    notes: [...notes, ...brand],
    plan: ctx.s.planOf(ctx.user.id),
  });
  return checkPlan(raw);
}
function estimate(
  ctx: Ctx,
  plan: VideoPlan,
  modelId: string,
  briefChars: number,
) {
  const c = ctx.s.config;
  const model = c.models.find((m) => m.id === modelId);
  if (!model) return null;
  return estimateDirector(c, model, {
    briefChars,
    methods: plan.scenes.map(methodOf),
  });
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
    const checked = await draftPlan(ctx, style, answers, []);
    if (mine !== tick) return;
    const e = checked.ok
      ? estimate(
          ctx,
          checked.plan,
          model,
          JSON.stringify(buildBrief(style, answers)).length,
        )
      : null;
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
  const send = () => {
    const r = reply(c, style, iv, input.value, locale);
    iv = r.interview;
    input.value = '';
    writeFlow(ctx, { ...flow, answers: iv.answers, notes: [...iv.notes] });
    ctx.setPrefs({ drafts: { ...ctx.prefs().drafts, [style.id]: iv.answers } });
    paint();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
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
        { type: 'button', class: 'button', id: 'chat-send', onclick: send },
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
  if (!video) {
    const checked = await draftPlan(ctx, style, flow.answers, flow.notes);
    if (!checked.ok) {
      out.append(
        h('h1', { text: t('plan.title') }),
        h('p', {
          class: 'error-state',
          role: 'alert',
          id: 'plan-refused',
          text: `${t('plan.refused')} ${checked.message}`,
        }),
      );
      return;
    }
    video = checked.plan;
    writeFlow(ctx, { ...flow, plan: video });
  }
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
  const paint = () => {
    const v = video!;
    const e = estimate(ctx, v, model, briefChars);
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
              writeFlow(ctx, { ...flow, plan: video });
              paint();
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
      modelPicker(ctx, roleOf(c), model, (id) => {
        model = id;
        ctx.setPrefs({ model: id });
        paint();
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
                      paint();
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
                    writeFlow(ctx, { ...flow, plan: video });
                    paint();
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
  paint();
};

/** P2-30 Live Build. */
export const buildScreen: Screen = async (ctx, _args, out) => {
  const c = ctx.s.config;
  let job: {
    styleId: string;
    plan: VideoPlan;
    model: string;
    max: number;
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
      onEvent: (e) => {
        void ctx.s.sync(ctx.user.id).then(ctx.refreshTop, () => undefined);
        if (e.step === 'reserve') step(t('build.reserve', { n: e.credits }));
        else if (e.step === 'scene') {
          step(t('build.scene', { i: e.index + 1, n: e.total }));
          bar.value = Math.round((e.index / e.total) * 90);
          const cards = preview.querySelectorAll<HTMLElement>('.preview-card');
          if (e.index > 0) cards[e.index - 1]!.dataset.state = 'done';
          cards[e.index]!.dataset.state = 'working';
        } else if (e.step === 'check') step(t('build.check'));
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
