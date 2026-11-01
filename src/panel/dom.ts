// Tiny DOM helpers for the panel and the website (vanilla TypeScript, like
// the editor's own panels; no framework).
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (
      k === 'value' ||
      k === 'checked' ||
      (k in el && typeof v !== 'string')
    )
      (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat())
    if (c !== null && c !== undefined && c !== false)
      el.append(typeof c === 'number' ? String(c) : c);
  return el;
}
export const clear = (
  el: Element,
  ...children: (Node | null | undefined | false)[]
) => el.replaceChildren(...children.filter((c): c is Node => !!c));
/** Appends, skipping empty slots. */
export const put = (
  el: Element,
  ...children: (Node | string | null | undefined | false)[]
) => el.append(...children.filter((c): c is Node | string => !!c));
