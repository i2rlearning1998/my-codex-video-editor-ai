// FX10: the Cloud storage panel (master switch, one switch per group with
// its size, a status line) and the "Save to your cloud?" dialog the Back
// button opens (docs/EDITOR-OWNERSHIP.md).
import { t } from '../i18n';
import {
  SYNC_GROUPS,
  formatBytes,
  type CloudSync,
  type SyncGroup,
} from '../sync/cloud-sync';
import { escapeHtml, openModal } from './components/modal';

export function openCloudDialog(sync: CloudSync): void {
  let off = () => {};
  const handle = openModal({
    titleText: escapeHtml(t('cloud.title')),
    bodyHtml: '<div class="cloud-panel" data-role="cloud-panel"></div>',
    onClose: () => off(),
  });
  handle.root.classList.add('cloud-dialog');
  const host = handle.root.querySelector<HTMLElement>('.cloud-panel')!;
  const row = (
    id: string,
    label: string,
    hint: string,
    checked: boolean,
    toggle: (value: boolean) => void,
    disabled = false,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'switch-row cloud-row';
    button.dataset.role = id;
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(checked));
    button.disabled = disabled;
    button.innerHTML = `<span class="cloud-row-text"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></span><span class="switch" aria-hidden="true"></span>`;
    button.onclick = () => toggle(!checked);
    return button;
  };
  const render = async () => {
    const settings = sync.settings();
    const sizes = await sync.sizes();
    host.replaceChildren();
    host.append(
      row(
        'cloud-master',
        t('cloud.master'),
        t('cloud.masterHint'),
        settings.on,
        (value) => void sync.setOn(value),
      ),
    );
    const groups = document.createElement('div');
    groups.className = 'cloud-groups';
    for (const group of SYNC_GROUPS as readonly SyncGroup[]) {
      const size = sizes[group];
      groups.append(
        row(
          `cloud-group-${group}`,
          t(`cloud.group.${group}`),
          `${t('cloud.count', { count: String(size.count) })} · ${formatBytes(size.bytes)}`,
          settings.groups[group],
          (value) => void sync.setGroup(group, value),
        ),
      );
    }
    host.append(groups);
    const status = document.createElement('p');
    status.className = 'cloud-status';
    status.dataset.role = 'cloud-status';
    status.textContent = t(`cloud.status.${sync.status()}`);
    host.append(status);
  };
  void render();
  off = sync.onChange(() => void render());
}

/** The Back button's dialog. Resolves with what the person chose. */
export function openExitDialog(
  sync: CloudSync,
): Promise<'save' | 'leave' | 'stay'> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value: 'save' | 'leave' | 'stay') => {
      if (answered) return;
      answered = true;
      resolve(value);
      handle.close();
    };
    const handle = openModal({
      titleText: escapeHtml(t('cloud.exit.title')),
      bodyHtml: `<p>${escapeHtml(t('cloud.exit.body'))}</p>${
        sync.connected()
          ? ''
          : `<p class="cloud-exit-note">${escapeHtml(t('cloud.exit.noAccount'))}</p>`
      }<div class="cloud-exit-buttons">
        <button type="button" class="button primary" data-role="cloud-exit-save">${escapeHtml(t('cloud.exit.save'))}</button>
        <button type="button" class="button" data-role="cloud-exit-leave">${escapeHtml(t('cloud.exit.leave'))}</button>
        <button type="button" class="button" data-role="cloud-exit-stay">${escapeHtml(t('cloud.exit.stay'))}</button>
      </div>`,
      onClose: () => {
        if (!answered) {
          answered = true;
          resolve('stay');
        }
      },
    });
    const bind = (role: string, value: 'save' | 'leave' | 'stay') => {
      handle.root.querySelector<HTMLButtonElement>(
        `[data-role="${role}"]`,
      )!.onclick = () => answer(value);
    };
    bind('cloud-exit-save', 'save');
    bind('cloud-exit-leave', 'leave');
    bind('cloud-exit-stay', 'stay');
  });
}
