// Renders a Style's Brief fields (or a Studio's inputs) from config: every
// field type, show-if and the validation messages. Pure config: a new field
// is an Admin change, not code.
import {
  isVisible,
  validateBrief,
  visibleFields,
  type Answers,
  type BriefField,
  type FormIssue,
  type LText,
  type Style,
} from '../platform-config';
import { h } from './dom';
import { t } from './strings';

export interface FormView {
  readonly el: HTMLElement;
  issues(): FormIssue[];
  showIssues(): void;
}
export function renderForm(
  style: Style,
  answers: Answers,
  say: (x: LText | undefined) => string,
  onChange: (a: Answers) => void,
): FormView {
  const el = h('form', {
    class: 'brief-form',
    novalidate: true,
    onsubmit: (e: Event) => e.preventDefault(),
  });
  let shown = false;
  let a: Answers = { ...answers };
  for (const f of style.brief.fields)
    if (a[f.id] === undefined && f.default !== undefined) a[f.id] = f.default;
  const set = (id: string, v: Answers[string]) => {
    a = { ...a, [id]: v };
    onChange(a);
    paint();
  };
  const message = (issue: FormIssue | undefined, f: BriefField) =>
    !issue
      ? ''
      : issue.code === 'required'
        ? t('brief.required')
        : issue.code === 'option'
          ? t('brief.option')
          : t('brief.range', { min: f.min ?? '', max: f.max ?? '' });

  const control = (f: BriefField): HTMLElement => {
    const v = a[f.id];
    const id = `f-${f.id}`;
    switch (f.type) {
      case 'longtext':
        return h('textarea', {
          id,
          name: f.id,
          rows: 4,
          value: typeof v === 'string' ? v : '',
          oninput: (e: Event) =>
            set(f.id, (e.target as HTMLTextAreaElement).value),
        });
      case 'choice':
        return h(
          'div',
          { class: 'choices', role: 'radiogroup', id },
          f.options.map((o) =>
            h(
              'label',
              { class: 'choice' },
              h('input', {
                type: 'radio',
                name: f.id,
                value: o.value,
                checked: v === o.value,
                onchange: () => set(f.id, o.value),
              }),
              h('span', { text: say(o.label) }),
            ),
          ),
        );
      case 'multi': {
        const list = Array.isArray(v) ? v : [];
        return h(
          'div',
          { class: 'choices', id },
          f.options.map((o) =>
            h(
              'label',
              { class: 'choice' },
              h('input', {
                type: 'checkbox',
                name: f.id,
                value: o.value,
                checked: list.includes(o.value),
                onchange: (e: Event) =>
                  set(
                    f.id,
                    (e.target as HTMLInputElement).checked
                      ? [...list, o.value]
                      : list.filter((x) => x !== o.value),
                  ),
              }),
              h('span', { text: say(o.label) }),
            ),
          ),
        );
      }
      case 'toggle':
        return h(
          'label',
          { class: 'switch' },
          h('input', {
            type: 'checkbox',
            id,
            name: f.id,
            checked: v === true,
            onchange: (e: Event) =>
              set(f.id, (e.target as HTMLInputElement).checked),
          }),
          h('span', { 'aria-hidden': 'true' }),
        );
      case 'number':
        return h('input', {
          type: 'number',
          id,
          name: f.id,
          min: f.min,
          max: f.max,
          value: typeof v === 'number' ? String(v) : '',
          oninput: (e: Event) => {
            const n = (e.target as HTMLInputElement).valueAsNumber;
            set(f.id, Number.isFinite(n) ? n : undefined);
          },
        });
      case 'slider':
        return h(
          'span',
          { class: 'slider' },
          h('input', {
            type: 'range',
            id,
            name: f.id,
            min: f.min ?? 0,
            max: f.max ?? 100,
            value: String(typeof v === 'number' ? v : (f.min ?? 0)),
            oninput: (e: Event) =>
              set(f.id, (e.target as HTMLInputElement).valueAsNumber),
          }),
          h('output', {
            for: id,
            text: String(typeof v === 'number' ? v : ''),
          }),
        );
      case 'color':
        return h('input', {
          type: 'color',
          id,
          name: f.id,
          value: typeof v === 'string' ? v : '#7c5cff',
          oninput: (e: Event) =>
            set(f.id, (e.target as HTMLInputElement).value),
        });
      case 'file':
      case 'voice':
        return h(
          'span',
          { class: 'file' },
          h('input', {
            type: 'file',
            id,
            name: f.id,
            accept: f.type === 'voice' ? 'audio/*' : undefined,
            onchange: (e: Event) =>
              set(
                f.id,
                (e.target as HTMLInputElement).files?.[0]?.name ?? undefined,
              ),
          }),
          typeof v === 'string'
            ? h('span', { class: 'muted', text: t('brief.file', { name: v }) })
            : null,
        );
      case 'ref':
        return h('input', {
          type: 'url',
          id,
          name: f.id,
          placeholder: 'https://',
          value: typeof v === 'string' ? v : '',
          oninput: (e: Event) =>
            set(f.id, (e.target as HTMLInputElement).value),
        });
      default:
        return h('input', {
          type: 'text',
          id,
          name: f.id,
          value: typeof v === 'string' ? v : '',
          oninput: (e: Event) =>
            set(f.id, (e.target as HTMLInputElement).value),
        });
    }
  };
  const rows = new Map<string, HTMLElement>();
  // P2B-30: fields grouped into collapsible sections from the config.
  const groups = new Map<string, HTMLElement>();
  const groupOf = (f: BriefField): HTMLElement => {
    const g = f.group && style.brief.groups.find((x) => x.id === f.group);
    if (!g) return el;
    let box = groups.get(g.id);
    if (!box) {
      box = h(
        'details',
        { class: 'field-group', 'data-group': g.id, open: g.open },
        h('summary', { text: say(g.label) }),
      );
      groups.set(g.id, box);
      el.append(box);
    }
    return box;
  };
  const paint = () => {
    const issues = shown ? validateBrief(style, a) : [];
    const visible = new Set(visibleFields(style, a).map((f) => f.id));
    for (const f of [...style.brief.fields].sort((x, y) => x.order - y.order)) {
      let row = rows.get(f.id);
      if (!row) {
        row = h(
          'div',
          { class: 'field', 'data-field': f.id, 'data-type': f.type },
          h(
            'label',
            { class: 'field-label', for: `f-${f.id}` },
            say(f.label),
            f.required
              ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' })
              : null,
          ),
          f.help ? h('p', { class: 'muted', text: say(f.help) }) : null,
          control(f),
          h('p', { class: 'field-error', role: 'alert' }),
        );
        rows.set(f.id, row);
        groupOf(f).append(row);
      }
      row.hidden = !visible.has(f.id) || !isVisible(f, a);
      const issue = issues.find((i) => i.field === f.id);
      row.classList.toggle('invalid', !!issue);
      row.querySelector('.field-error')!.textContent = message(issue, f);
      const out = row.querySelector('output');
      if (out) out.textContent = String(a[f.id] ?? '');
    }
  };
  paint();
  queueMicrotask(() => onChange(a));
  return {
    el,
    issues: () => validateBrief(style, a),
    showIssues: () => {
      shown = true;
      paint();
    },
  };
}
