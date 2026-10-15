// X4 (spec section 5): code animations saved as templates. They live in the
// My Templates store of this browser (`aive.myTemplates`, entries with
// `kind: 'code'`), never in the project and never on the Undo stack
// (docs/UNDO-RULES.md). A template keeps its name, category, tier, source,
// meta, default params and a thumbnail; inserting one gives the project its
// own copy of the source, so the project opens anywhere.
import {
  readTemplateEntries,
  writeTemplateEntries,
  onTemplatesChange,
} from './my-templates';

export const CODE_TEMPLATE_FORMAT = 'aive-code-template';
const MAX_CODE_TEMPLATES = 60;

export interface CodeTemplate {
  readonly kind: 'code';
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly createdAt: string;
  readonly tier: 'A' | 'B' | 'C';
  /** The code (a Composition Spec's JSON text for Tier A). */
  readonly source: string;
  /** B and C: the validated meta. A: { duration, params, scenes }. */
  readonly meta: Readonly<Record<string, unknown>>;
  /** The default param values inserted with it. */
  readonly params: Readonly<Record<string, unknown>>;
  /** A small PNG data URL. */
  readonly thumbnail?: string;
}

const isCode = (item: unknown): item is CodeTemplate =>
  !!item &&
  typeof item === 'object' &&
  (item as CodeTemplate).kind === 'code' &&
  typeof (item as CodeTemplate).id === 'string' &&
  typeof (item as CodeTemplate).name === 'string' &&
  typeof (item as CodeTemplate).source === 'string' &&
  ['A', 'B', 'C'].includes((item as CodeTemplate).tier) &&
  !!(item as CodeTemplate).meta &&
  typeof (item as CodeTemplate).meta === 'object' &&
  !!(item as CodeTemplate).params &&
  typeof (item as CodeTemplate).params === 'object';

function write(list: readonly CodeTemplate[]) {
  writeTemplateEntries([
    ...readTemplateEntries().filter((item) => !isCode(item)),
    ...list,
  ]);
}

export const codeTemplates = {
  list(): readonly CodeTemplate[] {
    return readTemplateEntries().filter(isCode);
  },
  find(id: string) {
    return this.list().find((item) => item.id === id);
  },
  save(template: CodeTemplate) {
    write([template, ...this.list()].slice(0, MAX_CODE_TEMPLATES));
  },
  /** Puts a template back at its place (Restore after a delete). */
  restore(template: CodeTemplate, index: number) {
    const list = [...this.list()];
    list.splice(Math.min(index, list.length), 0, template);
    write(list);
  },
  update(id: string, change: Partial<Pick<CodeTemplate, 'name'>>) {
    write(
      this.list().map((item) =>
        item.id === id ? { ...item, ...change } : item,
      ),
    );
  },
  remove(id: string): { template: CodeTemplate; index: number } | null {
    const list = [...this.list()];
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [template] = list.splice(index, 1);
    write(list);
    return { template: template!, index };
  },
  duplicate(id: string, name: string): CodeTemplate | null {
    const template = this.find(id);
    if (!template) return null;
    const copy: CodeTemplate = {
      ...structuredClone(template),
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    const list = [...this.list()];
    list.splice(list.findIndex((item) => item.id === id) + 1, 0, copy);
    write(list);
    return copy;
  },
  onChange: onTemplatesChange,
};

/** A template as a .json file's text. */
export function exportCodeTemplate(template: CodeTemplate): string {
  return `${JSON.stringify(
    { format: CODE_TEMPLATE_FORMAT, version: 1, template },
    null,
    2,
  )}\n`;
}
/** True when JSON text is an exported code template. */
export const isCodeTemplateFile = (text: string) => {
  try {
    const value = JSON.parse(text) as { format?: unknown };
    return value?.format === CODE_TEMPLATE_FORMAT;
  } catch {
    return false;
  }
};
/**
 * Reads an exported template file (a fresh id, so importing twice keeps
 * both). Throws a plain message when the file is not a code template.
 */
export function importCodeTemplate(text: string): CodeTemplate {
  let value: { format?: unknown; version?: unknown; template?: unknown };
  try {
    value = JSON.parse(text) as typeof value;
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (value?.format !== CODE_TEMPLATE_FORMAT || value.version !== 1)
    throw new Error('This file is not a code animation template.');
  const template = { ...(value.template as CodeTemplate), kind: 'code' };
  if (!isCode(template) || template.source.length > 1_048_576)
    throw new Error('The template in this file is damaged.');
  return {
    ...template,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...(typeof template.thumbnail === 'string' &&
    template.thumbnail.startsWith('data:image/')
      ? {}
      : { thumbnail: undefined }),
  } as CodeTemplate;
}
