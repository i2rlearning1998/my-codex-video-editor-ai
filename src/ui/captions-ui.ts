// FINAL2 U9: Transcribe and Auto captions (D-270's engine, src/captions).
// Both dialogs pick an STT engine from the speech registry (each shows its
// status with a button that fixes it), a language and a clip. Transcribe
// shows the text to copy; Auto captions builds a caption track and adds it
// as one undo step ('Add captions'). SRT and VTT import and export work on
// the open scene's caption track. Media bytes are read from the media
// store (D-004); nothing here is saved outside the project.
import {
  longTaskFacts,
  watchLongTasks,
  type LongTaskReport,
} from './long-tasks';
import { whisperSelfTest } from '../speech/whisper-worker-client';
import {
  CAPTION_POSITIONS,
  CAPTION_STYLE_IDS,
  CAPTION_STYLES,
  captionCommands,
  captionStyle,
  captionTrackFromTranscription,
  captionTrackOf,
  findCaptions,
  parseSrt,
  parseVtt,
  toSrt,
  toVtt,
  type CaptionPosition,
  type CaptionStyleId,
  type CaptionTrack,
} from '../captions';
import { findClipByLayer, type EditorEngine, type Project } from '../core';
import { t } from '../i18n';
import type { MediaStore } from '../media/store';
import type { SttProvider, Transcription, WordTiming } from '../speech/types';
import { openModal, type ModalHandle } from './components/modal';
import { plainMessage, showToast } from './components/toast';
import { lastDownloadError, localEngines } from './local-engines';
import { speechRegistry } from './services';
import { openSettings } from './settings-dialog';
import { diagnosticsButton } from './diagnostics';
import { WhisperError } from '../speech/whisper';
import { SpeechError } from '../speech/types';
import type { EditorSession } from './session';

export interface CaptionsContext {
  engine: EditorEngine;
  session: EditorSession;
  mediaStore: Promise<MediaStore | null>;
}

// --- Engines -----------------------------------------------------------------
export interface SttEngine {
  provider: SttProvider;
  ready: boolean;
  label: string;
  note: string;
  fix?: 'keys' | 'offline';
}

/** Dev/test only: a deterministic STT engine, active when a test sets
 *  `window.__AIVE_E2E_STT__` (never in a production build). */
const FAKE_TEXT =
  'Welcome to the editor. Captions follow every word you say. Edit them any time.';
const fakeStt: SttProvider = {
  id: 'e2e-fake-stt',
  name: 'Test captions engine',
  kind: 'speech-stt',
  requiresKey: false,
  keyFields: [],
  languages: ['en', 'hi'],
  async transcribe(request) {
    const words = FAKE_TEXT.split(' ');
    request.onProgress?.({
      phase: 'transcription',
      completed: 1,
      total: 2,
    });
    if (request.signal?.aborted)
      throw new DOMException('Cancelled', 'AbortError');
    const step = 2.8 / words.length;
    const timed: WordTiming[] = words.map((text, i) => ({
      text,
      start: i * step,
      end: (i + 1) * step - 0.02,
    }));
    return {
      text: FAKE_TEXT,
      language: request.lang ?? 'en',
      segments: [{ text: FAKE_TEXT, start: 0, end: 2.8 }],
      words: timed,
    };
  },
};
const fakeEnabled = () =>
  import.meta.env.DEV &&
  !!(window as { __AIVE_E2E_STT__?: boolean }).__AIVE_E2E_STT__;

export function sttEngines(): SttEngine[] {
  const registry = speechRegistry();
  const status = registry.getSpeechStatus();
  const local = localEngines(registry);
  const engines: SttEngine[] = [];
  if (fakeEnabled())
    engines.push({
      provider: fakeStt,
      ready: true,
      label: t('captions.engine.ready'),
      note: '',
    });
  for (const provider of registry.list()) {
    if (provider.kind !== 'speech-stt') continue;
    if (provider.id === 'local-whisper') {
      const view = local.view(provider.id);
      engines.push({
        provider,
        ready: view.state === 'ready',
        label: view.label,
        note: view.note,
        ...(view.state === 'ready' ? {} : { fix: 'offline' as const }),
      });
      continue;
    }
    const state = status.find((s) => s.id === provider.id)?.state;
    engines.push({
      provider,
      ready: state === 'ready',
      label: t(
        state === 'ready'
          ? 'captions.engine.ready'
          : 'captions.engine.needsKey',
      ),
      note: state === 'ready' ? '' : t('captions.engine.needsKeyNote'),
      ...(state === 'ready' ? {} : { fix: 'keys' as const }),
    });
  }
  return engines;
}
const engineName = (provider: SttProvider) =>
  provider.id === 'local-whisper'
    ? t('settings.offline.local-whisper')
    : provider.name;

// --- Clips and media -----------------------------------------------------------
interface SourceClip {
  layerId: string;
  name: string;
  assetId: string;
  startTime: number;
  duration: number;
  sourceIn: number;
  speed: number;
}
/** The open scene's video and audio clips that have media. */
export function soundClips(session: EditorSession): SourceClip[] {
  const composition = session.source.composition;
  const out: SourceClip[] = [];
  for (const track of composition.tracks)
    for (const clip of track.clips) {
      if (!clip.assetId) continue;
      const asset = session.source.assets.find((a) => a.id === clip.assetId);
      if (asset?.type !== 'video' && asset?.type !== 'audio') continue;
      const layer = composition.layers.find((l) => l.id === clip.layerId);
      out.push({
        layerId: clip.layerId,
        name: layer?.name ?? clip.name,
        assetId: clip.assetId,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        speed: clip.speed,
      });
    }
  return out.sort((a, b) => a.startTime - b.startTime);
}
/** A clip that can be transcribed (video or audio with media). */
export function transcribable(session: EditorSession, layerId: string) {
  return soundClips(session).some((clip) => clip.layerId === layerId);
}
async function mediaBlob(
  context: CaptionsContext,
  assetId: string,
): Promise<Blob> {
  const store = await context.mediaStore;
  const assets = context.session.source.assets;
  let asset = assets.find((a) => a.id === assetId);
  // Detached audio reads its video's bytes (D-048).
  const derived = asset && /^audio-of:(.+)$/.exec(asset.source.reference);
  if (derived) asset = assets.find((a) => a.id === derived[1]);
  const blob =
    store && asset?.source.reference.startsWith('media/')
      ? await store.read(asset.source.reference)
      : null;
  if (!blob) throw new Error(t('captions.error.noMedia'));
  return blob;
}
/** Source time → timeline time for one clip; words outside it are dropped. */
function onTimeline(transcription: Transcription, clip: SourceClip) {
  const end = clip.sourceIn + clip.duration * clip.speed;
  const map = (items: readonly WordTiming[]) =>
    items
      .filter((w) => w.end > clip.sourceIn && w.start < end)
      .map((w) => ({
        text: w.text,
        start:
          clip.startTime +
          (Math.max(w.start, clip.sourceIn) - clip.sourceIn) / clip.speed,
        end:
          clip.startTime + (Math.min(w.end, end) - clip.sourceIn) / clip.speed,
      }));
  return {
    ...transcription,
    segments: map(transcription.segments),
    ...(transcription.words ? { words: map(transcription.words) } : {}),
  };
}

/** Transcriptions made in this session, per clip media, engine and language. */
const transcripts = new Map<string, Transcription>();
const transcriptKey = (assetId: string, engine: string, lang: string) =>
  `${assetId}|${engine}|${lang}`;

function usedIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const composition of project.compositions) {
    const visit = (layers: Project['compositions'][number]['layers']) => {
      for (const layer of layers) {
        ids.add(layer.id);
        visit(layer.children);
      }
    };
    visit(composition.layers);
    for (const track of composition.tracks) {
      ids.add(track.id);
      for (const clip of track.clips) ids.add(clip.id);
    }
  }
  return ids;
}
/** Adds a caption track to the open scene: one 'Add captions' step. */
export function addCaptionTrack(
  context: CaptionsContext,
  track: CaptionTrack,
): number {
  const { engine, session } = context;
  const composition = session.source.composition;
  const plan = captionCommands(track, {
    compositionId: composition.id,
    width: composition.width,
    height: composition.height,
    idPrefix: `cap${Date.now().toString(36)}`,
    usedIds: usedIds(engine.state as unknown as Project),
  });
  if (!plan.textLayerIds.length) throw new Error(t('captions.error.noCues'));
  session.setPlaying(false);
  engine.commands.transaction(plan.label, plan.commands);
  return plan.textLayerIds.length;
}

// --- Shared dialog pieces --------------------------------------------------
interface Picks {
  layerId: string | null;
  lang: 'en' | 'hi';
  engine: string | null;
}
const segmented = (
  name: string,
  label: string,
  options: readonly { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
) => {
  const group = document.createElement('div');
  group.className = 'caption-seg';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  group.dataset.field = name;
  const caption = document.createElement('span');
  caption.className = 'caption-field-label';
  caption.textContent = label;
  const row = document.createElement('div');
  row.className = 'caption-seg-row';
  for (const option of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'radio');
    item.dataset.value = option.value;
    item.textContent = option.label;
    item.setAttribute('aria-checked', String(option.value === value));
    item.onclick = () => {
      for (const other of row.children)
        other.setAttribute('aria-checked', String(other === item));
      onChange(option.value);
    };
    row.append(item);
  }
  group.append(caption, row);
  return group;
};

function sourcePicker(
  session: EditorSession,
  picks: Picks,
  onChange: () => void,
) {
  const clips = soundClips(session);
  if (!picks.layerId || !clips.some((c) => c.layerId === picks.layerId))
    picks.layerId = clips[0]?.layerId ?? null;
  if (!clips.length) {
    const empty = document.createElement('p');
    empty.className = 'caption-hint';
    empty.dataset.field = 'source';
    empty.textContent = t('captions.noClips');
    return empty;
  }
  return segmented(
    'source',
    t('captions.source'),
    clips.map((clip) => ({ value: clip.layerId, label: clip.name })),
    picks.layerId ?? '',
    (value) => {
      picks.layerId = value;
      onChange();
    },
  );
}

function enginePicker(picks: Picks, onChange: () => void) {
  const wrap = document.createElement('div');
  wrap.className = 'caption-engines';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', t('captions.engine'));
  const draw = () => {
    const engines = sttEngines().filter((e) =>
      e.provider.languages.some((l) => l.split('-')[0] === picks.lang),
    );
    if (!engines.some((e) => e.provider.id === picks.engine))
      picks.engine =
        (engines.find((e) => e.ready) ?? engines[0])?.provider.id ?? null;
    const caption = document.createElement('span');
    caption.className = 'caption-field-label';
    caption.textContent = t('captions.engine');
    wrap.replaceChildren(caption);
    for (const engine of engines) {
      const row = document.createElement('div');
      row.className = 'caption-engine';
      row.dataset.engine = engine.provider.id;
      row.dataset.ready = String(engine.ready);
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.setAttribute('role', 'radio');
      pick.className = 'caption-engine-pick';
      pick.setAttribute(
        'aria-checked',
        String(engine.provider.id === picks.engine),
      );
      pick.innerHTML = `<span class="caption-engine-name"></span><span class="caption-engine-state"></span>`;
      pick.querySelector('.caption-engine-name')!.textContent = engineName(
        engine.provider,
      );
      pick.querySelector('.caption-engine-state')!.textContent = engine.label;
      pick.onclick = () => {
        picks.engine = engine.provider.id;
        draw();
        onChange();
      };
      row.append(pick);
      if (engine.fix) {
        const fix = document.createElement('button');
        fix.type = 'button';
        fix.className = 'caption-engine-fix';
        fix.dataset.fix = engine.fix;
        fix.textContent = t(
          engine.fix === 'keys' ? 'captions.fix.keys' : 'captions.fix.offline',
        );
        fix.title = engine.note;
        fix.onclick = () => openSettings(engine.fix);
        row.append(fix);
      }
      wrap.append(row);
    }
  };
  draw();
  return { element: wrap, refresh: draw };
}
const selectedEngine = (picks: Picks) =>
  sttEngines().find((e) => e.provider.id === picks.engine);

/** Runs (or reuses) the transcription of the picked clip. */
async function transcribe(
  context: CaptionsContext,
  picks: Picks,
  signal: AbortSignal,
  onProgress: (fraction: number | null, label?: string) => void,
): Promise<{ clip: SourceClip; transcription: Transcription }> {
  const clip = soundClips(context.session).find(
    (c) => c.layerId === picks.layerId,
  );
  if (!clip) throw new Error(t('captions.noClips'));
  const engine = selectedEngine(picks);
  if (!engine?.ready) throw new Error(t('captions.error.engine'));
  const key = transcriptKey(clip.assetId, engine.provider.id, picks.lang);
  const cached = transcripts.get(key);
  if (cached) return { clip, transcription: cached };
  const blob = await mediaBlob(context, clip.assetId);
  onProgress(null, t('captions.step.start'));
  const started = performance.now();
  lastRun = { engine: engine.provider.id, lang: picks.lang, steps: [] };
  const stopWatching = watchLongTasks();
  // FIX1 F4: every step is named while it runs, and every failure is
  // thrown to the dialog (never swallowed).
  const transcription = await engine.provider.transcribe({
    blob,
    lang: picks.lang,
    signal,
    onProgress: (p) => {
      const fraction = p.total ? Math.min(1, p.completed / p.total) : null;
      const label =
        p.phase === 'load'
          ? t(p.stage ? `captions.step.load.${p.stage}` : 'captions.step.load')
          : p.phase === 'decode'
            ? t('captions.step.decode')
            : p.phase === 'download'
              ? t('captions.step.download', {
                  done: (p.completed / 1e6).toFixed(0),
                  total: p.total ? (p.total / 1e6).toFixed(0) : '?',
                })
              : t('captions.step.listen', {
                  percent: String(Math.round((fraction ?? 0) * 100)),
                });
      lastRun?.steps.push(`${p.phase} ${p.completed}/${p.total ?? '?'}`);
      onProgress(fraction, label);
    },
  });
  if (lastRun) {
    lastRun.ms = performance.now() - started;
    lastRun.longTasks = stopWatching();
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!transcription.text.trim()) throw new WhisperError('no-speech', 'listen');
  transcripts.set(key, transcription);
  return { clip, transcription };
}

const progressRow = () => {
  const row = document.createElement('div');
  row.className = 'caption-progress';
  row.hidden = true;
  row.innerHTML = `<div class="caption-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div><span class="caption-progress-text"></span><button type="button" class="caption-cancel" data-action="caption-cancel"></button>`;
  row.querySelector('.caption-cancel')!.textContent = t('captions.cancel');
  const bar = row.querySelector<HTMLElement>('.caption-progress-bar')!;
  const fill = bar.querySelector<HTMLElement>('span')!;
  return {
    row,
    set(fraction: number | null, label?: string) {
      row.hidden = false;
      bar.classList.toggle('indeterminate', fraction === null);
      if (fraction !== null) {
        const percent = Math.round(fraction * 100);
        fill.style.inlineSize = `${percent}%`;
        bar.setAttribute('aria-valuenow', String(percent));
      } else bar.removeAttribute('aria-valuenow');
      row.querySelector('.caption-progress-text')!.textContent =
        label ?? t('captions.working');
    },
    hide() {
      row.hidden = true;
    },
    onCancel(run: () => void) {
      row.querySelector<HTMLButtonElement>('.caption-cancel')!.onclick = run;
    },
  };
};
const message = () => {
  const line = document.createElement('p');
  line.className = 'caption-message';
  line.setAttribute('role', 'status');
  return line;
};
const errorText = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof WhisperError && error.kind === 'cancelled')
    ? t('captions.cancelled')
    : error instanceof WhisperError
      ? t(`captions.fail.${error.kind}`)
      : error instanceof SpeechError && error.code === 'MODEL_UNAVAILABLE'
        ? t('captions.fail.not-downloaded')
        : plainMessage(error instanceof Error ? error.message : String(error));
/** FIX1 F4: what the last run did, for Copy diagnostics. */
let lastRun: {
  engine: string;
  lang: string;
  steps: string[];
  ms?: number;
  longTasks?: LongTaskReport;
  selfTest?: Record<string, string | number | boolean>;
} | null = null;
/** Shows the failure in `status`, with Copy diagnostics, and logs it. */
const showFailure = (status: HTMLElement, error: unknown) => {
  status.textContent = errorText(error);
  status.dataset.kind = 'error';
  console.debug('[captions] failed', error);
  if (error instanceof DOMException && error.name === 'AbortError') return;
  if (error instanceof WhisperError && error.kind === 'cancelled') return;
  // FIX4 A7: ask a fresh worker what it can do, for the report.
  if (lastRun && error instanceof WhisperError)
    void whisperSelfTest().then((result) => {
      if (lastRun) lastRun.selfTest = result;
    });
  status.append(
    ' ',
    diagnosticsButton(() => ({
      feature: 'Auto captions',
      ...(lastRun ? { providerId: lastRun.engine } : {}),
      ...(error instanceof WhisperError ? { step: error.step } : {}),
      error: error instanceof WhisperError && error.cause ? error.cause : error,
      timings: lastRun?.ms ? { run: lastRun.ms } : {},
      extra: {
        failure: error instanceof WhisperError ? error.kind : undefined,
        language: lastRun?.lang,
        steps: lastRun?.steps.slice(-6).join(', '),
        ...longTaskFacts(lastRun?.longTasks),
        ...Object.fromEntries(
          Object.entries(lastRun?.selfTest ?? {}).map(([k, v]) => [
            `worker.${k}`,
            v,
          ]),
        ),
      },
    })),
  );
};

let open: ModalHandle | undefined;

// --- Transcribe ----------------------------------------------------------------
export function openTranscribe(
  context: CaptionsContext,
  layerId?: string,
): ModalHandle {
  open?.close();
  const picks: Picks = { layerId: layerId ?? null, lang: 'en', engine: null };
  let controller: AbortController | null = null;
  const handle = openModal({
    titleText: t('captions.transcribeTitle'),
    onClose: () => {
      controller?.abort();
      if (open === handle) open = undefined;
    },
    bodyBuilder: (body) => {
      body.classList.add('captions-body');
      const engines = enginePicker(picks, () => update());
      const source = sourcePicker(context.session, picks, () => update());
      const lang = segmented(
        'language',
        t('captions.language'),
        [
          { value: 'en', label: t('captions.lang.en') },
          { value: 'hi', label: t('captions.lang.hi') },
        ],
        picks.lang,
        (value) => {
          picks.lang = value as Picks['lang'];
          engines.refresh();
          update();
        },
      );
      const progress = progressRow();
      const status = message();
      const result = document.createElement('textarea');
      result.className = 'caption-result';
      result.id = 'transcript-text';
      result.readOnly = true;
      result.hidden = true;
      result.setAttribute('aria-label', t('captions.transcript'));
      const actions = document.createElement('div');
      actions.className = 'caption-actions';
      const start = document.createElement('button');
      start.type = 'button';
      start.className = 'primary';
      start.dataset.action = 'transcribe-start';
      start.textContent = t('captions.transcribe');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.dataset.action = 'transcript-copy';
      copy.textContent = t('captions.copy');
      copy.hidden = true;
      const toCaptions = document.createElement('button');
      toCaptions.type = 'button';
      toCaptions.dataset.action = 'transcript-captions';
      toCaptions.textContent = t('captions.useForCaptions');
      toCaptions.hidden = true;
      actions.append(copy, toCaptions, start);
      const update = () => {
        start.disabled =
          !picks.layerId || !selectedEngine(picks)?.ready || !!controller;
        // FIX1 F4: a shown failure stays until the next run (it used to
        // be cleared here right after it was written: "silently nothing").
        if (status.dataset.kind === 'error') return;
        status.textContent = !selectedEngine(picks)?.ready
          ? t('captions.hint.engine')
          : '';
      };
      start.onclick = async () => {
        controller = new AbortController();
        delete status.dataset.kind;
        update();
        progress.onCancel(() => controller?.abort());
        try {
          const { transcription } = await transcribe(
            context,
            picks,
            controller.signal,
            progress.set,
          );
          result.value = transcription.text;
          result.hidden = false;
          copy.hidden = false;
          toCaptions.hidden = false;
          status.textContent = '';
        } catch (error) {
          showFailure(status, error);
        } finally {
          controller = null;
          progress.hide();
          update();
        }
      };
      copy.onclick = () => {
        result.select();
        void navigator.clipboard?.writeText(result.value).then(
          () => showToast(t('captions.copied'), 'success'),
          () => showToast(t('captions.copyBlocked'), 'warning'),
        );
      };
      toCaptions.onclick = () => {
        openAutoCaptions(context, picks.layerId ?? undefined, picks);
      };
      body.append(
        source,
        lang,
        engines.element,
        progress.row,
        status,
        result,
        actions,
      );
      update();
    },
  });
  handle.root.classList.add('captions-dialog');
  handle.root.id = 'transcribe-dialog';
  open = handle;
  return handle;
}

// --- Auto captions ---------------------------------------------------------------
function stylePreview(id: CaptionStyleId, position: CaptionPosition) {
  const style = captionStyle(id, position);
  const frame = document.createElement('span');
  frame.className = `caption-preview pos-${position}`;
  const text = document.createElement('span');
  text.className = 'caption-preview-text';
  const sample = t('captions.sample');
  text.textContent = style.textCase === 'upper' ? sample.toUpperCase() : sample;
  // The style's own colours and font are data (CAPTION_STYLES), drawn as is.
  text.style.fontFamily = `${style.fontFamily}, sans-serif`;
  text.style.fontWeight = String(style.fontWeight);
  text.style.color = style.color;
  text.style.textAlign = style.align;
  if (style.box) {
    const alpha = Math.round(style.box.opacity * 255)
      .toString(16)
      .padStart(2, '0');
    text.style.background = `${style.box.color}${alpha}`;
    text.classList.add('boxed');
  }
  if (style.karaoke) {
    // Spoken words take the highlight; the current one is underlined.
    const words = sample.split(' ');
    text.textContent = '';
    const spoken = document.createElement('span');
    spoken.style.color = style.highlightColor;
    spoken.textContent = `${words.slice(0, 2).join(' ')} `;
    const now = document.createElement('u');
    now.style.color = style.highlightColor;
    now.textContent = words[2] ?? '';
    text.append(spoken, now, ` ${words.slice(3).join(' ')}`);
  }
  frame.append(text);
  return frame;
}

export function openAutoCaptions(
  context: CaptionsContext,
  layerId?: string,
  from?: Picks,
): ModalHandle {
  open?.close();
  const picks: Picks = {
    layerId: layerId ?? from?.layerId ?? null,
    lang: from?.lang ?? 'en',
    engine: from?.engine ?? null,
  };
  let styleId: CaptionStyleId = 'clean';
  let position: CaptionPosition = 'bottom';
  let maxLines = CAPTION_STYLES.clean.maxLines;
  let controller: AbortController | null = null;
  const handle = openModal({
    titleText: t('captions.title'),
    onClose: () => {
      controller?.abort();
      if (open === handle) open = undefined;
    },
    bodyBuilder: (body) => {
      body.classList.add('captions-body');
      const engines = enginePicker(picks, () => update());
      const source = sourcePicker(context.session, picks, () => update());
      const lang = segmented(
        'language',
        t('captions.language'),
        [
          { value: 'en', label: t('captions.lang.en') },
          { value: 'hi', label: t('captions.lang.hi') },
        ],
        picks.lang,
        (value) => {
          picks.lang = value as Picks['lang'];
          engines.refresh();
          update();
        },
      );
      const gallery = document.createElement('div');
      gallery.className = 'caption-styles';
      gallery.setAttribute('role', 'radiogroup');
      gallery.setAttribute('aria-label', t('captions.style'));
      const drawGallery = () => {
        gallery.replaceChildren(
          ...CAPTION_STYLE_IDS.map((id) => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'caption-style';
            tile.setAttribute('role', 'radio');
            tile.dataset.style = id;
            tile.setAttribute('aria-checked', String(id === styleId));
            const name = document.createElement('span');
            name.className = 'caption-style-name';
            name.textContent = t(`captions.styleName.${id}`);
            tile.append(stylePreview(id, position), name);
            tile.onclick = () => {
              styleId = id;
              maxLines = CAPTION_STYLES[id].maxLines;
              lines
                .querySelectorAll('[role="radio"]')
                .forEach((item) =>
                  item.setAttribute(
                    'aria-checked',
                    String(
                      (item as HTMLElement).dataset.value === String(maxLines),
                    ),
                  ),
                );
              drawGallery();
            };
            return tile;
          }),
        );
      };
      const styleLabel = document.createElement('span');
      styleLabel.className = 'caption-field-label';
      styleLabel.textContent = t('captions.style');
      const lines = segmented(
        'lines',
        t('captions.maxLines'),
        ['1', '2', '3'].map((value) => ({ value, label: value })),
        String(maxLines),
        (value) => {
          maxLines = Number(value);
        },
      );
      const place = segmented(
        'position',
        t('captions.position'),
        CAPTION_POSITIONS.map((value) => ({
          value,
          label: t(`captions.pos.${value}`),
        })),
        position,
        (value) => {
          position = value as CaptionPosition;
          drawGallery();
        },
      );
      drawGallery();
      const progress = progressRow();
      const status = message();
      const actions = document.createElement('div');
      actions.className = 'caption-actions';
      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'primary';
      create.dataset.action = 'captions-create';
      create.textContent = t('captions.create');
      // FIX1 F4: the dialog can always be reported, run or not.
      actions.append(
        create,
        diagnosticsButton(() => ({
          feature: 'Auto captions',
          ...(picks.engine ? { providerId: picks.engine } : {}),
          extra: {
            engineReady: selectedEngine(picks)?.ready ?? false,
            engineState: selectedEngine(picks)?.label,
            language: picks.lang,
            lastSteps: lastRun?.steps.slice(-6).join(', '),
            webAssembly: typeof WebAssembly !== 'undefined',
            webGpu: 'gpu' in navigator,
            crossOriginIsolated: self.crossOriginIsolated,
            downloadError: (() => {
              const error = lastDownloadError.get('local-whisper');
              return error instanceof Error ? error.message : undefined;
            })(),
          },
        })),
      );
      // SRT / VTT: import into this scene, export the scene's captions.
      const files = document.createElement('div');
      files.className = 'caption-files';
      const fileLabel = document.createElement('span');
      fileLabel.className = 'caption-field-label';
      fileLabel.textContent = t('captions.files');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.srt,.vtt,text/vtt';
      input.hidden = true;
      input.id = 'captions-import-file';
      const importButton = document.createElement('button');
      importButton.type = 'button';
      importButton.dataset.action = 'captions-import';
      importButton.textContent = t('captions.import');
      importButton.onclick = () => input.click();
      const exportSrt = document.createElement('button');
      exportSrt.type = 'button';
      exportSrt.dataset.action = 'captions-export-srt';
      exportSrt.textContent = t('captions.exportSrt');
      const exportVtt = document.createElement('button');
      exportVtt.type = 'button';
      exportVtt.dataset.action = 'captions-export-vtt';
      exportVtt.textContent = t('captions.exportVtt');
      files.append(fileLabel, importButton, exportSrt, exportVtt, input);
      const hasCaptions = () =>
        findCaptions(context.session.source.composition as never).length > 0;
      const update = () => {
        create.disabled =
          !picks.layerId || !selectedEngine(picks)?.ready || !!controller;
        exportSrt.disabled = exportVtt.disabled = !hasCaptions();
        // FIX1 F4: a shown failure stays until the next run.
        if (status.dataset.kind === 'error') return;
        status.textContent = !picks.layerId
          ? ''
          : !selectedEngine(picks)?.ready
            ? t('captions.hint.engine')
            : '';
      };
      const finish = (count: number) => {
        showToast(t('captions.added', { count: String(count) }), 'success');
        handle.close();
      };
      create.onclick = async () => {
        controller = new AbortController();
        delete status.dataset.kind;
        update();
        progress.onCancel(() => controller?.abort());
        try {
          const { clip, transcription } = await transcribe(
            context,
            picks,
            controller.signal,
            progress.set,
          );
          const track = captionTrackFromTranscription(
            onTimeline(transcription, clip),
            { style: styleId, position, maxLines, language: picks.lang },
          );
          controller = null;
          // FIX1 F4: no cue is a visible failure, never a silent close.
          if (!track.cues.length) throw new WhisperError('no-speech', 'listen');
          finish(addCaptionTrack(context, track));
        } catch (error) {
          showFailure(status, error);
        } finally {
          controller = null;
          progress.hide();
          if (!handle.root.isConnected) return;
          update();
        }
      };
      input.onchange = async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const cues =
            /\.vtt$/i.test(file.name) || /^WEBVTT/.test(text)
              ? parseVtt(text)
              : parseSrt(text);
          if (!cues.length) throw new Error(t('captions.error.noCues'));
          finish(
            addCaptionTrack(context, {
              version: 1,
              language: picks.lang,
              style: captionStyle(styleId, position),
              cues,
            }),
          );
        } catch (error) {
          status.textContent = errorText(error);
        }
      };
      const download = (kind: 'srt' | 'vtt') => {
        const scene = context.session.source.composition;
        const cues = captionTrackOf(scene as never).cues;
        const text = kind === 'srt' ? toSrt(cues) : toVtt(cues);
        const url = URL.createObjectURL(
          new Blob([text], {
            type: kind === 'srt' ? 'application/x-subrip' : 'text/vtt',
          }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${scene.name || 'captions'}.${kind}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      exportSrt.onclick = () => download('srt');
      exportVtt.onclick = () => download('vtt');
      body.append(
        source,
        lang,
        engines.element,
        styleLabel,
        gallery,
        lines,
        place,
        progress.row,
        status,
        actions,
        files,
      );
      update();
    },
  });
  handle.root.classList.add('captions-dialog');
  handle.root.id = 'captions-dialog';
  open = handle;
  return handle;
}

/** The selected clip's layer id when it can be transcribed, else null. */
export function selectedSoundClip(session: EditorSession): string | null {
  const id = session.selectedIds.length === 1 ? session.selectedId : null;
  if (!id) return null;
  return findClipByLayer(session.source.composition, id) &&
    transcribable(session, id)
    ? id
    : null;
}
