// V7 (Clipchamp clone spec 11.5): the Text to speech panel (right side).
// Language (with a search), Voice with its description, Hear this voice,
// Advanced (Speed), the text with a character count and Add pause, then
// Preview and Save. After a save, edits show "You have unsaved changes"
// with Discard. A text to speech clip reopens the panel with its values;
// Save then replaces its audio in one step.
import { encodeWav } from '../../audio/sound-pack';
import { readTtsSettings, type TtsSettings } from '../../audio/tts/commands';
import { voiceProviders } from '../../audio/tts/registry';
import {
  MAX_TTS_TEXT,
  PAUSE_MARK,
  type TtsLanguage,
  type TtsVoice,
  type VoiceProvider,
} from '../../audio/tts/types';
import { formatNumber, t } from '../../i18n';
import { createNumberField } from '../components/number-field';
import { iconSvg } from '../icons';

export interface TtsHooks {
  /** Stores the audio and adds (or, with `clipId`, replaces) the clip. */
  save(
    file: File,
    name: string,
    settings: TtsSettings,
    clipId: string | null,
  ): Promise<void>;
  report(error: unknown): void;
}

/** Session state of the panel (transient, never saved). */
export const ttsState: {
  /** Opened from Record & create with nothing selected. */
  open: boolean;
  /** The text to speech clip being edited, if any. */
  clipId: string | null;
  draft: TtsSettings | null;
  saved: TtsSettings | null;
} = { open: false, clipId: null, draft: null, saved: null };

/** The clip's settings become the draft when its panel opens. */
export function editTtsClip(clip: {
  readonly id: string;
  readonly metadata?: object;
}) {
  if (ttsState.clipId === clip.id) return;
  const settings = readTtsSettings(clip);
  ttsState.clipId = clip.id;
  ttsState.draft = settings ? { ...settings } : null;
  ttsState.saved = settings ? { ...settings } : null;
}
/** A fresh panel from the Text to speech card. */
export function newTts() {
  ttsState.open = true;
  ttsState.clipId = null;
  ttsState.draft = null;
  ttsState.saved = null;
}

let catalog: {
  languages: (TtsLanguage & { provider: VoiceProvider })[];
  voices: Map<string, (TtsVoice & { provider: VoiceProvider })[]>;
} | null = null;
let loading: Promise<void> | null = null;
const loadCatalog = () =>
  (loading ??= (async () => {
    const languages: (TtsLanguage & { provider: VoiceProvider })[] = [];
    const voices = new Map<
      string,
      (TtsVoice & { provider: VoiceProvider })[]
    >();
    for (const provider of voiceProviders()) {
      for (const language of await provider.languages()) {
        if (!languages.some((item) => item.code === language.code))
          languages.push({ ...language, provider });
        const list = voices.get(language.code) ?? [];
        for (const voice of await provider.voices(language.code))
          list.push({ ...voice, provider });
        voices.set(language.code, list);
      }
    }
    catalog = { languages, voices };
  })());

const same = (a: TtsSettings | null, b: TtsSettings | null) =>
  JSON.stringify(a) === JSON.stringify(b);
/** The clip's name: its first words. */
export const ttsName = (text: string) => {
  const words = text
    .replaceAll(PAUSE_MARK, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
  return words || t('tts.defaultName');
};

export function ttsPanel(hooks: TtsHooks, rerender: () => void): HTMLElement[] {
  const header = document.createElement('header');
  header.className = 'right-section-header';
  const title = document.createElement('h3');
  title.textContent = t('tts.title');
  header.append(title);
  if (!catalog) {
    const note = document.createElement('p');
    note.className = 'right-note';
    note.textContent = t('tts.loading');
    void loadCatalog().then(rerender, hooks.report);
    return [header, note];
  }
  const { languages, voices } = catalog;
  if (!languages.length) {
    const note = document.createElement('p');
    note.className = 'right-note';
    note.textContent = t('tts.noVoices');
    return [header, note];
  }
  const first = languages[0]!;
  const draft: TtsSettings = (ttsState.draft ??= {
    provider: first.provider.id,
    language: first.code,
    voice: voices.get(first.code)?.[0]?.id ?? '',
    speed: 1,
    text: '',
  });
  const voiceOf = () =>
    (voices.get(draft.language) ?? []).find(
      (item) => item.id === draft.voice,
    ) ?? null;
  const elements: HTMLElement[] = [header];

  // Banner: unsaved changes after a save, with Discard.
  const banner = document.createElement('div');
  banner.className = 'tts-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `${iconSvg('info', 20)}<span></span>`;
  banner.querySelector('span')!.textContent = t('tts.unsaved');
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'button sm';
  discard.dataset.action = 'tts-discard';
  discard.textContent = t('tts.discard');
  discard.onclick = () => {
    ttsState.draft = ttsState.saved ? { ...ttsState.saved } : null;
    rerender();
  };
  banner.append(discard);
  elements.push(banner);

  // Language, with a search over the list.
  const languageSearch = document.createElement('input');
  languageSearch.type = 'search';
  languageSearch.id = 'tts-language-search';
  languageSearch.className = 'tts-search';
  languageSearch.placeholder = t('tts.searchLanguage');
  languageSearch.setAttribute('aria-label', t('tts.searchLanguage'));
  const language = document.createElement('select');
  language.id = 'tts-language';
  language.setAttribute('aria-label', t('tts.language'));
  const fillLanguages = (query: string) => {
    language.replaceChildren(
      ...languages
        .filter(
          (item) =>
            !query ||
            item.name.toLowerCase().includes(query) ||
            item.code.toLowerCase().includes(query) ||
            item.code === draft.language,
        )
        .map((item) => {
          const option = document.createElement('option');
          option.value = item.code;
          option.textContent = item.name;
          return option;
        }),
    );
    language.value = draft.language;
  };
  fillLanguages('');
  languageSearch.addEventListener('input', () =>
    fillLanguages(languageSearch.value.trim().toLowerCase()),
  );
  language.onchange = () => {
    draft.language = language.value;
    const list = voices.get(draft.language) ?? [];
    draft.voice = list[0]?.id ?? '';
    draft.provider = list[0]?.provider.id ?? draft.provider;
    rerender();
  };
  elements.push(labelled(t('tts.language'), languageSearch, language));

  // Voice, each with its description; browser voices are preview only.
  const voice = document.createElement('select');
  voice.id = 'tts-voice';
  voice.setAttribute('aria-label', t('tts.voice'));
  for (const item of voices.get(draft.language) ?? []) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} · ${item.description}${
      item.provider.canSave ? '' : ` (${t('tts.previewOnly')})`
    }`;
    voice.append(option);
  }
  voice.value = draft.voice;
  voice.onchange = () => {
    draft.voice = voice.value;
    draft.provider = voiceOf()?.provider.id ?? draft.provider;
    rerender();
  };
  const hear = document.createElement('button');
  hear.type = 'button';
  hear.className = 'button sm';
  hear.dataset.action = 'tts-hear';
  hear.innerHTML = `${iconSvg('play', 20)}<span></span>`;
  hear.querySelector('span')!.textContent = t('tts.hear');
  hear.onclick = () => {
    const chosen = voiceOf();
    if (chosen) chosen.provider.sample(chosen).catch(hooks.report);
  };
  elements.push(labelled(t('tts.voice'), voice), hear);

  // Advanced: Speed.
  const advanced = document.createElement('details');
  advanced.className = 'right-audio-group tts-advanced';
  const summary = document.createElement('summary');
  summary.textContent = t('tts.advanced');
  advanced.append(
    summary,
    createNumberField({
      id: 'tts-speed',
      label: t('tts.speed'),
      value: draft.speed,
      unit: '×',
      min: 0.5,
      max: 2,
      step: 0.1,
      decimals: 1,
      slider: true,
      className: 'right-row',
      onCommit: (value) => {
        draft.speed = value;
        refresh();
      },
    }),
  );
  elements.push(advanced);

  // Text, its count and Add pause.
  const text = document.createElement('textarea');
  text.id = 'tts-text';
  text.className = 'tts-text';
  text.maxLength = MAX_TTS_TEXT;
  text.rows = 6;
  text.value = draft.text;
  text.placeholder = t('tts.placeholder');
  text.setAttribute('aria-label', t('tts.text'));
  const count = document.createElement('span');
  count.className = 'tts-count';
  count.setAttribute('aria-live', 'polite');
  text.addEventListener('input', () => {
    draft.text = text.value;
    refresh();
  });
  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'button sm';
  pause.dataset.action = 'tts-pause';
  pause.textContent = t('tts.addPause');
  pause.onclick = () => {
    const at = text.selectionStart ?? text.value.length;
    const insert = ` ${PAUSE_MARK} `;
    if (text.value.length + insert.length > MAX_TTS_TEXT) return;
    text.value = text.value.slice(0, at) + insert + text.value.slice(at);
    draft.text = text.value;
    text.focus();
    text.selectionStart = text.selectionEnd = at + insert.length;
    refresh();
  };
  const textRow = document.createElement('div');
  textRow.className = 'tts-text-row';
  textRow.append(pause, count);
  elements.push(labelled(t('tts.text'), text), textRow);

  // Preview and Save.
  const note = document.createElement('p');
  note.className = 'right-note tts-note';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'button';
  preview.dataset.action = 'tts-preview';
  preview.innerHTML = `${iconSvg('play', 20)}<span></span>`;
  preview.querySelector('span')!.textContent = t('tts.preview');
  preview.onclick = () => {
    const chosen = voiceOf();
    if (!chosen) return;
    chosen.provider
      .preview(draft.text, chosen, { speed: draft.speed })
      .catch(hooks.report);
  };
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button primary';
  save.dataset.action = 'tts-save';
  save.textContent = t('tts.save');
  let busy = false;
  save.onclick = () => {
    const chosen = voiceOf();
    if (!chosen || busy) return;
    busy = true;
    refresh();
    note.textContent = t('tts.generating');
    const settings = { ...draft, provider: chosen.provider.id };
    chosen.provider
      .synthesize(draft.text, chosen, { speed: draft.speed })
      .then((buffer) => {
        const name = ttsName(draft.text);
        const file = new File(
          [encodeWav(buffer.getChannelData(0), buffer.sampleRate) as BlobPart],
          `${name}.wav`,
          { type: 'audio/wav' },
        );
        return hooks.save(file, name, settings, ttsState.clipId);
      })
      .then(
        () => {
          ttsState.saved = { ...settings };
          ttsState.draft = { ...settings };
          busy = false;
          note.textContent = '';
          rerender();
        },
        (error: unknown) => {
          busy = false;
          note.textContent = '';
          refresh();
          hooks.report(error);
        },
      );
  };
  const actions = document.createElement('div');
  actions.className = 'right-audio-actions';
  actions.append(preview, save);
  elements.push(actions, note);

  function refresh() {
    const empty = !draft.text.trim();
    const chosen = voiceOf();
    count.textContent = t('tts.count', {
      count: formatNumber(draft.text.length),
      max: formatNumber(MAX_TTS_TEXT),
    });
    preview.disabled = empty || !chosen;
    const canSave = !!chosen?.provider.canSave;
    save.disabled =
      busy ||
      empty ||
      !canSave ||
      (ttsState.saved !== null && same(ttsState.saved, draft));
    if (!busy)
      note.textContent = chosen && !canSave ? t('tts.previewOnlyHint') : '';
    banner.hidden = ttsState.saved === null || same(ttsState.saved, draft);
  }
  refresh();
  return elements;
}

function labelled(label: string, ...controls: HTMLElement[]) {
  const wrap = document.createElement('label');
  wrap.className = 'tts-field';
  const span = document.createElement('span');
  span.className = 'tts-label';
  span.textContent = label;
  wrap.append(span, ...controls);
  return wrap;
}
