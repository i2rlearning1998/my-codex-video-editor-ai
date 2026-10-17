import { iconSvg } from './icons';

// S1 Part 1: one header for every side panel (Clipchamp): the title on the
// left and exactly one collapse button, the drawer icon, on the right. The
// left panel's title follows the rail category; the right panel's follows
// the selection.
export interface PanelHeaderOptions {
  /** Classes added beside `panel-head`. */
  className?: string;
  titleId?: string;
  title?: string;
  /** Markup between the title and the button (a count badge). */
  extra?: string;
  button: {
    id?: string;
    icon: 'panelLeft' | 'panelRight';
    label: string;
    /** Extra attributes for the button, already escaped. */
    attributes?: string;
  };
}

export function panelHeaderHtml(options: PanelHeaderOptions): string {
  const { button } = options;
  const id = button.id ? ` id="${button.id}"` : '';
  const titleId = options.titleId ? ` id="${options.titleId}"` : '';
  return `<header class="panel-head${options.className ? ` ${options.className}` : ''}"><h2 class="panel-head-title"${titleId}>${options.title ?? ''}</h2>${options.extra ?? ''}<button type="button" class="icon-button panel-head-collapse"${id}${button.attributes ? ` ${button.attributes}` : ''} aria-label="${button.label}" title="${button.label}">${iconSvg(button.icon, 20)}</button></header>`;
}
