// FINAL2 U3: the Voice-over section of the left "Record & create" panel.
// FIX1 F3: this is now the one "Text to speech" tool. Only cloud engines
// are listed (Sarvam, Google Cloud, ElevenLabs, MiniMax); the browser and
// offline voices stay behind feature flags. With no key an empty state
// offers one button per provider, opening Settings at that key.
// Text, language, engine and voice (from the speech registry), speed,
// Preview, Save to Media (synthesizeToMedia, with progress and Cancel) and
// Add to timeline at the playhead. Engines that need a key or a download
// show their status and a button that opens Settings. Browser voices stay
// a Preview-only option (a page cannot capture speechSynthesis audio).
import { t } from '../i18n';
import { browserVoices } from '../audio/tts/browser';
import type { TtsVoice } from '../audio/tts/types';
import { ProviderError } from '../providers/errors';
import {
  SPEECH_PAUSE,
  SpeechError,
  encodeWav,
  listSpeechVoices,
  splitSpeech,
  synthesizeToMedia,
  type TtsProvider,
  type Voice,
} from '../speech';
import { formatBytes } from './local-engines';
import { KEYS_CHANGED, speechRegistry, voiceServices } from './services';
import { openSettings } from './settings-dialog';
import { flag } from './feature-flags';
import { diagnosticsButton } from './diagnostics';

/** FIX1 F3: the cloud engines, in the order the empty state offers them. */
const CLOUD_ENGINES = ['sarvam', 'google-cloud-tts', 'elevenlabs', 'minimax'];
/** The longest text one Save makes. */
export const MAX_SPEECH_TEXT = 5000;

export interface SpeechMetadata {
  providerId: string;
  voiceId: string;
  text: string;
  createdAt: string;
}
export interface VoiceoverHooks {
  /** Imports the speech file into Media; its asset id. */
  saveSpeech(file: File, speech: SpeechMetadata): Promise<string>;
  /** Adds the asset at the playhead on a new audio lane. */
  addSpeech(assetId: string, name: string): void;
  report(error: unknown): void;
}

type EngineState = 'ready' | 'needs-key' | 'needs-download' | 'unavailable';
interface Engine {
  id: string;
  label: string;
  state: EngineState;
  sizeBytes?: number;
  /** Absent: the browser's own voices (preview only). */
  provider?: TtsProvider;
}

/** Paid engines that speak Hindi (the hint names them). */
const HINDI_ENGINES = ['sarvam', 'google-cloud-tts', 'elevenlabs'];
const LANGUAGES = [
  { code: 'en-US', key: 'voiceover.lang.en' },
  { code: 'hi-IN', key: 'voiceover.lang.hi' },
];

/**
 * Dev/test only: with `window.__AIVE_E2E_SPEECH__` set by a test, a free
 * engine whose voice is a tone per character, as a real WAV file, so Save,
 * import and the timeline can be proven without a paid key.
 */
function testEngine(): TtsProvider | null {
  if (!(window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__)
    return null;
  return {
    id: 'test-speech',
    name: 'Test voice',
    kind: 'speech-tts',
    requiresKey: false,
    keyFields: [],
    listVoices: async (lang) =>
      !lang || lang.startsWith('en')
        ? [{ id: 'test-ava', name: 'Ava (test)', lang: 'en-US' }]
        : [],
    synthesize: async (request) => {
      const rate = 48_000;
      const seconds = Math.max(
        0.3,
        (request.text.length * 0.05) / (request.rate ?? 1),
      );
      const data = new Float32Array(Math.round(seconds * rate));
      for (let i = 0; i < data.length; i++)
        data[i] = 0.3 * Math.sin((2 * Math.PI * 330 * i) / rate);
      const blob = encodeWav({ sampleRate: rate, channels: [data] });
      return { blob, mime: blob.type, durationSec: seconds };
    },
  };
}

const plainError = (error: unknown) => {
  // FIX1 F3: the real class: key, quota, offline, timeout, status.
  if (error instanceof ProviderError)
    return error.code === 'KEY_INVALID' && error.status === 403
      ? t('voiceover.error.keyOrQuota')
      : error.code === 'KEY_MISSING' || error.code === 'KEY_INVALID'
        ? t('voiceover.error.key')
        : error.code === 'RATE_LIMITED'
          ? t('voiceover.error.limit')
          : error.code === 'ABORTED'
            ? t('voiceover.cancelled')
            : error.code === 'OFFLINE' ||
                (error.code === 'NETWORK' && !navigator.onLine)
              ? t('voiceover.error.offline')
              : error.code === 'TIMEOUT'
                ? t('voiceover.error.timeout')
                : error.code === 'HTTP'
                  ? error.status === 402 || error.status === 403
                    ? t('voiceover.error.quota', { status: error.status })
                    : t('voiceover.error.status', {
                        status: error.status ?? '',
                      })
                  : t('voiceover.error.network');
  if (error instanceof SpeechError)
    return error.code === 'LANGUAGE_UNAVAILABLE'
      ? t('voiceover.error.language')
      : t('voiceover.error.failed');
  return t('voiceover.error.failed');
};

/** FINAL3 V2.2: the first ready Text to speech engine and a voice for a
 *  language (the plan builder speaks with it), or null without one. */
export async function planVoiceEngine(
  lang: string,
): Promise<{ provider: TtsProvider; voiceId: string } | null> {
  let provider: TtsProvider | null = testEngine();
  if (!provider) {
    const status = speechRegistry().getSpeechStatus();
    provider =
      voiceServices()
        .filter((p): p is TtsProvider => p.kind === 'speech-tts')
        .find(
          (p) => status.find((item) => item.id === p.id)?.state === 'ready',
        ) ?? null;
  }
  if (!provider) return null;
  const voices = await provider.listVoices(lang).catch(() => []);
  const any = voices.length
    ? voices
    : await provider.listVoices().catch(() => []);
  return any[0] ? { provider, voiceId: any[0].id } : null;
}

export function mountVoiceover(hooks: VoiceoverHooks) {
  const root = document.createElement('section');
  root.className = 'voiceover';
  root.setAttribute('aria-labelledby', 'voiceover-title');
  let language = 'en-US';
  let engineId = '';
  let voiceId = '';
  let speed = 1;
  let text = '';
  let voices: { id: string; name: string }[] = [];
  let loadingVoices = false;
  let busy: AbortController | null = null;
  let progress = 0;
  let message = '';
  let messageKind: 'info' | 'error' = 'info';
  let lastError: unknown = null;
  let saved: { key: string; assetId: string } | null = null;
  let player: HTMLAudioElement | null = null;
  let playerUrl = '';
  let counter = 0;

  const engines = (): Engine[] => {
    const registry = speechRegistry();
    const status = registry.getSpeechStatus();
    const list: Engine[] = [];
    const fake = testEngine();
    if (fake)
      list.push({
        id: fake.id,
        label: fake.name,
        state: 'ready',
        provider: fake,
      });
    if (flag('browserVoice'))
      list.push({
        id: 'browser',
        label: t('voiceover.engine.browser'),
        state: 'ready',
      });
    const tts = [
      ...voiceServices(),
      ...(flag('offlineVoice') && registry.get('local-tts')
        ? [registry.get('local-tts')!]
        : []),
    ]
      .filter((p): p is TtsProvider => p.kind === 'speech-tts')
      .sort(
        (a, b) =>
          ((CLOUD_ENGINES.indexOf(a.id) + 99) % 99) -
          ((CLOUD_ENGINES.indexOf(b.id) + 99) % 99),
      );
    for (const provider of tts) {
      const found = status.find((item) => item.id === provider.id);
      const state = (found?.state ?? 'unavailable') as EngineState;
      list.push({
        id: provider.id,
        label:
          provider.id === 'local-tts'
            ? t('voiceover.engine.local')
            : provider.name,
        state,
        ...(found?.state === 'needs-download'
          ? { sizeBytes: found.sizeBytes }
          : {}),
        provider,
      });
    }
    return list;
  };
  const current = (): Engine => {
    const list = engines();
    return (
      list.find((item) => item.id === engineId) ??
      list[0] ?? { id: '', label: '', state: 'unavailable' }
    );
  };
  const pickDefault = () => {
    const list = engines();
    const chosen =
      list.find((item) => item.provider && item.state === 'ready') ??
      list.find((item) => item.id === 'browser') ??
      list[0];
    engineId = chosen?.id ?? '';
  };
  const key = () => [engineId, voiceId, language, speed, text].join('|');

  const loadVoices = async () => {
    const engine = current();
    voices = [];
    voiceId = '';
    if (engine.state !== 'ready') {
      render();
      return;
    }
    loadingVoices = true;
    render();
    const forEngine = engine.id;
    const forLanguage = language;
    try {
      let list: { id: string; name: string }[];
      if (!engine.provider) {
        const base = language.split('-')[0]!;
        const codes = (await browserVoices.languages()).filter(
          (item) => item.code.split('-')[0] === base,
        );
        list = (
          await Promise.all(
            codes.map((item) => browserVoices.voices(item.code)),
          )
        ).flat();
      } else {
        const result = await listSpeechVoices(engine.provider, language);
        list = result.voices.map((voice: Voice) => ({
          id: voice.id,
          name: voice.name,
        }));
      }
      if (engineId !== forEngine || language !== forLanguage) return;
      voices = list;
      voiceId = list[0]?.id ?? '';
    } catch (error) {
      if (engineId !== forEngine) return;
      message = plainError(error);
      messageKind = 'error';
      lastError = error;
    } finally {
      if (engineId === forEngine && language === forLanguage) {
        loadingVoices = false;
        render();
      }
    }
  };

  const stopPreview = () => {
    player?.pause();
    player = null;
    if (playerUrl) URL.revokeObjectURL(playerUrl);
    playerUrl = '';
    browserVoices.stop();
  };
  const setMessage = (value: string, kind: 'info' | 'error' = 'info') => {
    message = value;
    messageKind = kind;
    if (kind === 'info') lastError = null;
    render();
  };
  const fail = (error: unknown) => {
    console.debug('[tts] failed', current().id, error);
    lastError = error;
    setMessage(plainError(error), 'error');
  };

  const preview = async () => {
    const engine = current();
    stopPreview();
    if (!text.trim()) return;
    try {
      if (!engine.provider) {
        const voice: TtsVoice = {
          id: voiceId,
          name: voices.find((item) => item.id === voiceId)?.name ?? '',
          description: '',
          language,
        };
        setMessage(t('voiceover.playing'));
        await browserVoices.preview(text, voice, { speed });
        return;
      }
      busy = new AbortController();
      progress = 0;
      setMessage(t('voiceover.making'));
      const spoken = text.split(SPEECH_PAUSE).find((part) => part.trim());
      const [first] = splitSpeech(spoken ?? text);
      const result = await engine.provider.synthesize({
        text: first!,
        voiceId,
        lang: language,
        rate: speed,
        signal: busy.signal,
      });
      busy = null;
      playerUrl = URL.createObjectURL(result.blob);
      player = new Audio(playerUrl);
      player.onended = () => setMessage('');
      await player.play();
      setMessage(t('voiceover.playing'));
    } catch (error) {
      busy = null;
      fail(error);
    }
  };

  const save = async (): Promise<string | null> => {
    const engine = current();
    if (!engine.provider || engine.state !== 'ready' || !text.trim())
      return null;
    if (saved?.key === key()) return saved.assetId;
    stopPreview();
    busy = new AbortController();
    progress = 0;
    setMessage(t('voiceover.making'));
    try {
      const made = await synthesizeToMedia(text, {
        provider: engine.provider,
        voiceId,
        lang: language,
        rate: speed,
        signal: busy.signal,
        onProgress: (step) => {
          progress = step.total ? step.completed / step.total : 0;
          render();
        },
      });
      counter++;
      const name = t('voiceover.name', { n: String(counter) });
      const file = new File([made.blob], `${name}.wav`, { type: made.mime });
      const signal = busy.signal;
      const assetId = await hooks.saveSpeech(file, made.metadata);
      busy = null;
      if (signal.aborted) {
        setMessage(t('voiceover.cancelled'));
        return null;
      }
      saved = { key: key(), assetId };
      setMessage(t('voiceover.saved'));
      return assetId;
    } catch (error) {
      busy = null;
      fail(error);
      return null;
    }
  };

  const add = async () => {
    const assetId = await save();
    if (!assetId) return;
    try {
      hooks.addSpeech(assetId, t('voiceover.name', { n: String(counter) }));
      setMessage(t('voiceover.added'));
    } catch (error) {
      hooks.report(error);
    }
  };

  const field = (label: string, control: HTMLElement) => {
    const wrap = document.createElement('label');
    wrap.className = 'voiceover-field';
    const caption = document.createElement('span');
    caption.className = 'voiceover-label';
    caption.textContent = label;
    wrap.append(caption, control);
    return wrap;
  };
  const button = (action: string, label: string, primary = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = primary ? 'button primary' : 'button';
    item.dataset.action = action;
    item.textContent = label;
    return item;
  };
  const select = (
    id: string,
    options: { value: string; label: string }[],
    value: string,
  ) => {
    const item = document.createElement('select');
    item.id = id;
    for (const option of options) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      item.append(node);
    }
    item.value = value;
    return item;
  };

  // The text box keeps its node (and so focus and caret) across renders.
  const textBox = document.createElement('textarea');
  textBox.id = 'vo-text';
  textBox.rows = 4;
  textBox.maxLength = MAX_SPEECH_TEXT;
  textBox.setAttribute('autocomplete', 'off');
  textBox.placeholder = t('voiceover.placeholder');
  const count = document.createElement('span');
  count.className = 'voiceover-count';
  count.id = 'vo-count';
  const showCount = () =>
    (count.textContent = t('voiceover.count', {
      count: String(textBox.value.length),
      max: String(MAX_SPEECH_TEXT),
    }));
  textBox.oninput = () => {
    text = textBox.value;
    showCount();
    syncButtons();
  };
  // FIX1 F3: Add pause inserts a half-second pause at the caret.
  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'button sm';
  pauseButton.dataset.action = 'vo-pause';
  pauseButton.textContent = t('tts.addPause');
  pauseButton.onclick = () => {
    const at = textBox.selectionStart ?? textBox.value.length;
    const mark = ` ${SPEECH_PAUSE} `;
    if (textBox.value.length + mark.length > MAX_SPEECH_TEXT) return;
    textBox.setRangeText(mark, at, textBox.selectionEnd ?? at, 'end');
    textBox.focus();
    text = textBox.value;
    showCount();
    syncButtons();
  };
  showCount();
  let actions: HTMLButtonElement[] = [];
  const syncButtons = () => {
    const engine = current();
    const empty = !text.trim();
    for (const item of actions) {
      const saveable =
        item.dataset.action === 'vo-preview' || Boolean(engine.provider);
      item.disabled =
        Boolean(busy) || empty || engine.state !== 'ready' || !saveable;
    }
  };

  const render = () => {
    const engine = current();
    const title = document.createElement('h3');
    title.className = 'record-heading';
    title.id = 'voiceover-title';
    title.textContent = t('tts.title');
    // FIX1 F3: no cloud engine has a key: one card with a button each.
    const usable = engines().some(
      (item) => item.provider && item.state === 'ready',
    );
    if (!usable) {
      const empty = document.createElement('div');
      empty.className = 'voiceover-empty';
      empty.dataset.state = 'no-key';
      const words = document.createElement('p');
      words.textContent = t('voiceover.emptyTitle');
      const hint = document.createElement('p');
      hint.className = 'voiceover-note';
      hint.textContent = t('voiceover.emptyHint');
      const buttons = document.createElement('div');
      buttons.className = 'voiceover-empty-actions';
      for (const engine of engines().filter((item) => item.provider)) {
        const open = button(
          `vo-key-${engine.id}`,
          t('voiceover.addKeyFor', { provider: engine.label }),
        );
        open.className = 'button sm';
        open.dataset.provider = engine.id;
        open.onclick = () => openSettings('keys', engine.id);
        buttons.append(open);
      }
      empty.append(words, hint, buttons);
      root.replaceChildren(title, empty);
      return;
    }
    const textRow = document.createElement('div');
    textRow.className = 'voiceover-text-row';
    textRow.append(pauseButton, count);
    const nodes: HTMLElement[] = [
      title,
      field(t('voiceover.text'), textBox),
      textRow,
    ];

    const lang = select(
      'vo-language',
      LANGUAGES.map((item) => ({ value: item.code, label: t(item.key) })),
      language,
    );
    lang.onchange = () => {
      language = lang.value;
      void loadVoices();
    };
    nodes.push(field(t('voiceover.language'), lang));

    const list = engines();
    const engineSelect = select(
      'vo-engine',
      list.map((item) => ({ value: item.id, label: item.label })),
      engine.id,
    );
    engineSelect.onchange = () => {
      engineId = engineSelect.value;
      message = '';
      void loadVoices();
    };
    nodes.push(field(t('voiceover.engine'), engineSelect));

    const status = document.createElement('div');
    status.className = 'voiceover-status';
    status.dataset.state = engine.state;
    const statusText = document.createElement('span');
    statusText.textContent =
      engine.state === 'ready'
        ? engine.provider
          ? t('voiceover.state.ready')
          : t('voiceover.state.previewOnly')
        : engine.state === 'needs-key'
          ? t('voiceover.state.needsKey')
          : engine.state === 'needs-download'
            ? t('voiceover.state.needsDownload', {
                size: formatBytes(engine.sizeBytes ?? 0),
              })
            : t('voiceover.state.unavailable');
    status.append(statusText);
    if (engine.state !== 'ready') {
      const fix = button(
        'vo-fix',
        engine.state === 'needs-key'
          ? t('voiceover.fix.key')
          : t('voiceover.fix.offline'),
      );
      fix.className = 'button sm';
      fix.onclick = () =>
        openSettings(engine.state === 'needs-key' ? 'keys' : 'offline');
      status.append(fix);
    }
    nodes.push(status);

    if (language.startsWith('hi')) {
      const keyed = list.some(
        (item) => HINDI_ENGINES.includes(item.id) && item.state === 'ready',
      );
      if (!keyed) {
        const hint = document.createElement('div');
        hint.className = 'voiceover-hint';
        const words = document.createElement('span');
        words.textContent = t('voiceover.hindiHint');
        const fix = button('vo-hindi-key', t('voiceover.fix.key'));
        fix.className = 'button sm';
        fix.onclick = () => openSettings('keys');
        hint.append(words, fix);
        nodes.push(hint);
      }
    }

    if (engine.state === 'ready') {
      const voiceSelect = select(
        'vo-voice',
        voices.length
          ? voices.map((item) => ({ value: item.id, label: item.name }))
          : [
              {
                value: '',
                label: loadingVoices
                  ? t('voiceover.loadingVoices')
                  : engine.provider
                    ? t('voiceover.noVoices')
                    : t('voiceover.defaultVoice'),
              },
            ],
        voiceId,
      );
      voiceSelect.onchange = () => {
        voiceId = voiceSelect.value;
      };
      nodes.push(field(t('voiceover.voice'), voiceSelect));
    }

    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.id = 'vo-speed';
    speedInput.min = '0.5';
    speedInput.max = '2';
    speedInput.step = '0.1';
    speedInput.value = String(speed);
    const speedLabel = document.createElement('span');
    speedLabel.className = 'voiceover-speed';
    const showSpeed = () =>
      (speedLabel.textContent = t('voiceover.speedValue', {
        value: speed.toFixed(1),
      }));
    showSpeed();
    speedInput.oninput = () => {
      speed = Math.round(Number(speedInput.value) * 10) / 10;
      showSpeed();
    };
    const speedRow = document.createElement('div');
    speedRow.className = 'voiceover-speed-row';
    speedRow.append(speedInput, speedLabel);
    nodes.push(field(t('voiceover.speed'), speedRow));

    const previewButton = button('vo-preview', t('voiceover.preview'));
    previewButton.onclick = () => void preview();
    const saveButton = button('vo-save', t('voiceover.save'));
    saveButton.onclick = () => void save();
    const addButton = button('vo-add', t('voiceover.add'), true);
    addButton.onclick = () => void add();
    actions = [previewButton, saveButton, addButton];
    const row = document.createElement('div');
    row.className = 'voiceover-actions';
    row.append(previewButton, saveButton, addButton);
    nodes.push(row);
    if (!engine.provider) {
      const note = document.createElement('p');
      note.className = 'voiceover-note';
      note.textContent = t('voiceover.browserNote');
      nodes.push(note);
    }

    if (busy) {
      const bar = document.createElement('div');
      bar.className = 'voiceover-progress';
      const meter = document.createElement('progress');
      meter.max = 1;
      meter.value = progress;
      meter.setAttribute('aria-label', t('voiceover.making'));
      const cancel = button('vo-cancel', t('voiceover.cancel'));
      cancel.className = 'button sm';
      cancel.onclick = () => busy?.abort();
      bar.append(meter, cancel);
      nodes.push(bar);
    }
    const note = document.createElement('p');
    note.className = 'voiceover-message';
    note.setAttribute('role', 'status');
    note.dataset.kind = messageKind;
    note.textContent = message;
    nodes.push(note);
    if (messageKind === 'error' && lastError !== null) {
      const error = lastError;
      nodes.push(
        diagnosticsButton(() => ({
          feature: 'Text to speech',
          providerId: current().id,
          error,
          extra: { language, voice: voiceId, characters: text.length },
        })),
      );
    }
    root.replaceChildren(...nodes);
    syncButtons();
  };

  /** A key was saved or cleared: statuses and voices are read again. */
  const refresh = () => {
    if (current().state !== 'ready' || !current().provider) pickDefault();
    void loadVoices();
  };
  document.addEventListener(KEYS_CHANGED, refresh);
  pickDefault();
  void loadVoices();
  return {
    element: root,
    dispose() {
      document.removeEventListener(KEYS_CHANGED, refresh);
      stopPreview();
      busy?.abort();
    },
  };
}
