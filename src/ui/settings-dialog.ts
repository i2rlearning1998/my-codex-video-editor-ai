// FINAL2 U1: Settings. General (animations, Q5), Appearance (accent colour),
// Stock & API keys, and Offline voice & captions. Keys stay in this browser
// (src/providers/keys.ts); nothing here is a project edit or an undo step.
import { t } from '../i18n';
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
import { openModal, type ModalHandle } from './components/modal';
import {
  MOTION_SETTINGS,
  applyMotion,
  readMotion,
  systemReducesMotion,
} from './motion';
import { accentChoices, setAccent } from './accent';
import { stockProviders, voiceServices, speechRegistry } from './services';
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

/** Voice services whose key can be checked with a free list request. */
const LISTABLE = new Set(['google-cloud-tts', 'elevenlabs', 'minimax']);

export type KeyTestOutcome =
  'ok' | 'invalid' | 'rate' | 'network' | 'missing' | 'later';
export function testOutcomeText(outcome: KeyTestOutcome, retryAt?: number) {
  if (outcome === 'rate' && retryAt) {
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    return t('settings.keys.result.rateIn', { seconds });
  }
  return t(`settings.keys.result.${outcome}`);
}
const fromCode = (code: string): KeyTestOutcome =>
  code === 'KEY_INVALID'
    ? 'invalid'
    : code === 'KEY_MISSING'
      ? 'missing'
      : code === 'RATE_LIMITED'
        ? 'rate'
        : 'network';

async function runTest(
  provider: Provider | SpeechProvider,
): Promise<{ outcome: KeyTestOutcome; retryAt?: number }> {
  if (!provider.keyFields.every((f) => getKey(provider.id, f.id)))
    return { outcome: 'missing' };
  if ('kinds' in provider) {
    const result = await testKey(provider);
    if (result.status === 'ok') return { outcome: 'ok' };
    return {
      outcome: fromCode(result.code),
      ...(result.retryAt ? { retryAt: result.retryAt } : {}),
    };
  }
  if (LISTABLE.has(provider.id) && 'listVoices' in provider) {
    try {
      await provider.listVoices();
      return { outcome: 'ok' };
    } catch (error) {
      if (error instanceof ProviderError)
        return {
          outcome: fromCode(error.code),
          ...(error.retryAt ? { retryAt: error.retryAt } : {}),
        };
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
  const sync = () => {
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
      const { outcome, retryAt } = await runTest(provider);
      result.dataset.outcome = outcome;
      result.textContent = testOutcomeText(outcome, retryAt);
    } finally {
      testButton.disabled = false;
    }
  };
  sync();
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

/** Opens Settings, optionally on one tab (a "fix it" button elsewhere). */
export function openSettings(tab: SettingsTab = 'general'): ModalHandle {
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
  const renderEngines = () => {
    engines.innerHTML = localEngines(speechRegistry())
      .views()
      .map(engineRow)
      .join('');
    for (const button of engines.querySelectorAll<HTMLButtonElement>(
      '[data-engine-action]',
    ))
      button.onclick = () => {
        const id =
          button.closest<HTMLElement>('[data-engine]')!.dataset.engine!;
        localEngines(speechRegistry()).act(
          id,
          button.dataset.engineAction as 'download' | 'cancel' | 'remove',
        );
      };
  };
  unsubscribe = localEngines(speechRegistry()).subscribe(renderEngines);
  renderEngines();

  root.querySelector<HTMLButtonElement>('#settings-done')!.onclick = () =>
    handle.close();
  showTab(tab);
  root
    .querySelector<HTMLElement>(`[data-settings-tab="${tab}"]`)
    ?.focus({ preventScroll: true });
  return handle;
}
