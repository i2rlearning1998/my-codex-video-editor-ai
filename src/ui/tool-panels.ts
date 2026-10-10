// H3: the toolbar's deep panels in the left side panel (Canva): Font,
// Effects, Edit image, Replace and Crop. Controls whose systems are not built
// are shown disabled with "Planned: Wave N (ID)".
import type { Command, EditorEngine } from '../core';
import { t } from '../i18n';
import { locateLayer, type SceneLayer } from '../render/adapter';
import { SYSTEM_FONTS, textStyleOf } from '../render/text-style';
import { textStyleCommands } from './context-toolbar';
import type { CropTool } from './crop-tool';
import { iconSvg } from './icons';
import type { EditorSession } from './session';
import type { SidePanels } from './side-panel';
import { createNumberField } from './components/number-field';

export type ToolPanelId = 'font' | 'effects' | 'edit-image' | 'replace';

/** Crop ratios offered by the Crop panel (width / height). */
export const CROP_RATIOS = [
  ['freeform', null],
  ['original', 'original'],
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
] as const;

const planned = (label: string, icon: string, id: string, wave: number) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'tool-panel-item';
  item.setAttribute('aria-disabled', 'true');
  const reason = t('toolbar.later', { wave: String(wave), id });
  item.title = reason;
  item.setAttribute('aria-label', `${label}: ${reason}`);
  item.innerHTML = `${iconSvg(icon, 18)}<span></span>`;
  item.querySelector('span')!.textContent = label;
  return item;
};
const section = (title: string, ...children: HTMLElement[]) => {
  const wrap = document.createElement('section');
  wrap.className = 'tool-panel-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrap.append(heading, ...children);
  return wrap;
};

export function mountToolPanels(
  panels: SidePanels,
  engine: EditorEngine,
  session: EditorSession,
  crop: CropTool,
  report: (error: unknown) => void,
) {
  const selected = (): SceneLayer | null =>
    session.selectedIds.length === 1 && session.selectedId
      ? (locateLayer(session.source.composition.layers, session.selectedId)
          ?.layer ?? null)
      : null;
  const run = (label: string, commands: Command[]) => {
    try {
      if (commands.length) engine.commands.transaction(label, commands);
    } catch (error) {
      report(error);
    }
  };
  const font = () => {
    const layer = selected();
    if (!layer || layer.type !== 'text') return null;
    const current = textStyleOf(layer).family;
    const list = document.createElement('div');
    list.className = 'font-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t('toolbar.font'));
    for (const [name] of SYSTEM_FONTS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'font-option';
      item.setAttribute('role', 'option');
      item.dataset.font = name;
      item.setAttribute('aria-selected', String(name === current));
      item.style.fontFamily = name;
      item.textContent = name;
      item.onclick = () =>
        run(
          'Set font',
          textStyleCommands(
            session.source.composition.id,
            selected() ?? layer,
            'fontFamily',
            name,
          ),
        );
      list.append(item);
    }
    const more = planned(t('panels.fontCatalog'), 'text', 'TXT-007', 3);
    const upload = planned(t('panels.fontUpload'), 'upload', 'TXT-009', 3);
    const wrap = document.createElement('div');
    wrap.className = 'tool-panel';
    wrap.dataset.toolPanel = 'font';
    wrap.append(
      section(t('panels.systemFonts'), list),
      section(t('panels.moreFonts'), more, upload),
    );
    return wrap;
  };
  const effects = () => {
    const layer = selected();
    if (!layer || layer.type !== 'text') return null;
    const wrap = document.createElement('div');
    wrap.className = 'tool-panel';
    wrap.dataset.toolPanel = 'effects';
    wrap.append(
      section(
        t('panels.style'),
        planned(t('panels.shadow'), 'effects', 'TXT-019', 3),
        planned(t('panels.outline'), 'strokeStyle', 'TXT-019', 3),
        planned(t('panels.glow'), 'magic', 'TXT-020', 3),
        planned(t('panels.background'), 'rectangle', 'TXT-020', 3),
        planned(t('panels.presets'), 'text', 'TXT-022', 3),
      ),
      section(
        t('panels.shape'),
        planned(t('panels.curve'), 'curve', 'TXT-021', 3),
      ),
    );
    return wrap;
  };
  const editImage = () => {
    const layer = selected();
    if (!layer || (layer.type !== 'image' && layer.type !== 'video'))
      return null;
    const wrap = document.createElement('div');
    wrap.className = 'tool-panel';
    wrap.dataset.toolPanel = 'edit-image';
    const cropButton = document.createElement('button');
    cropButton.type = 'button';
    cropButton.className = 'tool-panel-item';
    cropButton.dataset.action = 'edit-crop';
    cropButton.innerHTML = `${iconSvg('crop', 18)}<span></span>`;
    cropButton.querySelector('span')!.textContent = t('toolbar.crop');
    cropButton.onclick = () => startCrop();
    wrap.append(
      section(
        t('panels.tools'),
        cropButton,
        planned(t('toolbar.bgRemover'), 'magic', 'AI-007', 10),
        planned(t('toolbar.magicEraser'), 'eraser', 'AI-007', 10),
      ),
      section(
        t('panels.adjust'),
        planned(t('panels.adjust'), 'adjust', 'CLR-001', 6),
        planned(t('panels.filters'), 'effects', 'FX-004', 6),
      ),
    );
    return wrap;
  };
  const replace = () => {
    const layer = selected();
    if (!layer || (layer.type !== 'image' && layer.type !== 'video'))
      return null;
    const wrap = document.createElement('div');
    wrap.className = 'tool-panel';
    wrap.dataset.toolPanel = 'replace';
    const hint = document.createElement('p');
    hint.className = 'tool-panel-hint';
    hint.textContent = t('panels.replaceHint');
    const grid = document.createElement('div');
    grid.className = 'replace-grid';
    const assets = session.source.assets.filter(
      (asset) => asset.type === layer.type,
    );
    for (const asset of assets) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'replace-option';
      item.dataset.assetId = asset.id;
      item.setAttribute('aria-pressed', String(asset.id === layer.assetId));
      item.textContent = asset.name;
      item.title = asset.name;
      item.onclick = () =>
        run('Replace media', [
          {
            type: 'SET_LAYER_ASSET',
            compositionId: session.source.composition.id,
            layerId: layer.id,
            assetId: asset.id,
          } as Command,
        ]);
      grid.append(item);
    }
    if (!assets.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = t('panels.replaceEmpty');
      grid.append(empty);
    }
    wrap.append(hint, grid);
    return wrap;
  };
  const builders: Record<ToolPanelId, () => HTMLElement | null> = {
    font,
    effects,
    'edit-image': editImage,
    replace,
  };
  const titles: Record<ToolPanelId, string> = {
    font: 'toolbar.font',
    effects: 'toolbar.effects',
    'edit-image': 'toolbar.editImage',
    replace: 'toolbar.replace',
  };

  // --- Crop ----------------------------------------------------------------
  const cropPanel = () => {
    if (!crop.active) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tool-panel';
    wrap.dataset.toolPanel = 'crop';
    const ratios = document.createElement('div');
    ratios.className = 'crop-ratios';
    ratios.setAttribute('role', 'radiogroup');
    ratios.setAttribute('aria-label', t('crop.ratio'));
    const current = crop.ratioChoice;
    for (const [id, value] of CROP_RATIOS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.ratio = id;
      item.setAttribute('role', 'radio');
      item.setAttribute('aria-checked', String(current === id));
      item.textContent =
        id === 'freeform' || id === 'original' ? t(`crop.${id}`) : id;
      item.onclick = () => {
        crop.setRatio(value, id);
        refreshCrop();
      };
      ratios.append(item);
    }
    const rotate = createNumberField({
      id: 'crop-rotate',
      label: t('crop.rotate'),
      value: crop.rotation,
      unit: '°',
      min: -180,
      max: 180,
      decimals: 1,
      slider: true,
      presets: [-90, -45, 0, 45, 90],
      onCommit: (value) => crop.setRotation(value),
    });
    const actions = document.createElement('div');
    actions.className = 'crop-actions';
    const button = (
      id: string,
      label: string,
      onClick: () => void,
      cls = '',
    ) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.action = id;
      item.className = cls;
      item.textContent = label;
      item.onclick = onClick;
      return item;
    };
    actions.append(
      button('crop-reset', t('crop.reset'), () => crop.reset(), 'ghost'),
      button('crop-cancel', t('crop.cancel'), () => crop.cancel(), 'secondary'),
      button(
        'crop-done',
        t('crop.done'),
        () => {
          try {
            crop.done();
          } catch (error) {
            report(error);
          }
        },
        'primary',
      ),
    );
    wrap.append(
      section(t('crop.ratio'), ratios),
      section(t('crop.rotate'), rotate),
      section(
        t('panels.smart'),
        planned(t('crop.smart'), 'magic', 'AI-009', 10),
        planned(t('crop.expand'), 'magic', 'AI-009', 10),
      ),
      actions,
    );
    return wrap;
  };
  const refreshCrop = () => {
    if (crop.active) panels.show('crop', t('toolbar.crop'), cropPanel);
    else if (panels.openId === 'crop') panels.close();
  };
  const startCrop = () => {
    const layer = selected();
    if (!layer) return;
    if (crop.start(layer.id)) refreshCrop();
  };
  return {
    open(id: ToolPanelId) {
      if (panels.openId === id && panels.visible) return panels.close();
      panels.show(id, t(titles[id]), builders[id]);
    },
    startCrop,
    /** Keeps the Crop panel in step with the crop tool. */
    syncCrop: refreshCrop,
  };
}
