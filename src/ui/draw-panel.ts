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
import { documentColors } from './palette';
import type { EditorSession } from './session';

/**
 * A drawn pen for the gallery (Canva's Draw shows each pen as its own
 * picture, not an icon): a barrel and a tip shaped like that pen's mark.
 */
const penSvg = (brush: DrawMode, color: string) => {
  const tip =
    brush === 'pen'
      ? '<path d="M16 8l-5 20h10z" fill="#d6d9de"/><path d="M16 4l-2 6h4z" fill="CURRENT"/>'
      : brush === 'marker'
        ? '<path d="M10 30l2-14h8l2 14z" fill="#d6d9de"/><path d="M12 16l2-8h4l2 8z" fill="CURRENT"/>'
        : brush === 'highlighter'
          ? '<path d="M9 30l1-12h12l1 12z" fill="#d6d9de"/><path d="M10 18l2-9h8l2 9z" fill="CURRENT" fill-opacity=".75"/>'
          : brush === 'glow'
            ? '<path d="M11 30l1-13h8l1 13z" fill="#d6d9de"/><path d="M12 17l2-8h4l2 8z" fill="CURRENT"/><circle cx="16" cy="8" r="6" fill="CURRENT" fill-opacity=".25"/>'
            : '<path d="M9 30V16h14v14z" fill="#f6b9c4"/><path d="M9 16h14v6H9z" fill="#e8e8ee"/>';
  return `<svg viewBox="0 0 32 48" width="32" height="48" aria-hidden="true"><g transform="translate(0 10)">${tip.replaceAll('CURRENT', color)}<rect x="11" y="30" width="10" height="14" rx="2" fill="#8a8f99"/></g></svg>`;
};
const BRUSH_COLOR: Record<DrawMode, string> = {
  pen: '#2f6bff',
  marker: '#ff5a6a',
  highlighter: '#ffe04a',
  glow: '#7af0ff',
  eraser: '#f6b9c4',
};
export const DRAW_SWATCHES = [
  '#000000',
  '#ffffff',
  '#ff3b30',
  '#ff9500',
  '#ffcc00',
  '#34c759',
  '#0a84ff',
  '#af52de',
] as const;

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
    <div class="draw-brushes" role="radiogroup" aria-label="${t('draw.brush')}">
      ${DRAW_MODES.map(
        (brush) =>
          `<button type="button" role="radio" data-brush="${brush}" aria-checked="false" title="${t(`draw.${brush}`)}">${penSvg(brush, BRUSH_COLOR[brush])}<span>${t(`draw.${brush}`)}</span></button>`,
      ).join('')}
    </div>
    <div class="draw-swatches" role="group" aria-label="${t('draw.color')}">
      ${DRAW_SWATCHES.map((color) => `<button type="button" class="draw-swatch" data-swatch="${color}" style="background:${color}" aria-label="${color}"></button>`).join('')}
    </div>
    <div class="draw-settings"></div>
    <button type="button" class="button" id="draw-exit">${t('draw.exit')}</button>`;
  for (const swatch of panel.querySelectorAll<HTMLButtonElement>(
    '[data-swatch]',
  ))
    swatch.onclick = () =>
      safely(() => session.setDrawStyle({ color: swatch.dataset.swatch! }));
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
        label: t('draw.transparency'),
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
