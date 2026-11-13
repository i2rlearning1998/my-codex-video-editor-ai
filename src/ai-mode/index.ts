// ROUND-B: AI mode. A second layout of the SAME editor (same engine, Scene
// Graph, Command Bus, canvas, history) and the single home of the Director.
// This chunk loads the first time AI mode opens; the editor's first load
// carries none of it. The canvas here is select-only: point at something
// and say what you want; every change is a proposal applied as one step.
import './ai-mode.css';
import type { EditorCommand } from '../core';
import type { OrbState } from '../contracts/p3';
import { iconSvg } from '../brand/icons';
import { selectionGeometry } from '../render/selection';
import { confirmDialog } from '../ui/components/modal';
import { duplicateScene } from '../ui/scenes';
import { hasControls } from '../ui/controls-panel';
import { locateLayer } from '../render/adapter';
import { motionReduced, readMotion, systemReducesMotion } from '../ui/motion';
import { createOrb, type OrbHandle } from '../panel/orb/orb';
import { h, clear } from '../panel/dom';
import { setLocale } from '../panel/strings';
import type { Ctx } from '../panel/app';
import type { AiHost, AiMode } from './host';
import { Director, type DirectorUi, type DrawerTab } from './director';
import {
  findLayer,
  hashLayer,
  isLocked,
  kindOf,
  seconds,
  stringOf,
} from './canvas-read';
import { suggestionsFor } from './propose';
import {
  CAPTION_STYLE_LIST,
  FORMATS,
  VOLUMES,
  captionRestyle,
  captionState,
  captionToggle,
  currentFormat,
  formatChange,
  musicVolume,
  soundState,
  soundToggle,
  type Offer,
} from './quick';
import { lang, t, type AiKey } from './strings';

const SWATCHES = [
  '#ffffff',
  '#111111',
  '#e5484d',
  '#f76b15',
  '#f5d90a',
  '#30a46c',
  '#3b82f6',
  '#8e4ec6',
  '#e93d82',
];
const svg = (name: string, size = 18) => {
  const span = document.createElement('span');
  span.style.display = 'contents';
  span.innerHTML = iconSvg(name, size);
  return span;
};
const iconButton = (
  id: string,
  icon: string,
  label: string,
  run: (event: MouseEvent) => void,
) =>
  h(
    'button',
    {
      type: 'button',
      class: 'ai-icon-btn',
      id,
      'aria-label': label,
      title: label,
      onclick: run,
    },
    svg(icon),
  );
const timecode = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const still = () => motionReduced(readMotion(), systemReducesMotion());

export function mountAiMode(host: AiHost): AiMode {
  const { engine, session, shell, stage, canvas } = host;
  const preview = stage.closest<HTMLElement>('.preview-panel')!;
  const topStart = shell.querySelector<HTMLElement>('.topbar-start')!;
  const topEnd = shell.querySelector<HTMLElement>('.topbar-end')!;
  let director: Director | null = null;
  let visible = false;
  let disposed = false;
  const offs: (() => void)[] = [];

  // ---- regions ------------------------------------------------------------
  const orbBox = h('div', { class: 'ai-orb' });
  const orbState = h('div', {
    class: 'ai-muted',
    id: 'ai-orb-state',
    role: 'status',
    text: t('state.idle'),
  });
  const thread = h('div', {
    class: 'ai-thread',
    id: 'ai-thread',
    role: 'log',
    'aria-live': 'polite',
  });
  const chips = h('div', { class: 'ai-row', id: 'ai-chips' });
  const fileChips = h('div', { class: 'ai-row', id: 'ai-files' });
  const input = h('textarea', {
    id: 'ai-input',
    rows: 2,
    placeholder: t('dir.placeholder'),
    'aria-label': t('dir.placeholder'),
  });
  const sendButton = h(
    'button',
    {
      type: 'button',
      id: 'ai-send',
      'aria-label': t('dir.send'),
      title: t('dir.send'),
    },
    svg('arrowUp', 18),
  );
  const composeBox = h('div', { class: 'ai-compose-box' });
  const directorEl = h(
    'aside',
    {
      id: 'ai-director',
      class: 'ai-region ai-panel',
      'aria-label': t('dir.title'),
    },
    h(
      'div',
      { class: 'ai-dir-head' },
      orbBox,
      h(
        'div',
        {},
        h('div', { class: 'ai-dir-name', text: t('dir.title') }),
        orbState,
      ),
      h(
        'div',
        { class: 'ai-row' },
        iconButton('ai-chats', 'layers', t('dir.chats'), (e) => chatMenu(e)),
        iconButton('ai-new-chat', 'plus', t('dir.newChat'), () =>
          director?.newChat(),
        ),
      ),
    ),
    thread,
    h(
      'div',
      { class: 'ai-compose' },
      composeBox,
      h('div', { class: 'ai-muted', text: t('dir.free') }),
    ),
  );
  const ribbon = h('div', {
    id: 'ai-ribbon',
    role: 'list',
    'aria-label': t('ribbon.title'),
  });
  const playButton = h(
    'button',
    { type: 'button', id: 'ai-play', 'aria-label': t('tl.play') },
    svg('play', 16),
  );
  const track = h('div', {
    id: 'ai-track',
    role: 'group',
    'aria-label': t('tl.label'),
  });
  const playhead = h('div', { id: 'ai-playhead' });
  const timeText = h('div', { id: 'ai-time' });
  const bottom = h(
    'section',
    { id: 'ai-bottom', class: 'ai-region ai-panel' },
    ribbon,
    h('div', { id: 'ai-timeline' }, playButton, track, timeText),
  );
  const drawerBody = h('div', { id: 'ai-drawer-body', role: 'tabpanel' });
  const tabs = h('div', { class: 'ai-tabs', role: 'tablist' });
  const drawer = h(
    'aside',
    {
      id: 'ai-drawer',
      class: 'ai-region ai-panel',
      'aria-label': t('top.drawer'),
    },
    tabs,
    drawerBody,
  );
  shell.append(directorEl, bottom, drawer);

  // ---- top bar ------------------------------------------------------------
  const creditsChip = h('span', {
    class: 'ai-top-chip ai-only',
    id: 'ai-credits',
  });
  const drawerToggle = iconButton(
    'ai-drawer-toggle',
    'panelRight',
    t('drawer.close'),
    () => setDrawer(!drawerOpen),
  );
  drawerToggle.classList.add('ai-only');
  const backButton = iconButton('ai-back', 'back', t('top.back'), () =>
    host.back(),
  );
  backButton.classList.add('ai-only');
  topStart.prepend(backButton);
  topEnd.prepend(creditsChip);
  topEnd.append(drawerToggle);

  // ---- stage --------------------------------------------------------------
  const quick = h('div', {
    id: 'ai-quick',
    class: 'ai-only',
    role: 'toolbar',
    'aria-label': t('quick.look'),
  });
  const glow = h('div', { class: 'ai-glow ai-only', 'aria-hidden': 'true' });
  const hit = h('div', { id: 'ai-hit', class: 'ai-only' });
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  outline.id = 'ai-outline';
  outline.classList.add('ai-only');
  const bubble = h('div', { id: 'ai-bubble', class: 'ai-only', hidden: true });
  const empty = h('div', { id: 'ai-empty', class: 'ai-only', hidden: true });
  const dropHint = h(
    'div',
    { id: 'ai-drop', class: 'ai-only', hidden: true },
    h('span', {}),
  );
  preview.prepend(quick);
  preview.append(glow);
  stage.append(hit, outline, bubble, empty, dropHint);

  // ---- orb ----------------------------------------------------------------
  let orb: OrbHandle | null = null;
  try {
    orb = createOrb({
      size: 56,
      level: still() ? 'off' : 'full',
      label: t('dir.title'),
    });
    orbBox.append(orb.el);
  } catch {
    /* no canvas: the state line still says what Director is doing */
  }
  let orbNow: OrbState = 'idle';
  const setOrb = (state: OrbState, progress?: number | null) => {
    orbNow = state;
    orb?.setState(state);
    if (progress !== undefined) orb?.setProgress(progress);
    orb?.setLevelOfEffects(still() || document.hidden ? 'off' : 'full');
    preview.dataset.orb = state;
    directorEl.dataset.orb = state;
    orbState.textContent = t(`state.${state}` as AiKey);
  };

  // ---- drawer -------------------------------------------------------------
  let drawerOpen = window.innerWidth >= 1280;
  let tab: DrawerTab = 'controls';
  const TABS: [DrawerTab, AiKey][] = [
    ['controls', 'tab.controls'],
    ['plan', 'tab.plan'],
    ['assets', 'tab.assets'],
    ['memory', 'tab.memory'],
  ];
  for (const [id, key] of TABS)
    tabs.append(
      h('button', {
        type: 'button',
        class: 'ai-tab',
        role: 'tab',
        'data-ai-tab': id,
        'aria-selected': 'false',
        text: t(key),
        onclick: () => openDrawer(id),
      }),
    );
  tabs.append(
    iconButton('ai-drawer-close', 'close', t('drawer.close'), () =>
      setDrawer(false),
    ),
  );
  const setDrawer = (open: boolean) => {
    drawerOpen = open;
    shell.classList.toggle('ai-drawer-closed', !open);
    drawerToggle.setAttribute('aria-pressed', String(open));
    drawerToggle.title = t(open ? 'drawer.close' : 'drawer.open');
    drawerToggle.setAttribute('aria-label', drawerToggle.title);
    if (open) paintDrawer();
    refit();
  };
  const openDrawer = (id: DrawerTab) => {
    tab = id;
    if (!drawerOpen) setDrawer(true);
    else paintDrawer();
  };
  const refit = () => {
    if (!visible) return;
    const run = () => {
      if (!visible) return;
      host.fit();
      place();
    };
    requestAnimationFrame(run);
    setTimeout(run, 280);
  };

  // ---- small popover ------------------------------------------------------
  let pop: HTMLElement | null = null;
  const closePop = () => {
    pop?.remove();
    pop = null;
    for (const b of shell.querySelectorAll('[aria-expanded="true"].aim-chip'))
      b.setAttribute('aria-expanded', 'false');
  };
  const openPop = (anchor: HTMLElement, build: (el: HTMLElement) => void) => {
    const again = pop && pop.dataset.for === anchor.id;
    closePop();
    if (again) return;
    pop = h('div', { class: 'ai-pop', role: 'menu', 'data-for': anchor.id });
    pop.id = `${anchor.id}-pop`;
    build(pop);
    // Inside the shell, so AI mode's colours reach it.
    shell.append(pop);
    const box = anchor.getBoundingClientRect();
    const mine = pop.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(box.left, window.innerWidth - mine.width - 8),
    );
    const below = box.bottom + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${below + mine.height > window.innerHeight - 8 ? Math.max(8, box.top - mine.height - 6) : below}px`;
    anchor.setAttribute('aria-expanded', 'true');
    pop.querySelector<HTMLElement>('button, input')?.focus();
  };
  const onDocDown = (event: PointerEvent) => {
    if (!pop) return;
    const target = event.target as Node;
    if (pop.contains(target)) return;
    const anchor = document.getElementById(pop.dataset.for ?? '');
    if (anchor?.contains(target)) return;
    closePop();
  };
  document.addEventListener('pointerdown', onDocDown, true);
  offs.push(() => document.removeEventListener('pointerdown', onDocDown, true));
  const popItem = (
    label: string,
    run: () => void,
    checked?: boolean,
    extra?: Node,
  ) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ai-pop-item',
        role: checked === undefined ? 'menuitem' : 'menuitemradio',
        ...(checked === undefined ? {} : { 'aria-checked': String(checked) }),
        onclick: () => {
          closePop();
          run();
        },
      },
      extra ?? null,
      h('span', { text: label }),
    );

  // ---- message box --------------------------------------------------------
  let pending: File[] = [];
  let sceneRef: string | null = null;
  const paintChips = () => {
    clear(chips);
    if (sceneRef) {
      const scene = engine.state.compositions.find((s) => s.id === sceneRef);
      chips.append(
        h(
          'span',
          { class: 'ai-sel-chip', 'data-chip': 'scene' },
          h('span', {
            text: t('chip.scene', { name: scene?.name ?? '?' }),
          }),
          h(
            'button',
            {
              type: 'button',
              'aria-label': t('dir.remove'),
              onclick: () => {
                sceneRef = null;
                paintChips();
              },
            },
            svg('close', 12),
          ),
        ),
      );
    }
    for (const id of session.selectedIds) {
      const hitLayer = findLayer(engine.state, id);
      if (!hitLayer) continue;
      chips.append(
        h(
          'span',
          { class: 'ai-sel-chip', 'data-chip': 'layer', 'data-layer': id },
          h('span', { text: hitLayer.layer.name }),
          h(
            'button',
            {
              type: 'button',
              'aria-label': t('dir.remove'),
              onclick: () => session.select(id, true),
            },
            svg('close', 12),
          ),
        ),
      );
    }
    chips.hidden = !chips.childElementCount;
    input.placeholder = t(
      session.selectedIds.length ? 'dir.placeholderSel' : 'dir.placeholder',
    );
    clear(fileChips);
    for (const file of pending)
      fileChips.append(
        h(
          'span',
          { class: 'ai-file-chip', 'data-file': file.name },
          h('span', { text: file.name }),
          h(
            'button',
            {
              type: 'button',
              'aria-label': t('dir.remove'),
              onclick: () => {
                pending = pending.filter((f) => f !== file);
                paintChips();
              },
            },
            svg('close', 12),
          ),
        ),
      );
    fileChips.hidden = !pending.length;
    sendButton.disabled = !director;
  };
  const send = () => {
    if (!director) return;
    const text = input.value;
    if (!text.trim() && !pending.length) return;
    const files = pending;
    const ref = sceneRef;
    pending = [];
    sceneRef = null;
    input.value = '';
    paintChips();
    void director.send({ text, files, sceneRef: ref });
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });
  input.addEventListener('focus', () => {
    if (orbNow === 'idle') setOrb('listening');
  });
  input.addEventListener('blur', () => {
    if (orbNow === 'listening') setOrb('idle');
  });
  sendButton.onclick = send;
  const filePicker = h('input', { type: 'file', multiple: true, hidden: true });
  filePicker.onchange = () => {
    pending = [...pending, ...(filePicker.files ?? [])].slice(0, 6);
    filePicker.value = '';
    paintChips();
  };
  // Voice typing (where the browser has it).
  type Recognition = {
    lang: string;
    interimResults: boolean;
    onresult:
      | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
      | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    start(): void;
    stop(): void;
  };
  let listening: Recognition | null = null;
  const voiceButton = iconButton('ai-voice', 'mic', t('dir.voice'), () => {
    const w = window as unknown as Record<
      string,
      (new () => Recognition) | undefined
    >;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      host.toast(t('dir.voiceNone'), 'info');
      return;
    }
    if (listening) {
      listening.stop();
      return;
    }
    const base = input.value;
    const r = new Ctor();
    r.lang = lang() === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = true;
    r.onresult = (e) => {
      input.value = `${base} ${Array.from(e.results)
        .map((x) => x[0]?.transcript ?? '')
        .join(' ')}`.trim();
    };
    const end = () => {
      listening = null;
      voiceButton.setAttribute('aria-pressed', 'false');
      if (orbNow === 'listening') setOrb('idle');
    };
    r.onend = end;
    r.onerror = end;
    listening = r;
    voiceButton.setAttribute('aria-pressed', 'true');
    setOrb('listening');
    r.start();
  });
  composeBox.append(
    chips,
    fileChips,
    input,
    h(
      'div',
      { class: 'ai-compose-actions' },
      iconButton('ai-attach', 'plus', t('dir.attach'), () =>
        filePicker.click(),
      ),
      voiceButton,
      h('span', { class: 'ai-grow' }),
      sendButton,
    ),
    filePicker,
  );
  // A file dropped on the message box is attached.
  composeBox.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    composeBox.dataset.drop = 'true';
  });
  composeBox.addEventListener('dragleave', () => {
    delete composeBox.dataset.drop;
  });
  composeBox.addEventListener('drop', (event) => {
    delete composeBox.dataset.drop;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    pending = [...pending, ...files].slice(0, 6);
    paintChips();
  });

  // ---- chats menu ---------------------------------------------------------
  const chatMenu = (event: MouseEvent) => {
    const anchor = event.currentTarget as HTMLElement;
    openPop(anchor, (el) => {
      el.append(h('div', { class: 'ai-label', text: t('dir.chats') }));
      for (const chat of [...(director?.chats() ?? [])].reverse())
        el.append(
          popItem(
            chat.title || t('dir.newChat'),
            () => director?.openChat(chat.id),
            chat.id === director?.chatId,
          ),
        );
    });
  };

  // ---- the stage: select only ---------------------------------------------
  const pointOf = (event: { clientX: number; clientY: number }) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const inCanvas = (event: { clientX: number; clientY: number }) => {
    const box = canvas.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    );
  };
  const pickAt = (event: { clientX: number; clientY: number }) =>
    inCanvas(event) ? host.pick(pointOf(event)) : null;
  let hoverId: string | null = null;
  let dropId: string | null = null;
  let flashing: string[] = [];
  hit.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    closePop();
    const id = pickAt(event);
    session.select(id, !!id && event.shiftKey);
    input.blur();
  });
  hit.addEventListener('pointermove', (event) => {
    const id = pickAt(event);
    if (id === hoverId) return;
    hoverId = id;
    hit.style.cursor = id ? 'pointer' : 'default';
    paintOutline();
  });
  hit.addEventListener('pointerleave', () => {
    hoverId = null;
    paintOutline();
  });
  hit.addEventListener('contextmenu', (event) => event.preventDefault());
  const corners = (id: string) => {
    try {
      return (
        selectionGeometry(
          session.previewSource ?? session.source,
          id,
          host.viewMatrix() as never,
        )?.corners ?? null
      );
    } catch {
      return null;
    }
  };
  /** The SVG and the hit area sit exactly on the canvas. */
  const place = () => {
    const s = stage.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    for (const el of [hit, outline as unknown as HTMLElement]) {
      el.style.left = `${c.left - s.left}px`;
      el.style.top = `${c.top - s.top}px`;
      el.style.width = `${c.width}px`;
      el.style.height = `${c.height}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    paintOutline();
    placeBubble();
  };
  const paintOutline = () => {
    while (outline.firstChild) outline.firstChild.remove();
    const add = (id: string, cls: string) => {
      const pts = corners(id);
      if (!pts) return;
      const poly = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'polygon',
      );
      poly.setAttribute('points', pts.map((p) => `${p[0]},${p[1]}`).join(' '));
      poly.setAttribute('class', cls);
      poly.setAttribute('data-layer', id);
      outline.append(poly);
    };
    if (dropId) add(dropId, 'drop');
    else if (hoverId && !session.selectedIds.includes(hoverId))
      add(hoverId, 'hover');
    for (const id of session.selectedIds) add(id, 'selected');
    for (const id of flashing) add(id, 'flash');
  };
  const flash = (ids: readonly string[]) => {
    flashing = [...ids];
    paintOutline();
    setTimeout(
      () => {
        flashing = [];
        paintOutline();
      },
      still() ? 600 : 1400,
    );
  };

  // ---- point and say: the bubble ------------------------------------------
  let bubbleFor = '';
  let bubbleMode: 'actions' | 'text' | 'colour' = 'actions';
  const say = (key: string): string =>
    (
      ({
        bigger: lang() === 'hi' ? 'इसे बड़ा करो' : 'Make it bigger',
        smaller: lang() === 'hi' ? 'इसे छोटा करो' : 'Make it smaller',
        remove: lang() === 'hi' ? 'इसे हटाओ' : 'Remove it',
        fit: lang() === 'hi' ? 'इसे फ़िट करो' : 'Fit it to the canvas',
        faster: lang() === 'hi' ? 'इसे तेज़ करो' : 'Make it faster',
      }) as Record<string, string>
    )[key] ?? key;
  const replaceWithFile = (layerId: string) => {
    const pick = h('input', {
      type: 'file',
      hidden: true,
      accept: 'image/*,video/*',
    });
    pick.onchange = () => {
      const file = pick.files?.[0];
      pick.remove();
      if (file) void director?.drop({ files: [file] }, layerId);
    };
    document.body.append(pick);
    pick.click();
  };
  const paintBubble = () => {
    const id = session.selectedIds.length === 1 ? session.selectedIds[0]! : '';
    const layer = id ? findLayer(engine.state, id)?.layer : null;
    const show =
      !!layer &&
      !!director &&
      !director.building &&
      !session.playing &&
      findLayer(engine.state, id)?.scene.id === session.source.composition.id;
    bubble.hidden = !show;
    if (!show || !layer) {
      bubbleFor = '';
      return;
    }
    if (bubbleFor !== id) bubbleMode = 'actions';
    bubbleFor = id;
    clear(bubble);
    bubble.dataset.layer = id;
    bubble.dataset.kind = kindOf(layer);
    bubble.append(h('div', { class: 'ai-bubble-name', text: layer.name }));
    if (isLocked(layer)) {
      bubble.append(h('div', { class: 'ai-muted', text: t('ctl.locked') }));
      placeBubble();
      return;
    }
    if (bubbleMode === 'colour') {
      bubble.append(
        h(
          'div',
          { class: 'ai-swatches' },
          SWATCHES.map((colour) =>
            h('button', {
              type: 'button',
              class: 'ai-swatch',
              'data-colour': colour,
              'aria-label': colour,
              style: `background:${colour}`,
              onclick: () => {
                bubbleMode = 'actions';
                director?.ask(
                  lang() === 'hi'
                    ? `इसका रंग ${colour} करो`
                    : `Recolour it ${colour}`,
                  { selectedIds: [id] },
                );
              },
            }),
          ),
        ),
      );
    } else if (bubbleMode === 'actions') {
      const row = h('div', { class: 'ai-row' });
      for (const key of [...suggestionsFor(layer), 'more'])
        row.append(
          h('button', {
            type: 'button',
            class: 'aim-chip',
            'data-suggest': key,
            text: t(`sug.${key}` as AiKey),
            onclick: () => {
              if (key === 'changeText') {
                bubbleMode = 'text';
                paintBubble();
              } else if (key === 'recolour') {
                bubbleMode = 'colour';
                paintBubble();
              } else if (key === 'replace') replaceWithFile(id);
              else if (key === 'more') input.focus();
              else director?.ask(say(key), { selectedIds: [id] });
            },
          }),
        );
      bubble.append(row);
    }
    const field = h('input', {
      type: 'text',
      class: 'ai-input',
      id: 'ai-bubble-input',
      placeholder: t(
        bubbleMode === 'text' ? 'bubble.textPrompt' : 'bubble.input',
      ),
      'aria-label': t(
        bubbleMode === 'text' ? 'bubble.textPrompt' : 'bubble.input',
      ),
      value: bubbleMode === 'text' ? stringOf(layer, 'text') : '',
    });
    bubble.append(
      h(
        'form',
        {
          onsubmit: (event: Event) => {
            event.preventDefault();
            const value = field.value.trim();
            if (!value) return;
            const asText = bubbleMode === 'text';
            bubbleMode = 'actions';
            if (asText)
              director?.ask(
                lang() === 'hi'
                  ? `टेक्स्ट "${value}" करो`
                  : `Change the text to "${value}"`,
                { selectedIds: [id] },
              );
            else void director?.send({ text: value, files: [] });
            field.value = '';
          },
        },
        field,
        h(
          'button',
          { type: 'submit', class: 'ai-icon-btn', 'aria-label': t('dir.send') },
          svg('arrowUp', 16),
        ),
      ),
    );
    if (bubbleMode === 'text') field.focus();
    placeBubble();
  };
  const placeBubble = () => {
    if (bubble.hidden || !bubbleFor) return;
    const pts = corners(bubbleFor);
    if (!pts) {
      bubble.hidden = true;
      return;
    }
    const s = stage.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const mine = bubble.getBoundingClientRect();
    const ox = c.left - s.left;
    const oy = c.top - s.top;
    const box = {
      left: ox + Math.min(...xs),
      right: ox + Math.max(...xs),
      top: oy + Math.min(...ys),
      bottom: oy + Math.max(...ys),
    };
    const gap = 10;
    // Beside the layer when there is room, else under or over it: the
    // bubble never sits on what it is about.
    const spots: [number, number][] = [
      [box.right + gap, box.top],
      [box.left - mine.width - gap, box.top],
      [box.left, box.bottom + gap],
      [box.left, box.top - mine.height - gap],
    ];
    const fits = ([x, y]: [number, number]) =>
      x >= 8 &&
      y >= 8 &&
      x + mine.width <= s.width - 8 &&
      y + mine.height <= s.height - 8;
    const [x, y] = spots.find(fits) ?? [
      s.width - mine.width - 8,
      s.height - mine.height - 8,
    ];
    bubble.style.left = `${Math.max(8, Math.min(x, s.width - mine.width - 8))}px`;
    bubble.style.top = `${Math.max(8, Math.min(y, s.height - mine.height - 8))}px`;
  };

  // ---- drag and drop ------------------------------------------------------
  const setDrop = (id: string | null, on: boolean) => {
    dropId = id;
    dropHint.hidden = !on;
    preview.classList.toggle('ai-stage-drop', on && !id);
    if (on)
      dropHint.firstElementChild!.textContent = t(
        id ? 'stage.dropLayer' : 'stage.dropScene',
      );
    paintOutline();
  };
  const replaceable = (id: string | null) => {
    const layer = id ? findLayer(engine.state, id)?.layer : null;
    const kind = layer ? kindOf(layer) : null;
    return kind === 'picture' || kind === 'video' ? id : null;
  };
  stage.addEventListener('dragover', (event) => {
    if (!visible || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    setDrop(replaceable(pickAt(event)), true);
  });
  stage.addEventListener('dragleave', (event) => {
    if (!visible) return;
    if (!stage.contains(event.relatedTarget as Node | null))
      setDrop(null, false);
  });
  stage.addEventListener('drop', (event) => {
    if (!visible) return;
    const files = [...(event.dataTransfer?.files ?? [])];
    const target = replaceable(pickAt(event));
    setDrop(null, false);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void director?.drop({ files }, target);
  });
  /** A card of the Assets tab dragged with the pointer onto the stage. */
  const startAssetDrag = (
    event: PointerEvent,
    asset: { assetId?: string; name: string; file?: () => Promise<File> },
  ) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost: HTMLElement | null = null;
    const over = (e: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      return (
        e.clientX >= box.left &&
        e.clientX <= box.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom
      );
    };
    const move = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        ghost = h('div', { class: 'ai-drag-ghost', text: asset.name });
        shell.append(ghost);
      }
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      if (over(e)) setDrop(replaceable(pickAt(e)), true);
      else setDrop(null, false);
    };
    const end = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const dragged = !!ghost;
      ghost?.remove();
      const target = dragged && over(e) ? replaceable(pickAt(e)) : null;
      const onStage = dragged && over(e) && e.type === 'pointerup';
      setDrop(null, false);
      if (!onStage) return;
      void (async () => {
        if (asset.assetId)
          await director?.drop(
            { assetId: asset.assetId, name: asset.name },
            target,
          );
        else if (asset.file)
          await director?.drop({ files: [await asset.file()] }, target);
      })();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // ---- empty state --------------------------------------------------------
  const paintEmpty = () => {
    const show =
      !!director &&
      !director.hasContent() &&
      !director.building &&
      director.stage !== 'built';
    empty.hidden = !show;
    if (!show || empty.childElementCount) return;
    empty.append(
      h(
        'div',
        { class: 'ai-empty-card' },
        h('div', { class: 'ai-empty-frame' }, svg('magic', 40)),
        h('h3', { text: t('stage.emptyTitle') }),
        h('p', { text: t('stage.emptyBody') }),
        h(
          'div',
          { class: 'ai-row', style: 'justify-content:center' },
          h('span', { class: 'ai-muted', text: `${t('stage.emptyTry')}:` }),
          (['stage.try1', 'stage.try2', 'stage.try3'] as AiKey[]).map((key) =>
            h('button', {
              type: 'button',
              class: 'aim-chip',
              'data-try': key,
              text: t(key),
              onclick: () => {
                input.value = t(key);
                input.focus();
              },
            }),
          ),
        ),
      ),
    );
  };

  // ---- scene ribbon -------------------------------------------------------
  let ribbonKey = '';
  let posterTimer: ReturnType<typeof setTimeout> | undefined;
  const posters = new Map<string, string>();
  let arriving = new Set<string>();
  const paintPosters = () => {
    for (const img of ribbon.querySelectorAll<HTMLImageElement>('img')) {
      const id = img.dataset.scene!;
      const url = host.poster(id, 264);
      if (url) {
        posters.set(id, url);
        img.src = url;
      }
    }
  };
  const sceneMenu = (anchor: HTMLElement, sceneId: string) =>
    openPop(anchor, (el) => {
      el.append(
        popItem(t('ribbon.duplicate'), () => {
          const made = duplicateScene(engine.state as never, sceneId);
          engine.commands.transaction('Duplicate scene', made.commands);
          session.selectComposition(made.id);
        }),
        popItem(t('ribbon.delete'), async () => {
          const scene = engine.state.compositions.find((s) => s.id === sceneId);
          if (!scene) return;
          if (engine.state.compositions.length < 2) {
            host.toast(t('ribbon.last'), 'info');
            return;
          }
          if (
            !(await confirmDialog(
              t('ribbon.deleteBody', { name: scene.name }),
              {
                titleText: t('ribbon.deleteTitle'),
                confirmLabel: t('ribbon.delete'),
                danger: true,
              },
            ))
          )
            return;
          engine.commands.transaction('Delete scene', [
            { type: 'DELETE_COMPOSITION', compositionId: sceneId },
          ]);
        }),
        popItem(t('ribbon.ask'), () => {
          sceneRef = sceneId;
          session.selectComposition(sceneId);
          session.select(null);
          paintChips();
          input.focus();
        }),
      );
    });
  const paintRibbon = (force = false) => {
    const scenes = engine.state.compositions;
    const open = session.source.composition.id;
    const key = scenes
      .map((s) => `${s.id}|${s.name}|${Math.round(s.duration * 10)}`)
      .join(',');
    if (force || key !== ribbonKey) {
      ribbonKey = key;
      clear(ribbon);
      const blank = scenes.length === 1 && !scenes[0]!.layers.length;
      if (blank)
        ribbon.append(
          h('div', { class: 'ai-ribbon-empty', text: t('ribbon.empty') }),
        );
      else
        scenes.forEach((scene, index) => {
          if (arriving.has(scene.id)) return;
          const img = h('img', {
            alt: '',
            draggable: false,
            'data-scene': scene.id,
          });
          if (posters.has(scene.id)) img.src = posters.get(scene.id)!;
          const menu = h(
            'button',
            {
              type: 'button',
              class: 'ai-scene-menu',
              id: `ai-scene-menu-${index}`,
              'aria-label': t('ribbon.menu'),
              'aria-haspopup': 'menu',
              onclick: (e: MouseEvent) => {
                e.stopPropagation();
                sceneMenu(menu, scene.id);
              },
            },
            svg('more', 14),
          );
          menu.addEventListener('pointerdown', (e) => e.stopPropagation());
          const card = h(
            'div',
            {
              class: 'ai-scene',
              role: 'listitem',
              tabindex: 0,
              'data-scene': scene.id,
              'data-index': index,
              'aria-label': scene.name,
            },
            h('span', { class: 'ai-scene-thumb' }, img),
            h(
              'span',
              { class: 'ai-scene-meta' },
              h('span', { text: `${index + 1}. ${scene.name}` }),
              h('span', { class: 'ai-len', text: seconds(scene.duration) }),
            ),
            menu,
          );
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              session.selectComposition(scene.id);
            }
          });
          card.addEventListener('pointerdown', (e) => dragScene(e, card));
          ribbon.append(card);
        });
    }
    for (const card of ribbon.querySelectorAll<HTMLElement>('.ai-scene'))
      card.setAttribute('aria-current', String(card.dataset.scene === open));
    clearTimeout(posterTimer);
    posterTimer = setTimeout(paintPosters, 350);
  };
  /** Click opens a scene; a drag moves it (one undo step on release). */
  const dragScene = (event: PointerEvent, card: HTMLElement) => {
    if (event.button !== 0) return;
    const id = card.dataset.scene!;
    const start = event.clientX;
    let dragging = false;
    let target = -1;
    const cards = () => [...ribbon.querySelectorAll<HTMLElement>('.ai-scene')];
    const mark = () => {
      for (const c of cards()) c.classList.remove('before', 'after');
      const list = cards();
      if (target < 0) return;
      if (target >= list.length) list.at(-1)?.classList.add('after');
      else list[target]?.classList.add('before');
    };
    const move = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(e.clientX - start) < 6) return;
        dragging = true;
        card.classList.add('dragging');
      }
      const list = cards();
      target = list.length;
      for (const [i, c] of list.entries()) {
        const box = c.getBoundingClientRect();
        if (e.clientX < box.left + box.width / 2) {
          target = i;
          break;
        }
      }
      mark();
    };
    const end = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      card.classList.remove('dragging');
      for (const c of cards()) c.classList.remove('before', 'after');
      if (!dragging) {
        if (e.type === 'pointerup') session.selectComposition(id);
        return;
      }
      if (e.type !== 'pointerup' || target < 0) return;
      const from = engine.state.compositions.findIndex((s) => s.id === id);
      const to = target > from ? target - 1 : target;
      if (from < 0 || to === from) return;
      // Reordering stops playback first, so the playhead never runs into a
      // scene that has just moved.
      session.setPlaying(false);
      engine.commands.transaction('Reorder scenes', [
        { type: 'MOVE_COMPOSITION', compositionId: id, index: to },
      ]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // ---- slim timeline ------------------------------------------------------
  let timelineKey = '';
  const paintTimeline = () => {
    const scene = session.source.composition;
    const total = Math.max(scene.duration, 1 / scene.fps);
    const lanes = scene.tracks.filter((lane) => lane.clips.length);
    const key = `${scene.id}|${total}|${lanes
      .map((lane) =>
        lane.clips.map((c) => `${c.id}:${c.startTime}:${c.duration}`).join(';'),
      )
      .join('/')}`;
    if (key !== timelineKey) {
      timelineKey = key;
      clear(track);
      if (!lanes.length)
        track.append(h('div', { class: 'ai-muted', text: t('tl.empty') }));
      for (const lane of lanes) {
        const row = h('div', { class: 'ai-lane' });
        for (const item of lane.clips) {
          const layer = locateLayer(scene.layers as never, item.layerId)?.layer;
          row.append(
            h('button', {
              type: 'button',
              class: 'ai-clip',
              'data-clip': item.id,
              'data-layer': item.layerId,
              'data-kind': layer
                ? layer.code
                  ? 'video'
                  : layer.type === 'group'
                    ? 'shape'
                    : layer.type
                : lane.type,
              'aria-label': item.name,
              title: item.name,
              style: `left:${(item.startTime / total) * 100}%;width:${(item.duration / total) * 100}%`,
              onpointerdown: (e: Event) => e.stopPropagation(),
              onclick: () => session.select(item.layerId),
            }),
          );
        }
        track.append(row);
      }
      track.append(playhead);
    }
    for (const b of track.querySelectorAll<HTMLElement>('.ai-clip'))
      b.setAttribute(
        'aria-pressed',
        String(session.selectedIds.includes(b.dataset.layer!)),
      );
    playhead.style.left = `${Math.min(100, (session.currentTime / total) * 100)}%`;
    timeText.textContent = `${timecode(session.currentTime)} / ${timecode(total)}`;
    clear(playButton, svg(session.playing ? 'pause' : 'play', 16));
    playButton.setAttribute(
      'aria-label',
      t(session.playing ? 'tl.pause' : 'tl.play'),
    );
    playButton.dataset.playing = String(session.playing);
  };
  playButton.onclick = () => host.togglePlayback();
  const seek = (event: PointerEvent) => {
    const box = track.getBoundingClientRect();
    const scene = session.source.composition;
    const part = Math.min(
      1,
      Math.max(0, (event.clientX - box.left) / box.width),
    );
    session.setPlaying(false);
    session.setCurrentTime(part * scene.duration);
  };
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    seek(event);
    const move = (e: PointerEvent) => seek(e);
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  });

  // ---- quick strip --------------------------------------------------------
  const propose = (text: string, offer: Offer) => {
    if (!director) return;
    if (!offer.commands.length) {
      host.toast(t('quick.same'), 'info');
      return;
    }
    director.offer(
      {
        id: `p-quick-${Date.now().toString(36)}`,
        summary:
          lang() === 'hi' ? `मैं यह करूँगा: ${text}।` : `I will: ${text}.`,
        label: 'Director change',
        commands: offer.commands,
        layerIds: offer.layerIds,
        sceneId: session.source.composition.id,
        credits: 0,
      },
      text,
    );
  };
  const onOff = (on: boolean) => t(on ? 'quick.on' : 'quick.off').toLowerCase();
  const quickButton = (
    id: string,
    icon: string,
    key: AiKey,
    build: (el: HTMLElement) => void,
  ) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'aim-chip',
        id,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        onclick: () => openPop(b, build),
      },
      svg(icon, 16),
      h('span', { text: t(key) }),
    );
    return b;
  };
  quick.append(
    quickButton('ai-quick-look', 'color', 'quick.look', (el) => {
      const themes = host.themes();
      if (!themes.length)
        el.append(h('p', { class: 'ai-muted', text: t('quick.noLooks') }));
      for (const theme of themes)
        el.append(
          popItem(
            theme.name,
            () =>
              propose(t('quick.sayLook', { name: theme.name }), {
                commands: host.themeCommands(theme),
                layerIds: [],
              }),
            theme.id === host.currentThemeId(),
            h(
              'span',
              { class: 'ai-look-dots' },
              [
                theme.palette.background,
                theme.palette.primary,
                theme.palette.accent,
              ].map((colour) => h('i', { style: `background:${colour}` })),
            ),
          ),
        );
    }),
    quickButton('ai-quick-voice', 'mic', 'quick.voice', (el) => {
      const now = soundState(engine.state, 'speech');
      if (now === null)
        el.append(h('p', { class: 'ai-muted', text: t('quick.noVoice') }));
      else
        for (const on of [true, false])
          el.append(
            popItem(
              t(on ? 'quick.on' : 'quick.off'),
              () =>
                propose(
                  t('quick.sayVoice', { state: onOff(on) }),
                  soundToggle(engine.state, 'speech', on),
                ),
              now === on,
            ),
          );
    }),
    quickButton('ai-quick-music', 'audio', 'quick.music', (el) => {
      const now = soundState(engine.state, 'music');
      if (now === null) {
        el.append(h('p', { class: 'ai-muted', text: t('quick.noMusic') }));
        return;
      }
      for (const on of [true, false])
        el.append(
          popItem(
            t(on ? 'quick.on' : 'quick.off'),
            () =>
              propose(
                t('quick.sayMusic', { state: onOff(on) }),
                soundToggle(engine.state, 'music', on),
              ),
            now === on,
          ),
        );
      el.append(h('div', { class: 'ai-label', text: t('quick.volume') }));
      for (const level of Object.keys(VOLUMES) as (keyof typeof VOLUMES)[])
        el.append(
          popItem(t(`quick.${level}` as AiKey), () =>
            propose(
              t('quick.sayVolume', { name: t(`quick.${level}` as AiKey) }),
              musicVolume(engine.state, level),
            ),
          ),
        );
    }),
    quickButton('ai-quick-captions', 'captions', 'quick.captions', (el) => {
      const now = captionState(engine.state);
      if (now === null) {
        el.append(h('p', { class: 'ai-muted', text: t('quick.noCaptions') }));
        return;
      }
      for (const on of [true, false])
        el.append(
          popItem(
            t(on ? 'quick.on' : 'quick.off'),
            () =>
              propose(
                t('quick.sayCaptions', { state: onOff(on) }),
                captionToggle(engine.state, on),
              ),
            now === on,
          ),
        );
      el.append(h('div', { class: 'ai-label', text: t('quick.style') }));
      for (const style of CAPTION_STYLE_LIST)
        el.append(
          popItem(style.name, () =>
            propose(
              t('quick.sayCaptionStyle', { name: style.name }),
              captionRestyle(engine.state, style.id),
            ),
          ),
        );
    }),
    quickButton('ai-quick-format', 'crop', 'quick.format', (el) => {
      const now = currentFormat(engine.state, session.source.composition.id);
      for (const name of Object.keys(FORMATS))
        el.append(
          popItem(
            name,
            () =>
              propose(
                t('quick.sayFormat', { name }),
                formatChange(engine.state, name),
              ),
            now === name,
          ),
        );
    }),
  );

  // ---- drawer: Controls and Assets ----------------------------------------
  const commit = (label: string, commands: readonly EditorCommand[]) => {
    try {
      host.preview(null);
      engine.commands.transaction(label, [...commands]);
    } catch (error) {
      host.toast(
        error instanceof Error ? error.message : String(error),
        'error',
      );
    }
  };
  const plain = (
    type: 'string' | 'color' | 'boolean',
    value: string | boolean,
  ) => ({ type, value, animated: false, keyframes: [], constraints: [] });
  const setProp = (
    sceneId: string,
    layerId: string,
    key: string,
    type: 'string' | 'color',
    value: string,
  ) =>
    ({
      type: 'SET_PROPERTY',
      compositionId: sceneId,
      layerId,
      target: { kind: 'property', key },
      property: plain(type, value),
    }) as EditorCommand;
  let controlsFor = '';
  const paintControls = () => {
    const id = session.selectedIds.length === 1 ? session.selectedIds[0]! : '';
    const found = id ? findLayer(engine.state, id) : null;
    // Rebuilt only when the layer itself changed, and never under the
    // person's fingers (a focused control keeps its element).
    const clipNow = found
      ? found.scene.tracks
          .flatMap((lane) => lane.clips)
          .find((item) => item.layerId === id)
      : null;
    const key = found
      ? `${id}|${hashLayer(found.layer)}|${clipNow?.enabled ?? ''}`
      : '';
    if (
      found &&
      controlsFor.startsWith(`${id}|`) &&
      drawerBody.dataset.painted === 'controls' &&
      (controlsFor === key ||
        (drawerBody.contains(document.activeElement) &&
          document.activeElement !== document.body))
    )
      return;
    controlsFor = key;
    drawerBody.dataset.painted = 'controls';
    clear(drawerBody);
    if (!found) {
      drawerBody.append(
        h('p', {
          class: 'ai-muted',
          id: 'ai-controls-none',
          text: t('ctl.none'),
        }),
      );
      return;
    }
    const { layer, scene } = found;
    const kind = kindOf(layer);
    drawerBody.append(h('h5', { class: 'ai-label', text: layer.name }));
    if (isLocked(layer)) {
      drawerBody.append(h('p', { class: 'ai-muted', text: t('ctl.locked') }));
      return;
    }
    // The layer's own controllers: the editor's existing Controls (a code
    // animation's settings with live preview, or a preset's controls).
    if (layer.code || hasControls(layer as never)) {
      const own = h('div', { class: 'ai-own', id: 'ai-own-controls' });
      own.append(...host.controls());
      drawerBody.append(
        h('div', { class: 'ai-section' }, h('h5', { text: t('ctl.own') }), own),
      );
    }
    const swatches = (key: string, label: AiKey) => {
      const now = layer.properties[key];
      const value = now && now.type === 'color' ? now.value : '';
      const hex = h('input', {
        type: 'text',
        class: 'ai-input',
        'aria-label': t('ctl.hex'),
        'data-hex': key,
        value,
        maxlength: 7,
        onchange: () => {
          if (/^#[0-9a-f]{6}$/i.test(hex.value))
            commit(t(label), [
              setProp(
                scene.id,
                layer.id,
                key,
                'color',
                hex.value.toLowerCase(),
              ),
            ]);
        },
      });
      return h(
        'div',
        { class: 'ai-section', 'data-control': key },
        h('h5', { text: t(label) }),
        h(
          'div',
          { class: 'ai-swatches' },
          SWATCHES.map((colour) =>
            h('button', {
              type: 'button',
              class: 'ai-swatch',
              'data-colour': colour,
              'aria-label': colour,
              'aria-pressed': String(colour === value),
              style: `background:${colour}`,
              onpointerenter: () =>
                host.preview([
                  setProp(scene.id, layer.id, key, 'color', colour),
                ]),
              onpointerleave: () => host.preview(null),
              onclick: () =>
                commit(t(label), [
                  setProp(scene.id, layer.id, key, 'color', colour),
                ]),
            }),
          ),
        ),
        hex,
      );
    };
    if (kind === 'text') {
      const area = h('textarea', {
        class: 'ai-input',
        id: 'ai-ctl-text',
        rows: 3,
        'aria-label': t('ctl.text'),
        value: stringOf(layer, 'text'),
      });
      // Typing previews on the canvas; leaving the field commits one step.
      area.addEventListener('input', () => {
        try {
          host.preview([
            setProp(scene.id, layer.id, 'text', 'string', area.value),
          ]);
        } catch {
          /* the commit reports what is wrong */
        }
      });
      area.addEventListener('change', () => {
        if (area.value !== stringOf(layer, 'text'))
          commit(t('ctl.text'), [
            setProp(scene.id, layer.id, 'text', 'string', area.value),
          ]);
        else host.preview(null);
      });
      drawerBody.append(
        h(
          'div',
          { class: 'ai-section', 'data-control': 'text' },
          h('h5', { text: t('ctl.text') }),
          area,
        ),
        swatches('fill', 'ctl.textColour'),
      );
    } else if (kind === 'shape')
      drawerBody.append(swatches('fill', 'ctl.fill'));
    else if (kind === 'picture' || kind === 'video')
      drawerBody.append(
        h(
          'div',
          { class: 'ai-section', 'data-control': 'replace' },
          h('h5', { text: t('ctl.replace') }),
          h('button', {
            type: 'button',
            class: 'ai-btn',
            id: 'ai-ctl-replace',
            text: t('ctl.replaceButton'),
            onclick: () => {
              const pick = h('input', {
                type: 'file',
                hidden: true,
                accept: kind === 'picture' ? 'image/*' : 'video/*',
              });
              pick.onchange = async () => {
                const file = pick.files?.[0];
                pick.remove();
                if (!file) return;
                if (
                  !file.type.startsWith(
                    kind === 'picture' ? 'image/' : 'video/',
                  )
                ) {
                  host.toast(t('ctl.wrongType'), 'error');
                  return;
                }
                const [assetId] = await host.importFiles([file]);
                if (assetId)
                  commit(t('ctl.replace'), [
                    {
                      type: 'SET_LAYER_ASSET',
                      compositionId: scene.id,
                      layerId: layer.id,
                      assetId,
                    },
                  ]);
              };
              document.body.append(pick);
              pick.click();
            },
          }),
        ),
      );
    // Show or hide: the layer's clip is switched on or off.
    const clipOf = scene.tracks
      .flatMap((lane) => lane.clips)
      .find((item) => item.layerId === layer.id);
    if (clipOf)
      drawerBody.append(
        h(
          'div',
          { class: 'ai-section ai-row', 'data-control': 'show' },
          h('button', {
            type: 'button',
            class: 'ai-switch',
            role: 'switch',
            id: 'ai-ctl-show',
            'aria-checked': String(clipOf.enabled),
            'aria-label': t('ctl.show'),
            onclick: () =>
              commit(t('ctl.show'), [
                {
                  type: 'SET_CLIP_ENABLED',
                  compositionId: scene.id,
                  clipId: clipOf.id,
                  enabled: !clipOf.enabled,
                },
              ]),
          }),
          h('span', { text: t('ctl.show') }),
        ),
      );
  };
  const paintAssets = () => {
    clear(drawerBody);
    const zone = h(
      'div',
      { class: 'ai-dropzone', id: 'ai-assets-drop' },
      h('span', { text: t('as.drop') }),
      h('button', {
        type: 'button',
        class: 'ai-btn sm',
        id: 'ai-assets-add',
        text: t('as.add'),
        onclick: () => {
          const pick = h('input', {
            type: 'file',
            hidden: true,
            multiple: true,
            accept: 'image/*,video/*,audio/*',
          });
          pick.onchange = async () => {
            const files = [...(pick.files ?? [])];
            pick.remove();
            if (files.length) await host.importFiles(files);
            paintAssets();
          };
          document.body.append(pick);
          pick.click();
        },
      }),
    );
    zone.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      zone.dataset.drop = 'true';
    });
    zone.addEventListener('dragleave', () => delete zone.dataset.drop);
    zone.addEventListener('drop', (e) => {
      delete zone.dataset.drop;
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      void host.importFiles(files).then(paintAssets);
    });
    drawerBody.append(zone);
    const slots = (director?.slots ?? []).filter((x) => !x.filled);
    if (slots.length)
      drawerBody.append(
        h(
          'div',
          { class: 'ai-section', id: 'ai-assets-slots' },
          h('h5', { text: t('as.slots') }),
          h(
            'ul',
            { class: 'ai-list' },
            slots.map((x) =>
              h('li', {
                class: 'ai-entry',
                'data-slot-wait': x.name,
                text: x.name,
              }),
            ),
          ),
        ),
      );
    // This Video's media (the project's assets), ready to drag onto the stage.
    const media = (
      engine.state.assets as unknown as readonly {
        id: string;
        name: string;
        type: string;
        metadata: Record<string, unknown>;
      }[]
    ).filter(
      (a) =>
        ['image', 'video', 'audio'].includes(a.type) &&
        a.metadata.removed !== true,
    );
    if (!media.length && !slots.length)
      drawerBody.append(
        h('p', { class: 'ai-muted', id: 'ai-assets-none', text: t('as.none') }),
      );
    const list = h('div', { class: 'ai-list', id: 'ai-assets-list' });
    for (const a of media) {
      const row = h(
        'button',
        {
          type: 'button',
          class: 'ai-asset',
          'data-asset': a.id,
          'data-kind': a.type,
          title: t('as.drag'),
        },
        h(
          'span',
          { class: 'ai-asset-thumb' },
          svg(
            a.type === 'audio'
              ? 'audio'
              : a.type === 'video'
                ? 'media'
                : 'image',
            16,
          ),
        ),
        h('span', { text: a.name }),
      );
      row.addEventListener('pointerdown', (e) =>
        startAssetDrag(e, { assetId: a.id, name: a.name }),
      );
      list.append(row);
    }
    if (media.length) drawerBody.append(list);
  };
  const paintDrawer = () => {
    for (const b of tabs.querySelectorAll<HTMLElement>('.ai-tab'))
      b.setAttribute('aria-selected', String(b.dataset.aiTab === tab));
    drawerBody.dataset.tab = tab;
    if (!drawerOpen) return;
    if (tab === 'controls') {
      paintControls();
      return;
    }
    drawerBody.dataset.painted = tab;
    controlsFor = '';
    if (tab === 'assets') paintAssets();
    else if (tab === 'plan' && director) director.renderPlan(drawerBody);
    else if (tab === 'memory' && director) director.renderMemory(drawerBody);
    else clear(drawerBody);
  };

  // ---- credits --------------------------------------------------------------
  let balance: () => number = () => 0;
  const paintCredits = () => {
    creditsChip.textContent = t('top.credits', { n: balance() });
  };

  // ---- one repaint --------------------------------------------------------
  let queued = false;
  const refresh = () => {
    if (!visible || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!visible) return;
      paintRibbon();
      paintTimeline();
      paintChips();
      paintEmpty();
      paintBubble();
      place();
      if (tab === 'controls' || tab === 'assets') paintDrawer();
    });
  };
  offs.push(
    session.onChange(refresh),
    session.onPreview(() => {
      if (visible) requestAnimationFrame(paintOutline);
    }),
    engine.on('state:changed', () => {
      refresh();
      if (visible && (tab === 'plan' || tab === 'memory')) paintDrawer();
    }),
  );
  let wide = window.innerWidth >= 1280;
  const onResize = () => {
    if (!visible) return;
    // Narrow: the drawer is an overlay, so it closes instead of covering
    // the stage unasked.
    const now = window.innerWidth >= 1280;
    if (wide && !now && drawerOpen) setDrawer(false);
    wide = now;
    refit();
  };
  window.addEventListener('resize', onResize);
  offs.push(() => window.removeEventListener('resize', onResize));
  const sized = new ResizeObserver(() => {
    if (visible) place();
  });
  sized.observe(stage);
  offs.push(() => sized.disconnect());
  // Nothing animates while the tab is hidden.
  const onHidden = () => {
    document.documentElement.classList.toggle('ai-tab-hidden', document.hidden);
    orb?.setLevelOfEffects(still() || document.hidden ? 'off' : 'full');
  };
  document.addEventListener('visibilitychange', onHidden);
  offs.push(() => document.removeEventListener('visibilitychange', onHidden));
  // Escape: a popover first, then the selection (the shell handles that).
  const onKey = (event: KeyboardEvent) => {
    if (!visible || event.key !== 'Escape') return;
    if (pop) {
      closePop();
      event.stopPropagation();
      event.preventDefault();
    } else if (bubbleMode !== 'actions') {
      bubbleMode = 'actions';
      paintBubble();
      event.stopPropagation();
      event.preventDefault();
    }
  };
  // On the window, so it runs before the shell's own Escape (deselect).
  window.addEventListener('keydown', onKey, true);
  offs.push(() => window.removeEventListener('keydown', onKey, true));

  // ---- Director: its services load here, in this chunk ----------------------
  const ui: DirectorUi = {
    host,
    thread,
    orb: setOrb,
    flash,
    refresh: () => {
      refresh();
      if (visible && tab !== 'controls') paintDrawer();
    },
    openDrawer: (id) => {
      // On a narrow window the drawer is an overlay: it is not opened unasked.
      tab = id;
      if (drawerOpen) paintDrawer();
      else
        for (const b of tabs.querySelectorAll<HTMLElement>('.ai-tab'))
          b.setAttribute('aria-selected', String(b.dataset.aiTab === tab));
    },
    arriving: async (ids) => {
      // Scenes arrive one by one: the ribbon fills and the stage follows.
      if (still() || ids.length < 2) {
        paintRibbon(true);
        return;
      }
      arriving = new Set(ids);
      paintRibbon(true);
      for (const id of ids) {
        arriving.delete(id);
        paintRibbon(true);
        session.selectComposition(id);
        paintPosters();
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
      if (ids[0]) session.selectComposition(ids[0]);
    },
    setInput: (text) => {
      input.value = text;
    },
    credits: paintCredits,
  };
  const loading = h('p', {
    class: 'ai-muted',
    id: 'ai-loading',
    role: 'status',
    text: t('dir.loading'),
  });
  const start = async () => {
    clear(thread, loading);
    try {
      const { createServices } = await import('../panel/services');
      const { text: sayText } = await import('../platform-config');
      const s = await createServices(localStorage);
      const user = await s.account.user();
      if (!user) throw new Error('signed out');
      await s.sync(user.id).catch(() => undefined);
      if (disposed) return;
      setLocale(lang());
      const ctx: Ctx = {
        s,
        user,
        prefs: () => s.prefs(user.id),
        setPrefs: (change) =>
          s.savePrefs(user.id, { ...s.prefs(user.id), ...change }),
        go: (route) => {
          location.href = `/panel/#/${route}`;
        },
        refreshTop: paintCredits,
        toast: (message, kind) =>
          host.toast(message, kind === 'error' ? 'error' : 'success'),
        say: (x) => sayText(x, lang()),
      };
      balance = () => s.ledger(user.id).balance();
      clear(thread);
      director = new Director(ui, { s, user, ctx });
      paintCredits();
      refresh();
      paintDrawer();
    } catch (error) {
      console.debug('[ai-mode] Director could not start', error);
      clear(
        thread,
        h('p', {
          class: 'ai-error',
          id: 'ai-error',
          role: 'alert',
          text: t('dir.error'),
        }),
        h('button', {
          type: 'button',
          class: 'ai-btn',
          id: 'ai-retry',
          text: t('dir.retry'),
          onclick: () => void start(),
        }),
      );
    }
  };
  setOrb('idle');
  paintChips();
  setDrawer(drawerOpen);
  void start();

  return {
    show() {
      visible = true;
      setDrawer(window.innerWidth >= 1280 ? drawerOpen : false);
      director?.entered();
      ribbonKey = '';
      timelineKey = '';
      refresh();
      paintDrawer();
      refit();
    },
    hide() {
      visible = false;
      closePop();
      bubble.hidden = true;
      listening?.stop();
      director?.left();
    },
    dispose() {
      disposed = true;
      for (const off of offs) off();
      director?.dispose();
      for (const el of [
        directorEl,
        bottom,
        drawer,
        quick,
        glow,
        hit,
        outline,
        bubble,
        empty,
        dropHint,
        creditsChip,
        drawerToggle,
        backButton,
      ])
        el.remove();
      pop?.remove();
    },
  };
}
