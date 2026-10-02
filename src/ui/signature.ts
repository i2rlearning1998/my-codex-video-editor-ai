// H6: signatures (Canva's Draw > Signature). Type a name in a script-like
// face, draw it on a pad, or upload a picture of it. A typed or drawn
// signature can be kept in this browser (localStorage, never the project)
// and added again with one click. Each insert is one undo step.
import {
  createLayer,
  number,
  vector2,
  type EditorEngine,
  type Point2,
} from '../core';
import { t } from '../i18n';
import { formatStrokes, strokesGeometry } from '../render/drawing';
import { createColorField } from './components/color-picker';
import { DRAWING_DURATION } from './draw-tool';
import { iconSvg } from './icons';
import { addTopLevel } from './library-insert';
import type { EditorSession } from './session';
import type { SidePanels } from './side-panel';

export const SIGNATURE_FONTS = ['Georgia', 'Times New Roman', 'Trebuchet MS'];
export type SavedSignature =
  | { kind: 'text'; text: string; font: string; color: string }
  | { kind: 'draw'; strokes: Point2[][]; color: string };
const KEY = 'aive.signature';
const PAD = { width: 300, height: 120 };
const HEX = /^#[0-9a-fA-F]{6}$/;

export function loadSignature(): SavedSignature | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(KEY) ?? 'null',
    ) as SavedSignature | null;
    if (!value || !HEX.test(value.color)) return null;
    if (value.kind === 'text' && typeof value.text === 'string' && value.text)
      return value;
    if (
      value.kind === 'draw' &&
      Array.isArray(value.strokes) &&
      value.strokes.length
    )
      return value;
    return null;
  } catch {
    return null;
  }
}
function storeSignature(value: SavedSignature | null) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage may be blocked; the signature is still added.
  }
}
const plain = (type: 'string' | 'color', value: string) => ({
  type,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});

/** Adds a signature to the open scene at the playhead, one undo step. */
export function addSignature(
  engine: EditorEngine,
  session: EditorSession,
  signature: SavedSignature,
): string {
  session.setPlaying(false);
  const composition = session.source.composition;
  const { width: W, height: H } = composition;
  const name = t('signature.layerName');
  let layer;
  if (signature.kind === 'text') {
    const size = Math.round(H * 0.08);
    const width = W * 0.4,
      height = size * 1.5;
    layer = createLayer(crypto.randomUUID(), 'text', name, DRAWING_DURATION);
    layer.transform.position = vector2((W - width) / 2, (H - height) / 2);
    layer.properties = {
      width: number(width),
      height: number(height),
      text: plain('string', signature.text),
      fontSize: number(size),
      fill: plain('color', signature.color),
      fontFamily: plain('string', signature.font),
      fontStyle: plain('string', 'italic'),
      textAlign: plain('string', 'center'),
    } as never;
  } else {
    // The pad is 300 × 120; the signature is a third of the canvas wide.
    const scale = (W * 0.3) / PAD.width;
    const size = Math.max(2, 3 * scale);
    const strokes = signature.strokes.map((stroke) =>
      stroke.map(([x, y]): Point2 => [x * scale, y * scale]),
    );
    const box = strokesGeometry(strokes, size);
    layer = createLayer(crypto.randomUUID(), 'shape', name, DRAWING_DURATION);
    layer.transform.position = vector2(
      (W - box.width) / 2,
      (H - box.height) / 2,
    );
    layer.properties = {
      width: number(box.width),
      height: number(box.height),
      path: plain('string', formatStrokes(box.strokes)),
      brush: plain('string', 'pen'),
      stroke: plain('color', signature.color),
      strokeWidth: number(size),
    } as never;
  }
  engine.commands.transaction(
    'Add signature',
    addTopLevel(composition, layer, session.currentTime),
  );
  session.select(layer.id);
  return layer.id;
}

export function mountSignature(options: {
  host: HTMLElement;
  panels: SidePanels;
  engine: EditorEngine;
  session: EditorSession;
  report: (error: unknown) => void;
  /** Imports picked files as media and resolves with the new asset ids. */
  upload: (file: File) => Promise<void>;
}) {
  const { host, panels, engine, session, report } = options;
  const safely = (action: () => void | Promise<void>) => {
    try {
      const result = action();
      if (result instanceof Promise) result.catch(report);
    } catch (error) {
      report(error);
    }
  };
  const entry = document.createElement('section');
  entry.className = 'signature-entry';
  host.append(entry);
  const renderEntry = () => {
    const saved = loadSignature();
    entry.innerHTML = `<h3 class="draw-title">${t('signature.title')}</h3>`;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button';
    open.id = 'signature-open';
    open.innerHTML = `${iconSvg('signature', 16)}<span></span>`;
    open.querySelector('span')!.textContent = t('signature.add');
    open.onclick = () => openPanel();
    entry.append(open);
    if (saved) {
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'button primary';
      use.id = 'signature-use-saved';
      use.textContent = t('signature.useSaved');
      use.onclick = () =>
        safely(() => void addSignature(engine, session, saved));
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'button ghost';
      forget.id = 'signature-forget';
      forget.textContent = t('signature.forget');
      forget.onclick = () => {
        storeSignature(null);
        renderEntry();
      };
      entry.append(use, forget);
    }
  };
  let tab: 'type' | 'draw' | 'upload' = 'type';
  let typed = '';
  let font = SIGNATURE_FONTS[0]!;
  let color = '#1f2937';
  let strokes: Point2[][] = [];
  let save = true;
  const finish = (signature: SavedSignature) => {
    addSignature(engine, session, signature);
    if (save) storeSignature(signature);
    renderEntry();
    panels.close();
  };
  const build = () => {
    const wrap = document.createElement('div');
    wrap.className = 'tool-panel signature-panel';
    wrap.dataset.toolPanel = 'signature';
    const tabs = document.createElement('div');
    tabs.className = 'segmented';
    tabs.setAttribute('role', 'tablist');
    for (const id of ['type', 'draw', 'upload'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.signatureTab = id;
      button.setAttribute('aria-selected', String(tab === id));
      button.textContent = t(`signature.tab.${id}`);
      button.onclick = () => {
        tab = id;
        show();
      };
      tabs.append(button);
    }
    wrap.append(tabs);
    const colour = createColorField({
      id: 'signature-color',
      label: t('signature.color'),
      value: color,
      compact: true,
      onCommit: (next) => {
        color = next;
        show();
      },
    });
    const keep = document.createElement('label');
    keep.className = 'signature-save';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'signature-save';
    box.checked = save;
    box.onchange = () => (save = box.checked);
    keep.append(box, document.createTextNode(t('signature.save')));
    const addButton = (id: string, enabled: boolean, run: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary';
      button.id = id;
      button.textContent = t('signature.addToPage');
      button.disabled = !enabled;
      button.onclick = () => safely(run);
      return button;
    };
    if (tab === 'type') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'signature-text';
      input.maxLength = 60;
      input.placeholder = t('signature.typePlaceholder');
      input.setAttribute('aria-label', t('signature.typeLabel'));
      input.value = typed;
      const fonts = document.createElement('div');
      fonts.className = 'signature-fonts';
      fonts.setAttribute('role', 'radiogroup');
      fonts.setAttribute('aria-label', t('signature.style'));
      const add = addButton('signature-add', !!typed.trim(), () =>
        finish({ kind: 'text', text: typed.trim(), font, color }),
      );
      const paint = () => {
        fonts.replaceChildren(
          ...SIGNATURE_FONTS.map((name) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.setAttribute('role', 'radio');
            option.dataset.font = name;
            option.setAttribute('aria-checked', String(font === name));
            option.style.fontFamily = name;
            option.style.fontStyle = 'italic';
            option.style.color = color;
            option.textContent = typed.trim() || t('signature.sample');
            option.onclick = () => {
              font = name;
              paint();
            };
            return option;
          }),
        );
        add.disabled = !typed.trim();
      };
      input.oninput = () => {
        typed = input.value;
        paint();
      };
      paint();
      wrap.append(input, fonts, colour, keep, add);
      queueMicrotask(() => input.focus());
    } else if (tab === 'draw') {
      const svgNS = 'http://www.w3.org/2000/svg';
      const pad = document.createElementNS(svgNS, 'svg');
      pad.id = 'signature-pad';
      pad.setAttribute('viewBox', `0 0 ${PAD.width} ${PAD.height}`);
      pad.setAttribute('role', 'img');
      pad.setAttribute('aria-label', t('signature.padLabel'));
      pad.classList.add('signature-pad');
      const add = addButton('signature-add', strokes.length > 0, () =>
        finish({ kind: 'draw', strokes, color }),
      );
      const redraw = () => {
        pad.replaceChildren(
          ...strokes.map((stroke) => {
            const line = document.createElementNS(svgNS, 'polyline');
            line.setAttribute(
              'points',
              stroke.map(([x, y]) => `${x},${y}`).join(' '),
            );
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', '3');
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('stroke-linejoin', 'round');
            return line;
          }),
        );
        add.disabled = strokes.length === 0;
      };
      let current: Point2[] | null = null;
      const point = (event: PointerEvent): Point2 => {
        const rect = pad.getBoundingClientRect();
        return [
          Math.round(
            ((event.clientX - rect.left) / rect.width) * PAD.width * 10,
          ) / 10,
          Math.round(
            ((event.clientY - rect.top) / rect.height) * PAD.height * 10,
          ) / 10,
        ];
      };
      pad.addEventListener('pointerdown', (event) => {
        pad.setPointerCapture(event.pointerId);
        current = [point(event)];
        strokes = [...strokes, current];
        redraw();
      });
      pad.addEventListener('pointermove', (event) => {
        if (!current) return;
        current.push(point(event));
        redraw();
      });
      const end = () => {
        if (current && current.length < 2) strokes = strokes.slice(0, -1);
        current = null;
        redraw();
      };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'ghost';
      clear.id = 'signature-clear';
      clear.textContent = t('signature.clear');
      clear.onclick = () => {
        strokes = [];
        redraw();
      };
      redraw();
      wrap.append(pad, clear, colour, keep, add);
    } else {
      const hint = document.createElement('p');
      hint.className = 'tool-panel-hint';
      hint.textContent = t('signature.uploadHint');
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'signature-file';
      input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
      input.setAttribute('aria-label', t('signature.uploadLabel'));
      input.onchange = () =>
        safely(async () => {
          const file = input.files?.[0];
          if (!file) return;
          await options.upload(file);
          panels.close();
        });
      wrap.append(hint, input);
    }
    return wrap;
  };
  const show = () => panels.show('signature', t('signature.title'), build);
  const openPanel = () => show();
  renderEntry();
  return { open: openPanel };
}
