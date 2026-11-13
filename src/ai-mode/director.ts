// ROUND-B B3: the Director inside AI mode. One controller for the whole
// flow: brief, plan, assets, build on the canvas, and after the build every
// message sorted into one of five kinds. It owns no copy of the project: it
// reads `engine.state` fresh on every message, previews with the engine's
// preview path and changes things only as ONE transaction per Apply.
// Everything that costs credits is a card with its cost and an Approve.
import type { EditorCommand } from '../core';
import type { OrbState } from '../contracts/p3';
import {
  canUse,
  costById,
  modelsForRole,
  styleById,
  text as sayText,
  type PlatformConfig,
  type Style,
} from '../platform-config';
import { GatewayError } from '../gateway';
import {
  checkPlan,
  llmPlan,
  mediaCredits,
  methodOf,
  refusalFor,
  runBuild,
  sceneFor,
  swapTarget,
  withMethod,
  allowedMethods,
} from '../director';
import { buildContextPack } from '../director/context-pack';
import {
  YOU_DECIDE,
  blockById,
  briefLines,
  classifyType,
  fillFromStyle,
  fillFromText,
  line,
  missingRequired,
  remaining,
  toPlannerInput,
  typeById,
  type BriefValues,
} from '../director/field-library';
import { sortMessage, type Ask } from '../director/intents';
import type { Services, Asset } from '../panel/services';
import type { CloudUser } from '../cloud/backend';
import type { Ctx } from '../panel/app';
import { applyModes, planSlots } from '../panel/asset-slots';
import { mountStudioForm } from '../panel/studio-form';
import { assetView, mockAudio, mockImage } from '../panel/screens/studio';
import { bestModels } from '../panel/screens/common';
import { h, clear, put } from '../panel/dom';
import { styleFromPlan } from '../project/style-from';
import type { AssetSlot } from '../project/workspace';
import type { Chat, SheetPart, Turn } from '../project/video-memory';
import type { VideoPlan } from '../video-plan';
import type { AiHost } from './host';
import {
  canvasSummary,
  findLayer,
  hashLayer,
  kindOf,
  layerHashes,
  layerLine,
  sceneLines,
} from './canvas-read';
import { propose, stillValid, suggestionsFor, type Proposal } from './propose';
import { lang, t, type AiKey } from './strings';

export type DrawerTab = 'controls' | 'plan' | 'assets' | 'memory';
export interface DirectorUi {
  readonly host: AiHost;
  readonly thread: HTMLElement;
  orb(state: OrbState, progress?: number | null): void;
  flash(layerIds: readonly string[]): void;
  /** Repaints the ribbon, the drawer, the chips and the empty state. */
  refresh(): void;
  openDrawer(tab: DrawerTab): void;
  /** Scenes arrive one by one (still when Animations are off). */
  arriving(sceneIds: readonly string[]): Promise<void>;
  setInput(text: string): void;
  credits(): void;
}
export interface Env {
  readonly s: Services;
  readonly user: CloudUser;
  readonly ctx: Ctx;
}
type Stage = 'start' | 'brief' | 'plan' | 'assets' | 'building' | 'built';
interface Slot extends AssetSlot {
  choice: 'make' | 'upload' | 'prompt' | 'library' | 'later';
  /** Asset Library rows made for this slot (the newest last; older ones kept). */
  made: string[];
  /** The Project Media asset that fills it now. */
  mediaId?: string;
}
interface Flow {
  stage: Stage;
  typeId: string;
  brief: BriefValues;
  files: string[];
  plan?: VideoPlan;
  max?: number;
  sceneCosts?: number[];
  slots?: Slot[];
  sceneIds?: string[];
  /** The Project style as this Video last saw it. */
  styleSeen?: string;
}
interface CardState {
  [key: string]: unknown;
}
type Send = { text: string; files: File[]; sceneRef?: string | null };

const OK_TYPES = /^(image|audio|video|text)\/|^application\/pdf$/;
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;
const dataUrlOf = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
const fileFromDataUrl = async (url: string, name: string) => {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type });
};
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export class Director {
  readonly #ui: DirectorUi;
  readonly #env: Env;
  readonly #host: AiHost;
  #flow!: Flow;
  #chat!: Chat;
  #videoId = '';
  #projectId = '';
  #queue: Send[] = [];
  #abort: AbortController | null = null;
  #busy = false;
  /** Open proposals by id (the newest previews on the canvas). */
  readonly #open = new Map<
    string,
    { proposal: Proposal; turnId: string; chatId: string }
  >();
  readonly #attached = new Map<string, File>();
  #off: (() => void)[] = [];

  constructor(ui: DirectorUi, env: Env) {
    this.#ui = ui;
    this.#env = env;
    this.#host = ui.host;
    this.#load();
    this.#off.push(
      this.#host.engine.on('state:changed', (event) => {
        if (event.reason === 'load') {
          // Another project was opened: start again on it.
          this.#load();
          return;
        }
        this.#afterChange();
      }),
    );
  }
  dispose() {
    for (const off of this.#off) off();
    this.#abort?.abort();
  }

  // ---- shortcuts ------------------------------------------------------------
  get #c(): PlatformConfig {
    return this.#env.s.config;
  }
  get #mem() {
    return this.#env.s.mem(this.#env.user.id);
  }
  get #ws() {
    return this.#env.s.ws(this.#env.user.id);
  }
  get #state() {
    return this.#host.engine.state;
  }
  #line(key: string, vars: Record<string, string | number> = {}) {
    return line(this.#c, key, lang(), vars);
  }
  #say = (x: Parameters<typeof sayText>[0]) => sayText(x, lang());
  get videoId() {
    return this.#videoId;
  }
  get projectId() {
    return this.#projectId;
  }
  get stage(): Stage {
    return this.#flow.stage;
  }
  get building() {
    return this.#flow.stage === 'building';
  }
  get plan(): VideoPlan | null {
    return this.#flow.plan ?? null;
  }
  get slots(): readonly Slot[] {
    return this.#flow.slots ?? [];
  }
  hasContent(): boolean {
    return this.#state.compositions.some((scene) => scene.layers.length > 0);
  }
  chats(): readonly Chat[] {
    return this.#mem.chats(this.#videoId);
  }
  get chatId() {
    return this.#chat.id;
  }

  // ---- start ----------------------------------------------------------------
  #load() {
    const { s, user } = this.#env;
    this.#videoId = this.#state.id;
    const ws = this.#ws;
    ws.reload();
    if (!ws.video(this.#videoId))
      ws.adopt({ id: this.#videoId, name: this.#state.metadata.name });
    this.#projectId = ws.video(this.#videoId)?.projectId ?? this.#videoId;
    const mem = s.mem(user.id);
    mem.reload();
    const saved = mem.flow<Flow>(this.#videoId);
    this.#flow = saved ?? {
      stage: this.hasContent() ? 'built' : 'start',
      typeId: '',
      brief: {},
      files: [],
    };
    // A build cut off by a reload kept nothing: the person can build again.
    const interrupted = this.#flow.stage === 'building';
    if (interrupted) this.#flow.stage = 'assets';
    this.#open.clear();
    this.#chat = mem.currentChat(this.#videoId);
    if (!this.#chat.turns.length && this.#c.director.greeting)
      this.#director(this.#say(this.#c.director.greeting), {}, false);
    this.#renderThread();
    if (interrupted) this.#director(this.#line('build.interrupted'));
    this.#reconcile(true);
    this.#saveFlow();
    // The panel's Home box hands over the first message.
    try {
      const key = `aive.ai.first.${this.#videoId}`;
      const first = sessionStorage.getItem(key);
      if (first) {
        sessionStorage.removeItem(key);
        void this.send({ text: first, files: [] });
      }
    } catch {
      /* a convenience only */
    }
    this.#styleOffer();
  }
  #saveFlow() {
    this.#mem.setFlow(this.#videoId, this.#flow);
  }
  #setStage(stage: Stage) {
    this.#flow.stage = stage;
    this.#saveFlow();
    const ws = this.#ws;
    const v = ws.video(this.#videoId);
    const to =
      stage === 'start' || stage === 'brief'
        ? 'brief'
        : stage === 'plan'
          ? 'plan'
          : stage === 'built'
            ? 'built'
            : 'assets';
    if (v && v.stage !== to && !(v.origin === 'manual' && to === 'brief'))
      ws.setStage(this.#videoId, to);
    this.#ui.refresh();
  }

  // ---- the thread -----------------------------------------------------------
  #director(
    text: string,
    extra: { tone?: string; card?: Turn['card'] } = {},
    paint = true,
  ): Turn {
    const turn = this.#mem.addTurn(this.#videoId, this.#chat.id, {
      role: 'director',
      text: extra.tone ? `[${extra.tone}] ${text}` : text,
      ...(extra.card ? { card: extra.card } : {}),
    });
    if (paint) this.#paintTurn(turn);
    return turn;
  }
  #card(kind: string, state: CardState, text = ''): Turn {
    return this.#director(text, { card: { kind, state } });
  }
  #saveCard(turnId: string, kind: string, state: CardState) {
    this.#mem.setCard(this.#videoId, this.#chat.id, turnId, { kind, state });
  }
  #renderThread() {
    clear(this.#ui.thread);
    const chat =
      this.#mem.chat(this.#videoId, this.#chat.id) ?? (this.#chat = this.#chat);
    this.#chat = chat;
    for (const turn of chat.turns) this.#paintTurn(turn, false);
    this.#scroll();
  }
  #scroll() {
    const el = this.#ui.thread;
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }
  #paintTurn(turn: Turn, scroll = true) {
    const tone = /^\[(refusal|error|kind|note)\] /.exec(turn.text)?.[1];
    const text = tone ? turn.text.slice(tone.length + 3) : turn.text;
    if (tone === 'kind')
      this.#ui.thread.append(
        h(
          'div',
          { class: 'ai-kind', 'data-kind-line': '' },
          `${t('dir.about')}: `,
          h('b', { text }),
        ),
      );
    else if (text)
      this.#ui.thread.append(
        h('div', {
          class: 'ai-msg',
          'data-role': turn.role,
          'data-turn': turn.id,
          ...(tone ? { 'data-tone': tone } : {}),
          ...(tone === 'refusal' || tone === 'error' ? { role: 'alert' } : {}),
          text,
        }),
      );
    if (turn.card) {
      const el = this.#renderCard(turn);
      if (el) this.#ui.thread.append(el);
    }
    if (scroll) this.#scroll();
  }
  /** Draws a card again in place (its state changed). */
  #repaint(turnId: string) {
    const turn = this.#mem
      .chat(this.#videoId, this.#chat.id)
      ?.turns.find((x) => x.id === turnId);
    const old = this.#ui.thread.querySelector(`[data-card-turn="${turnId}"]`);
    if (!turn?.card || !old) return;
    const next = this.#renderCard(turn);
    if (next) old.replaceWith(next);
    else old.remove();
  }
  /** The newest turn that holds a card of this kind. */
  #lastCard(kind: string): Turn | undefined {
    return [...(this.#mem.chat(this.#videoId, this.#chat.id)?.turns ?? [])]
      .reverse()
      .find((x) => x.card?.kind === kind);
  }
  #renderCard(turn: Turn): HTMLElement | null {
    const kind = turn.card!.kind;
    const state = turn.card!.state as CardState;
    const el = h('section', {
      class: 'ai-card',
      'data-card': kind,
      'data-card-turn': turn.id,
    });
    const active = (stage: Stage) =>
      this.#flow.stage === stage && this.#lastCard(kind)?.id === turn.id;
    if (kind === 'brief') this.#briefCard(el, turn, active('brief'));
    else if (kind === 'plan') this.#planCard(el, turn, active('plan'));
    else if (kind === 'assets')
      this.#assetsCard(
        el,
        active('assets') || (this.building && this.#lastCard(kind) === turn),
      );
    else if (kind === 'build') this.#buildCard(el, state);
    else if (kind === 'proposal') this.#proposalCard(el, turn, state);
    else if (kind === 'ask') this.#askCard(el, turn, state);
    else if (kind === 'unsure' || kind === 'cannot')
      this.#choiceCard(el, turn, state);
    else if (kind === 'newvideo') this.#newVideoCard(el, turn, state);
    else if (kind === 'newscene') this.#newSceneCard(el, turn, state);
    else if (kind === 'use') this.#useCard(el, turn, state);
    else if (kind === 'paid') this.#paidCard(el, turn, state);
    else if (kind === 'style') this.#styleCard(el, turn, state);
    else return null;
    return el;
  }
  #button(
    key: AiKey,
    run: () => void | Promise<void>,
    cls = '',
    vars: Record<string, string | number> = {},
  ): HTMLButtonElement {
    return h('button', {
      type: 'button',
      class: `ai-btn ${cls}`.trim(),
      text: t(key, vars),
      onclick: () => void run(),
    });
  }

  // ---- sending --------------------------------------------------------------
  async send(input: Send): Promise<void> {
    const text = input.text.trim();
    if (!text && !input.files.length) return;
    const settings = this.#host.chatSettings();
    if (!settings.enabled) {
      this.#director(t('dir.off'), { tone: 'error' });
      return;
    }
    const day = `aive.chat.count.${new Date().toISOString().slice(0, 10)}`;
    let used = 0;
    try {
      used = Number(localStorage.getItem(day) ?? 0);
    } catch {
      used = 0;
    }
    if (used >= settings.maxMessagesPerDay) {
      this.#director(t('dir.dayLimit', { n: settings.maxMessagesPerDay }), {
        tone: 'error',
      });
      this.#ui.setInput(text);
      return;
    }
    try {
      localStorage.setItem(day, String(used + 1));
    } catch {
      /* the server holds the real count */
    }
    const names = input.files.map((f) => f.name);
    const user = this.#mem.addTurn(this.#videoId, this.#chat.id, {
      role: 'user',
      text: [text, names.length ? `📎 ${names.join(', ')}` : '']
        .filter(Boolean)
        .join('\n'),
    });
    this.#paintTurn(user);
    if (this.building) {
      // A message during a build waits; the build is never disturbed.
      this.#queue.push(input);
      this.#director(this.#line('build.busy'));
      return;
    }
    if (this.#busy) {
      this.#queue.push(input);
      return;
    }
    this.#busy = true;
    this.#ui.orb('thinking');
    try {
      await this.#handle({ ...input, text });
    } catch (error) {
      this.#fail(error, text);
    } finally {
      this.#busy = false;
      if (!this.building) this.#ui.orb('idle');
      this.#ui.refresh();
      const next = this.#queue.shift();
      if (next && !this.building) void this.#replay(next);
    }
  }
  /** A queued message is handled without being written to the thread again. */
  async #replay(input: Send) {
    this.#busy = true;
    this.#ui.orb('thinking');
    try {
      await this.#handle({ ...input, text: input.text.trim() });
    } catch (error) {
      this.#fail(error, input.text);
    } finally {
      this.#busy = false;
      if (!this.building) this.#ui.orb('idle');
      this.#ui.refresh();
      const next = this.#queue.shift();
      if (next && !this.building) void this.#replay(next);
    }
  }
  #fail(error: unknown, text = '') {
    console.debug('[director]', error);
    const unreachable =
      error instanceof TypeError ||
      (error instanceof Error && /could not be reached/i.test(error.message));
    const message =
      error instanceof GatewayError && error.code === 'shortage'
        ? t('dir.noCredits', {
            need: error.detail.need ?? '',
            have: error.detail.have ?? '',
          })
        : unreachable
          ? t('dir.unreachable')
          : error instanceof Error && error.message
            ? error.message
            : t('dir.error');
    this.#director(message, { tone: 'error' });
    // Nothing is lost: the typed message goes back into the box.
    if (unreachable && text) this.#ui.setInput(text);
    this.#ui.orb('refusing');
    void this.#env.s
      .sync(this.#env.user.id)
      .catch(() => undefined)
      .then(() => this.#ui.credits());
  }
  async #handle(input: Send) {
    const { text } = input;
    this.#reconcile();
    const notes = await this.#notesFor(input.files);
    // The owner's refusals are matched first; no model is asked.
    const refusal = text ? refusalFor(this.#c.director, text) : null;
    if (refusal) {
      this.#ui.orb('refusing');
      this.#director(
        [
          this.#say(refusal.reply),
          refusal.alternative ? this.#say(refusal.alternative) : '',
        ]
          .filter(Boolean)
          .join(' '),
        { tone: 'refusal' },
      );
      return;
    }
    if (input.sceneRef !== undefined && input.sceneRef !== null) {
      if (!this.#state.compositions.some((s) => s.id === input.sceneRef)) {
        this.#director(this.#line('scene.gone'));
        return;
      }
      if (this.#host.session.source.composition.id !== input.sceneRef)
        this.#host.session.selectComposition(input.sceneRef);
    }
    const stage = this.#flow.stage;
    if (stage === 'start' || stage === 'brief') this.#briefMessage(text, notes);
    else if (stage === 'plan') await this.#planMessage(text);
    else if (stage === 'assets') this.#director(this.#line('assets.hint'));
    else
      await this.#builtMessage(
        text,
        input.sceneRef ? [] : [...this.#host.session.selectedIds],
      );
  }

  // ---- attachments and file notes -------------------------------------------
  async #notesFor(files: readonly File[]) {
    const out: { name: string; kind: string; note: string }[] = [];
    const maxMb = this.#c.director.context.maxAttachmentMb;
    for (const file of files) {
      if (file.size > maxMb * 1_048_576) {
        this.#director(this.#line('attach.tooBig', { n: maxMb }), {
          tone: 'error',
        });
        continue;
      }
      const type =
        file.type || (/\.(txt|md|srt)$/i.test(file.name) ? 'text/plain' : '');
      if (!OK_TYPES.test(type)) {
        this.#director(this.#line('attach.badType'), { tone: 'error' });
        continue;
      }
      const kind = type.startsWith('application/pdf')
        ? 'pdf'
        : type.split('/')[0]!;
      // A file is read once: its note is reused the next time.
      const known = this.#mem.noteFor(this.#videoId, {
        name: file.name,
        bytes: file.size,
      });
      let note = known?.note ?? '';
      if (!known) {
        if (kind === 'text')
          note = clip((await file.text()).replace(/\s+/g, ' ').trim(), 300);
        else if (kind === 'pdf')
          note = await import('../wiring/pdf-text')
            .then(async (m) =>
              clip(
                (
                  await m.pdfText(
                    new Uint8Array(await file.arrayBuffer()),
                    2000,
                  )
                )
                  .replace(/\s+/g, ' ')
                  .trim(),
                300,
              ),
            )
            .catch(() => '');
        note ||= `${kind} file, ${Math.max(1, Math.round(file.size / 1024))} KB`;
        this.#mem.fileNote(
          this.#videoId,
          { name: file.name, kind, bytes: file.size },
          note,
        );
      }
      this.#attached.set(file.name, file);
      // Pictures, sound and video also go to Project Media, ready to place.
      if (kind === 'image' || kind === 'audio' || kind === 'video')
        await this.#host.importFiles([file]).catch(() => undefined);
      out.push({ name: file.name, kind, note });
    }
    return out;
  }

  // ---- brief ----------------------------------------------------------------
  #style(): Style {
    const project = this.#ws.project(this.#projectId);
    return (
      (project?.templateId ? styleById(this.#c, project.templateId) : null) ??
      this.#c.styles.find((x) => x.enabled) ??
      this.#c.styles[0]!
    );
  }
  #briefMessage(
    text: string,
    notes: readonly { name: string; kind: string; note: string }[],
  ) {
    const lib = this.#c.director.fieldLibrary;
    const first = this.#flow.stage === 'start';
    const fileText = notes
      .filter((n) => n.kind === 'text' || n.kind === 'pdf')
      .map((n) => n.note)
      .join(' ');
    const type = first
      ? classifyType(lib, `${text} ${fileText}`)
      : typeById(lib, this.#flow.typeId);
    const has = (id: string) => type.blocks.some((b) => b.id === id);
    const fromText = fillFromText(lib, type, text);
    const values: BriefValues = first
      ? {
          ...fillFromStyle(
            lib,
            type,
            this.#ws.effectiveStyle(this.#videoId) as never,
          ),
          ...fromText,
        }
      : { ...this.#flow.brief };
    if (!first)
      for (const [k, v] of Object.entries(fromText)) {
        const main = k === 'topic' || k === 'product';
        if (!main) values[k] = v;
        else if (!(values[k] ?? '').trim()) values[k] = v;
        else if (has('notes'))
          values.notes = [values.notes, text].filter(Boolean).join(' ');
      }
    // What the attached files answer.
    for (const n of notes) {
      if (
        (n.kind === 'image' || n.kind === 'pdf' || n.kind === 'text') &&
        has('reference')
      )
        values.reference ||= n.name;
      if ((n.kind === 'audio' || n.kind === 'video') && has('recording'))
        values.recording ||= n.name;
      if (n.kind === 'text' && n.note.length > 200 && has('script'))
        values.script = 'mine';
    }
    this.#flow = {
      ...this.#flow,
      typeId: type.id,
      brief: values,
      files: [...new Set([...this.#flow.files, ...notes.map((n) => n.name)])],
    };
    this.#ui.orb('speaking');
    if (first) {
      const styled = Object.values(values).some((v) => v.startsWith('style:'));
      this.#setStage('brief');
      this.#director(
        [
          this.#line('type.understood', { type: this.#say(type.name) }),
          styled ? this.#line('brief.styled') : '',
          this.#line('brief.intro'),
        ]
          .filter(Boolean)
          .join(' '),
        { card: { kind: 'brief', state: {} } },
      );
    } else {
      this.#saveFlow();
      const last = this.#lastCard('brief');
      if (last) this.#repaint(last.id);
      this.#director(t('dir.understood'));
    }
  }
  #briefCard(el: HTMLElement, turn: Turn, active: boolean) {
    const lib = this.#c.director.fieldLibrary;
    const type = typeById(lib, this.#flow.typeId);
    const values = this.#flow.brief;
    const known = briefLines(lib, type, values, lang());
    const notes = this.#mem
      .video(this.#videoId)
      .notes.filter((n) => this.#flow.files.includes(n.name));
    el.dataset.done = String(!active);
    put(
      el,
      h(
        'h4',
        {},
        h('span', { text: t(active ? 'brief.title' : 'brief.done') }),
        h('span', { class: 'ai-muted', text: this.#say(type.name) }),
      ),
      h('div', { class: 'ai-label', text: this.#line('brief.known') }),
      h(
        'ul',
        { class: 'ai-known', 'data-brief-known': '' },
        known.map((l) => h('li', { text: l })),
        notes.map((n) =>
          h('li', {
            'data-file-note': n.name,
            text: `${t('brief.files')}: ${n.name} (${n.note})`,
          }),
        ),
      ),
    );
    if (!active) return;
    const error = h('p', { class: 'ai-error', role: 'alert', hidden: true });
    const set = (id: string, v: string) => {
      this.#flow.brief = { ...this.#flow.brief, [id]: v };
      this.#saveFlow();
    };
    const kit = this.#env.ctx.prefs().brandKit;
    const hasKit =
      !!kit.colors.length || !!kit.headingFont || !!kit.bodyFont || !!kit.logo;
    for (const { block, required } of remaining(lib, type, values)) {
      const field = h(
        'div',
        { class: 'ai-field', 'data-brief-field': block.id },
        h(
          'div',
          { class: 'ai-field-name' },
          this.#say(block.label),
          required
            ? h('span', { class: 'ai-req', text: t('brief.required') })
            : null,
        ),
        block.help
          ? h('div', { class: 'ai-muted', text: this.#say(block.help) })
          : null,
      );
      const chips = h('div', { class: 'ai-row', role: 'radiogroup' });
      const chip = (value: string, label: string) => {
        const b = h('button', {
          type: 'button',
          class: 'ai-chip',
          role: 'radio',
          'data-value': value,
          'aria-checked': 'false',
          text: label,
          onclick: () => {
            for (const x of chips.querySelectorAll('.ai-chip'))
              x.setAttribute('aria-checked', String(x === b));
            const input = field.querySelector<HTMLInputElement>('.ai-input');
            if (input) input.value = '';
            set(block.id, value);
          },
        });
        return b;
      };
      if (block.type === 'choice') {
        for (const o of block.options) {
          if (block.id === 'brand' && o.value === 'kit' && !hasKit) continue;
          chips.append(
            chip(
              o.value,
              block.id === 'brand' && o.value === 'kit'
                ? t('brief.useBrand')
                : this.#say(o.label),
            ),
          );
        }
      } else if (block.type === 'file') {
        field.append(
          this.#button(
            'brief.attach',
            () =>
              this.#pickFiles((files) => {
                void this.send({ text: '', files });
              }),
            'sm',
          ),
        );
      } else {
        const input = h(block.type === 'longtext' ? 'textarea' : 'input', {
          class: 'ai-input',
          'aria-label': this.#say(block.label),
          ...(block.type === 'longtext' ? { rows: 2 } : { type: 'text' }),
          oninput: (e: Event) => {
            for (const x of chips.querySelectorAll('.ai-chip'))
              x.setAttribute('aria-checked', 'false');
            set(
              block.id,
              (e.target as HTMLInputElement | HTMLTextAreaElement).value,
            );
          },
        });
        field.append(input);
      }
      if (block.youDecide) chips.append(chip(YOU_DECIDE, t('brief.youDecide')));
      if (chips.childElementCount) field.append(chips);
      put(el, field);
    }
    put(
      el,
      error,
      h(
        'div',
        { class: 'ai-row' },
        this.#button(
          'brief.continue',
          async () => {
            const miss = missingRequired(lib, type, this.#flow.brief);
            for (const f of el.querySelectorAll<HTMLElement>(
              '[data-brief-field]',
            ))
              f.dataset.invalid = String(
                miss.some((b) => b.id === f.dataset.briefField),
              );
            if (miss.length) {
              error.hidden = false;
              error.textContent = t('brief.missing', {
                fields: miss.map((b) => this.#say(b.label)).join(', '),
              });
              return;
            }
            await this.#approveBrief(turn);
          },
          'primary',
        ),
      ),
    );
    el.id = 'ai-brief-card';
  }
  async #approveBrief(turn: Turn) {
    const lib = this.#c.director.fieldLibrary;
    const type = typeById(lib, this.#flow.typeId);
    // An unanswered optional block is Director's to decide.
    for (const ref of type.blocks)
      if (!(this.#flow.brief[ref.id] ?? '').trim() && !ref.required) {
        const b = blockById(lib, ref.id);
        if (b?.youDecide) this.#flow.brief[ref.id] = YOU_DECIDE;
      }
    // The sheet follows every approved step.
    this.#mem.setPart(
      this.#videoId,
      'brief',
      briefLines(lib, type, this.#flow.brief, lang()),
    );
    this.#setStage('plan');
    this.#repaint(turn.id);
    await this.#makePlan([]);
  }

  // ---- plan -----------------------------------------------------------------
  #model(): string {
    const { s, user } = this.#env;
    const plan = s.planOf(user.id);
    const role = this.#c.director.roles.plan;
    const pick = bestModels(this.#env.ctx, modelsForRole(this.#c, role)).find(
      (m) => s.connected(m.id) && canUse(plan, m.requires ?? []),
    );
    return pick?.id ?? modelsForRole(this.#c, role)[0]?.id ?? '';
  }
  #voiceWanted() {
    return this.#flow.brief.voice === 'tts';
  }
  /** Project memory, the sheet and the canvas, inside the owner's budget. */
  contextPack(selection = '') {
    const x = this.#c.director.context;
    const style = this.#ws.effectiveStyle(this.#videoId);
    const tpl = this.#ws.project(this.#projectId)?.templateId;
    const canvas = canvasSummary(
      this.#state,
      this.#host.session.source.composition.id,
      this.#mem.touched(this.#videoId),
    );
    const chat = this.#mem.chat(this.#videoId, this.#chat.id) ?? this.#chat;
    return buildContextPack({
      rulebook: [
        `RULEBOOK\n${this.#say(this.#c.director.persona)}`,
        `You may: ${this.#c.director.scope.join(', ')}.`,
      ].join('\n'),
      playbook: tpl ? (styleById(this.#c, tpl)?.playbookText ?? '') : '',
      styleLines: style
        ? [
            style.look.palette.length
              ? `Colours: ${style.look.palette.join(', ')}`
              : '',
            style.look.headingFont ? `Fonts: ${style.look.headingFont}` : '',
            style.voice ? `Voice: ${style.voice}` : '',
            style.music ? `Music: ${style.music}` : '',
            style.scriptRules ? `Script rules: ${style.scriptRules}` : '',
          ].filter(Boolean)
        : [],
      facts: this.#mem.facts(this.#projectId),
      sheet: this.#mem.sheet(this.#videoId),
      notes: this.#mem.video(this.#videoId).notes,
      summary: chat.summary,
      turns: chat.turns,
      canvas,
      selection,
      budgetTokens: x.budgetTokens,
      lastTurns: x.lastTurns,
    });
  }
  async #makePlan(extraNotes: string[], rewrite = false) {
    const { s, user, ctx } = this.#env;
    this.#ui.orb('thinking');
    const wait = h('div', {
      class: 'ai-msg',
      'data-role': 'director',
      id: 'ai-plan-working',
      text: t('plan.working'),
    });
    this.#ui.thread.append(wait);
    this.#scroll();
    try {
      const input = toPlannerInput(this.#c, this.#flow.brief);
      const kit = ctx.prefs().brandKit;
      if (this.#flow.brief.brand === 'kit' && kit.colors[0])
        input.answers.accent = kit.colors[0];
      const style = this.#ws.effectiveStyle(this.#videoId);
      const memory = this.#mem.facts(this.#projectId).map((f) => f.text);
      const result = await llmPlan({
        gateway: s.gateway,
        config: this.#c,
        style: this.#style(),
        answers: input.answers,
        notes: [
          ...input.notes,
          ...extraNotes,
          ...(style?.look.palette.length
            ? [`Project colours: ${style.look.palette.join(', ')}.`]
            : []),
          ...(style?.graphics
            ? [`Graphics: ${clip(style.graphics, 300)}`]
            : []),
          ...memory.slice(0, 8).map((m) => `Remember: ${clip(m, 200)}`),
        ],
        plan: s.planOf(user.id),
        locale: lang(),
        userId: user.id,
        modelId: this.#model(),
        key: `plan-${this.#videoId}-${Date.now().toString(36)}`,
      });
      await s.sync(user.id).catch(() => undefined);
      this.#ui.credits();
      if (!result.ok) {
        this.#director(result.message, { tone: 'error' });
        if (!rewrite) this.#setStage('brief');
        const b = this.#lastCard('brief');
        if (b) this.#repaint(b.id);
        return;
      }
      let plan = result.plan;
      const aspect = this.#flow.brief.aspect;
      if (aspect && aspect !== YOU_DECIDE && /^\d+:\d+$/.test(aspect))
        plan = { ...plan, meta: { ...plan.meta, aspect: aspect as never } };
      const checked = checkPlan(plan);
      if (checked.ok) plan = checked.plan;
      if (rewrite) this.#mem.countRewrite(this.#videoId);
      await this.#setPlan(plan);
      const seconds = Math.round(
        plan.scenes.reduce((n, sc) => n + (sc.durationHint ?? 0), 0),
      );
      this.#ui.orb('speaking');
      const old = this.#lastCard('plan');
      const turn = this.#director(
        [
          this.#line('plan.restate', {
            what: clip(plan.meta.title, 80),
            scenes: plan.scenes.length,
            seconds,
          }),
          this.#line('plan.intro'),
        ].join('\n'),
        { card: { kind: 'plan', state: {} } },
      );
      if (old && old.id !== turn.id) this.#repaint(old.id);
      this.#ui.openDrawer('plan');
    } finally {
      wait.remove();
    }
  }
  async #setPlan(plan: VideoPlan) {
    const { s, user } = this.#env;
    const c = this.#c;
    const methods = plan.scenes.map(methodOf);
    const base = await s
      .estimate(this.#model(), methods, JSON.stringify(this.#flow.brief).length)
      .catch(() => null);
    const extra = mediaCredits(c, s.planOf(user.id), plan, false, (id) =>
      s.connected(id),
    );
    this.#flow.plan = plan;
    this.#flow.max = Math.ceil((base?.max ?? 0) + extra);
    this.#flow.sceneCosts = plan.scenes.map((_, i) =>
      Math.ceil(base?.scenes[i]?.max ?? 0),
    );
    this.#saveFlow();
  }
  async #planMessage(text: string) {
    // A message at the plan step asks for another plan (a rewrite).
    const left = this.#rewritesLeft();
    if (left <= 0) {
      this.#director(this.#line('plan.noRewrites'));
      return;
    }
    await this.#makePlan(
      [`Change asked by the person: ${clip(text, 400)}`],
      true,
    );
  }
  #rewritesLeft() {
    return Math.max(
      0,
      this.#c.director.rewritesPerVideo - this.#mem.rewrites(this.#videoId),
    );
  }
  #toolName(id: string) {
    const tool = this.#c.director.tools.find((x) => x.id === id);
    return tool?.name ? this.#say(tool.name) : id;
  }
  /** What a scene shows, in words (never the plan's JSON). */
  #seen(scene: VideoPlan['scenes'][number]): string {
    const parts = scene.layers.slice(0, 4).map((l) => {
      const any = l as unknown as {
        kind: string;
        text?: string;
        mediaIntent?: { query?: string };
        kitId?: string;
      };
      if (any.kind === 'text' && any.text) return `"${clip(any.text, 40)}"`;
      if (any.kind === 'media') return any.mediaIntent?.query ?? 'a picture';
      return any.kitId ?? any.kind;
    });
    return parts.join(', ') || (scene.title ?? '');
  }
  #planScenes(editable: boolean, turn?: Turn): HTMLElement {
    const plan = this.#flow.plan!;
    const c = this.#c;
    const userPlan = this.#env.s.planOf(this.#env.user.id);
    const reveal = c.director.reveal;
    return h(
      'ol',
      { class: 'ai-plan-scenes' },
      plan.scenes.map((scene, i) => {
        const li = h('li', {
          class: 'ai-plan-scene',
          'data-plan-scene': scene.id,
        });
        const view = () => {
          clear(
            li,
            h(
              'header',
              {},
              h('span', {
                text: `${t('plan.scene', { n: i + 1 })}: ${scene.title ?? ''}`,
              }),
              reveal.credits
                ? h('span', {
                    class: 'ai-cost',
                    text: t('plan.upTo', {
                      n: this.#flow.sceneCosts?.[i] ?? 0,
                    }),
                  })
                : null,
            ),
            h(
              'p',
              {},
              h('b', { text: `${t('plan.narration')}: ` }),
              clip(scene.narration ?? '', 220),
            ),
            h(
              'p',
              {},
              h('b', { text: `${t('plan.seen')}: ` }),
              this.#seen(scene),
            ),
            reveal.methods
              ? h(
                  'p',
                  { 'data-method': methodOf(scene) },
                  h('b', { text: `${t('plan.method')}: ` }),
                  this.#toolName(methodOf(scene)),
                )
              : null,
            editable
              ? h(
                  'div',
                  { class: 'ai-row' },
                  this.#button('plan.edit', edit, 'sm quiet'),
                )
              : null,
          );
        };
        const edit = () => {
          const area = h('textarea', {
            class: 'ai-input',
            rows: 3,
            'aria-label': t('plan.narration'),
            value: scene.narration ?? '',
            maxlength: c.director.limits.maxNarrationChars,
          });
          let method = methodOf(scene);
          const chips = h('div', { class: 'ai-row', role: 'radiogroup' });
          for (const m of allowedMethods(c, userPlan)) {
            const b = h('button', {
              type: 'button',
              class: 'ai-chip',
              role: 'radio',
              'data-method-choice': m,
              'aria-checked': String(m === method),
              text: this.#toolName(m),
              onclick: () => {
                method = m;
                for (const x of chips.children)
                  x.setAttribute('aria-checked', String(x === b));
              },
            });
            chips.append(b);
          }
          clear(
            li,
            h('header', {}, h('span', { text: t('plan.scene', { n: i + 1 }) })),
            area,
            chips,
            h(
              'div',
              { class: 'ai-row' },
              this.#button(
                'plan.save',
                async () => {
                  let next: VideoPlan = {
                    ...plan,
                    scenes: plan.scenes.map((x, k) =>
                      k === i ? { ...x, narration: area.value.trim() } : x,
                    ),
                  };
                  if (method !== methodOf(scene))
                    next = withMethod(next, i, method);
                  const ok = checkPlan(next);
                  await this.#setPlan(ok.ok ? ok.plan : next);
                  if (turn) this.#repaint(turn.id);
                  this.#ui.refresh();
                },
                'sm primary',
              ),
              this.#button('plan.cancel', view, 'sm quiet'),
            ),
          );
        };
        view();
        return li;
      }),
    );
  }
  #planCard(el: HTMLElement, turn: Turn, active: boolean) {
    const plan = this.#flow.plan;
    if (!plan) return;
    const { s, user } = this.#env;
    el.dataset.done = String(!active);
    if (!active) {
      const mine = this.#lastCard('plan')?.id === turn.id;
      put(
        el,
        h(
          'h4',
          {},
          h('span', { text: t(mine ? 'plan.approved' : 'plan.replaced') }),
          mine
            ? h('span', {
                class: 'ai-muted',
                text: `${plan.scenes.length} · ${clip(plan.meta.title, 40)}`,
              })
            : null,
        ),
      );
      return;
    }
    el.id = 'ai-plan-card';
    const max = this.#flow.max ?? 0;
    const balance = s.ledger(user.id).balance();
    const short = max > balance;
    const left = this.#rewritesLeft();
    const swapAll = async (dir: 'cheaper' | 'richer') => {
      if (this.#rewritesLeft() <= 0) return;
      let next = plan;
      let changed = false;
      const allowed = new Set(allowedMethods(this.#c, s.planOf(user.id)));
      plan.scenes.forEach((scene, i) => {
        const to = swapTarget(this.#c, methodOf(scene), dir);
        if (to && allowed.has(to)) {
          next = withMethod(next, i, to);
          changed = true;
        }
      });
      if (!changed) return;
      this.#mem.countRewrite(this.#videoId);
      const ok = checkPlan(next);
      await this.#setPlan(ok.ok ? ok.plan : next);
      this.#repaint(turn.id);
      this.#ui.refresh();
    };
    put(
      el,
      h(
        'h4',
        {},
        h('span', { text: `${t('plan.title')}: ${clip(plan.meta.title, 48)}` }),
        h('span', {
          class: 'ai-cost',
          id: 'ai-plan-total',
          text: t('plan.total', { n: max }),
        }),
      ),
      this.#planScenes(true, turn),
      h('p', {
        class: 'ai-muted',
        id: 'ai-plan-rewrites',
        text: this.#line(left > 0 ? 'plan.rewritesLeft' : 'plan.noRewrites', {
          n: left,
        }),
      }),
      short
        ? h(
            'p',
            { class: 'ai-error', role: 'alert', id: 'ai-plan-short' },
            `${t('dir.noCredits', { need: max, have: balance })} `,
            h('a', { href: '/panel/#/credits', text: t('dir.getCredits') }),
          )
        : null,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            'plan.approve',
            () => this.#approvePlan(turn),
            'primary',
          ),
          { id: 'ai-plan-approve', disabled: short },
        ),
        Object.assign(
          this.#button('plan.cheaper', () => swapAll('cheaper')),
          {
            id: 'ai-plan-cheaper',
            disabled: left <= 0,
          },
        ),
        Object.assign(
          this.#button('plan.richer', () => swapAll('richer')),
          {
            id: 'ai-plan-richer',
            disabled: left <= 0,
          },
        ),
      ),
    );
  }
  #approvePlan(turn: Turn) {
    const plan = this.#flow.plan!;
    this.#mem.setPart(
      this.#videoId,
      'scenes',
      plan.scenes.map(
        (sc, i) =>
          `Scene ${i + 1}: ${sc.title ?? ''} — ${clip(sc.narration ?? '', 90)}`,
      ),
    );
    this.#mem.note(
      this.#videoId,
      'decisions',
      `Plan approved: ${plan.scenes.length} scenes, up to ${this.#flow.max ?? 0} credits.`,
    );
    const voice = this.#voiceWanted();
    const before = new Map((this.#flow.slots ?? []).map((x) => [x.name, x]));
    this.#flow.slots = planSlots(plan, voice).map((slot) => {
      const known = before.get(slot.name);
      return (
        known ?? {
          ...slot,
          mode: 'upload' as const,
          choice: 'later' as const,
          made: [],
        }
      );
    });
    this.#setStage('assets');
    this.#repaint(turn.id);
    this.#director(
      this.#line(this.#flow.slots.length ? 'assets.intro' : 'assets.none'),
      { card: { kind: 'assets', state: {} } },
    );
    this.#ui.openDrawer('assets');
  }

  // ---- assets ---------------------------------------------------------------
  #pickFiles(done: (files: File[]) => void, accept = '') {
    const input = h('input', { type: 'file', hidden: true, multiple: true });
    if (accept) input.accept = accept;
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      input.remove();
      if (files.length) done(files);
    };
    document.body.append(input);
    input.click();
  }
  /** Puts a file into a slot: Project Media by the slot's exact name; the old one stays in the Library. */
  async fillSlot(name: string, file: File, row?: Asset) {
    const slot = this.#flow.slots?.find((x) => x.name === name);
    if (!slot) return;
    const type = file.type;
    const kindOk =
      slot.kind === 'image'
        ? type.startsWith('image/')
        : slot.kind === 'audio'
          ? type.startsWith('audio/')
          : type.startsWith('video/') || type.startsWith('image/');
    if (!kindOk) {
      this.#director(t('ctl.wrongType'), { tone: 'error' });
      return;
    }
    const ext = EXT[type] ?? file.name.split('.').pop() ?? 'bin';
    const named = new File([file], `${slot.name}.${ext}`, { type });
    // Regenerate keeps the old asset: it leaves Project Media (so the plan
    // finds the new file by name) but stays in the Asset Library.
    if (slot.mediaId)
      await this.#host.discardAssets([slot.mediaId]).catch(() => undefined);
    const [mediaId] = await this.#host.importFiles([named]);
    let saved = row;
    if (!saved) {
      saved = {
        id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        userId: this.#env.user.id,
        projectId: this.#videoId,
        kind: slot.kind,
        name: named.name,
        studioId: 'director',
        dataUrl: file.size < 1_500_000 ? await dataUrlOf(file) : '',
        bytes: file.size,
        createdAt: new Date().toISOString(),
        library: 'ai',
      };
      try {
        this.#env.s.saveAsset(saved);
      } catch {
        /* a full browser store keeps the file in Project Media only */
      }
    }
    const previous = slot.made[slot.made.length - 1];
    if (previous && previous !== saved.id)
      this.#env.s.patchAsset(saved.id, { replaces: previous });
    slot.made = [...slot.made.filter((id) => id !== saved.id), saved.id];
    slot.filled = true;
    if (mediaId) slot.mediaId = mediaId;
    this.#saveFlow();
    this.#mem.note(
      this.#videoId,
      'assets',
      `${slot.name}: ${slot.choice === 'make' ? 'made here' : slot.choice === 'library' ? 'from the Library' : 'uploaded'} (${named.name})`,
    );
    const card = this.#lastCard('assets');
    if (card) this.#repaint(card.id);
    this.#ui.refresh();
  }
  #studioFor(kind: Slot['kind']) {
    const id =
      kind === 'image' ? 'images' : kind === 'video' ? 'video' : 'voice';
    return this.#c.studios.find((x) => x.id === id && x.enabled) ?? null;
  }
  #slotBody(slot: Slot, body: HTMLElement) {
    clear(body);
    const upload = () =>
      this.#pickFiles(
        (files) => void this.fillSlot(slot.name, files[0]!),
        slot.kind === 'audio'
          ? 'audio/*'
          : slot.kind === 'video'
            ? 'video/*,image/*'
            : 'image/*',
      );
    if (slot.choice === 'upload')
      body.append(
        Object.assign(this.#button('assets.upload', upload, 'sm'), {
          dataset: {},
        }),
      );
    else if (slot.choice === 'prompt') {
      const area = h('textarea', {
        class: 'ai-input',
        rows: 3,
        readOnly: true,
        'data-slot-prompt': slot.name,
        value: slot.prompt,
      });
      body.append(
        area,
        h('p', { class: 'ai-muted', text: t('assets.promptNote') }),
        h(
          'div',
          { class: 'ai-row' },
          this.#button(
            'assets.copy',
            () =>
              void navigator.clipboard
                ?.writeText(slot.prompt)
                .then(() => this.#host.toast(t('assets.copied'), 'success'))
                .catch(() => area.select()),
            'sm',
          ),
          this.#button('assets.upload', upload, 'sm'),
        ),
      );
    } else if (slot.choice === 'library') {
      const rows = this.#env.s
        .assets(this.#env.user.id)
        .filter((a) => a.kind === slot.kind && !!a.dataUrl && !a.trashedAt)
        .slice(-12)
        .reverse();
      body.append(
        rows.length
          ? h(
              'div',
              { class: 'ai-list' },
              rows.map((a) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'ai-asset',
                    'data-library-asset': a.id,
                    onclick: async () =>
                      this.fillSlot(
                        slot.name,
                        await fileFromDataUrl(a.dataUrl!, a.name),
                        a,
                      ),
                  },
                  h('span', {
                    class: 'ai-asset-thumb',
                    style:
                      a.kind === 'image'
                        ? `background-image:url("${a.dataUrl}")`
                        : '',
                  }),
                  h('span', { text: a.name }),
                ),
              ),
            )
          : h('p', { class: 'ai-muted', text: t('assets.none') }),
      );
    } else if (slot.choice === 'make') {
      const studio = this.#studioFor(slot.kind);
      const host = h('div', {
        class: 'ai-studio-host',
        'data-slot-studio': slot.name,
      });
      if (!studio)
        host.append(h('p', { class: 'ai-muted', text: t('assets.none') }));
      else {
        // The reusable Studio form, prefilled by Director, with its cost.
        const main =
          studio.inputs.find((f) => f.type === 'longtext')?.id ?? 'prompt';
        const view = mountStudioForm({
          ctx: this.#env.ctx,
          studio,
          target: this.#videoId,
          initial: { [main]: slot.prompt },
          mock: { image: mockImage, audio: mockAudio },
          view: assetView,
          onSaved: (asset) => {
            this.#ui.credits();
            if (asset.dataUrl)
              void fileFromDataUrl(asset.dataUrl, asset.name).then((file) =>
                this.fillSlot(slot.name, file, asset),
              );
          },
        });
        host.append(view.el);
      }
      body.append(host);
    } else body.append(h('p', { class: 'ai-muted', text: t('assets.empty') }));
  }
  #assetsCard(el: HTMLElement, active: boolean) {
    const slots = this.#flow.slots ?? [];
    el.dataset.done = String(!active);
    el.id = active ? 'ai-assets-card' : '';
    put(el, h('h4', {}, h('span', { text: t('assets.title') })));
    const choices: [Slot['choice'], AiKey][] = [
      ['make', 'assets.make'],
      ['upload', 'assets.upload'],
      ['prompt', 'assets.prompt'],
      ['library', 'assets.library'],
      ['later', 'assets.later'],
    ];
    for (const slot of slots) {
      const body = h('div', { class: 'ai-slot-body' });
      const row = h(
        'div',
        {
          class: 'ai-slot',
          'data-slot': slot.name,
          'data-filled': String(slot.filled),
          'data-choice': slot.choice,
        },
        h(
          'header',
          {},
          h('span', { text: slot.name }),
          h('span', {
            class: 'ai-slot-state',
            text: t(
              slot.filled
                ? 'assets.ready'
                : slot.choice === 'later'
                  ? 'assets.empty'
                  : 'assets.waiting',
            ),
          }),
        ),
      );
      if (slot.made.length > 1)
        row.append(
          h('p', {
            class: 'ai-muted',
            'data-older': String(slot.made.length - 1),
            text: t('assets.older'),
          }),
        );
      if (active) {
        const chips = h('div', { class: 'ai-row', role: 'radiogroup' });
        for (const [value, key] of choices) {
          const b = h('button', {
            type: 'button',
            class: 'ai-chip',
            role: 'radio',
            'data-choice': value,
            'aria-checked': String(slot.choice === value),
            text: t(key),
            onclick: () => {
              slot.choice = value;
              slot.mode = value === 'prompt' ? 'prompt' : 'upload';
              this.#saveFlow();
              row.dataset.choice = value;
              for (const x of chips.children)
                x.setAttribute('aria-checked', String(x === b));
              this.#slotBody(slot, body);
              // "Give me a prompt": the Video waits; closing loses nothing.
              this.#pause();
            },
          });
          chips.append(b);
        }
        row.append(chips, body);
        this.#slotBody(slot, body);
      }
      put(el, row);
    }
    if (!active) return;
    const max = this.#flow.max ?? 0;
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            max > 0 ? 'assets.buildCost' : 'assets.build',
            () => this.build(),
            'primary',
            { n: max },
          ),
          { id: 'ai-build' },
        ),
      ),
    );
  }
  /** Where Director waits is also in the workspace (Home's Continue shows it). */
  #pause() {
    const plan = this.#flow.plan;
    if (!plan) return;
    try {
      this.#ws.pause(this.#videoId, {
        step: 'assets',
        templateId: this.#style().id,
        job: {
          plan,
          model: this.#model(),
          max: this.#flow.max ?? 0,
          voice: this.#voiceWanted(),
        },
        slots: (this.#flow.slots ?? []).map(
          ({ choice: _c, made: _m, mediaId: _i, ...rest }) => rest,
        ),
      });
    } catch {
      /* the flow itself is kept in memory either way */
    }
  }

  // ---- build ----------------------------------------------------------------
  #buildCard(el: HTMLElement, state: CardState) {
    const running = state.state === 'running';
    el.dataset.done = String(!running);
    el.dataset.state = String(state.state);
    put(
      el,
      h(
        'h4',
        {},
        h('span', { text: t('build.title') }),
        h('span', { class: 'ai-cost', 'data-build-credits': '' }),
      ),
      h('div', { class: 'ai-progress' }, h('span', { 'data-build-bar': '' })),
      h('ul', { class: 'ai-steps', 'data-build-steps': '' }),
    );
    if (running)
      put(
        el,
        h(
          'div',
          { class: 'ai-row' },
          Object.assign(
            this.#button('build.cancel', () => this.cancelBuild()),
            { id: 'ai-build-cancel' },
          ),
        ),
      );
    if (running) el.id = 'ai-build-card';
  }
  cancelBuild() {
    this.#abort?.abort();
  }
  async build(one?: { plan: VideoPlan; after: string; max: number }) {
    if (this.building) return;
    const { s, user } = this.#env;
    const plan = one?.plan ?? this.#flow.plan;
    if (!plan) return;
    const max = one?.max ?? this.#flow.max ?? 0;
    const balance = s.ledger(user.id).balance();
    if (max > balance) {
      this.#director(t('dir.noCredits', { need: max, have: balance }), {
        tone: 'error',
      });
      return;
    }
    const back = this.#flow.stage;
    this.#flow.stage = 'building';
    this.#saveFlow();
    const turn = this.#card(
      'build',
      { state: 'running' },
      this.#line('build.start'),
    );
    const assets = this.#lastCard('assets');
    if (assets) this.#repaint(assets.id);
    this.#ui.orb('building', 0);
    this.#ui.refresh();
    const card = () =>
      this.#ui.thread.querySelector<HTMLElement>(
        `[data-card-turn="${turn.id}"]`,
      );
    const steps = new Map<string, string>();
    const order = [
      'pay',
      'check',
      'media',
      'voice',
      'layout',
      'captions',
      'camera',
      'sound',
      'prepare',
      'scenes',
    ];
    const show = (step: string, state: string) => {
      steps.set(step, state);
      const list = card()?.querySelector('[data-build-steps]');
      if (!list) return;
      clear(
        list,
        ...order
          .filter((x) => steps.has(x))
          .map((x) =>
            h('li', {
              'data-step': x,
              'data-state': steps.get(x),
              text: t(`build.step.${x}` as AiKey),
            }),
          ),
      );
      const done = order.filter((x) => steps.get(x) === 'done').length;
      const part = Math.min(1, done / order.length);
      const bar = card()?.querySelector<HTMLElement>('[data-build-bar]');
      if (bar) bar.style.inlineSize = `${Math.round(part * 100)}%`;
      this.#ui.orb('building', part);
      this.#scroll();
    };
    this.#abort = new AbortController();
    const signal = this.#abort.signal;
    let added = false;
    let sceneIds: readonly string[] = [];
    let silent: string | null = null;
    let missing: readonly string[] = [];
    const slots = (one ? [] : (this.#flow.slots ?? [])).map((x) => ({
      ...x,
      mode: 'upload' as const,
    }));
    try {
      show('pay', 'running');
      const result = await runBuild({
        gateway: s.gateway,
        config: this.#c,
        userId: user.id,
        plan: s.planOf(user.id),
        modelId: this.#model(),
        video: applyModes(plan, slots),
        maxCredits: Math.max(1, max),
        key: `build-${this.#videoId}-${Date.now().toString(36)}`,
        connected: (id) => s.connected(id),
        voice: false,
        signal,
        onEvent: (e) => {
          if (e.step === 'reserve') show('pay', 'done');
        },
        beforeSettle: async (r) => {
          if (r.files.length)
            await this.#host.importFiles(
              r.files.map(
                (f) =>
                  new File(
                    [Uint8Array.from(atob(f.base64), (ch) => ch.charCodeAt(0))],
                    f.name,
                    { type: f.type },
                  ),
              ),
            );
          const built = await this.#host.buildPlan(r.plan, {
            signal,
            progress: (step, state) => show(step, state),
            ...(one
              ? { after: one.after }
              : this.#flow.sceneIds?.length
                ? { replace: this.#flow.sceneIds }
                : {}),
          });
          added = true;
          sceneIds = built.sceneIds;
          silent = built.silent;
          missing = built.missing;
        },
      });
      // Kept: the scenes are on the canvas and the credits are settled.
      show('scenes', 'running');
      await this.#ui.arriving(sceneIds);
      show('scenes', 'done');
      this.#saveCard(turn.id, 'build', {
        state: 'done',
        scenes: sceneIds.length,
        credits: result.credits,
      });
      if (!one) this.#flow.sceneIds = [...sceneIds];
      this.#flow.stage = 'built';
      this.#saveFlow();
      this.#afterBuild(sceneIds, result.credits, silent, missing, !!one);
    } catch (error) {
      // Nothing half-built: a build that added its scenes at the very end
      // and was then cancelled takes them back; the hold is refunded whole.
      if (added) this.#host.engine.undo();
      const cancelled = signal.aborted;
      this.#saveCard(turn.id, 'build', {
        state: cancelled ? 'cancelled' : 'failed',
      });
      this.#flow.stage = back === 'building' ? 'assets' : back;
      this.#saveFlow();
      const unreachable =
        error instanceof Error && /could not be reached/i.test(error.message);
      this.#director(
        cancelled
          ? this.#line('build.cancelled')
          : error instanceof GatewayError && error.code === 'shortage'
            ? t('dir.noCredits', {
                need: error.detail.need ?? max,
                have: error.detail.have ?? balance,
              })
            : unreachable
              ? t('dir.unreachable')
              : this.#line('build.failed'),
        cancelled ? {} : { tone: 'error' },
      );
    } finally {
      this.#abort = null;
      await s.sync(user.id).catch(() => undefined);
      this.#ui.credits();
      this.#repaint(turn.id);
      const a = this.#lastCard('assets');
      if (a) this.#repaint(a.id);
      this.#ui.orb('idle', null);
      this.#ui.refresh();
      const next = this.#queue.shift();
      if (next) void this.#replay(next);
    }
  }
  #afterBuild(
    sceneIds: readonly string[],
    credits: number,
    silent: string | null,
    missing: readonly string[],
    oneScene: boolean,
  ) {
    const ws = this.#ws;
    // The sheet follows the canvas.
    this.#mem.setPart(this.#videoId, 'scenes', sceneLines(this.#state));
    this.#mem.note(
      this.#videoId,
      'decisions',
      oneScene
        ? `Added one scene (${credits} credits).`
        : `Built ${sceneIds.length} scenes (${credits} credits).`,
    );
    // What Director made is remembered, so a later hand edit is noticed.
    const hashes: Record<string, string> = {};
    for (const scene of this.#state.compositions)
      if (sceneIds.includes(scene.id))
        for (const layer of scene.layers) hashes[layer.id] = hashLayer(layer);
    this.#mem.setTouched(this.#videoId, hashes);
    try {
      ws.markAi(this.#videoId);
      ws.setStage(this.#videoId, 'built');
      ws.resume(this.#videoId);
    } catch {
      /* the workspace is a convenience here */
    }
    this.#host.markAi();
    this.#director(
      [
        this.#line('build.done', { scenes: sceneIds.length, credits }),
        silent ? t('build.silent') : '',
        missing.length
          ? t('build.missing', { names: missing.slice(0, 6).join(', ') })
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    // The first Video of a Project sets the Project's style (said once).
    if (!oneScene && this.#flow.plan) {
      const filled = (() => {
        try {
          return ws.fillStyleFromVideo(
            this.#videoId,
            styleFromPlan(this.#flow.plan),
          );
        } catch {
          return false;
        }
      })();
      if (filled) {
        this.#director(this.#line('style.filled'));
        this.#flow.styleSeen = this.#styleHash();
        this.#saveFlow();
      }
    }
  }

  // ---- after the build: five kinds -------------------------------------------
  async #builtMessage(text: string, selectedIds: string[]) {
    if (!text) return;
    const asks = sortMessage(text, selectedIds.length > 0);
    for (const ask of asks) {
      const label: Record<Ask['kind'], string> = {
        question: 'kind.question',
        selection: 'kind.selection',
        scene: 'kind.scene',
        'new-scene': 'kind.newScene',
        'new-video': 'kind.newVideo',
      };
      this.#director(
        asks.length > 1
          ? `${this.#line(label[ask.kind]!)}: ${clip(ask.text, 60)}`
          : this.#line(label[ask.kind]!),
        { tone: 'kind' },
      );
      if (ask.unsure) {
        const layer = selectedIds[0]
          ? findLayer(this.#state, selectedIds[0])?.layer
          : null;
        this.#card(
          'unsure',
          {
            choices: layer ? suggestionsFor(layer) : ['background', 'allText'],
            selectedIds,
          },
          this.#line('unsure.ask'),
        );
        continue;
      }
      if (ask.kind === 'question') this.#answer(ask.text, selectedIds);
      else if (ask.kind === 'new-video')
        this.#card(
          'newvideo',
          { text: ask.text, state: 'open' },
          this.#line('newVideo.ask'),
        );
      else if (ask.kind === 'new-scene') await this.#newScene(ask.text);
      else
        this.ask(ask.text, {
          selectedIds: ask.kind === 'selection' ? selectedIds : [],
          echo: false,
        });
    }
  }
  #answer(text: string, selectedIds: readonly string[]) {
    const scenes = this.#state.compositions;
    const total = Math.round(scenes.reduce((n, s) => n + s.duration, 0));
    const brief = this.#mem
      .sheet(this.#videoId)
      .brief.slice(0, 3)
      .map((e) => e.text)
      .join('; ');
    const q = text.toLowerCase();
    const picked = selectedIds[0]
      ? findLayer(this.#state, selectedIds[0])?.layer
      : null;
    this.#ui.orb('speaking');
    this.#director(
      /how many scene|how long|length|कितने सीन|कितना लंबा/.test(q)
        ? this.#line('answer.scenes', { scenes: scenes.length, seconds: total })
        : /credit|cost|price|क्रेडिट|कीमत/.test(q)
          ? this.#line('answer.credits', {
              credits: this.#env.s.ledger(this.#env.user.id).balance(),
            })
          : /what can you|help|can you|क्या कर सकते|मदद/.test(q)
            ? this.#line('answer.can')
            : [
                this.#line('answer.know', {
                  brief: brief || '',
                  scenes: scenes.length,
                }),
                picked
                  ? this.#line('answer.selected', { what: layerLine(picked) })
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
    );
  }
  /**
   * A change to the selection or the scene: a proposal that previews on the
   * canvas. Also used by the bubble, the quick strip and drops.
   */
  ask(
    text: string,
    o: {
      selectedIds?: readonly string[];
      assetId?: string;
      allowed?: readonly string[];
      echo?: boolean;
    } = {},
  ) {
    const selectedIds = o.selectedIds ?? [...this.#host.session.selectedIds];
    if (o.echo !== false) {
      const user = this.#mem.addTurn(this.#videoId, this.#chat.id, {
        role: 'user',
        text,
      });
      this.#paintTurn(user);
    }
    this.#reconcile();
    const sceneId = this.#host.session.source.composition.id;
    const result = propose({
      project: this.#state,
      sceneId,
      selectedIds,
      text,
      touched: this.#mem.touched(this.#videoId),
      lang: lang(),
      ...(o.allowed ? { allowed: o.allowed } : {}),
      ...(o.assetId ? { assetId: o.assetId } : {}),
      fit: (_scene, layerId, mode) => this.#host.fitCommands(layerId, mode),
    });
    if (result.kind === 'proposal') this.offer(result.proposal);
    else if (result.kind === 'ask-hand-edited')
      this.#card(
        'ask',
        {
          layers: result.layers,
          text,
          selectedIds,
          ...(o.assetId ? { assetId: o.assetId } : {}),
          state: 'open',
        },
        this.#line('handEdited.ask', {
          layer: result.layers.map((l) => l.name).join(', '),
        }),
      );
    else if (result.kind === 'locked')
      this.#director(this.#line('locked.layer', { layer: result.name }), {
        tone: 'note',
      });
    else if (result.kind === 'gone')
      this.#director(this.#line('proposal.gone'), { tone: 'note' });
    else void this.#cannot(text, selectedIds, result.alternatives);
  }
  /** Not something the offline rules can do: a real model may (with its cost), else alternatives. */
  async #cannot(
    text: string,
    selectedIds: readonly string[],
    alternatives: readonly string[],
  ) {
    const chat = await this.#host.chat().catch(() => null);
    const plus = chat as
      | (typeof chat & {
          commandsOf?: (id: string) => readonly EditorCommand[] | null;
        })
      | null;
    if (plus?.commandsOf && this.#env.s.remote) {
      const role = this.#c.director.roles.write;
      const model = modelsForRole(this.#c, role).find((m) =>
        this.#env.s.connected(m.id),
      );
      const cost = costById(this.#c, 'prompt-help');
      this.#card(
        'paid',
        {
          text,
          selectedIds: [...selectedIds],
          max: Math.max(1, Math.ceil(cost?.max ?? 1)),
          model: model?.id ?? '',
          state: 'open',
        },
        this.#line('paid.ask', {
          credits: Math.max(1, Math.ceil(cost?.max ?? 1)),
        }),
      );
      return;
    }
    this.#card(
      'cannot',
      { choices: [...alternatives], selectedIds: [...selectedIds] },
      this.#line('cannot.make'),
    );
  }
  /** Shows a proposal card; the newest open proposal previews on the canvas. */
  offer(proposal: Proposal, userText = '') {
    if (userText) {
      const user = this.#mem.addTurn(this.#videoId, this.#chat.id, {
        role: 'user',
        text: userText,
      });
      this.#paintTurn(user);
    }
    if (!proposal.commands.length) {
      this.#director(t('quick.same'), { tone: 'note' });
      return;
    }
    const turn = this.#card(
      'proposal',
      { proposal, state: 'open' },
      proposal.summary,
    );
    this.#open.set(proposal.id, {
      proposal,
      turnId: turn.id,
      chatId: this.#chat.id,
    });
    this.#previewNewest();
  }
  #previewNewest() {
    const last = [...this.#open.values()].at(-1);
    try {
      this.#host.preview(last ? last.proposal.commands : null);
    } catch {
      // Commands that no longer apply: the proposal is cancelled.
      if (last) this.#cancelProposal(last.proposal.id);
    }
    this.#host.redraw();
  }
  #cancelProposal(id: string, say = true) {
    const open = this.#open.get(id);
    if (!open) return;
    this.#open.delete(id);
    this.#saveCard(open.turnId, 'proposal', {
      proposal: open.proposal,
      state: 'cancelled',
    });
    this.#repaint(open.turnId);
    if (say) this.#director(this.#line('proposal.gone'), { tone: 'note' });
  }
  #proposalCard(el: HTMLElement, turn: Turn, state: CardState) {
    const proposal = state.proposal as Proposal;
    const status = String(state.state);
    // After a reload an open proposal is live again.
    if (status === 'open' && !this.#open.has(proposal.id))
      this.#open.set(proposal.id, {
        proposal,
        turnId: turn.id,
        chatId: this.#chat.id,
      });
    el.dataset.done = String(status !== 'open');
    el.dataset.state = status;
    el.dataset.proposal = proposal.id;
    put(
      el,
      h(
        'h4',
        {},
        h('span', {
          text: t(
            status === 'applied'
              ? 'prop.applied'
              : status === 'discarded'
                ? 'prop.discarded'
                : status === 'cancelled'
                  ? 'prop.cancelled'
                  : 'prop.title',
          ),
        }),
        h('span', {
          class: 'ai-cost',
          text: proposal.credits
            ? t('plan.credits', { n: proposal.credits })
            : t('prop.free'),
        }),
      ),
    );
    if (status !== 'open') return;
    put(
      el,
      h('p', { class: 'ai-muted', text: t('prop.preview') }),
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button('prop.apply', () => this.apply(proposal.id), 'primary'),
          { dataset: { act: 'apply' } },
        ),
        Object.assign(
          this.#button('prop.discard', () => this.discard(proposal.id)),
          { dataset: { act: 'discard' } },
        ),
      ),
    );
    for (const b of el.querySelectorAll<HTMLElement>('.ai-btn'))
      b.dataset.act = b.classList.contains('primary') ? 'apply' : 'discard';
  }
  apply(id: string) {
    const open = this.#open.get(id);
    // Applied twice, or already gone: the second press does nothing.
    if (!open) return;
    const { proposal } = open;
    if (!stillValid(this.#state, proposal)) {
      this.#cancelProposal(id);
      this.#previewNewest();
      return;
    }
    const before: Record<string, string> = {};
    for (const layerId of proposal.layerIds) {
      const hit = findLayer(this.#state, layerId);
      if (hit) before[layerId] = hashLayer(hit.layer);
    }
    this.#open.delete(id);
    this.#host.preview(null);
    try {
      // One Apply = one transaction = one undo step.
      this.#host.engine.commands.transaction(proposal.label, [
        ...proposal.commands,
      ]);
    } catch (error) {
      this.#saveCard(open.turnId, 'proposal', { proposal, state: 'cancelled' });
      this.#repaint(open.turnId);
      this.#director(
        error instanceof Error ? error.message : this.#line('proposal.gone'),
        { tone: 'error' },
      );
      this.#previewNewest();
      return;
    }
    const after: Record<string, string> = {};
    for (const layerId of proposal.layerIds) {
      const hit = findLayer(this.#state, layerId);
      after[layerId] = hit ? hashLayer(hit.layer) : '';
    }
    this.#mem.note(this.#videoId, 'decisions', proposal.summary, 'director', {
      before,
      after,
    });
    this.#mem.setTouched(
      this.#videoId,
      Object.fromEntries(Object.entries(after).filter(([, v]) => v)),
    );
    this.#mem.setPart(this.#videoId, 'scenes', sceneLines(this.#state));
    this.#saveCard(open.turnId, 'proposal', { proposal, state: 'applied' });
    this.#repaint(open.turnId);
    this.#host.markAi();
    this.#ui.flash(proposal.layerIds.filter((layerId) => after[layerId]));
    this.#previewNewest();
    this.#ui.refresh();
  }
  discard(id: string) {
    const open = this.#open.get(id);
    if (!open) return;
    this.#open.delete(id);
    this.#saveCard(open.turnId, 'proposal', {
      proposal: open.proposal,
      state: 'discarded',
    });
    this.#repaint(open.turnId);
    this.#previewNewest();
  }
  #askCard(el: HTMLElement, turn: Turn, state: CardState) {
    const open = state.state === 'open';
    el.dataset.done = String(!open);
    put(el, h('h4', {}, h('span', { text: t('prop.title') })));
    if (!open) return;
    const layers = state.layers as { id: string; name: string }[];
    const close = (to: string) => {
      this.#saveCard(turn.id, 'ask', { ...state, state: to });
      this.#repaint(turn.id);
    };
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            'ask.yes',
            () => {
              close('yes');
              this.ask(String(state.text), {
                selectedIds: state.selectedIds as string[],
                allowed: layers.map((l) => l.id),
                echo: false,
                ...(state.assetId ? { assetId: String(state.assetId) } : {}),
              });
            },
            'primary',
          ),
          { id: 'ai-ask-yes' },
        ),
        Object.assign(
          this.#button('ask.no', () => close('no')),
          { id: 'ai-ask-no' },
        ),
      ),
    );
  }
  #choiceCard(el: HTMLElement, turn: Turn, state: CardState) {
    const choices = (state.choices as string[]) ?? [];
    const phrases: Record<string, string> = {
      changeText: '',
      bigger: 'make it bigger',
      smaller: 'make it smaller',
      recolour: 'recolour it blue',
      remove: 'remove it',
      fit: 'fit it',
      faster: 'make it faster',
      replace: '',
      background: 'make the background blue',
      allText: 'make all text bigger',
      selectFirst: '',
    };
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        choices.map((key) =>
          h('button', {
            type: 'button',
            class: 'ai-chip',
            'data-choice': key,
            text: t(`sug.${key}` as AiKey),
            onclick: () => {
              const phrase = phrases[key];
              if (!phrase) {
                this.#ui.setInput('');
                return;
              }
              el.dataset.done = 'true';
              this.ask(phrase, {
                selectedIds: (state.selectedIds as string[]) ?? [],
              });
              void turn;
            },
          }),
        ),
      ),
    );
  }
  #useCard(el: HTMLElement, turn: Turn, state: CardState) {
    const open = state.state === 'open';
    el.dataset.done = String(!open);
    if (!open) return;
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            'stage.useHere',
            () => {
              this.#saveCard(turn.id, 'use', { ...state, state: 'used' });
              this.#repaint(turn.id);
              const commands = this.#host.placeAssetCommands(
                String(state.assetId),
              );
              this.offer({
                id: `p-use-${Date.now().toString(36)}`,
                summary:
                  lang() === 'hi'
                    ? `मैं "${String(state.name)}" को इस सीन में जोड़ूँगा।`
                    : `I will add "${String(state.name)}" to this scene.`,
                label: 'Director change',
                commands,
                layerIds: [],
                sceneId: this.#host.session.source.composition.id,
                credits: 0,
              });
            },
            'primary',
          ),
          { id: 'ai-use-here' },
        ),
      ),
    );
  }
  #paidCard(el: HTMLElement, turn: Turn, state: CardState) {
    const open = state.state === 'open';
    el.dataset.done = String(!open);
    put(
      el,
      h(
        'h4',
        {},
        h('span', { text: t('prop.title') }),
        h('span', {
          class: 'ai-cost',
          text: t('plan.upTo', { n: Number(state.max) }),
        }),
      ),
    );
    if (!open) return;
    const close = (to: string) => {
      this.#saveCard(turn.id, 'paid', { ...state, state: to });
      this.#repaint(turn.id);
    };
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        this.#button(
          'plan.approve',
          async () => {
            close('asked');
            await this.#askModel(
              String(state.text),
              (state.selectedIds as string[]) ?? [],
            );
          },
          'primary',
        ),
        this.#button('plan.cancel', () => close('no')),
      ),
    );
  }
  /** The real edit engine (a gateway server): its proposal, previewed like any other. */
  async #askModel(text: string, selectedIds: readonly string[]) {
    const chat = (await this.#host.chat()) as
      | (Awaited<ReturnType<AiHost['chat']>> & {
          commandsOf?: (id: string) => readonly EditorCommand[] | null;
        })
      | null;
    if (!chat?.commandsOf) return;
    this.#ui.orb('thinking');
    const sceneId = this.#host.session.source.composition.id;
    try {
      for await (const event of chat.send({
        text: `${text}\n\n${this.contextPack().text.slice(0, 2000)}`,
        selection: selectedIds.map((id) => ({
          kind: 'layer' as const,
          id,
          sceneId,
        })),
        attachmentIds: [],
      })) {
        if (event.type === 'failure')
          this.#director(this.#say(event.failure.message as never), {
            tone: 'error',
          });
        else if (event.type === 'proposal') {
          const commands = chat.commandsOf(event.id) ?? [];
          chat.discard(event.id);
          this.offer({
            id: `p-model-${event.id}`,
            summary: this.#say(event.summary as never),
            label: 'Director change',
            commands,
            layerIds: [...selectedIds],
            sceneId,
            credits: event.credits,
          });
        }
      }
    } finally {
      await this.#env.s.sync(this.#env.user.id).catch(() => undefined);
      this.#ui.credits();
      this.#ui.orb('idle');
    }
  }

  // ---- new scene, new video --------------------------------------------------
  async #newScene(text: string) {
    const { s, user } = this.#env;
    const c = this.#c;
    const base = this.#flow.plan;
    const open = this.#host.session.source.composition;
    const methods = allowedMethods(c, s.planOf(user.id));
    const method =
      (base
        ? methodOf(base.scenes[Math.min(1, base.scenes.length - 1)]!)
        : '') ||
      methods[0] ||
      'motion-graphics';
    const idea = text
      .replace(
        /\b(add|make|create|insert|one more|another|new|extra|a|an|scene|about|on|of)\b|नया|सीन|जोड़ो|जोड़ें|पर|के बारे में/giu,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
    const title = clip(idea || text, 60);
    const scene = {
      ...sceneFor(methods.includes(method) ? method : methods[0]!, {
        id: `n${Date.now().toString(36)}`,
        title,
        narration: idea || text,
        index: 1,
        last: false,
        accent:
          this.#ws.effectiveStyle(this.#videoId)?.look.palette[0] ?? '#7c5cff',
      }),
      durationHint: c.director.estimate.secondsPerScene,
    };
    const ratio = open.width / open.height;
    const aspect =
      Math.abs(ratio - 9 / 16) < 0.02
        ? '9:16'
        : Math.abs(ratio - 1) < 0.02
          ? '1:1'
          : '16:9';
    const raw = {
      format: 'video-plan',
      version: 3,
      meta: base
        ? { ...base.meta, title, aspect }
        : { build: 'scenes', title, language: lang(), aspect, fps: open.fps },
      scenes: [scene],
      overlays: [],
      captions: base?.captions ?? { enabled: false },
      notes: `Style: same as the video. One new scene.`,
    };
    const checked = checkPlan(raw);
    if (!checked.ok) {
      this.#director(checked.message, { tone: 'error' });
      return;
    }
    const est = await s
      .estimate(this.#model(), [methodOf(checked.plan.scenes[0]!)], text.length)
      .catch(() => null);
    const max = Math.ceil(
      (est?.max ?? 0) +
        mediaCredits(c, s.planOf(user.id), checked.plan, false, (id) =>
          s.connected(id),
        ),
    );
    const at = this.#state.compositions.findIndex((x) => x.id === open.id);
    this.#card(
      'newscene',
      { plan: checked.plan, max, after: open.id, at: at + 1, state: 'open' },
      this.#line('plan.restate', {
        what: title,
        scenes: 1,
        seconds: c.director.estimate.secondsPerScene,
      }),
    );
  }
  #newSceneCard(el: HTMLElement, turn: Turn, state: CardState) {
    const open = state.state === 'open';
    const plan = state.plan as VideoPlan;
    const scene = plan.scenes[0]!;
    el.dataset.done = String(!open);
    put(
      el,
      h(
        'h4',
        {},
        h('span', { text: `${t('new.scene')}: ${scene.title ?? ''}` }),
        h('span', {
          class: 'ai-cost',
          text: t('plan.upTo', { n: Number(state.max) }),
        }),
      ),
      h(
        'p',
        { class: 'ai-muted' },
        `${t('plan.narration')}: ${clip(scene.narration ?? '', 160)}`,
      ),
      h(
        'p',
        { class: 'ai-muted' },
        `${t('plan.method')}: ${this.#toolName(methodOf(scene))}`,
      ),
      h('p', {
        class: 'ai-muted',
        text: t('new.sceneWhere', { n: Number(state.at) }),
      }),
    );
    if (!open) return;
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            'new.sceneBuild',
            async () => {
              this.#saveCard(turn.id, 'newscene', { ...state, state: 'used' });
              this.#repaint(turn.id);
              const after = this.#state.compositions.some(
                (x) => x.id === state.after,
              )
                ? String(state.after)
                : this.#host.session.source.composition.id;
              await this.build({ plan, after, max: Number(state.max) });
            },
            'primary',
            { n: Number(state.max) },
          ),
          { id: 'ai-new-scene-build' },
        ),
        this.#button('plan.cancel', () => {
          this.#saveCard(turn.id, 'newscene', { ...state, state: 'no' });
          this.#repaint(turn.id);
        }),
      ),
    );
  }
  #newVideoCard(el: HTMLElement, turn: Turn, state: CardState) {
    const status = String(state.state);
    el.dataset.done = String(status !== 'open');
    put(el, h('h4', {}, h('span', { text: t('new.video') })));
    const set = (next: CardState) => {
      this.#saveCard(turn.id, 'newvideo', next);
      this.#repaint(turn.id);
    };
    if (status === 'made') {
      put(
        el,
        h('p', { text: t('new.videoMade', { name: String(state.name) }) }),
        h(
          'div',
          { class: 'ai-row' },
          h('a', {
            class: 'ai-btn primary',
            id: 'ai-new-video-open',
            href: `/?open=${encodeURIComponent(String(state.videoId))}&ai=1`,
            text: t('new.videoOpen'),
          }),
        ),
      );
      return;
    }
    if (status !== 'open') return;
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            'new.videoYes',
            async () => {
              const { s, user } = this.#env;
              const text = String(state.text);
              const name = clip(
                text
                  .replace(
                    /\b(make|create|start|a|an|new|another|next|video|about|on)\b|नया|वीडियो|बनाओ|बनाएँ/giu,
                    ' ',
                  )
                  .replace(/\s+/g, ' ')
                  .trim() || t('new.video'),
                60,
              );
              try {
                const open = this.#host.session.source.composition;
                const ratio = open.width / open.height;
                const id = await s.createVideo(user.id, {
                  projectId: this.#projectId,
                  name,
                  aspect:
                    Math.abs(ratio - 9 / 16) < 0.02
                      ? '9:16'
                      : Math.abs(ratio - 1) < 0.02
                        ? '1:1'
                        : '16:9',
                  origin: 'ai',
                  stage: 'brief',
                });
                try {
                  sessionStorage.setItem(`aive.ai.first.${id}`, text);
                } catch {
                  /* the new video then starts with an empty chat */
                }
                set({ ...state, state: 'made', videoId: id, name });
              } catch (error) {
                // A plan limit: the owner's sentence, and nothing is made.
                this.#director(
                  error instanceof Error ? error.message : t('dir.error'),
                  { tone: 'error' },
                );
              }
            },
            'primary',
          ),
          { id: 'ai-new-video-yes' },
        ),
        Object.assign(
          this.#button('new.videoNo', () => set({ ...state, state: 'no' })),
          { id: 'ai-new-video-no' },
        ),
      ),
    );
  }

  // ---- drops ------------------------------------------------------------------
  /** A file or a Library asset dropped on a layer (replace) or the stage (use here). */
  async drop(
    source: { files?: readonly File[]; assetId?: string; name?: string },
    layerId: string | null,
  ) {
    let assetId = source.assetId ?? '';
    let name = source.name ?? '';
    if (source.files?.length) {
      const file = source.files[0]!;
      const maxMb = this.#c.director.context.maxAttachmentMb;
      if (file.size > maxMb * 1_048_576) {
        this.#director(this.#line('attach.tooBig', { n: maxMb }), {
          tone: 'error',
        });
        return;
      }
      if (!/^(image|audio|video)\//.test(file.type)) {
        this.#director(this.#line('attach.badType'), { tone: 'error' });
        return;
      }
      const [id] = await this.#host.importFiles([file]);
      assetId = id ?? '';
      name = file.name;
    }
    if (!assetId) return;
    if (layerId) {
      const layer = findLayer(this.#state, layerId)?.layer;
      const kind = layer ? kindOf(layer) : null;
      if (layer && (kind === 'picture' || kind === 'video')) {
        this.ask(
          lang() === 'hi'
            ? `"${layer.name}" को "${name}" से बदलो`
            : `Replace "${layer.name}" with "${name}"`,
          { selectedIds: [layerId], assetId },
        );
        return;
      }
    }
    this.#card(
      'use',
      { assetId, name, state: 'open' },
      this.#line('drop.use', { name }),
    );
  }

  // ---- B4: the Project's new style ---------------------------------------------
  #styleHash(): string {
    const p = this.#ws.project(this.#projectId);
    return p
      ? JSON.stringify([p.style.look, p.style.voice, p.style.music])
      : '';
  }
  #styleOffer() {
    if (this.#flow.stage !== 'built') return;
    const now = this.#styleHash();
    if (this.#flow.styleSeen === undefined) {
      this.#flow.styleSeen = now;
      this.#saveFlow();
      return;
    }
    if (now === this.#flow.styleSeen) return;
    const open = this.#lastCard('style');
    if (open && (open.card!.state as CardState).state === 'open') return;
    this.#card(
      'style',
      { hash: now, state: 'open' },
      this.#line('style.newAsk'),
    );
  }
  #styleCard(el: HTMLElement, turn: Turn, state: CardState) {
    const open = state.state === 'open';
    el.dataset.done = String(!open);
    if (!open) return;
    put(
      el,
      h(
        'div',
        { class: 'ai-row' },
        Object.assign(
          this.#button(
            'style.apply',
            () => {
              this.#saveCard(turn.id, 'style', { ...state, state: 'used' });
              this.#repaint(turn.id);
              this.#flow.styleSeen = String(state.hash);
              this.#saveFlow();
              const offer = this.styleProposal();
              if (offer) this.offer(offer);
            },
            'primary',
          ),
          { id: 'ai-style-apply' },
        ),
        this.#button('ask.no', () => {
          this.#saveCard(turn.id, 'style', { ...state, state: 'no' });
          this.#repaint(turn.id);
          this.#flow.styleSeen = String(state.hash);
          this.#saveFlow();
        }),
      ),
    );
  }
  /** The Project's style as commands on this Video: text and shape colours, fonts, backgrounds. */
  styleProposal(): Proposal | null {
    const style = this.#ws.effectiveStyle(this.#videoId);
    if (!style) return null;
    const [bg, primary, accent] = style.look.palette;
    const commands: EditorCommand[] = [];
    const layerIds: string[] = [];
    const plain = (type: 'string' | 'color', value: string) => ({
      type,
      value,
      animated: false,
      keyframes: [],
      constraints: [],
    });
    for (const scene of this.#state.compositions) {
      if (bg && scene.backgroundColor !== bg)
        commands.push({
          type: 'SET_COMPOSITION_BACKGROUND',
          compositionId: scene.id,
          color: bg,
        });
      for (const layer of scene.layers) {
        const set = (key: string, type: 'string' | 'color', value: string) => {
          const now = layer.properties[key];
          if (now && now.type === type && now.value === value) return;
          commands.push({
            type: 'SET_PROPERTY',
            compositionId: scene.id,
            layerId: layer.id,
            target: { kind: 'property', key },
            property: plain(type, value),
          } as EditorCommand);
          if (!layerIds.includes(layer.id)) layerIds.push(layer.id);
        };
        if (layer.type === 'text') {
          if (primary) set('fill', 'color', primary);
          if (style.look.headingFont)
            set('fontFamily', 'string', style.look.headingFont);
        } else if (layer.type === 'shape' && (accent || primary))
          set('fill', 'color', accent ?? primary!);
      }
    }
    if (!commands.length) return null;
    return {
      id: `p-style-${Date.now().toString(36)}`,
      summary:
        lang() === 'hi'
          ? 'मैं इस वीडियो पर प्रोजेक्ट का नया स्टाइल लगाऊँगा (रंग और फ़ॉन्ट)।'
          : "I will apply the project's new style to this video (colours and fonts).",
      label: 'Apply project style',
      commands,
      layerIds,
      sceneId: this.#host.session.source.composition.id,
      credits: 0,
    };
  }

  // ---- the canvas changed -------------------------------------------------------
  /** Sheet and canvas agree; an AI change undone in the editor leaves the sheet. */
  #reconcile(quiet = false) {
    const hashes = layerHashes(this.#state);
    const gone = this.#mem.reconcile(this.#videoId, hashes);
    this.#mem.pruneTouched(this.#videoId, new Set(Object.keys(hashes)));
    if (this.#flow.stage === 'built')
      this.#mem.setPart(this.#videoId, 'scenes', sceneLines(this.#state));
    if (!quiet || gone.length)
      for (const what of gone)
        this.#director(this.#line('undo.seen', { what: clip(what, 100) }), {
          tone: 'note',
        });
  }
  #afterChange() {
    // A proposal whose layer or scene is gone is cancelled with one sentence.
    for (const [id, open] of [...this.#open])
      if (!stillValid(this.#state, open.proposal)) this.#cancelProposal(id);
    if (this.#open.size) this.#previewNewest();
    if (this.#flow.stage === 'start' && this.hasContent() && !this.#busy) {
      // Made by hand in the editor: Director starts from what is there.
      this.#flow.stage = 'built';
      this.#saveFlow();
    }
  }
  /** Coming back to AI mode: read the canvas again. */
  entered() {
    this.#mem.reload();
    this.#ws.reload();
    this.#reconcile();
    this.#styleOffer();
    if (this.#open.size) this.#previewNewest();
  }
  left() {
    this.#host.preview(null);
  }

  // ---- chats ----------------------------------------------------------------------
  newChat() {
    const brief = this.#mem
      .sheet(this.#videoId)
      .brief.slice(0, 4)
      .map((e) => e.text)
      .join('; ');
    this.#chat = this.#mem.newChat(this.#videoId);
    this.#open.clear();
    this.#host.preview(null);
    // The same sheet: a new chat starts knowing the brief.
    if (brief) this.#director(this.#line('chat.resume', { brief }), {}, false);
    else if (this.#c.director.greeting)
      this.#director(this.#say(this.#c.director.greeting), {}, false);
    // The step the Video waits at is offered again in this chat.
    const stage = this.#flow.stage;
    if (stage === 'brief')
      this.#director('', { card: { kind: 'brief', state: {} } }, false);
    else if (stage === 'plan' && this.#flow.plan)
      this.#director('', { card: { kind: 'plan', state: {} } }, false);
    else if (stage === 'assets')
      this.#director('', { card: { kind: 'assets', state: {} } }, false);
    this.#renderThread();
    this.#ui.refresh();
  }
  openChat(id: string) {
    const chat = this.#mem.chat(this.#videoId, id);
    if (!chat) return;
    this.#chat = chat;
    this.#open.clear();
    this.#host.preview(null);
    this.#renderThread();
    this.#ui.refresh();
  }

  // ---- drawer: Plan and Memory ------------------------------------------------------
  renderPlan(out: HTMLElement) {
    clear(out);
    const plan = this.#flow.plan;
    if (!plan) {
      put(
        out,
        h('p', { class: 'ai-muted', id: 'ai-plan-none', text: t('plan.none') }),
      );
      return;
    }
    put(
      out,
      h(
        'div',
        { class: 'ai-section', id: 'ai-plan-view' },
        h('h5', { text: clip(plan.meta.title, 80) }),
        this.#c.director.reveal.credits && this.#flow.max !== undefined
          ? h('p', {
              class: 'ai-cost',
              text: t('plan.total', { n: this.#flow.max }),
            })
          : null,
        this.#planScenes(false),
      ),
    );
  }
  renderMemory(out: HTMLElement) {
    clear(out);
    const mem = this.#mem;
    const again = () => this.renderMemory(out);
    const entries = (
      title: AiKey,
      list: readonly {
        id: string;
        text: string;
        pinned: boolean;
      }[],
      on: {
        patch(id: string, p: { text?: string; pinned?: boolean }): void;
        forget(id: string): void;
        add?(text: string): void;
      },
      part: string,
    ) => {
      const section = h(
        'div',
        { class: 'ai-section', 'data-mem-part': part },
        h('h5', { text: t(title) }),
      );
      const ul = h('ul', { class: 'ai-list' });
      if (!list.length)
        ul.append(h('li', { class: 'ai-muted', text: t('mem.empty') }));
      for (const e of list) {
        const text = h('span', { 'data-entry-text': '', text: e.text });
        const li = h(
          'li',
          {
            class: 'ai-entry',
            'data-entry': e.id,
            'data-pinned': String(e.pinned),
          },
          text,
          h(
            'div',
            { class: 'ai-entry-actions' },
            h('button', {
              type: 'button',
              class: 'ai-btn sm quiet',
              'data-act': 'pin',
              'aria-pressed': String(e.pinned),
              text: t(e.pinned ? 'mem.unpin' : 'mem.pin'),
              onclick: () => {
                on.patch(e.id, { pinned: !e.pinned });
                again();
              },
            }),
            h('button', {
              type: 'button',
              class: 'ai-btn sm quiet',
              'data-act': 'edit',
              text: t('mem.edit'),
              onclick: () => {
                const field = h('input', {
                  type: 'text',
                  class: 'ai-input',
                  value: e.text,
                  'aria-label': t('mem.edit'),
                });
                const done = (save: boolean) => {
                  const v = field.value.trim();
                  if (save && v && v !== e.text) on.patch(e.id, { text: v });
                  again();
                };
                field.addEventListener('keydown', (ev) => {
                  if (ev.key === 'Enter') done(true);
                  if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    done(false);
                  }
                });
                field.addEventListener('blur', () => done(true));
                text.replaceWith(field);
                field.focus();
              },
            }),
            h('button', {
              type: 'button',
              class: 'ai-btn sm quiet',
              'data-act': 'forget',
              text: t('mem.forget'),
              onclick: () => {
                on.forget(e.id);
                again();
              },
            }),
          ),
        );
        ul.append(li);
      }
      section.append(ul);
      if (on.add) {
        const field = h('input', {
          type: 'text',
          class: 'ai-input',
          placeholder: t('mem.addPlaceholder'),
          'aria-label': t('mem.add'),
          'data-mem-new': part,
        });
        const add = () => {
          const v = field.value.trim();
          if (!v) return;
          on.add!(v);
          again();
        };
        field.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') add();
        });
        section.append(
          h(
            'div',
            { class: 'ai-row' },
            field,
            h('button', {
              type: 'button',
              class: 'ai-btn sm',
              'data-mem-add': part,
              text: t('mem.add'),
              onclick: add,
            }),
          ),
        );
      }
      return section;
    };
    const sheet = mem.sheet(this.#videoId);
    const part = (p: SheetPart, title: AiKey, add = false) =>
      entries(
        title,
        sheet[p],
        {
          patch: (id, x) =>
            mem.patchEntry(this.#videoId, p, id, {
              ...x,
              ...(x.text ? { source: 'user' as const } : {}),
            }),
          forget: (id) => mem.forgetEntry(this.#videoId, p, id),
          ...(add
            ? {
                add: (text: string) =>
                  void mem.note(this.#videoId, p, text, 'user'),
              }
            : {}),
        },
        p,
      );
    put(
      out,
      h('div', { class: 'ai-label', text: t('mem.sheet') }),
      part('brief', 'mem.brief'),
      part('scenes', 'mem.scenes'),
      part('assets', 'mem.assets'),
      part('decisions', 'mem.decisions', true),
      h('div', { class: 'ai-label', text: t('mem.project') }),
      entries(
        'mem.project',
        mem.facts(this.#projectId),
        {
          patch: (id, x) => mem.patchFact(this.#projectId, id, x),
          forget: (id) => mem.forgetFact(this.#projectId, id),
          add: (text) => void mem.addFact(this.#projectId, text, 'user'),
        },
        'project',
      ),
      h(
        'div',
        { class: 'ai-section', 'data-mem-part': 'files' },
        h('h5', { text: t('mem.files') }),
        h(
          'ul',
          { class: 'ai-list' },
          mem.video(this.#videoId).notes.length
            ? mem.video(this.#videoId).notes.map((n) =>
                h('li', {
                  class: 'ai-entry',
                  'data-file-note': n.name,
                  text: `${n.name}: ${n.note}`,
                }),
              )
            : [h('li', { class: 'ai-muted', text: t('mem.empty') })],
        ),
      ),
      h(
        'div',
        { class: 'ai-section', 'data-mem-part': 'chats' },
        h('h5', { text: t('mem.chats') }),
        h(
          'ul',
          { class: 'ai-list' },
          mem.chats(this.#videoId).map((c) =>
            h(
              'li',
              { class: 'ai-entry', 'data-chat': c.id },
              h('button', {
                type: 'button',
                class: 'ai-btn sm quiet',
                text: `${c.title || t('dir.newChat')} · ${t('mem.turns', { n: c.turns.length })}${c.id === this.#chat.id ? ` · ${t('mem.current')}` : ''}`,
                onclick: () => this.openChat(c.id),
              }),
            ),
          ),
        ),
      ),
    );
  }
  /** Asset rows of this Video (the panel's Asset Library) and waiting slots. */
  assetRows(): Asset[] {
    return this.#env.s
      .assets(this.#env.user.id)
      .filter(
        (a) =>
          a.projectId === this.#videoId &&
          !a.trashedAt &&
          !a.id.startsWith('ed:'),
      );
  }
  /** A proposal is waiting (used by tests of the busy state and by the UI). */
  get openProposals() {
    return this.#open.size;
  }
}
