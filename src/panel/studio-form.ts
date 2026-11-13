// ROUND-A A4: one reusable Studio form. It draws any Studio tool from the
// Platform Config (fields, option lists, limits, costs), checks every field
// under the field, shows the cost before Run, runs through the gateway with a
// progress line, saves the result (to Studio Libraries or a chosen Video)
// and lists this tool's history. The Studio page uses it; Round B will show
// it inside the Director's asset step (pass `target` to fix where results go).
import {
  canUse,
  defaultModelFor,
  isVisible,
  modelAvailability,
  modelsForRole,
  needsConsent,
  type LText,
  type Model,
  type Studio,
  type StudioField,
} from '../platform-config';
import { estimateStudio, GatewayError, hash } from '../gateway';
import { clear, h } from './dom';
import { icon } from './icons';
import { posterSvg, waveSvg } from './art';
import type { Ctx } from './app';
import type { Asset } from './services';
import { t, type Key } from './strings';
import { bestModels, limitAlert, when } from './screens/common';

export const STUDIO_LIBRARY = 'unsorted';
type Value = string | number | boolean | string[];
export interface StudioFormOptions {
  readonly ctx: Ctx;
  readonly studio: Studio;
  /** Fixes where results go (a Video id); otherwise the person chooses. */
  readonly target?: string;
  /** Called after a result is saved. */
  readonly onSaved?: (asset: Asset) => void;
  /** Draws a placeholder picture or sound (the offline mock's result). */
  readonly mock: {
    image(seed: string, label: string): string;
    audio(seed: string, seconds?: number): string;
  };
  /** Renders a saved result. */
  readonly view: (a: Asset) => HTMLElement;
}
export interface StudioFormView {
  readonly el: HTMLElement;
  /** The current answers (for tests and Round B). */
  answers(): Record<string, Value>;
}

const say = (ctx: Ctx, x: LText | undefined) => ctx.say(x);
const fmtBytes = (n: number) => `${Math.round(n / 1_048_576)} MB`;

/** Where a result can be saved: Studio Libraries, or a Video. */
function destinations(ctx: Ctx) {
  const ws = ctx.s.ws(ctx.user.id);
  ws.reload();
  return [
    { id: STUDIO_LIBRARY, name: t('lib.studioCard') },
    ...ws
      .videos()
      .filter((v) => !ws.project(v.projectId)?.trashedAt)
      .map((v) => ({
        id: v.id,
        name: `${ws.project(v.projectId)?.name ?? ''} › ${v.name}`,
      })),
  ];
}

/** This tool's results, newest first: its own Studio Library. */
export function studioHistory(
  ctx: Ctx,
  studio: Studio,
  view: (a: Asset) => HTMLElement,
): HTMLElement {
  const mine = ctx.s
    .assets(ctx.user.id)
    .filter((a) => a.studioId === studio.id && !a.trashedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  return h(
    'section',
    { class: 'studio-library', id: 'studio-library' },
    h('h2', {
      text: studio.historyLabel
        ? say(ctx, studio.historyLabel)
        : t('studio.library'),
    }),
    mine.length
      ? h(
          'div',
          { class: 'studio-history grid' },
          mine.map((a) =>
            h(
              'article',
              { class: 'card', 'data-asset': a.id, 'data-kind': a.kind },
              h('h3', { text: a.name }),
              h('p', {
                class: 'muted',
                text: when(a.createdAt, ctx.prefs().locale),
              }),
              view(a),
            ),
          ),
        )
      : h('p', {
          class: 'muted',
          id: 'studio-library-empty',
          text: t('studio.libraryEmpty'),
        }),
    h('a', {
      href: `#/assets/studio/${encodeURIComponent(studio.id)}`,
      class: 'button sm',
      text: t('studio.libraryOpen'),
    }),
  );
}

export function mountStudioForm(o: StudioFormOptions): StudioFormView {
  const { ctx, studio: s } = o;
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  const answers: Record<string, Value> = {};
  const files = new Map<string, File>();
  for (const f of s.inputs)
    if (f.default !== undefined) answers[f.id] = f.default as Value;
  // ---- the model ------------------------------------------------------------
  const models = bestModels(ctx, modelsForRole(c, s.role));
  const usable = (m: Model) =>
    modelAvailability(c, plan, m.id).ok && ctx.s.connected(m.id);
  let model: Model | undefined =
    (c.assignments[s.role]
      ? models.find((m) => m.id === c.assignments[s.role] && usable(m))
      : undefined) ??
    models.find(usable) ??
    defaultModelFor(c, plan, s.role);
  const modelSelect = h(
    'select',
    {
      id: 'studio-model',
      'aria-label': t('studio.model'),
      onchange: (e: Event) => {
        model = models.find(
          (m) => m.id === (e.target as HTMLSelectElement).value,
        );
        paint();
      },
    },
    models.map((m) =>
      h('option', {
        value: m.id,
        text: `${say(ctx, m.name)}${usable(m) ? '' : ` · ${t('common.locked')}`}`,
        disabled: !usable(m),
        ...(m.id === model?.id ? { selected: true } : {}),
      }),
    ),
  );
  // ---- fields ---------------------------------------------------------------
  const errors = new Map<string, string>();
  let tried = false;
  const shown = (f: StudioField) =>
    isVisible(f as never, answers as never) &&
    (!f.onlyModels?.length || (!!model && f.onlyModels.includes(model.id)));
  const optionOk = (opt: { requires?: string[] | undefined }) =>
    canUse(plan, opt.requires ?? []);
  const check = (): boolean => {
    errors.clear();
    for (const f of s.inputs) {
      if (!shown(f) || f.type === 'info' || f.type === 'ideas') continue;
      const v = answers[f.id];
      const empty =
        v === undefined ||
        v === '' ||
        (Array.isArray(v) && !v.length) ||
        (f.type === 'file' && !files.has(f.id));
      if (f.required && empty) {
        errors.set(f.id, t('brief.required'));
        continue;
      }
      if (empty) continue;
      if (typeof v === 'string' && f.maxLength && [...v].length > f.maxLength)
        errors.set(f.id, t('studio.tooLong', { n: f.maxLength }));
      if (
        typeof v === 'number' &&
        ((f.min !== undefined && v < f.min) ||
          (f.max !== undefined && v > f.max))
      )
        errors.set(
          f.id,
          t('brief.range', { min: f.min ?? '', max: f.max ?? '' }),
        );
      const opt = f.options.find((x) => x.value === v);
      if (opt && !optionOk(opt)) errors.set(f.id, t('studio.optionLocked'));
      const file = files.get(f.id);
      if (file && f.accept?.length && !f.accept.includes(file.type))
        errors.set(f.id, t('studio.fileType'));
      if (file && f.maxBytes && file.size > f.maxBytes)
        errors.set(f.id, t('studio.fileSize', { n: fmtBytes(f.maxBytes) }));
    }
    return errors.size === 0;
  };
  const set = (id: string, v: Value | undefined) => {
    if (v === undefined) delete answers[id];
    else answers[id] = v;
    if (tried) check();
    paint();
  };
  const preview = (opt: { value: string; preview?: string | undefined }) => {
    const src =
      opt.preview && /^(https:\/\/|\/)/.test(opt.preview)
        ? opt.preview
        : o.mock.audio(`voice:${opt.value}`, 1);
    void new Audio(src).play().catch(() => undefined);
  };
  const action = async (f: StudioField, area: HTMLTextAreaElement) => {
    // Enhance (improve the prompt) or Generate (write one from the frames),
    // through the gateway on the owner's writing model.
    const role = c.director.roles.write;
    // A connected model the plan allows (a real one before the offline mock).
    const m = bestModels(ctx, modelsForRole(c, role)).find(usable);
    if (!m) {
      errors.set(f.id, t('studio.noModel'));
      return paint();
    }
    const input =
      f.action === 'generate'
        ? [files.get('first')?.name, files.get('last')?.name, answers.look]
            .filter(Boolean)
            .join(', ') || say(ctx, s.name)
        : area.value.trim();
    if (!input) {
      errors.set(f.id, t('brief.required'));
      return paint();
    }
    try {
      const r = await ctx.s.gateway.run({
        userId: ctx.user.id,
        plan,
        role,
        modelId: m.id,
        request: {
          system:
            f.action === 'generate'
              ? 'studio:generate-prompt'
              : 'studio:enhance',
          messages: [{ role: 'user', content: input }],
          prompt: input,
        },
        maxCredits: c.costs.find((x) => x.id === 'prompt-help')?.max ?? 1,
        key: `prompt-${s.id}-${Date.now().toString(36)}`,
      });
      const text = (r.result.text ?? '').slice(0, f.maxLength ?? 4000);
      if (text) set(f.id, text);
      ctx.refreshTop();
    } catch (e) {
      errors.set(f.id, (e as Error).message);
      paint();
    }
  };
  const control = (f: StudioField): HTMLElement => {
    const id = `sf-${f.id}`;
    const v = answers[f.id];
    const opts = f.options;
    const chip = (
      opt: (typeof opts)[number],
      on: boolean,
      onPick: () => void,
    ) => {
      const ok = optionOk(opt);
      return h(
        'button',
        {
          type: 'button',
          class: `chip${ok ? '' : ' locked'}`,
          'data-value': opt.value,
          'aria-pressed': String(on),
          disabled: !ok,
          title: ok ? undefined : t('studio.optionLocked'),
          onclick: onPick,
        },
        ok ? null : icon('lock', 12),
        say(ctx, opt.label),
      );
    };
    switch (f.type) {
      case 'info':
        return h(
          'ul',
          { class: 'sf-info', id },
          (f.lines ?? []).map((l) => h('li', { text: say(ctx, l) })),
        );
      case 'ideas': {
        const key = f.ideasFor ? String(answers[f.ideasFor] ?? 'all') : 'all';
        const list = f.ideas?.[key] ?? f.ideas?.all ?? [];
        const max = f.ideasShown ?? 4;
        const open = el.dataset[`more${f.id}`] === '1';
        return h(
          'div',
          { class: 'sf-ideas', id },
          ...(open ? list : list.slice(0, max)).map((idea) =>
            h('button', {
              type: 'button',
              class: 'sf-idea',
              text: say(ctx, idea),
              onclick: () => f.fills && set(f.fills, say(ctx, idea)),
            }),
          ),
          list.length > max && !open
            ? h('button', {
                type: 'button',
                class: 'button sm ghost',
                'data-act': 'more-ideas',
                text: t('studio.viewMore'),
                onclick: () => {
                  el.dataset[`more${f.id}`] = '1';
                  paint();
                },
              })
            : null,
        );
      }
      case 'longtext':
      case 'text': {
        const text = typeof v === 'string' ? v : '';
        const input =
          f.type === 'longtext'
            ? h('textarea', {
                id,
                rows: 4,
                value: text,
                ...(f.maxLength ? { maxlength: f.maxLength } : {}),
              })
            : h('input', {
                id,
                type: 'text',
                value: text,
                ...(f.maxLength ? { maxlength: f.maxLength } : {}),
              });
        const counter = f.maxLength
          ? h('span', {
              class: 'sf-count',
              text: `${[...text].length} / ${f.maxLength}`,
            })
          : null;
        input.addEventListener('input', () => {
          answers[f.id] = input.value;
          if (counter)
            counter.textContent = `${[...input.value].length} / ${f.maxLength}`;
          update();
        });
        // No repaint on leaving the field: a repaint would replace the button
        // the pointer is about to click (Enhance, Run).
        input.addEventListener('change', () => {
          answers[f.id] = input.value;
          update();
        });
        return h(
          'div',
          { class: 'sf-text' },
          input,
          h(
            'div',
            { class: 'sf-under' },
            counter,
            f.action
              ? h('button', {
                  type: 'button',
                  class: 'button sm',
                  'data-act': f.action,
                  text: t(
                    f.action === 'enhance'
                      ? 'studio.enhancePrompt'
                      : 'studio.generatePrompt',
                  ),
                  onclick: () => void action(f, input as HTMLTextAreaElement),
                })
              : null,
          ),
        );
      }
      case 'choice': {
        if (f.display === 'select')
          return h(
            'select',
            {
              id,
              onchange: (e: Event) =>
                set(f.id, (e.target as HTMLSelectElement).value),
            },
            opts.map((opt) =>
              h('option', {
                value: opt.value,
                text: say(ctx, opt.label),
                disabled: !optionOk(opt),
                ...(opt.value === v ? { selected: true } : {}),
              }),
            ),
          );
        if (f.display === 'cards')
          return h(
            'div',
            { class: 'sf-cards', id, role: 'radiogroup' },
            opts.map((opt) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'sf-card glow',
                  role: 'radio',
                  'data-value': opt.value,
                  'aria-checked': String(v === opt.value),
                  disabled: !optionOk(opt),
                  onclick: () => set(f.id, opt.value),
                },
                h(
                  'span',
                  { class: 'sf-card-art', 'aria-hidden': 'true' },
                  opt.art && /^(https:\/\/|\/)/.test(opt.art)
                    ? h('img', { src: opt.art, alt: '' })
                    : posterSvg(`${s.id}-${opt.art ?? opt.value}`, c),
                ),
                h('span', { text: say(ctx, opt.label) }),
              ),
            ),
          );
        return h(
          'div',
          {
            class: `chips sf-chips${f.display === 'toggle' ? ' sf-toggle' : ''}`,
            id,
            role: 'radiogroup',
          },
          opts.map((opt) =>
            chip(opt, v === opt.value, () => set(f.id, opt.value)),
          ),
        );
      }
      case 'multi': {
        const list = Array.isArray(v) ? v : [];
        return h(
          'div',
          { class: 'chips sf-chips', id, role: 'group' },
          opts.map((opt) =>
            chip(opt, list.includes(opt.value), () =>
              set(
                f.id,
                list.includes(opt.value)
                  ? list.filter((x) => x !== opt.value)
                  : [...list, opt.value],
              ),
            ),
          ),
        );
      }
      case 'toggle':
        return h('input', {
          id,
          type: 'checkbox',
          role: 'switch',
          checked: v === true,
          onchange: (e: Event) =>
            set(f.id, (e.target as HTMLInputElement).checked),
        });
      case 'number':
      case 'slider': {
        const input = h('input', {
          id,
          type: f.type === 'slider' ? 'range' : 'number',
          value: typeof v === 'number' ? String(v) : '',
          ...(f.min !== undefined ? { min: f.min } : {}),
          ...(f.max !== undefined ? { max: f.max } : {}),
          onchange: (e: Event) => {
            const n = Number((e.target as HTMLInputElement).value);
            set(f.id, Number.isFinite(n) ? n : undefined);
          },
        });
        return f.type === 'slider'
          ? h(
              'div',
              { class: 'sf-slider' },
              input,
              h('output', {
                for: id,
                text: typeof v === 'number' ? String(v) : '',
              }),
            )
          : input;
      }
      case 'voice':
        return h(
          'div',
          { class: 'sf-voices', id, role: 'radiogroup' },
          opts.map((opt) =>
            h(
              'div',
              {
                class: 'sf-voice',
                'data-value': opt.value,
                'aria-checked': String(v === opt.value),
              },
              h(
                'label',
                { class: 'choice' },
                h('input', {
                  type: 'radio',
                  name: id,
                  value: opt.value,
                  checked: v === opt.value,
                  onchange: () => set(f.id, opt.value),
                }),
                h('span', { text: say(ctx, opt.label) }),
              ),
              waveSvg(opt.value),
              h(
                'button',
                {
                  type: 'button',
                  class: 'button sm ghost',
                  'data-act': 'preview',
                  'aria-label': `${t('studio.playSample')}: ${say(ctx, opt.label)}`,
                  onclick: () => preview(opt),
                },
                icon('play', 14),
              ),
            ),
          ),
        );
      case 'file': {
        const file = files.get(f.id);
        const input = h('input', {
          id,
          type: 'file',
          accept: (f.accept ?? []).join(','),
          class: 'sf-file-input',
          onchange: (e: Event) => {
            const picked = (e.target as HTMLInputElement).files?.[0];
            if (picked) files.set(f.id, picked);
            else files.delete(f.id);
            set(f.id, picked?.name);
          },
        });
        return h(
          'div',
          { class: 'sf-file' },
          h(
            'label',
            { class: 'sf-drop', for: id },
            icon('file', 18),
            h('span', {
              text: file ? file.name : t('studio.chooseFile'),
            }),
          ),
          input,
          file
            ? h('button', {
                type: 'button',
                class: 'button sm ghost',
                'data-act': 'clear-file',
                text: t('studio.removeFile'),
                onclick: () => {
                  files.delete(f.id);
                  set(f.id, undefined);
                },
              })
            : null,
          f.swapWith
            ? h('button', {
                type: 'button',
                class: 'button sm',
                'data-act': 'swap',
                text: t('studio.swap'),
                onclick: () => {
                  const a = files.get(f.id);
                  const b = files.get(f.swapWith!);
                  if (b) files.set(f.id, b);
                  else files.delete(f.id);
                  if (a) files.set(f.swapWith!, a);
                  else files.delete(f.swapWith!);
                  answers[f.id] = b?.name as never;
                  answers[f.swapWith!] = a?.name as never;
                  if (!b) delete answers[f.id];
                  if (!a) delete answers[f.swapWith!];
                  paint();
                },
              })
            : null,
        );
      }
      default:
        return h('input', {
          id,
          type: 'text',
          value: typeof v === 'string' ? v : '',
          onchange: (e: Event) =>
            set(f.id, (e.target as HTMLInputElement).value),
        });
    }
  };
  const row = (f: StudioField) =>
    h(
      'div',
      {
        class: `field sf-field sf-type-${f.type}`,
        'data-field': f.id,
        'data-invalid': errors.has(f.id) ? 'true' : undefined,
      },
      f.type === 'ideas' || f.type === 'info'
        ? h('span', { class: 'field-label', text: say(ctx, f.label) })
        : h('label', {
            class: 'field-label',
            for: `sf-${f.id}`,
            text: `${say(ctx, f.label)}${f.required ? ' *' : ''}`,
          }),
      control(f),
      f.help && f.type !== 'info'
        ? h('p', { class: 'muted sf-help', text: say(ctx, f.help) })
        : null,
      errors.has(f.id)
        ? h('p', {
            class: 'field-error',
            role: 'alert',
            'data-error': f.id,
            text: errors.get(f.id)!,
          })
        : null,
    );
  // ---- the rest -------------------------------------------------------------
  const fieldsBox = h('div', { class: 'sf-fields' });
  const cost = h('p', {
    class: 'estimate',
    id: 'studio-cost',
    'aria-live': 'polite',
  });
  const consent = s.consent
    ? h(
        'label',
        { class: 'choice consent', id: 'studio-consent-row' },
        h('input', { type: 'checkbox', id: 'studio-consent' }),
        h('span', { text: say(ctx, s.consent) }),
      )
    : null;
  const consentError = h('p', {
    class: 'field-error',
    role: 'alert',
    id: 'consent-error',
  });
  const dests = destinations(ctx);
  const dest = o.target
    ? null
    : h(
        'select',
        { id: 'studio-project', 'aria-label': t('studio.saveTo') },
        dests.map((d) => h('option', { value: d.id, text: d.name })),
      );
  const progress = h(
    'div',
    { class: 'sf-progress', id: 'studio-progress', hidden: true },
    h('div', { class: 'sf-progress-bar' }),
    h('span', { text: t('studio.working') }),
  );
  const result = h('div', {
    class: 'result',
    id: 'studio-result',
    'aria-live': 'polite',
  });
  let max = 0;
  const update = () => {
    if (!model) {
      cost.textContent = t('studio.noModel');
      return;
    }
    const e = estimateStudio(c, s, model, answers);
    max = e.max;
    cost.textContent = t('studio.cost', { n: e.max });
    if (consent) consent.hidden = !needsConsent(s, answers as never);
  };
  function paint() {
    const active = document.activeElement?.id;
    const loose = s.inputs.filter((f) => !f.group && shown(f));
    clear(
      fieldsBox,
      h(
        'div',
        { class: 'field sf-field', 'data-field': 'model' },
        h('label', {
          class: 'field-label',
          for: 'studio-model',
          text: t('studio.model'),
        }),
        modelSelect,
      ),
      ...loose.map(row),
      ...s.groups.map((g) => {
        const inside = s.inputs.filter((f) => f.group === g.id && shown(f));
        if (!inside.length) return null;
        const d = h(
          'details',
          {
            class: 'sf-group',
            'data-group': g.id,
            ...(g.open || el.dataset[`open${g.id}`] ? { open: true } : {}),
          },
          h('summary', { text: say(ctx, g.label) }),
          ...inside.map(row),
        );
        d.addEventListener('toggle', () => {
          if (d.open) el.dataset[`open${g.id}`] = '1';
          else delete el.dataset[`open${g.id}`];
        });
        return d;
      }),
    );
    if (active) document.getElementById(active)?.focus();
    update();
  }
  const run = h(
    'button',
    {
      type: 'button',
      class: 'button primary',
      id: 'studio-run',
      onclick: async () => {
        tried = true;
        consentError.textContent = '';
        const ok = check();
        paint();
        if (!ok) {
          fieldsBox
            .querySelector<HTMLElement>(
              '[data-invalid="true"] input, [data-invalid="true"] textarea, [data-invalid="true"] button',
            )
            ?.focus();
          return;
        }
        if (
          consent &&
          !consent.hidden &&
          !(consent.querySelector('input') as HTMLInputElement).checked
        ) {
          consentError.textContent = t('studio.consentNeeded');
          return;
        }
        if (!model) return;
        run.disabled = true;
        progress.hidden = false;
        clear(result);
        const prompt = s.inputs
          .filter(
            (f) =>
              shown(f) &&
              answers[f.id] !== undefined &&
              f.type !== 'ideas' &&
              f.type !== 'info',
          )
          .map(
            (f) =>
              `${f.id}: ${Array.isArray(answers[f.id]) ? (answers[f.id] as string[]).join(', ') : String(answers[f.id])}`,
          )
          .join('\n');
        const units = estimateStudio(c, s, model, answers).units;
        const work = c.costs.find((x) => x.id === s.costId);
        const target = o.target ?? dest?.value ?? STUDIO_LIBRARY;
        try {
          const r = await ctx.s.gateway.run({
            userId: ctx.user.id,
            plan,
            role: s.role,
            modelId: model.id,
            request: {
              system: `studio:${s.id}`,
              messages: [{ role: 'user', content: prompt }],
              prompt,
              units,
            },
            maxCredits: max,
            workCredits: work ? work.min * units : 0,
            requires: s.requires,
            ...(s.toolId ? { toolId: s.toolId } : {}),
            ...(s.id === 'voice-clone'
              ? { action: 'voice-clone' as const }
              : { action: 'store' as const }),
            addMb:
              s.output === 'video'
                ? 20
                : s.output === 'image' || s.output === 'audio'
                  ? 2
                  : 0.01,
            key: `studio-${s.id}-${Date.now().toString(36)}`,
          });
          const seed = `${prompt}:${Date.now()}`;
          const first = String(
            answers.name ??
              answers.title ??
              answers.prompt ??
              answers.plot ??
              answers.script ??
              answers.description ??
              say(ctx, s.name),
          )
            .split('\n')[0]!
            .slice(0, 40);
          const asset: Asset = {
            id: `asset-${Date.now().toString(36)}-${hash(seed).toString(36)}`,
            userId: ctx.user.id,
            projectId: target,
            kind: s.output,
            name: `${say(ctx, s.name)}: ${first}`,
            studioId: s.id,
            studioName: say(ctx, s.name),
            bytes: 0,
            createdAt: new Date().toISOString(),
          };
          const made = r.result.media;
          if (made?.base64 && made.mime)
            asset.dataUrl = `data:${made.mime};base64,${made.base64}`;
          else if (s.output === 'image' || s.output === 'video')
            asset.dataUrl = o.mock.image(seed, first);
          else if (s.output === 'audio') asset.dataUrl = o.mock.audio(seed);
          else if (s.output === 'captions')
            asset.text = `1\n00:00:00,000 --> 00:00:03,000\n${first}\n`;
          else asset.text = r.result.text ?? '';
          asset.bytes =
            (asset.dataUrl?.length ?? 0) + (asset.text?.length ?? 0);
          ctx.s.saveAsset(asset);
          const where =
            dests.find((d) => d.id === target)?.name ?? t('lib.studioCard');
          clear(
            result,
            h('p', {
              class: 'ok-state',
              id: 'studio-saved',
              text: t('studio.savedTo', { project: where, n: r.credits }),
            }),
            o.view(asset),
          );
          await ctx.s.sync(ctx.user.id).catch(() => undefined);
          el.querySelector('#studio-library')?.replaceWith(
            studioHistory(ctx, s, o.view),
          );
          ctx.refreshTop();
          o.onSaved?.(asset);
        } catch (e) {
          if (e instanceof GatewayError && e.code.startsWith('limit-')) {
            clear(result, limitAlert('studio-error', e.message));
          } else {
            const msg =
              e instanceof GatewayError
                ? e.code === 'shortage'
                  ? t('gw.shortage', {
                      need: e.detail.need ?? '',
                      have: e.detail.have ?? '',
                    })
                  : t('gw.refused', { message: e.message })
                : t('app.error');
            clear(
              result,
              h('p', {
                class: 'error-state',
                role: 'alert',
                id: 'studio-error',
                text: msg,
              }),
            );
          }
          await ctx.s.sync(ctx.user.id).catch(() => undefined);
          ctx.refreshTop();
        } finally {
          run.disabled = false;
          progress.hidden = true;
        }
      },
    },
    t('studio.run'),
  );
  const el = h(
    'div',
    { class: 'studio-form', 'data-studio-form': s.id },
    fieldsBox,
    dest
      ? h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'studio-project',
            class: 'field-label',
            text: t('studio.saveTo'),
          }),
          dest,
        )
      : null,
    consent,
    consentError,
    h('div', { class: 'sf-run' }, cost, run),
    progress,
    result,
    studioHistory(ctx, s, o.view),
  );
  paint();
  return { el, answers: () => ({ ...answers }) };
}

export type { Key };
