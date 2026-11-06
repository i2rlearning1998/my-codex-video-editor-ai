// P3U: the editor's chat dock. Select something, say what to change, read the
// proposal, then Apply (one undo step) or Discard. It talks only to the
// EditorChatEngine contract; the engine decides what a proposal contains.
import type {
  EditEvent,
  EditorChatEngine,
  OrbState,
  P3Failure,
  P3Text,
  SelectionRef,
} from '../contracts/p3';
import { getLanguage, subscribe, t as appT } from '../i18n';
import { iconSvg } from '../brand/icons';
import { locateLayer } from '../render/adapter';
import type { EditorSession } from './session';
import './chat-dock.css';
import { CHAT_DOCK_STRINGS } from './chat-dock-strings';

const t = (key: string, params?: Record<string, string | number>): string => {
  const own = CHAT_DOCK_STRINGS[key];
  if (!own) return appT(key, params);
  return Object.entries(params ?? {}).reduce(
    (text, [k, v]) => text.replaceAll(`{${k}}`, String(v)),
    getLanguage() === 'hi' ? own[1] : own[0],
  );
};
const say = (text: P3Text): string =>
  getLanguage() === 'hi' && text.hi ? text.hi : text.en;

export interface ChatSettings {
  readonly enabled: boolean;
  readonly maxMessagesPerDay: number;
}
export interface ChatDockOptions {
  readonly host: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly engine: EditorChatEngine;
  readonly session: EditorSession;
  /** Read each time, so an owner change shows without a reload. */
  readonly settings: () => ChatSettings;
  readonly storage?: Storage;
  readonly today?: () => string;
  /** P4: called when a message is sent (the project becomes an AI project). */
  readonly onUsed?: () => void;
}

type Item =
  | { kind: 'user'; text: string; chips: string[] }
  | { kind: 'assistant'; text: string; streaming: boolean; stopped: boolean }
  | {
      kind: 'proposal';
      id: string;
      summary: string;
      credits: number;
      commands: number;
      status: 'pending' | 'applying' | 'applied' | 'discarded';
      error?: string;
    }
  | { kind: 'failure'; text: string; refusal: boolean };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function mountChatDock(options: ChatDockOptions): () => void {
  const { host, toggle, engine, session } = options;
  const storage = options.storage ?? localStorage;
  const today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  const countKey = () => `aive.chat.count.${today()}`;
  const used = (): number => {
    try {
      return Number(storage.getItem(countKey()) ?? 0) || 0;
    } catch {
      return 0;
    }
  };
  const bump = () => {
    try {
      storage.setItem(countKey(), String(used() + 1));
    } catch {
      /* the limit is then only kept for this page */
    }
  };

  const items: Item[] = [];
  let orb: OrbState = 'idle';
  let abort: AbortController | null = null;

  const panel = el('section', {
    class: 'chat-dock',
    id: 'chat-dock',
    'aria-label': t('chat.title'),
    role: 'dialog',
    'aria-modal': 'false',
    tabindex: '-1',
  });
  panel.hidden = true;
  host.append(panel);

  // --- selection -----------------------------------------------------
  const nameOf = (id: string): string => {
    const found = locateLayer(session.source.composition.layers, id);
    return found?.layer.name || id;
  };
  const selection = (): SelectionRef[] => {
    const scene = session.source.composition.id;
    return session.selectedIds.map((id) => ({
      kind: 'layer' as const,
      id,
      sceneId: scene,
    }));
  };

  // --- render --------------------------------------------------------
  const log = el('div', {
    class: 'chat-log',
    role: 'log',
    'aria-live': 'polite',
  });
  const chips = el('div', {
    class: 'chat-chips',
    'aria-label': t('chat.selection'),
  });
  const orbDot = el('span', { class: 'chat-orb', 'aria-hidden': 'true' });
  const orbLabel = el('span', { class: 'chat-orb-label', role: 'status' });
  const note = el('p', { class: 'chat-note', role: 'status' });
  const input = el('textarea', {
    class: 'chat-input',
    id: 'chat-input',
    rows: '2',
    maxlength: '2000',
  });
  const send = el('button', {
    type: 'button',
    class: 'chat-send primary',
    id: 'chat-send',
  });
  const closeButton = el('button', {
    type: 'button',
    class: 'icon-button',
    id: 'chat-close',
  });
  closeButton.innerHTML = iconSvg('close', 16);
  const head = el(
    'header',
    { class: 'chat-head' },
    orbDot,
    el('strong', { class: 'chat-title', id: 'chat-title' }),
    orbLabel,
    closeButton,
  );
  panel.append(
    head,
    log,
    chips,
    note,
    el('div', { class: 'chat-compose' }, input, send),
  );

  const blocked = (): string | null => {
    const s = options.settings();
    if (!s.enabled) return t('chat.off');
    if (used() >= s.maxMessagesPerDay)
      return t('chat.limit', { n: s.maxMessagesPerDay });
    return null;
  };

  function paintItem(item: Item): HTMLElement {
    if (item.kind === 'user') {
      const row = el(
        'div',
        { class: 'chat-msg user', 'data-role': 'user' },
        el('span', { class: 'chat-who' }, t('chat.you')),
        el('p', {}, item.text),
      );
      if (item.chips.length)
        row.append(
          el(
            'div',
            { class: 'chat-chips sent' },
            ...item.chips.map((c) => el('span', { class: 'chat-chip' }, c)),
          ),
        );
      return row;
    }
    if (item.kind === 'assistant') {
      const row = el(
        'div',
        {
          class: `chat-msg assistant${item.streaming ? ' streaming' : ''}`,
          'data-role': 'assistant',
        },
        el('span', { class: 'chat-who' }, t('chat.director')),
        el('p', {}, item.text),
      );
      if (item.stopped)
        row.append(el('span', { class: 'chat-tag' }, t('chat.stopped')));
      return row;
    }
    if (item.kind === 'failure')
      return el(
        'div',
        {
          class: `chat-msg failure${item.refusal ? ' refusal' : ''}`,
          role: 'alert',
          'data-role': 'failure',
        },
        el('p', {}, item.text),
      );
    const card = el('div', {
      class: `chat-proposal ${item.status}`,
      'data-role': 'proposal',
      'data-proposal': item.id,
    });
    card.append(
      el('span', { class: 'chat-who' }, t('chat.proposal')),
      el('p', { class: 'chat-summary' }, item.summary),
      el(
        'div',
        { class: 'chat-meta' },
        el('span', {}, t('chat.commands', { n: item.commands })),
        el('span', {}, t('chat.credits', { n: item.credits })),
      ),
    );
    if (item.status === 'pending' || item.status === 'applying') {
      const apply = el('button', {
        type: 'button',
        class: 'primary sm',
        'data-act': 'apply',
      });
      apply.textContent = t('chat.apply');
      apply.disabled = item.status === 'applying';
      const discard = el('button', {
        type: 'button',
        class: 'sm',
        'data-act': 'discard',
      });
      discard.textContent = t('chat.discard');
      discard.disabled = item.status === 'applying';
      apply.addEventListener('click', () => void doApply(item));
      discard.addEventListener('click', () => {
        engine.discard(item.id);
        item.status = 'discarded';
        paint();
      });
      card.append(el('div', { class: 'chat-actions' }, apply, discard));
    } else {
      card.append(
        el(
          'p',
          { class: 'chat-result', role: 'status' },
          item.status === 'applied' ? t('chat.applied') : t('chat.discarded'),
        ),
      );
    }
    if (item.error)
      card.append(el('p', { class: 'chat-error', role: 'alert' }, item.error));
    return card;
  }

  function paintChips() {
    const ids = session.selectedIds;
    chips.replaceChildren(
      ids.length
        ? el('span', { class: 'chat-chips-label' }, t('chat.selection'))
        : el('span', { class: 'chat-chips-label' }, t('chat.selectionNone')),
      ...ids.map((id) =>
        el('span', { class: 'chat-chip', 'data-id': id }, nameOf(id)),
      ),
    );
  }

  function paint() {
    const busy = abort !== null;
    panel.setAttribute('aria-label', t('chat.title'));
    (head.querySelector('#chat-title') as HTMLElement).textContent =
      t('chat.title');
    orbDot.dataset.state = orb;
    orbLabel.textContent = t(`chat.state.${orb}`);
    closeButton.setAttribute('aria-label', t('chat.close'));
    closeButton.title = t('chat.close');
    toggle.setAttribute('aria-label', t('chat.toggle'));
    toggle.title = t('chat.toggle');
    toggle.setAttribute('aria-pressed', String(!panel.hidden));
    input.setAttribute('aria-label', t('chat.input'));
    input.setAttribute('placeholder', t('chat.placeholder'));
    const why = blocked();
    note.textContent =
      why ??
      t('chat.left', {
        n: Math.max(0, options.settings().maxMessagesPerDay - used()),
      });
    note.classList.toggle('warn', why !== null);
    input.disabled = why !== null;
    send.disabled = !busy && (why !== null || input.value.trim() === '');
    send.textContent = busy ? t('chat.stop') : t('chat.send');
    send.dataset.mode = busy ? 'stop' : 'send';
    paintChips();
    if (items.length === 0)
      log.replaceChildren(el('p', { class: 'chat-empty' }, t('chat.empty')));
    else log.replaceChildren(...items.map(paintItem));
    log.scrollTop = log.scrollHeight;
  }

  // --- actions ---------------------------------------------------------
  async function doApply(item: Extract<Item, { kind: 'proposal' }>) {
    item.status = 'applying';
    delete item.error;
    paint();
    const result = await engine.apply(item.id);
    if (result.ok) item.status = 'applied';
    else {
      item.status = 'pending';
      item.error = say(result.failure.message);
    }
    paint();
  }

  function failureItem(failure: P3Failure): Item {
    return {
      kind: 'failure',
      text: say(failure.message),
      refusal: failure.code === 'refused',
    };
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || abort || blocked()) return;
    const refs = selection();
    items.push({
      kind: 'user',
      text,
      chips: session.selectedIds.map(nameOf),
    });
    input.value = '';
    bump();
    options.onUsed?.();
    const controller = new AbortController();
    abort = controller;
    orb = 'thinking';
    let reply: Extract<Item, { kind: 'assistant' }> | null = null;
    paint();
    try {
      for await (const event of engine.send({
        text,
        selection: refs,
        attachmentIds: [],
        signal: controller.signal,
      }) as AsyncIterable<EditEvent>) {
        if (event.type === 'state') orb = event.state;
        else if (event.type === 'token') {
          if (!reply) {
            reply = {
              kind: 'assistant',
              text: '',
              streaming: true,
              stopped: false,
            };
            items.push(reply);
          }
          reply.text += event.text;
        } else if (event.type === 'proposal') {
          if (reply) reply.streaming = false;
          items.push({
            kind: 'proposal',
            id: event.id,
            summary: say(event.summary),
            credits: event.credits,
            commands: event.commandCount,
            status: 'pending',
          });
        } else if (event.type === 'failure')
          items.push(failureItem(event.failure));
        paint();
      }
    } catch {
      items.push({
        kind: 'failure',
        text: t('chat.failed'),
        refusal: false,
      });
    }
    if (reply) {
      reply.streaming = false;
      if (controller.signal.aborted) reply.stopped = true;
    }
    if (controller.signal.aborted && !reply)
      items.push({
        kind: 'assistant',
        text: '',
        streaming: false,
        stopped: true,
      });
    abort = null;
    orb = 'idle';
    paint();
    input.focus();
  }

  send.addEventListener('click', () => {
    if (abort) abort.abort();
    else void submit();
  });
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void submit();
    }
  });
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    paint();
    if (open) (input.disabled ? panel : input).focus();
    else toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  closeButton.addEventListener('click', () => setOpen(false));
  // Escape closes the dock before the shell's own Escape (deselect) sees it.
  const onEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    if (!panel.contains(document.activeElement)) return;
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
  };
  window.addEventListener('keydown', onEscape, true);

  const offSession = session.onChange(() => {
    if (!panel.hidden) paintChips();
  });
  const offLanguage = subscribe(paint);
  paint();
  return () => {
    abort?.abort();
    offSession();
    window.removeEventListener('keydown', onEscape, true);
    offLanguage();
    panel.remove();
  };
}
