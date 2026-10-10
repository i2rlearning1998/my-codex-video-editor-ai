/** Minimal modal dialog: focus trap, Esc to close, backdrop click to close (unless persistent),
 *  returns focus to the element that had focus before opening. No framework dependency.
 *  Participates in the app-wide overlay stack (temporary-overlay.ts) so a single global
 *  Escape handler can close whichever overlay — modal, palette, or shortcut sheet — is on top. */
import { registerExternalOverlay } from '../temporary-overlay';

export interface ModalHandle {
  close: () => void;
  root: HTMLElement;
}
export interface ModalOptions {
  titleText: string;
  bodyHtml?: string;
  bodyBuilder?: (body: HTMLElement) => void;
  persistent?: boolean;
  labelledBy?: string;
  onClose?: () => void;
}

let openCount = 0;

export function openModal(options: ModalOptions): ModalHandle {
  const trigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `modal-title-${++openCount}`;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `
    <div class="modal-header">
      <h2 id="${titleId}">${options.titleText}</h2>
      <button type="button" class="modal-close" aria-label="Close dialog">&times;</button>
    </div>
    <div class="modal-body">${options.bodyHtml ?? ''}</div>`;
  backdrop.append(dialog);
  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
  options.bodyBuilder?.(dialog.querySelector('.modal-body')!);

  const focusables = () =>
    [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    backdrop.remove();
    document.body.style.overflow = '';
    options.onClose?.();
    trigger?.focus({ preventScroll: true });
  };
  const unregister = registerExternalOverlay(() => {
    // A persistent modal still swallows Escape (via closeTopOverlay's return value)
    // but does not actually close, preserving the old persistent-modal contract.
    if (!options.persistent) close();
  });

  dialog.querySelector('.modal-close')!.addEventListener('click', close);
  if (!options.persistent)
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
  // Escape is handled by the global shortcut dispatcher (commands/shortcuts.ts) via
  // closeTopOverlay(), which calls close() above through registerExternalOverlay. Only the
  // focus trap (Tab) needs handling locally here.
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  dialog.addEventListener('keydown', keydown);
  requestAnimationFrame(() => {
    (focusables()[0] ?? dialog).focus({ preventScroll: true });
  });

  const originalClose = close;
  return {
    root: dialog,
    close: () => {
      dialog.removeEventListener('keydown', keydown);
      originalClose();
    },
  };
}

/** Promise-based confirm dialog, replacing window.confirm for consistent styling and testability. */
export function confirmDialog(
  message: string,
  options: {
    titleText?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const handle = openModal({
      titleText: options.titleText ?? 'Please confirm',
      bodyHtml: `<p class="modal-message">${message}</p>
        <div class="modal-actions">
          <button type="button" class="button" data-role="cancel">${options.cancelLabel ?? 'Cancel'}</button>
          <button type="button" class="button ${options.danger ? 'danger' : 'primary'}" data-role="confirm">${options.confirmLabel ?? 'Confirm'}</button>
        </div>`,
      onClose: () => settle(false),
    });
    handle.root
      .querySelector('[data-role="cancel"]')!
      .addEventListener('click', () => {
        settle(false);
        handle.close();
      });
    handle.root
      .querySelector('[data-role="confirm"]')!
      .addEventListener('click', () => {
        settle(true);
        handle.close();
      });
  });
}

/** I1.7: a one-field text dialog. Resolves to the trimmed text, or null when
 *  cancelled or left empty. Enter confirms, Escape cancels. */
export function promptDialog(
  titleText: string,
  value: string,
  options: {
    label: string;
    confirmLabel: string;
    cancelLabel: string;
    maxLength?: number;
  },
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: string | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let input!: HTMLInputElement;
    const handle = openModal({
      titleText: escapeHtml(titleText),
      onClose: () => settle(null),
      bodyBuilder: (body) => {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'modal-input';
        input.dataset.role = 'prompt-input';
        input.value = value;
        input.maxLength = options.maxLength ?? 256;
        input.setAttribute('aria-label', options.label);
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button';
        cancel.dataset.role = 'cancel';
        cancel.textContent = options.cancelLabel;
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'button primary';
        ok.dataset.role = 'confirm';
        ok.textContent = options.confirmLabel;
        actions.append(cancel, ok);
        body.append(input, actions);
        const confirm = () => {
          const text = input.value.trim();
          settle(text ? text : null);
          handle.close();
        };
        cancel.onclick = () => handle.close();
        ok.onclick = confirm;
        input.onkeydown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            confirm();
          }
        };
      },
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      }),
    );
  });
}

export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}
