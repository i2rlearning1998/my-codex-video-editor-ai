/** Toast notifications: info/success/warning/error, auto-dismiss with manual close.
 *  Purely presentational; does not replace the existing #status live region. */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

let container: HTMLElement | null = null;
function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-stack';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Notifications');
  document.body.append(container);
  return container;
}

export function showToast(
  text: string,
  kind: ToastKind = 'info',
  durationMs = 4000,
): () => void {
  const stack = ensureContainer();
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  item.innerHTML = `<span class="toast-text"></span><button type="button" class="toast-close" aria-label="Dismiss notification">&times;</button>`;
  item.querySelector('.toast-text')!.textContent = text;
  const remove = () => {
    item.classList.add('toast-leaving');
    setTimeout(() => item.remove(), 160);
  };
  item.querySelector('.toast-close')!.addEventListener('click', remove);
  stack.append(item);
  const timer = durationMs > 0 ? setTimeout(remove, durationMs) : undefined;
  return () => {
    clearTimeout(timer);
    remove();
  };
}
