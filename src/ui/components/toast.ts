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
  label.textContent = text;
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
