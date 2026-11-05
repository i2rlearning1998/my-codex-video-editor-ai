// P3U Director room: the home of the platform. A living Orb, a chat that
// streams, memory the person can see and remove, and three ways to start.
// It talks only to DirectorService (src/contracts/p3), so the real Part 2
// service replaces the mock without touching this file.
import type {
  ChatRecord,
  DirectorEvent,
  DirectorQuestion,
  MemoryFact,
  OrbState,
  P3Text,
  ProjectMemory,
  StartPath,
} from '../../contracts/p3';
import { clear, h } from '../dom';
import { composer } from '../composer';
import { createOrb, type OrbLevel } from '../orb/orb';
import { directorService } from '../p3-services';
import { t, getLocale, type Key } from '../strings';
import type { Screen } from '../app';
import { currentModel } from './flow';

const say = (x: P3Text): string => (getLocale() === 'hi' && x.hi ? x.hi : x.en);

/** Settings > Animations is read by the Orb; the owner's level comes from config. */
const levelOf = (): OrbLevel => 'full';

export interface RoomOptions {
  /** On Home: the person's name line and the credits line. */
  readonly home?: { readonly greeting: string; readonly balance: string };
}

export const directorRoomScreen = async (
  ctx: Parameters<Screen>[0],
  args: string[],
  out: HTMLElement,
  opts: RoomOptions = {},
): Promise<void> => {
  const svc = await directorService(ctx);
  const c = ctx.s.config;
  const styleId = args[0] ?? c.styles[0]?.id ?? '';

  const orb = createOrb({
    size: 168,
    level: levelOf(),
    label: t('room.title'),
    colors: {},
  });
  const stateLabel = h('p', {
    class: 'room-state',
    'aria-live': 'polite',
    text: t('room.state.idle'),
  });
  const setOrb = (s: OrbState) => {
    orb.setState(s);
    stateLabel.textContent = t(`room.state.${s}` as Key);
    root.dataset.orbState = s;
  };

  const log = h('ol', { class: 'room-log', 'aria-live': 'off' });
  const memStrip = h('div', { class: 'room-memory', hidden: true });
  const hero = h('div', { class: 'room-hero' });
  const root = h('section', {
    class: opts.home ? 'room on-home' : 'room',
    'data-has-chat': 'false',
  });

  let chat: ChatRecord | null = null;
  let memory: ProjectMemory | null = null;
  let abort: AbortController | null = null;
  let lastText = '';
  let creditsTotal = 0;

  const markChat = () => {
    root.dataset.hasChat = 'true';
  };

  // ---- memory strip -------------------------------------------------------
  const paintMemory = () => {
    const facts = memory?.facts ?? [];
    memStrip.hidden = facts.length === 0;
    clear(
      memStrip,
      h('span', { class: 'room-memory-title', text: t('room.remember') }),
      h(
        'ul',
        { class: 'room-memory-list' },
        facts.map((f) =>
          h(
            'li',
            { class: 'room-fact', 'data-fact': f.id },
            h('span', { text: f.text }),
            h('button', {
              type: 'button',
              class: 'room-fact-x',
              'aria-label': `${t('room.forget')}: ${f.text}`,
              title: t('room.forget'),
              text: '×',
              onclick: async () => {
                if (!memory) return;
                memory = await svc.setMemory(
                  memory.projectId,
                  memory.facts.filter((x) => x.id !== f.id),
                );
                paintMemory();
              },
            }),
          ),
        ),
      ),
      memory
        ? h('a', {
            class: 'btn ghost room-open-memory',
            href: `#/project/${encodeURIComponent(memory.projectId)}`,
            text: t('room.openMemory'),
          })
        : null,
      h('button', {
        type: 'button',
        class: 'btn ghost room-make-style',
        text: t('room.makeStyle'),
        onclick: async () => {
          if (!memory) return;
          const s = await svc.makeStyle(
            memory.projectId,
            `Style ${new Date().getFullYear()}`,
          );
          addNote(t('room.styleDraft', { name: s.name }), {
            href: `#/my-styles/${encodeURIComponent(s.id)}`,
            label: t('room.reviewStyle'),
          });
        },
      }),
    );
  };

  // ---- messages -------------------------------------------------------------
  const scroll = () => {
    log.lastElementChild?.scrollIntoView({ block: 'end' });
  };
  const bubble = (who: 'you' | 'director', extra = '') => {
    const body = h('div', { class: 'room-text' });
    const li = h(
      'li',
      { class: `room-msg ${who}${extra}`, 'data-from': who },
      who === 'director'
        ? h('span', { class: 'room-dot', 'aria-hidden': 'true' })
        : null,
      h(
        'div',
        { class: 'room-bubble' },
        h('span', {
          class: 'room-name',
          text: who === 'you' ? t('chat.you') : t('chat.director'),
        }),
        body,
      ),
    );
    log.append(li);
    scroll();
    return { li, body };
  };
  const addNote = (text: string, link?: { href: string; label: string }) => {
    const b = bubble('director', ' note');
    b.body.textContent = text;
    if (link)
      b.body.append(
        ' ',
        h('a', { class: 'room-note-link', href: link.href, text: link.label }),
      );
  };

  const askChips = (q: DirectorQuestion) => {
    const wrap = h('div', {
      class: 'answer-chips room-chips',
      'data-question': q.id,
    });
    for (const a of q.answers)
      wrap.append(
        h('button', {
          type: 'button',
          class: 'chip',
          'data-answer': a.value,
          text: say(a.label),
          onclick: () => {
            wrap.querySelectorAll('button').forEach((b) => (b.disabled = true));
            void send(say(a.label));
          },
        }),
      );
    return wrap;
  };

  // ---- send ---------------------------------------------------------------
  const box = composer({
    ctx,
    role: c.director.roles.write,
    model: () => currentModel(ctx),
    onModel: (id) => ctx.setPrefs({ model: id }),
    placeholder: t('director.placeholder'),
    onSend: (text, files) =>
      send(
        files.length
          ? `${text}\n\n${files.map((f) => `[${f.name}]`).join(' ')}`
          : text,
      ),
  });

  async function ensureChat(path: StartPath) {
    if (chat) return;
    const started = await svc.start(path);
    chat = started.chat;
    memory = started.project;
    paintMemory();
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    await ensureChat(args[0] ? { kind: 'style', styleId } : { kind: 'blank' });
    if (!chat) return;
    markChat();
    lastText = clean;
    box.set('');
    const mine = bubble('you');
    mine.body.textContent = clean;
    box.setBusy(true);
    abort = new AbortController();
    stop.hidden = false;
    let answer: ReturnType<typeof bubble> | null = null;
    try {
      for await (const ev of svc.send({
        chatId: chat.id,
        text: clean,
        attachmentIds: [],
        signal: abort.signal,
      }) as AsyncIterable<DirectorEvent>) {
        switch (ev.type) {
          case 'state':
            setOrb(ev.state);
            break;
          case 'token':
            answer ??= bubble('director');
            answer.body.append(ev.text);
            scroll();
            break;
          case 'question':
            answer ??= bubble('director');
            answer.li
              .querySelector('.room-bubble')
              ?.append(askChips(ev.question));
            scroll();
            break;
          case 'refusal': {
            const r = bubble('director', ' refusal');
            r.body.textContent = say(ev.reply);
            if (ev.alternative)
              r.li.querySelector('.room-bubble')?.append(
                h('p', {
                  class: 'room-alt',
                  text: `${t('room.alt')}: ${say(ev.alternative)}`,
                }),
              );
            break;
          }
          case 'memory':
            if (memory)
              memory = {
                ...memory,
                facts: [...memory.facts, ...ev.added] as MemoryFact[],
              };
            paintMemory();
            break;
          case 'failure': {
            const f = bubble('director', ' failure');
            f.body.textContent = say(ev.failure.message);
            f.li.querySelector('.room-bubble')?.append(
              h('button', {
                type: 'button',
                class: 'btn ghost room-retry',
                text: t('room.retry'),
                onclick: () => void send(lastText),
              }),
            );
            break;
          }
          case 'done':
            creditsTotal += ev.creditsUsed;
            ctx.refreshTop();
            break;
        }
      }
    } finally {
      stop.hidden = true;
      abort = null;
      box.setBusy(false);
      if (orb.state() !== 'idle') setOrb('idle');
      box.input.focus();
    }
  }

  const stop = h('button', {
    type: 'button',
    class: 'btn ghost room-stop',
    hidden: true,
    text: t('room.stop'),
    onclick: () => abort?.abort(),
  });

  // ---- hero with the three start paths ------------------------------------
  const startCard = (key: 'style' | 'brief' | 'blank') =>
    h(
      'button',
      {
        type: 'button',
        class: 'room-start glow',
        'data-start': key,
        onclick: () => {
          if (key === 'brief') {
            const idea = box.input.value.trim();
            ctx.go(
              `brief/${styleId}${idea ? `?idea=${encodeURIComponent(idea)}` : ''}`,
            );
          } else if (key === 'style') ctx.go('styles');
          else box.input.focus();
        },
      },
      h('strong', { text: t(`room.start.${key}` as Key) }),
      h('span', { text: t(`room.start.${key}Help` as Key) }),
    );
  clear(
    hero,
    h('div', { class: 'room-orb' }, orb.el),
    opts.home
      ? h('p', {
          id: 'greeting',
          class: 'eyebrow room-eyebrow',
          text: opts.home.greeting,
        })
      : null,
    h('h1', { class: 'room-greeting', text: t('room.greeting') }),
    h('p', { class: 'room-sub', text: t('room.sub') }),
    opts.home
      ? h('p', {
          id: 'home-balance',
          class: 'room-balance',
          text: opts.home.balance,
        })
      : null,
    stateLabel,
    h(
      'div',
      { class: 'room-starts' },
      startCard('style'),
      startCard('brief'),
      startCard('blank'),
    ),
  );

  root.append(
    hero,
    h('div', { class: 'room-scroll' }, log),
    memStrip,
    h('div', { class: 'room-input' }, box.el, stop),
  );
  out.append(root);
  box.input.focus();
  void creditsTotal;
};
