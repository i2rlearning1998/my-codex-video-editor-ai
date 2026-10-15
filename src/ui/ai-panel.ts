// Q4: the left rail's AI category. Everything imported from Creator Packs
// (My library), grouped by kind, each card with an AI chip. A click inserts
// it with the usual library insert (one undo step); a preset is applied to
// the selected layer. The header holds Import creator pack and Copy AI brief.
import { t } from '../i18n';
import { iconSvg } from './icons';
import { creatorLibraryId, type CreatorLibrary } from './creator-library';

/** Kinds in the order the panel lists them (the brief's order). */
export const AI_KINDS = [
  'shape',
  'background',
  'text',
  'template',
  'motion',
  'preset',
  'composition',
  'effect',
  'theme',
] as const;

export interface AiPanelOptions {
  readonly library: CreatorLibrary;
  /** Inserts a native or motion item (library id). */
  readonly insert: (id: string) => void;
  /** Applies a preset to the selected layer (library id). */
  readonly applyPreset: (id: string) => void;
  readonly importPack: () => void;
  readonly copyBrief: () => void;
}

export function mountAiPanel(host: HTMLElement, options: AiPanelOptions) {
  const render = () => {
    const header = document.createElement('header');
    header.className = 'ai-panel-header';
    const title = document.createElement('h2');
    title.textContent = t('ai.title');
    const actions = document.createElement('div');
    actions.className = 'ai-panel-actions';
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'button';
    importButton.id = 'ai-import';
    importButton.textContent = t('creator.importMenu');
    importButton.onclick = () => options.importPack();
    const brief = document.createElement('button');
    brief.type = 'button';
    brief.className = 'button primary';
    brief.id = 'ai-copy-brief';
    brief.innerHTML = `${iconSvg('copy', 16)}<span></span>`;
    brief.querySelector('span')!.textContent = t('brief.copy');
    brief.onclick = () => options.copyBrief();
    actions.append(importButton, brief);
    header.append(title, actions);
    const entries = options.library.list();
    const body = document.createElement('div');
    body.className = 'ai-panel-body';
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'ai-empty';
      empty.id = 'ai-empty';
      empty.textContent = t('ai.empty');
      body.append(empty);
    }
    for (const kind of AI_KINDS) {
      const items = entries.filter((entry) => entry.item.type === kind);
      if (!items.length) continue;
      const section = document.createElement('section');
      section.className = 'ai-group';
      section.dataset.kind = kind;
      const heading = document.createElement('h3');
      heading.textContent = `${t(`ai.kind.${kind}`)} (${items.length})`;
      const grid = document.createElement('div');
      grid.className = 'ai-grid';
      for (const entry of items) {
        const id = creatorLibraryId(entry.key);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'ai-card';
        card.dataset.item = id;
        card.title = `${entry.name} · ${entry.packName.en}`;
        const thumb = document.createElement('span');
        thumb.className = 'ai-thumb';
        if (entry.thumbnail) {
          const image = document.createElement('img');
          image.src = entry.thumbnail;
          image.alt = '';
          image.draggable = false;
          thumb.append(image);
        } else
          thumb.innerHTML = iconSvg(
            kind === 'preset' ? 'animate' : 'magic',
            20,
          );
        const chip = document.createElement('span');
        chip.className = 'ai-chip';
        chip.textContent = t('creator.badge');
        thumb.append(chip);
        const name = document.createElement('span');
        name.className = 'ai-name';
        name.textContent = entry.name;
        card.append(thumb, name);
        card.onclick = () =>
          kind === 'preset' ? options.applyPreset(id) : options.insert(id);
        grid.append(card);
      }
      section.append(heading, grid);
      body.append(section);
    }
    host.replaceChildren(header, body);
  };
  const unsubscribe = options.library.onChange(render);
  render();
  return { render, dispose: () => unsubscribe() };
}
