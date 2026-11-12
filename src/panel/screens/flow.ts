// P2-24, P2-26, P2-29, P2-30: Brief Room, Director chat, Plan card and Live
// Build. Every text, field, question, cost and limit comes from the config.
import {
  buildBrief,
  canUse,
  costById,
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
import { artSvg, posterArt } from '../art';
import { composer, type Attachment } from '../composer';
import type { VideoPlan } from '../../video-plan';
import { HANDOFF_KEY } from '../../auth-gate';
import { h, clear, put } from '../dom';
import type { Ctx, Screen } from '../app';
import { renderForm } from '../form';
import { t } from '../strings';
import { motionOn, tick } from '../motion';
import { bestModels, modelPicker, empty } from './common';
import { newDirectorVideo } from './workspace';
import { styleFromPlan } from '../../project/style-from';
import { planSlots } from '../asset-slots';
import { getSlotFile } from '../slot-files';
import type { AssetSlot } from '../../project/workspace';

interface Flow {
  styleId: string;
  /** P4: the project this video is made in (it exists from the start). */
  projectId?: string;
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
/**
 * ROUND-A: a Video follows its Project's style (with its own changes on
 * top); the planner reads it as notes.
 */
function projectStyleNotes(ctx: Ctx, videoId?: string): string[] {
  const f = videoId ? ctx.s.ws(ctx.user.id).effectiveStyle(videoId) : null;
  if (!f) return [];
  const lines = [
    f.look.palette.length
      ? `Project colours: ${f.look.palette.join(', ')}.`
      : '',
    f.look.headingFont || f.look.bodyFont
      ? `Project fonts: ${[f.look.headingFont, f.look.bodyFont].filter(Boolean).join(' / ')}.`
      : '',
    f.look.captionStyle ? `Caption style: ${f.look.captionStyle}.` : '',
    f.graphics ? `Graphics and animation: ${f.graphics}` : '',
    f.voice ? `Voice: ${f.voice}.` : '',
    f.music ? `Music: ${f.music}.` : '',
    f.scriptRules ? `Script rules: ${f.scriptRules}` : '',
  ];
  return lines.filter(Boolean).map((l) => l.slice(0, 600));
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
const strengthPct = (style: Style, a: Answers) => {
  const fields = style.brief.fields;
  const weight = (f: (typeof fields)[number]) => (f.required ? 2 : 1);
  const total = fields.reduce((n, f) => n + weight(f), 0);
  const got = fields
    .filter(
      (f) =>
        a[f.id] !== undefined &&
        a[f.id] !== '' &&
        !(Array.isArray(a[f.id]) && !(a[f.id] as unknown[]).length),
    )
    .reduce((n, f) => n + weight(f), 0);
  return total ? Math.round((got / total) * 100) : 0;
};
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
  const meterFill = h('i');
  const meterEl = h(
    'div',
    { class: 'meter', 'aria-hidden': 'true' },
    meterFill,
  );
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
    const pct = strengthPct(style, answers);
    meterFill.style.width = `${Math.max(4, pct)}%`;
    meterEl.dataset.level = pct >= 75 ? 'high' : pct >= 45 ? 'mid' : 'low';
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
  // P4: the project exists before Director starts. One named in the address
  // (`?project=`) is used; otherwise one is made when the person goes on.
  const wanted = new URLSearchParams(location.hash.split('?')[1] ?? '').get(
    'project',
  );
  const next = async (route: 'director' | 'plan') => {
    form.showIssues();
    if (form.issues().length && route === 'plan') {
      ctx.toast(t('brief.fix'), 'error');
      return;
    }
    const before = readFlow(ctx);
    // ROUND-B SEAM: the brief is bound to a Video (`?project=<videoId>`).
    const ws = ctx.s.ws(ctx.user.id);
    const projectId =
      (wanted && ws.video(wanted) ? wanted : '') ||
      (before?.styleId === style.id &&
      before.projectId &&
      ws.video(before.projectId)
        ? before.projectId
        : undefined) ||
      (await newDirectorVideo(ctx));
    if (!projectId) return;
    ws.markAi(projectId);
    ws.setStage(projectId, route === 'plan' ? 'plan' : 'brief');
    writeFlow(ctx, {
      styleId: style.id,
      projectId,
      answers,
      notes: before?.styleId === style.id ? before.notes : [],
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
        meterEl,
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

/** P2-26, P2-27 Director chat (R3: a chat room with a live "Your film" card). */
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
  let thinking = false;
  const side = h('aside', { class: 'dir-side', id: 'dir-side' });
  const optionLabel = (f: Style['brief']['fields'][number], v: unknown) => {
    const one = (x: string) =>
      f.options.find((o) => o.value === x)?.label
        ? ctx.say(f.options.find((o) => o.value === x)!.label)
        : x;
    if (Array.isArray(v)) return v.map((x) => one(String(x))).join(', ');
    if (typeof v === 'boolean') return v ? '✓' : '–';
    return one(String(v)).slice(0, 90);
  };
  let sideSeq = 0;
  const paintSide = async () => {
    const mine = ++sideSeq;
    const known = style.brief.fields.filter(
      (f) =>
        iv.answers[f.id] !== undefined &&
        iv.answers[f.id] !== '' &&
        [
          'text',
          'longtext',
          'choice',
          'multi',
          'number',
          'toggle',
          'color',
        ].includes(f.type) &&
        !(
          Array.isArray(iv.answers[f.id]) &&
          !(iv.answers[f.id] as unknown[]).length
        ),
    );
    const pct = strengthPct(style, iv.answers);
    const e = await previewPlan(ctx, style, iv.answers)
      .then((chk) =>
        chk.ok
          ? ctx.s.estimate(
              currentModel(ctx),
              chk.plan.scenes.map(methodOf),
              JSON.stringify(buildBrief(style, iv.answers)).length,
            )
          : null,
      )
      .catch(() => null);
    if (mine !== sideSeq) return;
    clear(
      side,
      h(
        'div',
        { class: 'dir-poster' },
        posterArt(style, c),
        h('span', { class: 'dir-poster-name', text: ctx.say(style.name) }),
      ),
      h('p', { class: 'dir-kicker', text: t('chat.film') }),
      h(
        'div',
        {
          class: 'dir-meter',
          role: 'img',
          'aria-label': t('chat.ready', { pct }),
        },
        h('i', { style: `width:${pct}%` }),
      ),
      h('p', {
        class: 'dir-ready',
        id: 'dir-ready',
        text: t('chat.ready', { pct }),
      }),
      h('p', { class: 'dir-sub', text: t('chat.sofar') }),
      known.length
        ? h(
            'dl',
            { class: 'dir-facts', id: 'dir-facts' },
            ...known.flatMap((f) => [
              h('dt', { text: ctx.say(f.label) }),
              h('dd', { text: optionLabel(f, iv.answers[f.id]) }),
            ]),
          )
        : h('p', { class: 'dir-empty', text: t('chat.nothing') }),
      iv.notes.length
        ? h(
            'div',
            { class: 'dir-notes' },
            h('p', { class: 'dir-sub', text: t('chat.notes') }),
            ...iv.notes
              .slice(-3)
              .map((n) => h('p', { class: 'dir-note', text: n.slice(0, 120) })),
          )
        : null,
      e && c.director.reveal.credits
        ? h('p', {
            class: 'dir-estimate',
            id: 'dir-estimate',
            text: t('brief.estimate', { min: e.min, max: e.max }),
          })
        : null,
      h(
        'div',
        { class: 'dir-actions' },
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
        h(
          'a',
          { class: 'button', href: `#/brief/${style.id}` },
          t('common.back'),
        ),
      ),
    );
  };
  const paint = () => {
    const last = iv.messages.length - 1;
    // The question's answers, else the options of the field it fills.
    const chipsOf = (q: Style['interview']['questions'][number]) =>
      q.answers.length
        ? q.answers
        : (style.brief.fields.find((f) => f.id === q.fills)?.options ?? []).map(
            (o) => o.label,
          );
    const row = (
      m: { from: 'director' | 'user'; kind: string },
      body: (Node | null)[],
      extra = '',
    ) =>
      h(
        'li',
        { class: `msg ${m.from} ${m.kind}${extra}`, 'data-kind': m.kind },
        m.from === 'director'
          ? h('span', { class: 'orb sm', 'aria-hidden': 'true' })
          : null,
        h(
          'div',
          { class: 'msg-body' },
          h('span', {
            class: 'msg-name',
            text: m.from === 'director' ? t('chat.director') : t('chat.you'),
          }),
          ...body,
        ),
      );
    clear(
      log,
      ...iv.messages.map((m, i) => {
        // P2B-31: Director speaks with its orb; the open question is a card
        // with the config's answers as chips.
        const q =
          m.kind === 'question' && i === last
            ? style.interview.questions.find((x) => x.id === m.questionId)
            : undefined;
        return row(
          m,
          [
            h('span', { class: 'msg-text', text: m.text }),
            q && chipsOf(q).length
              ? h(
                  'div',
                  { class: 'answer-chips' },
                  chipsOf(q).map((a) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'chip',
                        'data-answer': ctx.say(a),
                        onclick: () => void doSend(ctx.say(a), []),
                      },
                      ctx.say(a),
                    ),
                  ),
                )
              : null,
          ],
          q ? ' question-card' : '',
        );
      }),
    );
    const open = iv.messages.at(-1);
    if (
      !thinking &&
      open?.from === 'director' &&
      open.kind !== 'question' &&
      open.kind !== 'refusal'
    )
      log.append(
        row({ from: 'director', kind: 'done' }, [
          h('span', { class: 'msg-text', text: t('director.ready') }),
        ]),
      );
    if (thinking)
      log.append(
        row({ from: 'director', kind: 'thinking' }, [
          h(
            'span',
            { class: 'msg-text' },
            h('i', { class: 'thinking-dots' }),
            t('chat.thinking'),
          ),
        ]),
      );
    log.lastElementChild?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
    void paintSide();
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
  const doSend = async (said: string, files: Attachment[]) => {
    if (busy) return;
    busy = true;
    box.setBusy(true);
    // What was attached becomes a note for the plan and a line in the chat.
    for (const f of files)
      iv = {
        ...iv,
        notes: [...iv.notes, `Attached ${f.name}: ${f.text}`],
        messages: [
          ...iv.messages,
          {
            from: 'user',
            kind: 'answer',
            text: t('chat.attached', { name: f.name }),
          },
        ],
      };
    if (said.trim()) {
      thinking = !!helper;
      if (thinking) paint();
    }
    const r = !said.trim()
      ? { interview: iv }
      : helper
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
    thinking = false;
    busy = false;
    iv = r.interview;
    box.setBusy(false);
    box.set('');
    writeFlow(ctx, { ...flow, answers: iv.answers, notes: [...iv.notes] });
    ctx.setPrefs({ drafts: { ...ctx.prefs().drafts, [style.id]: iv.answers } });
    paint();
    box.input.focus();
  };
  const box = composer({
    ctx,
    role: roleOf(c),
    model: () => currentModel(ctx),
    onModel: (id) => {
      ctx.setPrefs({ model: id });
      void paintSide();
    },
    placeholder: t('director.placeholder'),
    onSend: (text, files) => doSend(text, files),
  });
  out.append(
    h(
      'div',
      { class: 'dir-stage' },
      h(
        'section',
        { class: 'dir-main' },
        h(
          'header',
          { class: 'dir-head' },
          h('span', { class: 'orb', 'aria-hidden': 'true' }),
          h('h1', { text: `${t('director.title')} · ${ctx.say(style.name)}` }),
        ),
        log,
        box.el,
      ),
      side,
    ),
  );
  paint();
  box.input.focus();
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
      checked = await draftPlan(ctx, style, flow.answers, [
        ...flow.notes,
        ...projectStyleNotes(ctx, flow.projectId),
      ]);
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
  /** P2B-31: the method chip's colour by its cost (free, low, high). */
  const costClass = (m: string) => {
    const tool = c.director.tools.find((x) => x.id === m);
    const cost = tool?.costId ? costById(c, tool.costId) : undefined;
    const most = cost?.max ?? 0;
    return most === 0 ? 'free' : most < 10 ? 'low' : 'high';
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
        // P2B-31: a picture per scene, drawn from its id in brand colours.
        h(
          'div',
          { class: 'scene-thumb' },
          artSvg(s.id, c, `${i + 1}`, 160, 90),
        ),
        h(
          'div',
          { class: 'scene-head' },
          h('strong', {
            text: `${t('plan.scene', { n: i + 1 })}: ${s.title ?? ''}`,
          }),
          reveal.methods
            ? h('span', {
                class: `chip method cost-${costClass(m)}`,
                'data-cost': costClass(m),
                text: toolName(m),
              })
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
            onclick: async () => {
              // P4: the project exists; the files the video needs are asked
              // for on the next page, where Director waits.
              const ws = ctx.s.ws(ctx.user.id);
              const projectId =
                (flow.projectId && ws.video(flow.projectId)
                  ? flow.projectId
                  : '') || (await newDirectorVideo(ctx));
              if (!projectId) return;
              ws.markAi(projectId);
              writeFlow(ctx, { ...flow, projectId });
              const slots = planSlots(video!, voice);
              if (!slots.length) {
                sessionStorage.setItem(
                  `aive.panel.build.${ctx.user.id}`,
                  JSON.stringify({
                    styleId: style.id,
                    plan: video,
                    model,
                    max: e!.max,
                    voice,
                    projectId,
                    slots: [],
                    key: `build-${Date.now().toString(36)}`,
                  }),
                );
                ctx.go('build');
                return;
              }
              ws.pause(projectId, {
                step: 'assets',
                templateId: style.id,
                job: { plan: video, model, max: e!.max, voice },
                slots,
              });
              ctx.go(`assets-step/${projectId}`);
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
/** The editor address that builds a finished plan (into the project when there is one). */
const handoffHref = (id: string, projectId?: string) =>
  `/?handoff=${encodeURIComponent(id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`;

export const buildScreen: Screen = async (ctx, _args, out) => {
  const c = ctx.s.config;
  let job: {
    styleId: string;
    plan: VideoPlan;
    model: string;
    max: number;
    voice?: boolean;
    key: string;
    projectId?: string;
    slots?: AssetSlot[];
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
    let done: {
      id: string;
      title: string;
      used: number;
      back: number;
      projectId?: string;
    } | null = null;
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
            href: handoffHref(done.id, done.projectId),
          },
          t('build.open'),
        ),
      ),
    );
    return;
  }
  const steps = h('ol', {
    class: 'steps notes',
    id: 'build-steps',
    'aria-live': 'polite',
  });
  const bar = h('progress', { id: 'build-progress', max: 100, value: 0 });
  const pct = h('span', { class: 'meter-num', text: '0' });
  const setPct = (n: number) => {
    bar.value = n;
    pct.textContent = String(n);
  };
  const status = h('p', {
    class: 'build-status',
    id: 'build-status',
    role: 'status',
  });
  const actions = h('div', { class: 'actions' });
  // P2-R3: each scene is a frame in a film strip; the big frame shows the one
  // being made right now. The pictures are the plan's real layers laid out by
  // the editor's own layout code (a layout preview, see scene-frame.ts); if
  // that cannot load, the seeded art is shown instead.
  let sf: typeof import('../scene-frame') | null = null;
  try {
    sf = await import('../scene-frame');
  } catch {
    sf = null;
  }
  const arts = sf
    ? job.plan.scenes.map((_, i) => sf!.sceneArt(job!.plan, i))
    : [];
  const aspect = job.plan.meta.aspect.replace(':', ' / ');
  const wide = job.plan.meta.aspect === '16:9';
  let raf = 0;
  /** A canvas with scene i drawn at progress p (0 to 1). */
  const sceneCanvas = (i: number, cssWidth: number, p: number) => {
    const art = arts[i]!;
    const cv = document.createElement('canvas');
    cv.width = cssWidth * 2;
    cv.height = sf!.frameHeight(art, cv.width);
    cv.className = 'scene-canvas';
    sf!.paintScene(cv, art, p);
    return cv;
  };
  const play = (cv: HTMLCanvasElement, i: number) => {
    cancelAnimationFrame(raf);
    if (!motionOn()) {
      sf!.paintScene(cv, arts[i]!, 1);
      return;
    }
    const t0 = performance.now();
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / 1500);
      sf!.paintScene(cv, arts[i]!, p);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };
  const frameArt = (i: number, w: number, hh: number) =>
    artSvg(job!.plan.scenes[i]?.id ?? `scene-${i}`, c, '', w, hh);
  const bigFrame = h('div', {
    class: 'build-frame',
    'data-state': 'waiting',
    style: `aspect-ratio:${aspect};--fw:${wide ? 'min(520px,86vw)' : 'min(300px,70vw)'}`,
  });
  const bigCap = h('p', { class: 'build-cap' });
  const showFrame = (i: number) => {
    const sc = job!.plan.scenes[i];
    bigFrame.classList.remove('swap');
    void bigFrame.offsetWidth;
    bigFrame.classList.add('swap');
    const cv = sf ? sceneCanvas(i, wide ? 520 : 300, 0) : null;
    clear(
      bigFrame,
      cv ?? frameArt(i, 360, 640),
      h('span', { class: 'build-scan', 'aria-hidden': 'true' }),
      h('span', {
        class: 'build-tag',
        text: `${i + 1} / ${job!.plan.scenes.length}`,
      }),
    );
    if (cv) play(cv, i);
    bigCap.textContent = sc?.narration ?? sc?.title ?? '';
  };
  showFrame(0);
  const preview = h(
    'ol',
    { class: 'preview strip', id: 'build-preview' },
    job.plan.scenes.map((s, i) =>
      h(
        'li',
        { class: 'preview-card', 'data-state': 'waiting' },
        h(
          'div',
          { class: 'frame-thumb', style: `aspect-ratio:${aspect}` },
          sf ? sceneCanvas(i, 200, 0) : frameArt(i, 200, 112),
        ),
        h('strong', { text: `${i + 1}. ${s.title ?? ''}` }),
        h('span', { class: 'muted frame-text', text: s.narration ?? '' }),
        h('span', { class: 'frame-badge', 'aria-hidden': 'true' }),
      ),
    ),
  );
  const fillThumb = (i: number) => {
    const cv = preview.querySelectorAll<HTMLCanvasElement>(
      '.frame-thumb canvas',
    )[i];
    if (cv && sf) sf.paintScene(cv, arts[i]!, 1);
  };
  // P2B-31: the plan being built, read-only, in the mono face.
  const code = h(
    'details',
    { class: 'code-view' },
    h('summary', { text: t('build.planCode') }),
    h('pre', {
      class: 'code',
      id: 'build-code',
      text: JSON.stringify(job.plan, null, 2).slice(0, 20000),
    }),
  );
  out.append(
    h('h1', { text: t('build.title') }),
    h(
      'div',
      { class: 'build-stage' },
      h('div', { class: 'build-notes' }, steps),
      h('div', { class: 'build-main' }, bigFrame, bigCap),
      h(
        'div',
        { class: 'build-meter' },
        h('span', { class: 'meter-pct' }, pct, h('small', { text: '%' })),
        bar,
        status,
      ),
    ),
    preview,
    code,
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
          setPct(Math.round((e.index / e.total) * 90));
          showFrame(e.index);
          tick('select');
          const cards = preview.querySelectorAll<HTMLElement>('.preview-card');
          if (e.index > 0) {
            cards[e.index - 1]!.dataset.state = 'done';
            fillThumb(e.index - 1);
          }
          cards[e.index]!.dataset.state = 'working';
        } else if (e.step === 'media')
          step(
            e.kind === 'voice'
              ? t('build.voice')
              : t('build.picture', { i: e.index + 1 }),
          );
        else if (e.step === 'check') step(t('build.check'));
        else if (e.step === 'done') {
          setPct(100);
          tick('done');
          bigFrame.dataset.state = 'done';
          for (const card of preview.querySelectorAll<HTMLElement>(
            '.preview-card',
          ))
            card.dataset.state = 'done';
          arts.forEach((_, n) => fillThumb(n));
          const big = bigFrame.querySelector('canvas');
          cancelAnimationFrame(raf);
          if (big && sf) sf.paintScene(big, arts[arts.length - 1]!, 1);
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
    // the Asset Library. P4: the project exists, so the rows go straight to
    // its libraries: AI-made files to AI Libraries, the person's own files
    // to Media Libraries.
    const owned = j.projectId ?? `handoff:${id}`;
    const ws = ctx.s.ws(ctx.user.id);
    const mine = [] as { name: string; type: string; bytes: Uint8Array }[];
    for (const sl of j.slots ?? []) {
      if (!sl.filled) continue;
      const f = await getSlotFile(j.projectId ?? '', sl.name).catch(
        () => undefined,
      );
      if (f)
        mine.push({
          name: f.name,
          type: f.type,
          bytes: new Uint8Array(await f.blob.arrayBuffer()),
        });
    }
    if (result.files.length || mine.length) {
      await putHandoffFiles(id, [
        ...result.files.map((f) => ({
          name: f.name,
          type: f.type,
          bytes: fromBase64(f.base64),
        })),
        ...mine,
      ]).catch(() => undefined);
      for (const f of result.files)
        try {
          ctx.s.saveAsset({
            id: `${id}-${f.name}`,
            userId: ctx.user.id,
            projectId: owned,
            kind: f.kind,
            name: f.name,
            studioId: 'director',
            library: 'ai',
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
    // The editor lists every file the video still waits for, by name.
    const made = new Set(
      result.files.map((f) => f.name.replace(/\.[a-z0-9]{2,5}$/i, '')),
    );
    const expected = (j.slots ?? []).map((sl) => ({
      name: sl.name,
      kind: sl.kind,
      filled: sl.filled || made.has(sl.name),
    }));
    localStorage.setItem(`${HANDOFF_KEY(id)}.slots`, JSON.stringify(expected));
    if (j.projectId && ws.video(j.projectId)) {
      ws.resume(j.projectId);
      ws.markAi(j.projectId);
      ws.setStage(j.projectId, 'built');
      // ROUND-A A1: the first built Video gives an empty Project its style.
      ws.fillStyleFromVideo(j.projectId, styleFromPlan(result.plan));
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
        ...(j.projectId ? { projectId: j.projectId } : {}),
      }),
    );
    actions.append(
      h(
        'a',
        {
          class: 'button primary',
          id: 'open-in-editor',
          href: handoffHref(id, j.projectId),
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
