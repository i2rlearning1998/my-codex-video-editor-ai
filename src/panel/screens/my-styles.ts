// P3U: the person's own Styles. A draft comes from "Make this my Style" and is
// never used until it is reviewed and accepted. Talks only to DirectorService.
import type { StyleRecord } from '../../contracts/p3';
import { clear, h, put } from '../dom';
import { directorService } from '../p3-services';
import { t, type Key } from '../strings';
import type { Ctx, Screen } from '../app';
import { empty, when } from './common';

const lines = (v: string): string[] =>
  v
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** A small picture of a Style: its colours, heading font and first rule. */
export function stylePreview(s: {
  name: string;
  palette: readonly string[];
  fonts: { heading: string; body: string };
  rules: readonly string[];
}): HTMLElement {
  const [a = '#7c5cff', b = '#22d3ee'] = s.palette;
  return h(
    'div',
    {
      class: 'mine-preview',
      'data-preview': 'style',
      style: `background:linear-gradient(135deg,${a},${b})`,
    },
    h('strong', {
      class: 'mine-preview-title',
      style: `font-family:'${s.fonts.heading}',sans-serif`,
      text: s.name || '—',
    }),
    h('span', {
      class: 'mine-preview-body',
      style: `font-family:'${s.fonts.body}',sans-serif`,
      text: s.rules[0] ?? '',
    }),
    h(
      'span',
      { class: 'mine-dots', 'aria-hidden': 'true' },
      s.palette.map((c) => h('i', { style: `background:${c}` })),
    ),
  );
}

export const styleBadge = (s: StyleRecord) =>
  h('span', {
    class: `badge mine-badge ${s.status}`,
    'data-status': s.status,
    text: t(s.status === 'draft' ? 'mine.draft' : 'mine.active'),
  });

/** The list shown on Styles and on its own route. */
export async function mineList(ctx: Ctx, into: HTMLElement): Promise<number> {
  // P4: a rule set that already has a Style card is edited from that card.
  const linked = new Set(
    ctx.s
      .ws(ctx.user.id)
      .styles()
      .map((x) => x.recordId),
  );
  const list = (await (await directorService(ctx)).listStyles()).filter(
    (x) => !linked.has(x.id),
  );
  clear(
    into,
    ...(list.length
      ? list.map((s) =>
          h(
            'article',
            { class: 'card mine-card', 'data-mine': s.id },
            stylePreview(s),
            h(
              'div',
              { class: 'mine-meta' },
              h('h3', { text: s.name }),
              styleBadge(s),
              h('p', {
                class: 'muted',
                text: `${t('mine.version', { n: s.version })} · ${when(s.updatedAt, ctx.prefs().locale)}`,
              }),
            ),
            h(
              'a',
              {
                class: `button sm ${s.status === 'draft' ? 'primary' : ''}`,
                href: `#/my-styles/${encodeURIComponent(s.id)}`,
                'data-act': 'review',
              },
              t(s.status === 'draft' ? 'mine.review' : 'mine.edit'),
            ),
          ),
        )
      : [empty(t('mine.empty'))]),
  );
  return list.length;
}

export const myStylesScreen: Screen = async (ctx, _a, out) => {
  const grid = h('div', { class: 'grid', id: 'mine-grid' });
  put(
    out,
    h('a', { class: 'back-link', href: '#/styles', text: t('mine.back') }),
    h('h1', { text: t('mine.title') }),
    h('p', { class: 'muted', text: t('mine.sub') }),
    grid,
  );
  await mineList(ctx, grid);
};

export const styleReviewScreen: Screen = async (ctx, args, out) => {
  const svc = await directorService(ctx);
  const id = args[0] ?? '';
  const found = (await svc.listStyles()).find((s) => s.id === id);
  if (!found) {
    put(
      out,
      h('a', { class: 'back-link', href: '#/my-styles', text: t('mine.back') }),
      h('p', { class: 'error-state', role: 'alert', text: t('mine.notFound') }),
    );
    return;
  }
  let style = found;
  let palette = [...style.palette];

  const err = h('p', { class: 'field-error', role: 'alert', id: 'mine-error' });
  const note = h('p', { class: 'ok-state', role: 'status', id: 'mine-note' });
  const prevBox = h('div', { class: 'mine-preview-box' });

  const input = (
    key: Key,
    id: string,
    value: string,
    onInput?: () => void,
  ): [HTMLElement, HTMLInputElement] => {
    const el = h('input', {
      type: 'text',
      id,
      value,
      oninput: () => onInput?.(),
    });
    return [
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'field-label', for: id, text: t(key) }),
        el,
      ),
      el,
    ];
  };
  const area = (
    key: Key,
    id: string,
    value: readonly string[],
  ): [HTMLElement, HTMLTextAreaElement] => {
    const el = h('textarea', {
      id,
      rows: 4,
      value: value.join('\n'),
      oninput: () => paintPreview(),
    });
    return [
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'field-label', for: id, text: t(key) }),
        el,
      ),
      el,
    ];
  };

  const [nameF, name] = input('mine.name', 'mine-name', style.name, () =>
    paintPreview(),
  );
  const [rulesF, rules] = area('mine.rules', 'mine-rules', style.rules);
  const [dosF, dos] = area('mine.dos', 'mine-dos', style.dos);
  const [dontsF, donts] = area('mine.donts', 'mine-donts', style.donts);
  const [headF, heading] = input(
    'mine.fontHeading',
    'mine-font-heading',
    style.fonts.heading,
    () => paintPreview(),
  );
  const [bodyF, body] = input(
    'mine.fontBody',
    'mine-font-body',
    style.fonts.body,
    () => paintPreview(),
  );
  const [langF, lang] = input(
    'mine.language',
    'mine-language',
    style.voice.language,
  );
  const [toneF, tone] = input('mine.tone', 'mine-tone', style.voice.tone);

  const pacing = h('div', {
    class: 'seg-group',
    role: 'radiogroup',
    'aria-label': t('mine.pacing'),
    id: 'mine-pacing',
  });
  let pace = style.pacing;
  const paintPace = () => {
    for (const b of pacing.querySelectorAll<HTMLButtonElement>('button')) {
      const on = b.dataset.value === pace;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  for (const v of ['slow', 'medium', 'fast'] as const)
    pacing.append(
      h('button', {
        type: 'button',
        class: 'seg',
        role: 'radio',
        'data-value': v,
        text: t(`mine.pacing.${v}` as Key),
        onclick: () => {
          pace = v;
          paintPace();
        },
      }),
    );
  paintPace();

  const swatches = h('div', { class: 'mine-swatches', id: 'mine-palette' });
  const paintSwatches = () => {
    clear(
      swatches,
      ...palette.map((c, i) =>
        h(
          'span',
          { class: 'mine-swatch', 'data-swatch': String(i) },
          h('input', {
            type: 'color',
            value: c,
            'aria-label': `${t('mine.palette')} ${i + 1}`,
            oninput: (e: Event) => {
              palette[i] = (e.target as HTMLInputElement).value;
              paintPreview();
            },
          }),
          palette.length > 1
            ? h('button', {
                type: 'button',
                class: 'mine-swatch-x',
                'aria-label': `${t('mine.removeColour')} ${i + 1}`,
                text: '×',
                onclick: () => {
                  palette.splice(i, 1);
                  paintSwatches();
                  paintPreview();
                },
              })
            : null,
        ),
      ),
      palette.length < 8
        ? h('button', {
            type: 'button',
            class: 'button sm',
            id: 'mine-add-colour',
            text: t('mine.addColour'),
            onclick: () => {
              palette.push('#ffffff');
              paintSwatches();
              paintPreview();
            },
          })
        : null,
    );
  };

  const collect = (): Partial<StyleRecord> => ({
    name: name.value.trim(),
    rules: lines(rules.value),
    dos: lines(dos.value),
    donts: lines(donts.value),
    palette: [...palette],
    fonts: {
      heading: heading.value.trim() || style.fonts.heading,
      body: body.value.trim() || style.fonts.body,
    },
    voice: {
      language: lang.value.trim() || style.voice.language,
      tone: tone.value.trim() || style.voice.tone,
    },
    pacing: pace,
  });

  function paintPreview() {
    const c = collect();
    clear(
      prevBox,
      stylePreview({
        name: c.name ?? '',
        palette: c.palette ?? [],
        fonts: c.fonts ?? style.fonts,
        rules: c.rules ?? [],
      }),
    );
  }

  const submit = async (accept: boolean) => {
    err.textContent = '';
    note.textContent = '';
    const edits = collect();
    if (!edits.name) {
      err.textContent = t('mine.needName');
      name.focus();
      return;
    }
    if (!edits.rules?.length) {
      err.textContent = t('mine.needRule');
      rules.focus();
      return;
    }
    style = await svc.acceptStyle(style.id, edits);
    badge.replaceWith((badgeEl = styleBadge(style)));
    badge = badgeEl;
    note.textContent = accept
      ? t('mine.accepted', { name: style.name })
      : t('mine.saved', { n: style.version });
    acceptBtn.hidden = true;
    saveBtn.hidden = false;
  };

  let badgeEl = styleBadge(style);
  let badge: HTMLElement = badgeEl;
  const acceptBtn = h('button', {
    type: 'button',
    class: 'button primary',
    id: 'mine-accept',
    text: t('mine.accept'),
    hidden: style.status === 'active',
    onclick: () => void submit(true),
  });
  const saveBtn = h('button', {
    type: 'button',
    class: 'button primary',
    id: 'mine-save',
    text: t('mine.save'),
    hidden: style.status === 'draft',
    onclick: () => void submit(false),
  });

  put(
    out,
    h('a', { class: 'back-link', href: '#/my-styles', text: t('mine.back') }),
    h(
      'div',
      { class: 'mine-head' },
      h('h1', { text: t('mine.reviewTitle') }),
      badge,
    ),
    style.status === 'draft'
      ? h('p', { class: 'muted', text: t('mine.reviewHelp') })
      : null,
    h(
      'div',
      { class: 'mine-layout' },
      h(
        'form',
        {
          class: 'brief-form mine-form',
          id: 'mine-form',
          novalidate: true,
          onsubmit: (e: Event) => e.preventDefault(),
        },
        nameF,
        rulesF,
        dosF,
        dontsF,
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label', text: t('mine.palette') }),
          swatches,
        ),
        h('div', { class: 'mine-two' }, headF, bodyF),
        h('div', { class: 'mine-two' }, langF, toneF),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label', text: t('mine.pacing') }),
          pacing,
        ),
        err,
        note,
        h('div', { class: 'actions' }, acceptBtn, saveBtn),
      ),
      h(
        'aside',
        { class: 'mine-side' },
        h('h2', { text: t('mine.preview') }),
        prevBox,
      ),
    ),
  );
  paintSwatches();
  paintPreview();
};
