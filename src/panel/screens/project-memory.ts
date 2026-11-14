// ROUND-B B1: a Project's memory (the Project page's Memory tab). The facts
// are what Director remembers for EVERY Video of the Project; the person can
// add, edit, pin and forget them. Chats and the Video sheet belong to each
// Video (AI mode shows them); this tab lists the Videos that have them.
import type { Entry } from '../../project/video-memory';
import { clear, h, put } from '../dom';
import { t, type Key } from '../strings';
import type { Ctx } from '../app';
import { empty } from './common';

export async function memoryPanel(
  ctx: Ctx,
  projectId: string,
  out: HTMLElement,
): Promise<void> {
  const mem = ctx.s.mem(ctx.user.id);
  mem.reload();
  const factsBox = h('ul', { class: 'mem-facts', id: 'mem-facts' });

  function paintFacts() {
    const sorted = [...mem.facts(projectId)].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned),
    );
    const row = (f: Entry) => {
      const text = h('span', { class: 'mem-text', text: f.text });
      const edit = () => {
        const field = h('input', {
          type: 'text',
          class: 'mem-edit',
          value: f.text,
          'aria-label': t('mem.edit'),
        });
        const done = (save: boolean) => {
          const v = field.value.trim();
          if (save && v && v !== f.text)
            mem.patchFact(projectId, f.id, { text: v, source: 'user' });
          paintFacts();
        };
        field.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        });
        field.addEventListener('blur', () => done(true));
        text.replaceWith(field);
        field.focus();
      };
      return h(
        'li',
        {
          class: `mem-fact${f.pinned ? ' pinned' : ''}`,
          'data-fact': f.id,
        },
        text,
        h('span', {
          class: 'badge mem-source',
          text: t(`mem.from.${f.source}` as Key),
        }),
        h('button', {
          type: 'button',
          class: 'button sm',
          'data-act': 'edit',
          text: t('mem.edit'),
          onclick: edit,
        }),
        h('button', {
          type: 'button',
          class: 'button sm',
          'data-act': 'pin',
          'aria-pressed': String(f.pinned),
          text: t(f.pinned ? 'mem.unpin' : 'mem.pin'),
          onclick: () => {
            mem.patchFact(projectId, f.id, { pinned: !f.pinned });
            paintFacts();
          },
        }),
        h('button', {
          type: 'button',
          class: 'button sm',
          'data-act': 'forget',
          'aria-label': `${t('mem.forget')}: ${f.text}`,
          text: t('mem.forget'),
          onclick: () => {
            mem.forgetFact(projectId, f.id);
            paintFacts();
          },
        }),
      );
    };
    clear(
      factsBox,
      ...(sorted.length
        ? sorted.map(row)
        : [h('li', {}, empty(t('mem.empty')))]),
    );
  }

  const field = h('input', {
    type: 'text',
    id: 'mem-new',
    placeholder: t('mem.addPlaceholder'),
    'aria-label': t('mem.add'),
  });
  const add = () => {
    const text = field.value.trim();
    field.value = '';
    if (!text) return;
    mem.addFact(projectId, text, 'user');
    paintFacts();
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });

  // The Videos of this Project and what Director keeps for each.
  const ws = ctx.s.ws(ctx.user.id);
  const videos = ws.videosOf(projectId).filter((v) => !v.trashedAt);
  const videoRows = videos.map((v) => {
    const m = mem.has(v.id) ? mem.video(v.id) : null;
    const lines = m
      ? m.sheet.brief.length +
        m.sheet.scenes.length +
        m.sheet.assets.length +
        m.sheet.decisions.length
      : 0;
    return h(
      'li',
      { class: 'mem-chat', 'data-video-memory': v.id },
      h('strong', { text: v.name }),
      h('span', {
        class: 'muted',
        text: t('mem.videoLine', { chats: m?.chats.length ?? 0, lines }),
      }),
    );
  });

  put(
    out,
    h(
      'div',
      { class: 'two-col' },
      h(
        'section',
        { class: 'mem-section col-main' },
        h('h2', { text: t('mem.title') }),
        h('p', { class: 'muted', text: t('rda.memorySub') }),
        factsBox,
        h(
          'div',
          { class: 'mem-add' },
          field,
          h('button', {
            type: 'button',
            class: 'button primary',
            id: 'mem-add',
            text: t('mem.add'),
            onclick: add,
          }),
        ),
      ),
      h(
        'aside',
        { class: 'col-side card', id: 'mem-videos' },
        h('h3', { text: t('mem.videos') }),
        h('p', { class: 'muted', text: t('mem.videosSub') }),
        h(
          'ul',
          { class: 'mem-chats', id: 'mem-chats' },
          ...(videoRows.length
            ? videoRows
            : [h('li', {}, empty(t('mem.noChats')))]),
        ),
      ),
    ),
  );
  paintFacts();
}
