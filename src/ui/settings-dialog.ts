// FINAL2 U1: Settings. General (animations, Q5), Appearance (accent colour),
// Stock & API keys, and Offline voice & captions. Keys stay in this browser
// (src/providers/keys.ts); nothing here is a project edit or an undo step.
import { t } from '../i18n';
import { setTextSpellcheck, textSpellcheck } from './feature-flags';
import {
  DARK_ACCENTS,
  LIGHT_ACCENTS,
  type AccentPalette,
  type AppearanceMode,
} from '../appearance';
import {
  getKey,
  setKey,
  clearKey,
  maskKey,
  testKey,
  ProviderError,
  type Provider,
} from '../providers';
import type { SpeechProvider } from '../speech';
import { diagnosticsButton } from './diagnostics';
import { longTaskFacts, watchLongTasks } from './long-tasks';
import { whisperSelfTest } from '../speech/whisper-worker-client';
import { DEFAULT_MODEL_HOST, modelHost, setModelHost } from '../speech/models';
import { classifyWhisperError, WhisperError } from '../speech/whisper';
import { encodeWav } from '../speech';
import { lastDownloadError } from './local-engines';
import { whisperRunner } from './services';
import { openModal, type ModalHandle } from './components/modal';
import {
  MOTION_SETTINGS,
  applyMotion,
  readMotion,
  systemReducesMotion,
} from './motion';
import { accentChoices, setAccent } from './accent';
import {
  stockProviders,
  voiceServices,
  speechRegistry,
  KEYS_CHANGED,
} from './services';
import { localEngines, type LocalEngineView } from './local-engines';

export type SettingsTab = 'general' | 'appearance' | 'keys' | 'offline';
const TABS: SettingsTab[] = ['general', 'appearance', 'keys', 'offline'];

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/** FIX1 F4: the last key-test failure per provider (diagnostics). */
export const lastKeyError = new Map<string, ProviderError>();
/** Voice services whose key can be checked with a free list request. */
const LISTABLE = new Set(['google-cloud-tts', 'elevenlabs', 'minimax']);

export type KeyTestOutcome =
  | 'ok'
  | 'invalid'
  | 'rate'
  | 'network'
  | 'missing'
  | 'later'
  // FIX1 F2: the truthful failure classes.
  | 'offline'
  | 'timeout'
  | 'http'
  | 'blocked';
export function testOutcomeText(
  outcome: KeyTestOutcome,
  retryAt?: number,
  status?: number,
) {
  if (outcome === 'rate' && retryAt) {
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    return t('settings.keys.result.rateIn', { seconds });
  }
  return t(`settings.keys.result.${outcome}`, { status: status ?? '' });
}
const fromCode = (code: string): KeyTestOutcome =>
  code === 'KEY_INVALID'
    ? 'invalid'
    : code === 'KEY_MISSING'
      ? 'missing'
      : code === 'RATE_LIMITED'
        ? 'rate'
        : code === 'OFFLINE'
          ? 'offline'
          : code === 'TIMEOUT'
            ? 'timeout'
            : code === 'HTTP'
              ? 'http'
              : code === 'CORS_BLOCKED'
                ? 'blocked'
                : 'network';

async function runTest(
  provider: Provider | SpeechProvider,
): Promise<{ outcome: KeyTestOutcome; retryAt?: number; status?: number }> {
  if (!provider.keyFields.every((f) => getKey(provider.id, f.id)))
    return { outcome: 'missing' };
  if ('kinds' in provider) {
    const result = await testKey(provider);
    if (result.status === 'ok') return { outcome: 'ok' };
    if (result.error) lastKeyError.set(provider.id, result.error);
    return {
      outcome: fromCode(result.code),
      ...(result.retryAt ? { retryAt: result.retryAt } : {}),
      ...(result.error?.status ? { status: result.error.status } : {}),
    };
  }
  if (LISTABLE.has(provider.id) && 'listVoices' in provider) {
    try {
      await provider.listVoices();
      return { outcome: 'ok' };
    } catch (error) {
      if (error instanceof ProviderError) {
        lastKeyError.set(provider.id, error);
        return {
          outcome: fromCode(error.code),
          ...(error.retryAt ? { retryAt: error.retryAt } : {}),
          ...(error.status ? { status: error.status } : {}),
        };
      }
      return { outcome: 'network' };
    }
  }
  return { outcome: 'later' };
}

function keyBlock(provider: Provider | SpeechProvider): string {
  const hint = esc(t(`settings.keys.hint.${provider.id}`));
  if (!provider.requiresKey || !provider.keyFields.length)
    return `<section class="key-block" data-provider="${provider.id}">
      <header class="key-block-head"><h4>${esc(provider.name)}</h4><span class="key-state" data-state="none">${t('settings.keys.noKey')}</span></header>
      <p class="settings-note">${hint}</p>
    </section>`;
  const fields = provider.keyFields
    .map(
      (field) => `<div class="key-field">
        <label class="key-label" for="key-${provider.id}-${field.id}">${esc(field.label)}</label>
        <div class="key-input-row">
          <input id="key-${provider.id}-${field.id}" class="key-input" data-field="${field.id}" type="${field.secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false" />
          ${field.secret ? `<button type="button" class="button ghost sm key-show" data-show="${field.id}" aria-pressed="false">${t('settings.keys.show')}</button>` : ''}
        </div>
      </div>`,
    )
    .join('');
  return `<section class="key-block" data-provider="${provider.id}">
    <header class="key-block-head"><h4>${esc(provider.name)}</h4><span class="key-state"></span></header>
    <p class="settings-note">${hint}</p>
    ${fields}
    <div class="key-actions">
      <button type="button" class="button primary sm" data-key-action="save">${t('settings.keys.save')}</button>
      <button type="button" class="button secondary sm" data-key-action="test">${t('settings.keys.test')}</button>
      <button type="button" class="button ghost sm" data-key-action="clear">${t('settings.keys.clear')}</button>
    </div>
    <p class="key-result" role="status" aria-live="polite"></p>
  </section>`;
}

function bindKeyBlock(
  block: HTMLElement,
  provider: Provider | SpeechProvider,
): void {
  const inputs = [...block.querySelectorAll<HTMLInputElement>('.key-input')];
  if (!inputs.length) return;
  const state = block.querySelector<HTMLElement>('.key-state')!;
  const result = block.querySelector<HTMLElement>('.key-result')!;
  const sync = (changed = true) => {
    if (changed) document.dispatchEvent(new Event(KEYS_CHANGED));
    const saved = provider.keyFields.every((f) => getKey(provider.id, f.id));
    state.dataset.state = saved ? 'saved' : 'empty';
    state.textContent = t(
      saved ? 'settings.keys.saved' : 'settings.keys.notSet',
    );
    for (const input of inputs) {
      const value = getKey(provider.id, input.dataset.field!);
      input.placeholder = value
        ? maskKey(value)
        : t('settings.keys.placeholder');
    }
  };
  const save = () => {
    let changed = false;
    for (const input of inputs)
      if (input.value.trim()) {
        setKey(provider.id, input.dataset.field!, input.value);
        input.value = '';
        input.type = 'password';
        changed = true;
      }
    for (const button of block.querySelectorAll<HTMLElement>('.key-show'))
      button.setAttribute('aria-pressed', 'false');
    sync();
    return changed;
  };
  for (const button of block.querySelectorAll<HTMLButtonElement>('.key-show'))
    button.onclick = () => {
      const input = inputs.find(
        (i) => i.dataset.field === button.dataset.show,
      )!;
      const show = input.type === 'password';
      if (show && !input.value)
        input.value = getKey(provider.id, input.dataset.field!);
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.textContent = t(
        show ? 'settings.keys.hide' : 'settings.keys.show',
      );
    };
  for (const input of inputs)
    input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (save()) result.textContent = t('settings.keys.savedNote');
      }
    };
  block.querySelector<HTMLButtonElement>('[data-key-action="save"]')!.onclick =
    () => {
      result.dataset.outcome = '';
      result.textContent = save()
        ? t('settings.keys.savedNote')
        : t('settings.keys.typeFirst');
    };
  block.querySelector<HTMLButtonElement>('[data-key-action="clear"]')!.onclick =
    () => {
      for (const field of provider.keyFields) clearKey(provider.id, field.id);
      for (const input of inputs) input.value = '';
      result.dataset.outcome = '';
      result.textContent = t('settings.keys.cleared');
      sync();
    };
  const testButton = block.querySelector<HTMLButtonElement>(
    '[data-key-action="test"]',
  )!;
  testButton.onclick = async () => {
    save();
    testButton.disabled = true;
    result.dataset.outcome = 'busy';
    result.textContent = t('settings.keys.testing');
    try {
      const started = performance.now();
      const { outcome, retryAt, status } = await runTest(provider);
      result.dataset.outcome = outcome;
      result.textContent = testOutcomeText(outcome, retryAt, status);
      // FIX1 F4: a failed test can be reported (never with the key).
      if (!['ok', 'later', 'missing'].includes(outcome)) {
        const error = lastKeyError.get(provider.id);
        const took = performance.now() - started;
        result.append(
          ' ',
          diagnosticsButton(() => ({
            feature: 'Settings › Stock & API keys › Test',
            providerId: provider.id,
            step: 'key test',
            ...(status ? { status } : {}),
            timings: { test: took },
            error,
            extra: { outcome },
          })),
        );
      }
    } finally {
      testButton.disabled = false;
    }
  };
  sync(false);
}

function swatches(mode: AppearanceMode, list: readonly AccentPalette[]) {
  return `<div class="accent-group" data-accent-group="${mode}">
    <span class="settings-label" id="accent-${mode}-label">${t(`settings.accent.${mode}`)}</span>
    <div class="accent-swatches" role="radiogroup" aria-labelledby="accent-${mode}-label">
      ${list
        .map(
          (p) =>
            `<button type="button" role="radio" class="accent-swatch" data-accent-mode="${mode}" data-accent-id="${p.id}" aria-label="${esc(t(`settings.accent.name.${p.id}`))}" title="${esc(t(`settings.accent.name.${p.id}`))}" style="--swatch:${p.accent}"></button>`,
        )
        .join('')}
    </div>
  </div>`;
}

function engineRow(view: LocalEngineView): string {
  return `<section class="key-block offline-engine" data-engine="${view.id}">
    <header class="key-block-head"><h4>${esc(t(`settings.offline.${view.id}`))}</h4>
      <span class="key-state" data-state="${view.state}">${esc(view.label)}</span></header>
    <p class="settings-note">${esc(view.note)}</p>
    ${view.progress === undefined ? '' : `<progress class="engine-progress" max="1" value="${view.progress}"></progress>`}
    <div class="key-actions">
      ${view.actions.map((a) => `<button type="button" class="button ${a === 'download' ? 'primary' : 'ghost'} sm" data-engine-action="${a}">${t(`settings.offline.action.${a}`)}</button>`).join('')}
    </div>
  </section>`;
}

let open: ModalHandle | undefined;

/**
 * FIX1 F4: Offline captions › Run self-test. Downloads the model when
 * needed, starts it and runs one second of silence through the real runner,
 * then says which backend ran, how long the start took, and any error in
 * plain words (with Copy diagnostics). Silence giving no words is a pass.
 */
function bindSelfTest(section: HTMLElement) {
  const button = section.querySelector<HTMLButtonElement>(
    '[data-action="whisper-selftest"]',
  )!;
  const result = section.querySelector<HTMLElement>('.selftest-result')!;
  const backend = () =>
    'gpu' in navigator
      ? t('settings.selftest.backendWasmGpu')
      : t('settings.selftest.backendWasm');
  button.onclick = async () => {
    const runner = whisperRunner;
    if (!runner) return;
    button.disabled = true;
    result.dataset.state = 'busy';
    const started = performance.now();
    const steps: string[] = [];
    const stopWatching = watchLongTasks();
    try {
      if (!(await runner.isReady())) {
        result.textContent = t('settings.selftest.downloading');
        await localEngines(speechRegistry()).act('local-whisper', 'download');
        if (!(await runner.isReady()))
          throw (
            lastDownloadError.get('local-whisper') ??
            new WhisperError('not-downloaded', 'check')
          );
      }
      result.textContent = t('settings.selftest.loading');
      const silence = encodeWav({
        sampleRate: 16000,
        channels: [new Float32Array(16000)],
      });
      try {
        await runner.transcribe({
          blob: silence,
          lang: 'en',
          onProgress: (p) => steps.push(`${p.phase} ${p.completed}/${p.total}`),
        });
      } catch (error) {
        if (!(error instanceof WhisperError && error.kind === 'no-speech'))
          throw error;
      }
      stopWatching();
      result.dataset.state = 'ok';
      result.textContent = t('settings.selftest.ok', {
        backend: backend(),
        seconds: (
          (runner.lastLoadMs?.() ?? performance.now() - started) / 1000
        ).toFixed(1),
      });
    } catch (error) {
      const failure = classifyWhisperError(error, 'load');
      const longTasks = stopWatching();
      const worker = await whisperSelfTest();
      result.dataset.state = 'error';
      result.textContent = t('settings.selftest.failed', {
        why: t(`captions.fail.${failure.kind}`),
      });
      result.append(
        ' ',
        diagnosticsButton(() => ({
          feature: 'Offline captions self-test',
          providerId: 'local-whisper',
          step: failure.step,
          error: failure.cause ?? failure,
          timings: { total: performance.now() - started },
          extra: {
            failure: failure.kind,
            backend: backend(),
            steps: steps.join(', '),
            ...longTaskFacts(longTasks),
            ...Object.fromEntries(
              Object.entries(worker).map(([k, v]) => [`worker.${k}`, v]),
            ),
            modelHost: modelHost(),
          },
        })),
      );
    } finally {
      button.disabled = false;
    }
  };
}

/** FIX4 A6: Model source: where the offline model files are downloaded from. */
function bindModelSource(section: HTMLElement) {
  const input = section.querySelector<HTMLInputElement>('#model-source-input')!;
  const status = section.querySelector<HTMLElement>('#model-source-status')!;
  const show = () => {
    input.value = modelHost() === DEFAULT_MODEL_HOST ? '' : modelHost();
  };
  show();
  section.querySelector<HTMLButtonElement>(
    '[data-action="model-source-save"]',
  )!.onclick = () => {
    const ok = setModelHost(input.value);
    status.dataset.state = ok ? 'ok' : 'error';
    status.textContent = t(
      ok ? 'settings.modelSource.saved' : 'settings.modelSource.invalid',
    );
    if (ok) show();
  };
  section.querySelector<HTMLButtonElement>(
    '[data-action="model-source-reset"]',
  )!.onclick = () => {
    setModelHost('');
    show();
    status.dataset.state = 'ok';
    status.textContent = t('settings.modelSource.saved');
  };
}

/** Opens Settings, optionally on one tab (a "fix it" button elsewhere). */
export function openSettings(
  tab: SettingsTab = 'general',
  /** FIX1 F3: opens the keys tab at this provider's key. */
  provider?: string,
): ModalHandle {
  open?.close();
  const stock = stockProviders();
  const voices = voiceServices();
  let unsubscribe = () => {};
  const handle = openModal({
    titleText: t('settings.title'),
    onClose: () => {
      unsubscribe();
      if (open === handle) open = undefined;
    },
    bodyHtml: `
      <div class="settings-tabs" role="tablist" aria-label="${t('settings.title')}">
        ${TABS.map((id) => `<button type="button" role="tab" id="settings-tab-${id}" data-settings-tab="${id}" aria-controls="settings-pane-${id}">${t(`settings.tab.${id}`)}</button>`).join('')}
      </div>
      <div class="settings-pane" role="tabpanel" id="settings-pane-general" aria-labelledby="settings-tab-general">
        <div class="settings-row">
          <span class="settings-label" id="motion-label">${t('settings.motion')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="motion-label" id="motion-setting">
            ${MOTION_SETTINGS.map((value) => `<button type="button" role="radio" data-motion-value="${value}">${t(`settings.motion.${value}`)}</button>`).join('')}
          </div>
          <p class="settings-note" id="motion-system">${t('settings.motionSystem', { value: t(systemReducesMotion() ? 'settings.yes' : 'settings.no') })}</p>
        </div>
        <div class="settings-row">
          <button type="button" class="switch-row" id="text-spellcheck-setting" role="switch" aria-checked="${String(textSpellcheck())}"><span>${t('settings.spellcheck')}</span><span class="switch" aria-hidden="true"></span></button>
          <p class="settings-note">${t('settings.spellcheckNote')}</p>
        </div>
      </div>
      <div class="settings-pane" role="tabpanel" id="settings-pane-appearance" aria-labelledby="settings-tab-appearance">
        <div class="settings-row">
          <span class="settings-label">${t('settings.accent')}</span>
          <p class="settings-note">${t('settings.accent.note')}</p>
          ${swatches('dark', DARK_ACCENTS)}
          ${swatches('light', LIGHT_ACCENTS)}
          <div class="accent-preview" aria-hidden="true">
            <span class="accent-preview-button">${t('settings.accent.previewButton')}</span>
            <span class="accent-preview-chip">${t('settings.accent.previewChip')}</span>
          </div>
        </div>
      </div>
      <div class="settings-pane" role="tabpanel" id="settings-pane-keys" aria-labelledby="settings-tab-keys">
        <p class="settings-note settings-lead">${t('settings.keys.lead')}</p>
        <h3 class="settings-section">${t('settings.keys.stock')}</h3>
        ${stock.map(keyBlock).join('')}
        <h3 class="settings-section">${t('settings.keys.voice')}</h3>
        ${voices.map(keyBlock).join('')}
      </div>
      <div class="settings-pane" role="tabpanel" id="settings-pane-offline" aria-labelledby="settings-tab-offline">
        <p class="settings-note settings-lead">${t('settings.offline.lead')}</p>
        <div class="offline-engines"></div>
        <section class="key-block model-source" id="model-source">
          <header class="key-block-head"><h4>${t('settings.modelSource.title')}</h4></header>
          <p class="settings-note">${t('settings.modelSource.note')}</p>
          <input class="key-input" id="model-source-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="${DEFAULT_MODEL_HOST}" aria-label="${t('settings.modelSource.title')}" />
          <div class="key-actions">
            <button type="button" class="button secondary sm" data-action="model-source-save">${t('settings.modelSource.save')}</button>
            <button type="button" class="button ghost sm" data-action="model-source-reset">${t('settings.modelSource.reset')}</button>
          </div>
          <p class="selftest-result" id="model-source-status" role="status" aria-live="polite"></p>
        </section>
        <section class="key-block whisper-selftest" id="whisper-selftest">
          <header class="key-block-head"><h4>${t('settings.selftest.title')}</h4></header>
          <p class="settings-note">${t('settings.selftest.note')}</p>
          <div class="key-actions"><button type="button" class="button secondary sm" data-action="whisper-selftest">${t('settings.selftest.run')}</button></div>
          <p class="selftest-result" role="status" aria-live="polite"></p>
        </section>
      </div>
      <div class="modal-actions"><button type="button" class="button primary" id="settings-done">${t('creator.done')}</button></div>`,
  });
  open = handle;
  const root = handle.root;
  root.classList.add('settings-dialog');
  root.closest('.modal-dialog')?.classList.add('settings-dialog');

  const showTab = (id: SettingsTab) => {
    for (const button of root.querySelectorAll<HTMLElement>(
      '[data-settings-tab]',
    )) {
      const on = button.dataset.settingsTab === id;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
    }
    for (const pane of root.querySelectorAll<HTMLElement>('.settings-pane'))
      pane.hidden = pane.id !== `settings-pane-${id}`;
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-settings-tab]',
  ))
    button.onclick = () => showTab(button.dataset.settingsTab as SettingsTab);

  // FINAL3 T2: spell checking in the text editor (off by default).
  const spell = root.querySelector<HTMLButtonElement>(
    '#text-spellcheck-setting',
  )!;
  spell.onclick = () => {
    const next = !textSpellcheck();
    setTextSpellcheck(next);
    spell.setAttribute('aria-checked', String(next));
  };
  // General: animations.
  const syncMotion = () => {
    const current = readMotion();
    for (const button of root.querySelectorAll<HTMLElement>(
      '[data-motion-value]',
    ))
      button.setAttribute(
        'aria-checked',
        String(button.dataset.motionValue === current),
      );
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-motion-value]',
  ))
    button.onclick = () => {
      applyMotion(
        button.dataset.motionValue as (typeof MOTION_SETTINGS)[number],
      );
      syncMotion();
    };
  syncMotion();

  // Appearance: accent swatches, one choice per mode.
  const syncAccent = () => {
    const chosen = accentChoices();
    for (const button of root.querySelectorAll<HTMLElement>('[data-accent-id]'))
      button.setAttribute(
        'aria-checked',
        String(
          chosen[button.dataset.accentMode as AppearanceMode] ===
            button.dataset.accentId,
        ),
      );
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-accent-id]',
  ))
    button.onclick = () => {
      setAccent(
        button.dataset.accentMode as AppearanceMode,
        button.dataset.accentId!,
      );
      syncAccent();
    };
  syncAccent();

  // Keys.
  for (const provider of [...stock, ...voices]) {
    const block = root.querySelector<HTMLElement>(
      `.key-block[data-provider="${provider.id}"]`,
    );
    if (block) bindKeyBlock(block, provider);
  }

  // Offline engines.
  const engines = root.querySelector<HTMLElement>('.offline-engines')!;
  // A row is rebuilt only when its state or buttons change; progress
  // updates in place, so Cancel stays under the pointer.
  const renderEngines = () => {
    for (const view of localEngines(speechRegistry()).views()) {
      const key = `${view.state}:${view.actions.join(',')}`;
      let row = engines.querySelector<HTMLElement>(
        `[data-engine="${view.id}"]`,
      );
      if (row && row.dataset.key === key) {
        row.querySelector('.key-state')!.textContent = view.label;
        row.querySelector('.settings-note')!.textContent = view.note;
        const bar = row.querySelector<HTMLProgressElement>('.engine-progress');
        if (bar && view.progress !== undefined) bar.value = view.progress;
        continue;
      }
      const holder = document.createElement('div');
      holder.innerHTML = engineRow(view);
      const fresh = holder.firstElementChild as HTMLElement;
      fresh.dataset.key = key;
      for (const button of fresh.querySelectorAll<HTMLButtonElement>(
        '[data-engine-action]',
      ))
        button.onclick = () =>
          void localEngines(speechRegistry()).act(
            view.id,
            button.dataset.engineAction as 'download' | 'cancel' | 'remove',
          );
      if (row) row.replaceWith(fresh);
      else engines.append(fresh);
      row = fresh;
    }
  };
  unsubscribe = localEngines(speechRegistry()).subscribe(renderEngines);
  renderEngines();
  bindSelfTest(root.querySelector<HTMLElement>('#whisper-selftest')!);
  bindModelSource(root.querySelector<HTMLElement>('#model-source')!);

  root.querySelector<HTMLButtonElement>('#settings-done')!.onclick = () =>
    handle.close();
  showTab(tab);
  root
    .querySelector<HTMLElement>(`[data-settings-tab="${tab}"]`)
    ?.focus({ preventScroll: true });
  if (provider) {
    const block = handle.root.querySelector<HTMLElement>(
      `.key-block[data-provider="${CSS.escape(provider)}"]`,
    );
    block?.classList.add('key-block-focus');
    // After the modal's own first-frame focus.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        block?.scrollIntoView({ block: 'center' });
        block?.querySelector<HTMLInputElement>('.key-input')?.focus();
      }),
    );
  }
  return handle;
}
