// P2-R3: the Director's message box, built like a modern AI chat: a growing
// text area, a "+" menu, a model picker, voice typing and a round Send button.
// Models come from the Platform Config (what the plan may use and the server
// can reach); nothing here is hard-coded.
import {
  modelAvailability,
  modelsForRole,
  type Model,
} from '../platform-config';
import { h, clear } from './dom';
import { icon } from './icons';
import { tick } from './motion';
import { t } from './strings';
import type { Ctx } from './app';
import { bestModels } from './screens/common';

export interface Attachment {
  name: string;
  text: string;
}
export interface ComposerOptions {
  ctx: Ctx;
  /** The model role that answers in this chat. */
  role: string;
  model: () => string;
  onModel: (id: string) => void;
  placeholder: string;
  /** Called with the typed text and what was attached. */
  onSend: (text: string, files: Attachment[]) => void | Promise<void>;
}
export interface Composer {
  readonly el: HTMLElement;
  readonly input: HTMLTextAreaElement;
  setBusy(on: boolean): void;
  set(text: string): void;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as Record<string, RecognitionCtor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const MAX_FILE = 200_000; // bytes of text read from a file
const MAX_NOTE = 3000; // characters passed on to Director

export function composer(o: ComposerOptions): Composer {
  const { ctx } = o;
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  let busy = false;
  let files: Attachment[] = [];
  let open: HTMLElement | null = null;

  const input = h('textarea', {
    id: 'chat-input',
    rows: 1,
    placeholder: o.placeholder,
    'aria-label': o.placeholder,
  });
  const fit = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  };
  const chips = h('div', { class: 'cmp-files', id: 'chat-files' });
  const paintFiles = () => {
    sync();
    clear(
      chips,
      ...files.map((f, i) =>
        h(
          'span',
          { class: 'cmp-file' },
          icon('file', 14),
          h('span', { text: f.name }),
          h(
            'button',
            {
              type: 'button',
              'aria-label': t('chat.remove'),
              onclick: () => {
                files = files.filter((_, j) => j !== i);
                paintFiles();
              },
            },
            icon('close', 12),
          ),
        ),
      ),
    );
  };

  // ---- pop-ups (the + menu and the model list) -------------------------------
  const closePop = () => {
    open?.classList.remove('in');
    const gone = open;
    open = null;
    if (gone) setTimeout(() => gone.remove(), 160);
  };
  const pop = (anchor: HTMLElement, body: HTMLElement) => {
    const was = open;
    closePop();
    if (was && was.dataset.for === anchor.id) return;
    const box = h('div', { class: 'cmp-pop', role: 'menu' }, body);
    box.dataset.for = anchor.id;
    wrap.append(box);
    box.style.left = `${anchor.offsetLeft}px`;
    requestAnimationFrame(() => box.classList.add('in'));
    open = box;
    tick('select');
  };
  document.addEventListener('pointerdown', (e) => {
    if (open && !wrap.contains(e.target as Node)) closePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) closePop();
  });

  // ---- the + menu ------------------------------------------------------------------
  const picker = h('input', {
    type: 'file',
    accept: '.txt,.md,text/plain,text/markdown',
    hidden: true,
    id: 'chat-file-input',
  });
  picker.addEventListener('change', async () => {
    const f = picker.files?.[0];
    picker.value = '';
    if (!f || f.size > MAX_FILE) return;
    files = [
      ...files,
      { name: f.name, text: (await f.text()).slice(0, MAX_NOTE) },
    ];
    paintFiles();
  });
  const plus = h(
    'button',
    {
      type: 'button',
      class: 'cmp-btn',
      id: 'chat-plus',
      'aria-label': t('chat.add'),
      title: t('chat.add'),
      onclick: () => {
        const texts = ctx.s
          .assets(ctx.user.id)
          .filter((a) => a.kind === 'text' && a.text)
          .slice(0, 6);
        pop(
          plus,
          h(
            'div',
            { class: 'cmp-menu' },
            h(
              'button',
              {
                type: 'button',
                class: 'cmp-item',
                id: 'chat-add-file',
                onclick: () => {
                  closePop();
                  picker.click();
                },
              },
              icon('file', 18),
              t('chat.addFile'),
            ),
            h('div', { class: 'cmp-sep', text: t('chat.fromAssets') }),
            ...(texts.length
              ? texts.map((a) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'cmp-item sub',
                      'data-asset': a.id,
                      onclick: () => {
                        files = [
                          ...files,
                          {
                            name: a.name,
                            text: (a.text ?? '').slice(0, MAX_NOTE),
                          },
                        ];
                        paintFiles();
                        closePop();
                      },
                    },
                    icon('assets', 16),
                    a.name,
                  ),
                )
              : [h('p', { class: 'cmp-empty', text: t('chat.noAssets') })]),
          ),
        );
      },
    },
    icon('plus', 20),
  );

  // ---- the model list -------------------------------------------------------------
  const items = (): {
    id: string;
    label: string;
    hint: string;
    ok: boolean;
    why: string;
  }[] => {
    const list = bestModels(ctx, modelsForRole(c, o.role));
    const row = (m: Model, label: string, hint: string) => {
      const allowed = modelAvailability(c, plan, m.id).ok;
      const ok = allowed && ctx.s.connected(m.id);
      return {
        id: m.id,
        label,
        hint,
        ok,
        why: ok ? '' : allowed ? t('common.notConnected') : t('common.locked'),
      };
    };
    if (c.director.reveal.modelNames)
      return list.map((m) => row(m, ctx.say(m.name), t(`tier.${m.tier}.hint`)));
    return (['fast', 'balanced', 'best'] as const).flatMap((tier) => {
      const m = list.find((x) => x.tier === tier);
      return m ? [row(m, t(`tier.${tier}`), t(`tier.${tier}.hint`))] : [];
    });
  };
  const modelBtn = h('button', {
    type: 'button',
    class: 'cmp-pill',
    id: 'chat-model',
    'aria-label': t('chat.model'),
  });
  const paintModel = () => {
    const cur = items().find((x) => x.id === o.model());
    clear(
      modelBtn,
      h('span', { class: 'cmp-dot', 'aria-hidden': 'true' }),
      h('span', { text: cur?.label ?? t('chat.model') }),
      icon('chevronDown', 14),
    );
  };
  modelBtn.addEventListener('click', () =>
    pop(
      modelBtn,
      h(
        'div',
        { class: 'cmp-menu models' },
        ...items().map((m) =>
          h(
            'button',
            {
              type: 'button',
              class: `cmp-item model${m.id === o.model() ? ' on' : ''}`,
              disabled: !m.ok,
              'data-model': m.id,
              title: m.why || undefined,
              onclick: () => {
                o.onModel(m.id);
                paintModel();
                closePop();
              },
            },
            h(
              'span',
              { class: 'cmp-model' },
              h('strong', { text: m.label }),
              h('small', { text: m.ok ? m.hint : m.why }),
            ),
            m.id === o.model()
              ? icon('check', 16)
              : m.ok
                ? null
                : icon('lock', 14),
          ),
        ),
      ),
    ),
  );

  // ---- voice typing -----------------------------------------------------------------
  const Rec = recognitionCtor();
  let rec: Recognition | null = null;
  let heard = false;
  const mic = h('button', {
    type: 'button',
    class: 'cmp-btn',
    id: 'chat-mic',
    'aria-label': t('chat.mic'),
    title: Rec ? t('chat.mic') : t('chat.micOff'),
    disabled: !Rec,
  });
  const listening = h('span', { class: 'cmp-listen', 'aria-live': 'polite' });
  const paintMic = (on: boolean) => {
    mic.classList.toggle('live', on);
    mic.setAttribute('aria-pressed', String(on));
    clear(mic, icon(on ? 'stop' : 'mic', 18));
    clear(
      listening,
      ...(on
        ? [
            h(
              'span',
              { class: 'cmp-bars', 'aria-hidden': 'true' },
              ...Array.from({ length: 5 }, () => h('i')),
            ),
            h('span', { text: t('chat.listening') }),
          ]
        : []),
    );
  };
  paintMic(false);
  mic.addEventListener('click', () => {
    if (!Rec) return;
    if (rec) {
      rec.stop();
      return;
    }
    const base = input.value ? `${input.value.trim()} ` : '';
    rec = new Rec();
    rec.lang = ctx.prefs().locale === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    heard = false;
    rec.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++)
        said += e.results[i]![0]!.transcript;
      heard = true;
      input.value = base + said;
      fit();
      sync();
    };
    const done = () => {
      rec = null;
      paintMic(false);
      if (heard) input.focus();
    };
    rec.onend = done;
    rec.onerror = done;
    paintMic(true);
    tick('select');
    try {
      rec.start();
    } catch {
      done();
    }
  });

  // ---- send ---------------------------------------------------------------------------
  const send = h('button', {
    type: 'button',
    class: 'cmp-send',
    id: 'chat-send',
    'aria-label': t('director.send'),
    title: t('director.send'),
  });
  clear(send, icon('send', 20));
  function sync() {
    send.disabled = busy || (!input.value.trim() && !files.length);
  }
  const go = async () => {
    const text = input.value.trim();
    if (busy || (!text && !files.length)) return;
    rec?.stop();
    const sent = files;
    files = [];
    paintFiles();
    tick('select');
    await o.onSend(text, sent);
    sync();
  };
  send.addEventListener('click', () => void go());
  input.addEventListener('input', () => {
    fit();
    sync();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void go();
    }
  });
  sync();
  paintModel();

  const box = h(
    'div',
    { class: 'cmp-box' },
    chips,
    input,
    h(
      'div',
      { class: 'cmp-bar' },
      plus,
      modelBtn,
      listening,
      h('span', { class: 'cmp-grow' }),
      mic,
      send,
    ),
  );
  const wrap = h(
    'div',
    { class: 'cmp chat-input' },
    box,
    picker,
    h(
      'p',
      { class: 'cmp-note' },
      h('span', { text: t('chat.hint') }),
      h('span', { text: t('chat.safe') }),
    ),
  );
  return {
    el: wrap,
    input,
    setBusy(on) {
      busy = on;
      wrap.classList.toggle('busy', on);
      sync();
    },
    set(text) {
      input.value = text;
      fit();
      sync();
    },
  };
}
