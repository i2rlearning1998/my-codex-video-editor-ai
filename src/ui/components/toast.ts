/** Toast notifications: info/success/warning/error, auto-dismiss with manual close.
 *  Purely presentational; does not replace the existing #status live region.
 *  H2: an optional action button (for example Undo) runs and dismisses. */
import { t } from '../../i18n';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

let container: HTMLElement | null = null;
function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-stack';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', t('toast.region'));
  document.body.append(container);
  return container;
}

/** V2 (B6): a toast is always a plain sentence. Raw JSON (a validation
 *  report) shows its first message, or a general sentence. */
export function plainMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const message = (first as { message?: unknown } | undefined)?.message;
    if (
      typeof message === 'string' &&
      message.trim() &&
      !/^[[{]/.test(message.trim())
    )
      return message.trim();
  } catch {
    // Not JSON after all: fall through to the general sentence.
  }
  return t('error.generic');
}

export function showToast(
  text: string,
  kind: ToastKind = 'info',
  durationMs = 4000,
  action?: ToastAction,
): () => void {
  const stack = ensureContainer();
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const label = document.createElement('span');
  label.className = 'toast-text';
  label.textContent = plainMessage(text);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', t('toast.dismiss'));
  close.textContent = '×';
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    item.classList.add('toast-leaving');
    setTimeout(() => item.remove(), 160);
  };
  item.append(label);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      remove();
      action.run();
    });
    item.append(button);
  }
  item.append(close);
  close.addEventListener('click', remove);
  stack.append(item);
  const timer = durationMs > 0 ? setTimeout(remove, durationMs) : undefined;
  return () => {
    clearTimeout(timer);
    remove();
  };
}
