// FINAL3 (Canva text Effects): the Effects side panel of a text. Style:
// None, Shadow, Lift, Hollow, Splice, Echo, Outline, Glow, Background,
// Glitch and Neon, each tile previewed with the real renderer; the chosen
// effect's sliders (Intensity, Direction, Transparency, Roundness, Spread)
// and colours, and Remove effect. Shape: None or Curve (−100 to 100). Every
// change is one undo step; preview and export draw the same effect.
import type { Command } from '../core';
import { t } from '../i18n';
import type { SceneLayer } from '../render/adapter';
import { layoutRich } from '../render/rich-text';
import { DEFAULT_TEXT_STYLE } from '../render/text-style';
import { canvasMeasureText } from '../render/canvas';
import {
  EFFECT_DEFAULTS,
  EFFECT_FIELDS,
  TEXT_EFFECTS,
  drawTextWithEffects,
  formatTextEffect,
  parseTextEffect,
  type TextEffect,
  type TextEffectType,
} from '../render/text-effects';
import { createColorField } from './components/color-picker';
import { createNumberField } from './components/number-field';
import { textPropertyCommand } from './text-box-commands';

export interface TextEffectsDeps {
  readonly compositionId: () => string;
  readonly layer: () => SceneLayer | null;
  readonly run: (label: string, commands: Command[]) => void;
  readonly refresh: () => void;
}

const stringOf = (layer: SceneLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'string' ? value.value : undefined;
};
/** A tile's preview: "Ag" drawn with the effect by the real renderer. */
function preview(effect: TextEffect | null, curve = 0): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 96;
  canvas.className = 'text-effect-preview';
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.fillStyle = '#f4f4f6';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const style = { ...DEFAULT_TEXT_STYLE, weight: 800 };
  const layout = layoutRich(
    'Ag',
    [],
    'none',
    { style, size: 48, color: '#2b2f45' },
    null,
    canvasMeasureText,
  );
  const width = layout.lines[0]!.width;
  context.translate((canvas.width - width) / 2, (canvas.height - 58) / 2);
  drawTextWithEffects(context, {
    layout,
    style,
    width,
    height: layout.height,
    fontSize: 48,
    color: '#2b2f45',
    ...(effect ? { textEffect: effect } : {}),
    ...(curve ? { textCurve: curve } : {}),
  });
  return canvas;
}

export function buildTextEffectsPanel(
  deps: TextEffectsDeps,
): HTMLElement | null {
  const layer = deps.layer();
  if (!layer || layer.type !== 'text') return null;
  const effect = parseTextEffect(stringOf(layer, 'textEffect'));
  const curveProperty = layer.properties.textCurve;
  const curve =
    curveProperty?.type === 'number' && Number.isFinite(curveProperty.value)
      ? curveProperty.value
      : 0;
  const wrap = document.createElement('div');
  wrap.className = 'tool-panel text-effects';
  wrap.dataset.toolPanel = 'effects';
  const set = (label: string, key: string, value: string | number) => {
    const current = deps.layer();
    if (!current) return;
    const command = textPropertyCommand(
      deps.compositionId(),
      current,
      key,
      value,
    );
    if (command) deps.run(label, [command]);
    deps.refresh();
  };
  const setEffect = (next: TextEffect | null) =>
    set(
      next ? 'Text effect' : 'Remove effect',
      'textEffect',
      next ? formatTextEffect(next) : '',
    );
  const heading = (text: string) => {
    const h = document.createElement('h3');
    h.textContent = text;
    return h;
  };
  const tile = (
    key: string,
    label: string,
    pressed: boolean,
    picture: HTMLCanvasElement,
    onClick: () => void,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-effect-tile';
    button.dataset.effect = key;
    button.setAttribute('aria-pressed', String(pressed));
    const name = document.createElement('span');
    name.textContent = label;
    button.append(picture, name);
    button.onclick = onClick;
    return button;
  };
  // Style.
  const style = document.createElement('section');
  style.className = 'tool-panel-section';
  const grid = document.createElement('div');
  grid.className = 'text-effect-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('panels.style'));
  grid.append(
    tile('none', t('textfx.none'), !effect, preview(null), () =>
      setEffect(null),
    ),
    ...TEXT_EFFECTS.map((type) =>
      tile(
        type,
        t(`textfx.${type}`),
        effect?.type === type,
        preview(EFFECT_DEFAULTS[type]),
        () =>
          effect?.type === type
            ? undefined
            : setEffect({ ...EFFECT_DEFAULTS[type] }),
      ),
    ),
  );
  style.append(heading(t('panels.style')), grid);
  if (effect) {
    const fields = document.createElement('div');
    fields.className = 'text-effect-fields';
    const limits: Record<string, [number, number, string]> = {
      intensity: [0, 100, ''],
      direction: [-180, 180, '°'],
      transparency: [0, 100, '%'],
      roundness: [0, 100, ''],
      spread: [0, 100, ''],
    };
    for (const key of EFFECT_FIELDS[effect.type as TextEffectType]) {
      if (key === 'color' || key === 'color2') {
        fields.append(
          createColorField({
            id: `text-effect-${key}`,
            label: t(`textfx.field.${key}`),
            value: effect[key],
            onCommit: (value) => setEffect({ ...effect, [key]: value }),
          }),
        );
        continue;
      }
      const [min, max, unit] = limits[key]!;
      fields.append(
        createNumberField({
          id: `text-effect-${key}`,
          label: t(`textfx.field.${key}`),
          value: effect[key] as number,
          min,
          max,
          unit,
          decimals: 0,
          slider: true,
          onCommit: (value) => setEffect({ ...effect, [key]: value }),
        }),
      );
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary text-effect-remove';
    remove.dataset.action = 'text-effect-remove';
    remove.textContent = t('textfx.remove');
    remove.onclick = () => setEffect(null);
    fields.append(remove);
    style.append(fields);
  }
  // Shape.
  const shape = document.createElement('section');
  shape.className = 'tool-panel-section';
  const shapes = document.createElement('div');
  shapes.className = 'text-effect-grid';
  shapes.append(
    tile('shape-none', t('textfx.none'), !curve, preview(null), () =>
      set('Remove curve', 'textCurve', 0),
    ),
    tile('curve', t('textfx.curve'), !!curve, preview(null, 50), () =>
      curve ? undefined : set('Curve text', 'textCurve', 50),
    ),
  );
  shape.append(heading(t('panels.shape')), shapes);
  if (curve)
    shape.append(
      createNumberField({
        id: 'text-effect-curve',
        label: t('textfx.curve'),
        value: curve,
        min: -100,
        max: 100,
        decimals: 0,
        slider: true,
        onCommit: (value) => set('Curve text', 'textCurve', value),
      }),
    );
  wrap.append(style, shape);
  return wrap;
}
