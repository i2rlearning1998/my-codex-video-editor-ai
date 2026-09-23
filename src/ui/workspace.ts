import type { EditorSession } from './session';
import { iconSvg } from './icons';

/** Small transient panel sizing, not a docking or document-layout model. */
export function mountWorkspace(
  shell: HTMLElement,
  session: EditorSession,
  resize: () => void,
) {
  let left = 224,
    right = 258,
    height = 230;
  let leftClosed = window.innerWidth < 900,
    rightClosed = window.innerWidth < 1100;
  const bar = shell.querySelector('.topbar')!;
  const controls = document.createElement('div');
  controls.className = 'workspace-controls';
  controls.innerHTML = `<button type="button" class="icon-button" data-panel="left" aria-label="Toggle library" title="Toggle library">${iconSvg('panelLeft')}</button><button type="button" class="icon-button" data-panel="right" aria-label="Toggle inspector" title="Toggle inspector">${iconSvg('panelRight')}</button>`;
  (bar.querySelector('#menu-trigger') ?? bar.firstElementChild)!.after(
    controls,
  );
  const paint = () => {
    shell.style.setProperty('--left-panel', `${leftClosed ? 0 : left}px`);
    shell.style.setProperty('--right-panel', `${rightClosed ? 0 : right}px`);
    shell.style.setProperty(
      '--timeline-height',
      `${Math.min(height, Math.max(100, window.innerHeight * 0.65))}px`,
    );
    shell.classList.toggle('library-collapsed', leftClosed);
    shell.classList.toggle('inspector-collapsed', rightClosed);
    resize();
  };
  controls.onclick = (event) => {
    const side = (event.target as HTMLElement).dataset.panel;
    if (side === 'left') leftClosed = !leftClosed;
    if (side === 'right') rightClosed = !rightClosed;
    paint();
  };
  const disposers: (() => void)[] = [];
  for (const [selector, axis] of [
    ['.library', 'left'],
    ['.inspector', 'right'],
    ['.timeline', 'height'],
  ] as const) {
    const handle = document.createElement('div');
    handle.className = `panel-resizer ${axis}`;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute(
      'aria-label',
      `Resize ${axis === 'height' ? 'timeline' : axis + ' panel'}`,
    );
    handle.setAttribute(
      'aria-orientation',
      axis === 'height' ? 'horizontal' : 'vertical',
    );
    shell.querySelector(selector)!.append(handle);
    let gesture: {
      id: number;
      x: number;
      y: number;
      left: number;
      right: number;
      height: number;
    } | null = null;
    const release = () => {
      const id = gesture?.id;
      gesture = null;
      if (id !== undefined && handle.hasPointerCapture(id))
        handle.releasePointerCapture(id);
    };
    const cancel = () => {
      if (gesture) {
        left = gesture.left;
        right = gesture.right;
        height = gesture.height;
        release();
        paint();
      }
    };
    const apply = (delta: number) => {
      if (axis === 'left')
        left = Math.max(160, Math.min(360, (gesture?.left ?? left) + delta));
      else if (axis === 'right')
        right = Math.max(190, Math.min(380, (gesture?.right ?? right) - delta));
      else
        height = Math.max(
          110,
          Math.min(
            window.innerHeight * 0.65,
            (gesture?.height ?? height) - delta,
          ),
        );
      paint();
    };
    handle.onpointerdown = (event) => {
      if (event.button !== 0 || gesture) return;
      session.setPlaying(false);
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left,
        right,
        height,
      };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        cancel();
        return;
      }
      event.preventDefault();
    };
    handle.onpointermove = (event) => {
      if (event.pointerId !== gesture?.id) return;
      const delta =
        axis === 'height'
          ? event.clientY - gesture.y
          : event.clientX - gesture.x;
      if (!Number.isFinite(delta)) {
        cancel();
        return;
      }
      apply(delta);
    };
    handle.onpointerup = (event) => {
      if (event.pointerId === gesture?.id) release();
    };
    handle.onpointercancel = cancel;
    handle.onlostpointercapture = cancel;
    handle.onkeydown = (event) => {
      if (event.key === 'Escape') cancel();
      else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        apply(['ArrowLeft', 'ArrowUp'].includes(event.key) ? -10 : 10);
      }
    };
    window.addEventListener('blur', cancel);
    disposers.push(() => {
      cancel();
      window.removeEventListener('blur', cancel);
      handle.remove();
    });
  }
  const onWindowResize = () => {
    if (window.innerWidth < 700) {
      leftClosed = true;
      rightClosed = true;
    }
    paint();
  };
  window.addEventListener('resize', onWindowResize);
  paint();
  return () => {
    disposers.forEach((fn) => fn());
    window.removeEventListener('resize', onWindowResize);
    controls.remove();
  };
}
