// P3U: renders a Studio form from the CHOSEN MODEL's declared parameters
// (a FormSpec from the StudioEngine). Which fields exist, their limits and
// their show-if rules come from the model; this file only draws them. The
// engine reports errors but never fixes a value, so clamping while the person
// types is done here, as the contract says.
import type {
  FormSpec,
  FormValues,
  ParamDecl,
  StudioEngine,
} from '../contracts/p3';
import { h } from './dom';
import { waveSvg } from './art';
import { t } from './strings';

/** A label as the contract and the parsed config both give it. */
export type Txt = { readonly en: string; readonly hi?: string | undefined };
type Val = string | number | boolean | readonly string[];
export interface StudioFormView {
  readonly el: HTMLElement;
  values(): FormValues;
  /** Replaces every value (Enhance, Undo enhance) and redraws. */
  setValues(v: FormValues): void;
  /** Shows the engine's errors under their fields; true when there are none. */
  showIssues(): boolean;
}

const hue = (s: string) =>
  [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export function renderStudioForm(
  spec: FormSpec,
  engine: StudioEngine,
  initial: FormValues,
  say: (x: Txt | undefined) => string,
  onChange: (v: FormValues) => void,
): StudioFormView {
  const el = h('form', {
    class: 'brief-form studio-form',
    id: 'studio-fields',
    novalidate: true,
    onsubmit: (e: Event) => e.preventDefault(),
  });
  let values: Record<string, Val> = { ...engine.defaults(spec), ...initial };
  let shown = false;
  const wraps = new Map<string, HTMLElement>();
  const errs = new Map<string, HTMLElement>();
  const preview = h('pre', {
    id: 'studio-preview-text',
    class: 'studio-preview-text',
  });

  const set = (id: string, v: Val | undefined) => {
    const next = { ...values };
    if (v === undefined || v === '') delete next[id];
    else next[id] = v;
    values = next;
    refresh();
    onChange(values);
  };

  const refresh = () => {
    const visible = new Set(engine.visible(spec, values).map((d) => d.id));
    for (const [id, w] of wraps) w.hidden = !visible.has(id);
    preview.textContent = engine.assemble(spec, values).preview;
    if (shown) paintErrors();
  };
  const paintErrors = () => {
    const r = engine.validate(spec, values);
    for (const [id, line] of errs) {
      const m = !r.ok ? r.errors[id] : undefined;
      line.textContent = m ? say(m) : '';
      wraps.get(id)?.classList.toggle('invalid', !!m);
    }
  };

  const pills = (d: ParamDecl, multi: boolean): HTMLElement => {
    const cur = values[d.id];
    const list = Array.isArray(cur) ? cur : cur === undefined ? [] : [cur];
    const box = h('div', {
      class: 'seg-group studio-pills',
      role: multi ? 'group' : 'radiogroup',
      'aria-label': say(d.label),
      'data-field': d.id,
    });
    const paint = () => {
      const now = values[d.id];
      const sel = Array.isArray(now) ? now : now === undefined ? [] : [now];
      for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
        const on = sel.includes(b.dataset.value ?? '');
        b.classList.toggle('on', on);
        b.setAttribute(multi ? 'aria-pressed' : 'aria-checked', String(on));
      }
    };
    for (const o of d.options) {
      box.append(
        h('button', {
          type: 'button',
          class: 'seg',
          role: multi ? undefined : 'radio',
          'data-value': o.value,
          text: say(o.label),
          onclick: () => {
            if (multi) {
              const now = values[d.id];
              const arr = Array.isArray(now) ? [...now] : [];
              set(
                d.id,
                arr.includes(o.value)
                  ? arr.filter((x) => x !== o.value)
                  : [...arr, o.value],
              );
            } else set(d.id, o.value);
            paint();
          },
        }),
      );
    }
    void list;
    queueMicrotask(paint);
    return box;
  };

  /** Cards with a picture: styles and voices. */
  const cards = (d: ParamDecl): HTMLElement => {
    const box = h('div', {
      class: 'studio-cards',
      role: 'radiogroup',
      'aria-label': say(d.label),
      'data-field': d.id,
    });
    const paint = () => {
      for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
        const on = values[d.id] === b.dataset.value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
    for (const o of d.options) {
      const art =
        d.type === 'voice'
          ? waveSvg(o.value)
          : h('span', {
              class: 'studio-swatch',
              'aria-hidden': 'true',
              style: `background:linear-gradient(135deg,hsl(${hue(o.value)} 70% 52%),hsl(${(hue(o.value) + 70) % 360} 70% 30%))`,
            });
      box.append(
        h(
          'button',
          {
            type: 'button',
            class: 'studio-card',
            role: 'radio',
            'data-value': o.value,
            onclick: () => {
              set(d.id, o.value);
              paint();
            },
          },
          art,
          h('span', { text: say(o.label) }),
        ),
      );
    }
    queueMicrotask(paint);
    return box;
  };

  const aspectBox = (d: ParamDecl): HTMLElement => {
    const box = h('div', {
      class: 'seg-group studio-aspects',
      role: 'radiogroup',
      'aria-label': say(d.label),
      'data-field': d.id,
    });
    const paint = () => {
      for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
        const on = values[d.id] === b.dataset.value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
    for (const o of d.options) {
      const [a = '1', b = '1'] = o.value.split(':');
      const w = Number(a) || 1;
      const hh = Number(b) || 1;
      const k = 22 / Math.max(w, hh);
      box.append(
        h(
          'button',
          {
            type: 'button',
            class: 'seg studio-aspect',
            role: 'radio',
            'data-value': o.value,
            onclick: () => {
              set(d.id, o.value);
              paint();
            },
          },
          h('span', {
            class: 'aspect-shape',
            'aria-hidden': 'true',
            style: `width:${Math.round(w * k)}px;height:${Math.round(hh * k)}px`,
          }),
          h('span', { text: say(o.label) }),
        ),
      );
    }
    queueMicrotask(paint);
    return box;
  };

  const control = (d: ParamDecl): HTMLElement => {
    const id = `sf-${d.id}`;
    const v = values[d.id];
    switch (d.type) {
      case 'longtext':
        return h('textarea', {
          id,
          name: d.id,
          rows: 4,
          value: typeof v === 'string' ? v : '',
          oninput: (e: Event) =>
            set(d.id, (e.target as HTMLTextAreaElement).value),
        });
      case 'choice':
        return pills(d, false);
      case 'multi':
        return pills(d, true);
      case 'style-card':
      case 'voice':
        return cards(d);
      case 'aspect':
        return aspectBox(d);
      case 'toggle':
        return h(
          'label',
          { class: 'switch' },
          h('input', {
            type: 'checkbox',
            id,
            name: d.id,
            checked: v === true,
            onchange: (e: Event) =>
              set(d.id, (e.target as HTMLInputElement).checked),
          }),
          h('span', { 'aria-hidden': 'true' }),
        );
      case 'number':
      case 'seed': {
        const input = h('input', {
          type: 'number',
          id,
          name: d.id,
          min: d.min,
          max: d.max,
          step: d.step,
          value: typeof v === 'number' ? String(v) : '',
          oninput: (e: Event) => {
            const n = (e.target as HTMLInputElement).valueAsNumber;
            if (!Number.isFinite(n)) return set(d.id, undefined);
            // Clamp down at once; clamp up when the person leaves the field,
            // so typing "15" into a field with a minimum of 10 still works.
            if (d.max !== undefined && n > d.max) {
              input.value = String(d.max);
              return set(d.id, d.max);
            }
            set(d.id, n);
          },
          onchange: () => {
            const n = input.valueAsNumber;
            if (Number.isFinite(n) && d.min !== undefined && n < d.min) {
              input.value = String(d.min);
              set(d.id, d.min);
            }
          },
        });
        return d.type === 'seed'
          ? h(
              'span',
              { class: 'studio-seed' },
              input,
              h('button', {
                type: 'button',
                class: 'button sm',
                'data-random': d.id,
                text: t('studio.random'),
                onclick: () => {
                  const n = Math.floor(Math.random() * 1_000_000);
                  input.value = String(n);
                  set(d.id, n);
                },
              }),
            )
          : input;
      }
      case 'slider':
        return h(
          'span',
          { class: 'slider' },
          h('input', {
            type: 'range',
            id,
            name: d.id,
            min: d.min ?? 0,
            max: d.max ?? 100,
            step: d.step ?? 1,
            value: String(typeof v === 'number' ? v : (d.min ?? 0)),
            oninput: (e: Event) => {
              const n = (e.target as HTMLInputElement).valueAsNumber;
              (e.target as HTMLElement).nextElementSibling!.textContent =
                String(n);
              set(d.id, n);
            },
          }),
          h('output', {
            for: id,
            text: String(typeof v === 'number' ? v : (d.min ?? 0)),
          }),
        );
      case 'color':
        return h('input', {
          type: 'color',
          id,
          name: d.id,
          value: typeof v === 'string' ? v : '#7c5cff',
          oninput: (e: Event) =>
            set(d.id, (e.target as HTMLInputElement).value),
        });
      case 'file':
        return h(
          'span',
          { class: 'file' },
          h('input', {
            type: 'file',
            id,
            name: d.id,
            accept: d.accept.map((a) => `${a}/*`).join(',') || undefined,
            onchange: (e: Event) => {
              const f = (e.target as HTMLInputElement).files;
              set(d.id, f && f.length ? [...f].map((x) => x.name) : undefined);
            },
          }),
        );
      default:
        return h('input', {
          type: 'text',
          id,
          name: d.id,
          value: typeof v === 'string' ? v : '',
          oninput: (e: Event) =>
            set(d.id, (e.target as HTMLInputElement).value),
        });
    }
  };

  const field = (d: ParamDecl): HTMLElement => {
    const line = h('p', {
      class: 'field-error',
      role: 'alert',
      'data-error': d.id,
    });
    errs.set(d.id, line);
    const w = h(
      'div',
      { class: 'field', 'data-field-wrap': d.id },
      h('label', {
        class: 'field-label',
        for: `sf-${d.id}`,
        text: say(d.label) + (d.required ? ' *' : ''),
      }),
      d.help ? h('p', { class: 'muted help', text: say(d.help) }) : null,
      control(d),
      line,
    );
    wraps.set(d.id, w);
    return w;
  };

  const build = () => {
    wraps.clear();
    errs.clear();
    const more = spec.advanced.length
      ? h(
          'details',
          { class: 'more-options', id: 'studio-more' },
          h('summary', { text: t('studio.more') }),
          spec.advanced.map(field),
        )
      : null;
    el.replaceChildren(
      ...spec.basic.map(field),
      ...(more ? [more] : []),
      h(
        'details',
        { class: 'studio-preview', id: 'studio-preview' },
        h('summary', { text: t('studio.preview') }),
        preview,
      ),
    );
    refresh();
  };
  build();

  return {
    el,
    values: () => values,
    setValues(v) {
      values = { ...v };
      build();
      onChange(values);
    },
    showIssues() {
      shown = true;
      paintErrors();
      return engine.validate(spec, values).ok;
    },
  };
}
