// SHP-018 Draw panel: brush choice, size, colour and opacity. It only changes
// transient session state; strokes are committed by the canvas Draw tool.
// G4: five tools (Pen, Marker, Highlighter, Glow pen, Eraser); every brush
// keeps its own size, colour and opacity, each 1 to 100 with a number field,
// a slider and presets; the colour picker offers the design's colours, the
// eyedropper and the full picker. The panel is rebuilt only when the tool
// changes, so a field keeps focus while its value is edited.
import { t } from '../i18n';
import { DRAW_MODES, type DrawMode } from '../render/drawing';
import { createColorField } from './components/color-picker';
import { createNumberField, syncNumberField } from './components/number-field';
import { iconSvg } from './icons';
import { documentColors } from './palette';
import type { EditorSession } from './session';

const ICONS: Record<DrawMode, string> = {
  pen: 'pen',
  marker: 'brush',
  highlighter: 'highlighter',
  glow: 'glow',
  eraser: 'eraser',
};

export function mountDrawPanel(
  panel: HTMLElement,
  session: EditorSession,
  report: (error: unknown) => void,
) {
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  panel.innerHTML = `
    <h3 class="draw-title">${t('draw.title')}</h3>
    <p class="draw-hint">${t('draw.hint')}</p>
    <div class="draw-brushes" role="radiogroup" aria-label="${t('draw.brush')}">
      ${DRAW_MODES.map(
        (brush) =>
          `<button type="button" role="radio" data-brush="${brush}" aria-checked="false" title="${t(`draw.${brush}`)}">${iconSvg(ICONS[brush])}<span>${t(`draw.${brush}`)}</span></button>`,
      ).join('')}
    </div>
    <div class="draw-settings"></div>
    <button type="button" class="button" id="draw-exit">${t('draw.exit')}</button>`;
  const settings = panel.querySelector<HTMLElement>('.draw-settings')!;
  for (const button of panel.querySelectorAll<HTMLButtonElement>(
    '[data-brush]',
  ))
    button.onclick = () =>
      safely(() => session.setDrawBrush(button.dataset.brush as DrawMode));
  panel.querySelector<HTMLButtonElement>('#draw-exit')!.onclick = () =>
    session.setDrawBrush(null);
  /** The tool the settings were built for (undefined before the first). */
  let builtFor: DrawMode | null | undefined;
  const build = () => {
    const mode = session.drawBrush;
    const style = session.drawStyle;
    const erasing = mode === 'eraser';
    settings.replaceChildren(
      createNumberField({
        id: 'draw-size',
        label: t('draw.size'),
        value: style.size,
        unit: 'px',
        min: 1,
        max: 100,
        decimals: 0,
        slider: true,
        presets: [2, 4, 8, 16, 32, 64],
        onCommit: (size) => safely(() => session.setDrawStyle({ size })),
        onPreview: (size) => safely(() => session.setDrawStyle({ size })),
      }),
      createColorField({
        id: 'draw-color',
        label: t('draw.color'),
        value: style.color,
        documentColors: () => documentColors(session.source.composition),
        onCommit: (color) => safely(() => session.setDrawStyle({ color })),
        onPreview: (color) => safely(() => session.setDrawStyle({ color })),
      }),
      createNumberField({
        id: 'draw-opacity',
        label: t('draw.opacity'),
        value: Math.round(style.opacity * 100),
        unit: '%',
        min: 1,
        max: 100,
        decimals: 0,
        slider: true,
        presets: [25, 40, 60, 80, 100],
        onCommit: (value) =>
          safely(() => session.setDrawStyle({ opacity: value / 100 })),
        onPreview: (value) =>
          safely(() => session.setDrawStyle({ opacity: value / 100 })),
      }),
    );
    // The eraser uses its size only.
    settings.querySelector<HTMLButtonElement>('#draw-color')!.disabled =
      erasing;
    for (const id of ['draw-opacity', 'draw-opacity-more'])
      settings
        .querySelector<HTMLInputElement | HTMLButtonElement>(`#${id}`)
        ?.toggleAttribute('disabled', erasing);
  };
  const sync = () => {
    const style = session.drawStyle;
    for (const button of panel.querySelectorAll<HTMLElement>('[data-brush]'))
      button.setAttribute(
        'aria-checked',
        String(button.dataset.brush === session.drawBrush),
      );
    panel.querySelector<HTMLButtonElement>('#draw-exit')!.disabled =
      !session.drawBrush;
    if (builtFor !== session.drawBrush) {
      builtFor = session.drawBrush;
      build();
      return;
    }
    // Same tool: show the values without rebuilding (a field or the colour
    // picker may be in use).
    syncNumberField(settings, 'draw-size', style.size);
    syncNumberField(settings, 'draw-opacity', Math.round(style.opacity * 100));
  };
  sync();
  return { sync };
}
