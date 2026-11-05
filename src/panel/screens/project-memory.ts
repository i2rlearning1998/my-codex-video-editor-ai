// P3U: one project's memory and chats. The facts are what Director remembers;
// the person can add, pin and forget them. Talks only to DirectorService.
import type { MemoryFact, ProjectMemory } from '../../contracts/p3';
import { clear, h, put } from '../dom';
import { directorService } from '../p3-services';
import { t, type Key } from '../strings';
import type { Screen } from '../app';
import { empty, when } from './common';

export const projectMemoryScreen: Screen = async (ctx, args, out) => {
  const svc = await directorService(ctx);
  const projectId = args[0] ?? '';
  let memory: ProjectMemory = await svc.memory(projectId);

  const factsBox = h('ul', { class: 'mem-facts', id: 'mem-facts' });
  const chatsBox = h('ul', { class: 'mem-chats', id: 'mem-chats' });
  const styleLine = h('p', { class: 'muted', id: 'mem-style' });
  const makeNote = h('p', {
    class: 'ok-state',
    role: 'status',
    id: 'mem-note',
  });

  const save = async (facts: readonly MemoryFact[]) => {
    memory = await svc.setMemory(projectId, facts);
    paintFacts();
  };

  function paintFacts() {
    const sorted = [...memory.facts].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned),
    );
    clear(
      factsBox,
      ...(sorted.length
        ? sorted.map((f) =>
            h(
              'li',
              {
                class: `mem-fact${f.pinned ? ' pinned' : ''}`,
                'data-fact': f.id,
              },
              h('span', { class: 'mem-text', text: f.text }),
              h('span', {
                class: 'badge mem-source',
                text: t(`mem.from.${f.source}` as Key),
              }),
              h('button', {
                type: 'button',
                class: 'button sm',
                'data-act': 'pin',
                'aria-pressed': String(f.pinned),
                text: t(f.pinned ? 'mem.unpin' : 'mem.pin'),
                onclick: () =>
                  void save(
                    memory.facts.map((x) =>
                      x.id === f.id ? { ...x, pinned: !x.pinned } : x,
                    ),
                  ),
              }),
              h('button', {
                type: 'button',
                class: 'button sm',
                'data-act': 'forget',
                'aria-label': `${t('mem.forget')}: ${f.text}`,
                text: t('mem.forget'),
                onclick: () =>
                  void save(memory.facts.filter((x) => x.id !== f.id)),
              }),
            ),
          )
        : [h('li', {}, empty(t('mem.empty')))]),
    );
  }

  const field = h('input', {
    type: 'text',
    id: 'mem-new',
    placeholder: t('mem.addPlaceholder'),
    'aria-label': t('mem.add'),
  });
  const add = async () => {
    const text = field.value.trim();
    if (!text) return;
    if (memory.facts.some((f) => f.text.toLowerCase() === text.toLowerCase())) {
      field.value = '';
      return;
    }
    field.value = '';
    await save([
      ...memory.facts,
      {
        id: `fact-${Date.now().toString(36)}`,
        text,
        source: 'user',
        pinned: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void add();
    }
  });

  const chats = await svc.listChats(projectId);
  clear(
    chatsBox,
    ...(chats.length
      ? chats.map((c) =>
          h(
            'li',
            { class: 'mem-chat', 'data-chat': c.id },
            h('strong', { text: c.title }),
            h('span', {
              class: 'muted',
              text: `${t('mem.messages', { n: c.messages.length })} · ${when(c.updatedAt, ctx.prefs().locale)}`,
            }),
          ),
        )
      : [h('li', {}, empty(t('mem.noChats')))]),
  );

  const style = memory.styleId
    ? (await svc.listStyles()).find((s) => s.id === memory.styleId)
    : undefined;
  styleLine.textContent = `${t('mem.style')}: ${style ? style.name : (memory.styleId ?? t('mem.noStyle'))}`;

  put(
    out,
    h('a', { class: 'back-link', href: '#/projects', text: t('mem.back') }),
    h('h1', { text: t('mem.title') }),
    h('p', { class: 'muted', text: t('mem.sub') }),
    styleLine,
    h(
      'section',
      { class: 'mem-section' },
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
          onclick: () => void add(),
        }),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h('button', {
        type: 'button',
        class: 'button',
        id: 'mem-make-style',
        text: t('mem.makeStyle'),
        onclick: async () => {
          const s = await svc.makeStyle(
            projectId,
            `Style ${memory.facts.length}`,
          );
          clear(
            makeNote,
            document.createTextNode(
              `${t('room.styleDraft', { name: s.name })} `,
            ),
            h('a', {
              href: `#/my-styles/${encodeURIComponent(s.id)}`,
              text: t('room.reviewStyle'),
            }),
          );
        },
      }),
      h('a', { class: 'button', href: '#/home', text: t('mem.newChat') }),
    ),
    makeNote,
    h('h2', { text: t('mem.chats') }),
    chatsBox,
  );
  paintFacts();
};
