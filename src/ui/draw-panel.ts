// SHP-018 Draw panel: brush choice, size, color and opacity. It only changes
// transient session state; strokes are committed by the canvas Draw tool.
import { formatNumber, t } from '../i18n';
import { BRUSHES, MAX_BRUSH, MIN_BRUSH } from '../render/drawing';
import { iconSvg } from './icons';
import type { EditorSession } from './session';

export function mountDrawPanel(
  panel: HTMLElement,
  session: EditorSession,
  report: (error: unknown) => void,
) {
  panel.innerHTML = `
    <h3 class="draw-title">${t('draw.title')}</h3>
    <p class="draw-hint">${t('draw.hint')}</p>
    <div class="draw-brushes" role="radiogroup" aria-label="${t('draw.brush')}">
      ${BRUSHES.map(
        (brush) =>
          `<button type="button" role="radio" data-brush="${brush}" aria-checked="false" title="${t(`draw.${brush}`)}">${iconSvg(brush === 'marker' ? 'brush' : brush)}<span>${t(`draw.${brush}`)}</span></button>`,
      ).join('')}
    </div>
    <label class="draw-field" for="draw-size"><span>${t('draw.size')}</span>
      <input id="draw-size" type="range" min="${MIN_BRUSH}" max="${MAX_BRUSH}" step="1" />
      <input id="draw-size-value" type="number" min="${MIN_BRUSH}" max="${MAX_BRUSH}" step="1" aria-label="${t('draw.size')}" />
    </label>
    <label class="draw-field" for="draw-color"><span>${t('draw.color')}</span>
      <input id="draw-color" type="color" />
    </label>
    <label class="draw-field" for="draw-opacity"><span>${t('draw.opacity')}</span>
      <input id="draw-opacity" type="range" min="0" max="100" step="1" />
      <output id="draw-opacity-value" for="draw-opacity"></output>
    </label>
    <button type="button" class="button" id="draw-exit">${t('draw.exit')}</button>`;
  const find = <T extends HTMLElement>(id: string) =>
    panel.querySelector<T>(`#${id}`)!;
  const size = find<HTMLInputElement>('draw-size');
  const sizeValue = find<HTMLInputElement>('draw-size-value');
  const color = find<HTMLInputElement>('draw-color');
  const opacity = find<HTMLInputElement>('draw-opacity');
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
      sync();
    }
  };
  for (const button of panel.querySelectorAll<HTMLButtonElement>(
    '[data-brush]',
  ))
    button.onclick = () =>
      safely(() =>
        session.setDrawBrush(button.dataset.brush as (typeof BRUSHES)[number]),
      );
  const setSize = (value: string) =>
    safely(() =>
      session.setDrawStyle({
        size: Math.round(
          Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Number(value) || MIN_BRUSH)),
        ),
      }),
    );
  size.oninput = () => setSize(size.value);
  sizeValue.onchange = () => setSize(sizeValue.value);
  color.oninput = () =>
    safely(() => session.setDrawStyle({ color: color.value }));
  opacity.oninput = () =>
    safely(() =>
      session.setDrawStyle({ opacity: Number(opacity.value) / 100 }),
    );
  find<HTMLButtonElement>('draw-exit').onclick = () =>
    session.setDrawBrush(null);
  const sync = () => {
    const style = session.drawStyle;
    for (const button of panel.querySelectorAll<HTMLElement>('[data-brush]'))
      button.setAttribute(
        'aria-checked',
        String(button.dataset.brush === session.drawBrush),
      );
    if (document.activeElement !== size) size.value = String(style.size);
    if (document.activeElement !== sizeValue)
      sizeValue.value = String(style.size);
    color.value = style.color;
    opacity.value = String(Math.round(style.opacity * 100));
    find('draw-opacity-value').textContent = t('draw.percent', {
      value: formatNumber(Math.round(style.opacity * 100)),
    });
    find<HTMLButtonElement>('draw-exit').disabled = !session.drawBrush;
  };
  sync();
  return { sync };
}
