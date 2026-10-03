// J9: the asset being dragged from the Media panel. A page's own drag can
// read its data only on drop, so the canvas and the timeline read this while
// the pointer moves (to draw where the drop would land). Transient.
export interface AssetDrag {
  readonly assetId: string;
  readonly type: 'image' | 'video' | 'audio';
  readonly name: string;
  readonly duration: number;
  readonly width?: number;
  readonly height?: number;
}
let current: AssetDrag | null = null;
export const assetDrag = (): AssetDrag | null => current;
export function setAssetDrag(drag: AssetDrag | null): void {
  current = drag;
}

/**
 * The drag image: the card's thumbnail and the name in a rounded chip (the
 * browser's default is a translucent copy of the whole card).
 */
export function dragGhost(card: HTMLElement, name: string): HTMLElement {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  const thumb = card.querySelector<HTMLElement>('.media-thumb');
  const image = document.createElement('span');
  image.className = 'drag-ghost-thumb';
  if (thumb)
    image.style.backgroundImage = getComputedStyle(thumb).backgroundImage;
  const label = document.createElement('span');
  label.className = 'drag-ghost-name';
  label.textContent = name;
  ghost.append(image, label);
  document.body.append(ghost);
  return ghost;
}
