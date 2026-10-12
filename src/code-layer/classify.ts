// X2 (spec section 2): one import for code animations. Classification, in
// order: a valid Composition Spec (JSON) is Tier A; a block that
// `compileBlock` accepts is Tier B; free code the runtime validates is
// Tier C; otherwise a plain list of errors (line, what, how to fix) and
// nothing is added.
import type { ParamSpec } from '../blocks/types';
import { blockMeta, MAX_CODE_DURATION } from './meta';
import type { FreeCodeMeta, FreeCodeRuntime } from './runtime-types';
import { STARTER_PREFIX } from './tier-a';

/** The source size limit (spec section 2). */
export const CODE_BYTES_LIMIT = 1_048_576;

export interface CodeIssue {
  line: number;
  what: string;
  fix: string;
}
export type Classified =
  | {
      tier: 'A';
      /** The parsed Composition Spec (validated). */
      spec: unknown;
      name: string;
      duration: number;
      scenes: number;
      params: readonly ParamSpec[];
    }
  | { tier: 'B' | 'C'; source: string; meta: FreeCodeMeta }
  | { tier: null; issues: CodeIssue[] };

const utf8 = (text: string) => new TextEncoder().encode(text).length;
/** The line of a character offset (1-based). */
const lineAt = (text: string, offset: number) =>
  text.slice(0, Math.max(0, offset)).split('\n').length;

/** An .html file's code is the text of its first inline script. */
export function scriptOf(text: string): string {
  const match = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(text);
  return match ? match[1]! : text;
}

/** The line of the JSON value a spec issue's path names (best effort). */
function lineOfPath(text: string, path: string): number {
  const key = path
    .split('/')
    .filter(Boolean)
    .reverse()
    .find((part) => !/^\d+$/.test(part));
  if (!key) return 1;
  const at = text.indexOf(
    `"${key.replaceAll('~1', '/').replaceAll('~0', '~')}"`,
  );
  return at < 0 ? 1 : lineAt(text, at);
}

/** The offset of the first JSON syntax error (a small strict scanner). */
export function jsonErrorOffset(text: string): number {
  let i = 0;
  const fail = (): never => {
    throw i;
  };
  const space = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const literal = (word: string) => {
    if (text.startsWith(word, i)) i += word.length;
    else fail();
  };
  const string = () => {
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      else if (text.charCodeAt(i) < 32) fail();
      i++;
    }
    if (text[i] !== '"') fail();
    i++;
  };
  const value = (): void => {
    space();
    const c = text[i];
    if (c === '{') {
      i++;
      space();
      if (text[i] === '}') return void i++;
      for (;;) {
        space();
        if (text[i] !== '"') fail();
        string();
        space();
        if (text[i] !== ':') fail();
        i++;
        value();
        space();
        if (text[i] === ',') i++;
        else if (text[i] === '}') return void i++;
        else fail();
      }
    } else if (c === '[') {
      i++;
      space();
      if (text[i] === ']') return void i++;
      for (;;) {
        value();
        space();
        if (text[i] === ',') i++;
        else if (text[i] === ']') return void i++;
        else fail();
      }
    } else if (c === '"') string();
    else if (c === 't') literal('true');
    else if (c === 'f') literal('false');
    else if (c === 'n') literal('null');
    else {
      const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(
        text.slice(i, i + 64),
      );
      if (!match) fail();
      i += match![0].length;
    }
  };
  try {
    value();
    space();
    if (i < text.length) fail();
    return -1;
  } catch (at) {
    return typeof at === 'number' ? at : 0;
  }
}

function jsonIssue(text: string, error: unknown): CodeIssue {
  // V8 quotes a slice of the text after a comma; keep the reason only.
  const message = (error instanceof Error ? error.message : String(error))
    .split(/,\s*"/)[0]!
    .replace(/\s+/g, ' ')
    .trim();
  return {
    line: lineAt(text, Math.max(0, jsonErrorOffset(text))),
    what: `The JSON is not valid: ${message}`,
    fix: 'Check the commas, quotes and brackets near this line.',
  };
}

const looksJson = (text: string) =>
  /^\s*[[{]/.test(text) && !/^\s*\(\s*\{/.test(text);
const looksBlock = (text: string) =>
  /^\s*\(\s*\{/.test(text) || /\brender\s*\(\s*ctx\b/.test(text);

/**
 * Classifies a pasted or dropped source. `runtime` is the Tier C runtime
 * (null when none is available here).
 */
export async function classifyCode(
  input: string,
  runtime: FreeCodeRuntime | null,
  fileName = '',
): Promise<Classified> {
  const fail = (issues: CodeIssue[]): Classified => ({ tier: null, issues });
  if (!input.trim())
    return fail([
      {
        line: 1,
        what: 'There is no code.',
        fix: 'Paste the code or choose a .json, .js, .mjs or .html file.',
      },
    ]);
  if (utf8(input) > CODE_BYTES_LIMIT)
    return fail([
      {
        line: 1,
        what: 'The code is larger than 1 MB.',
        fix: 'Move images and data out of it, or split it into smaller animations.',
      },
    ]);
  const text = /\.html?$/i.test(fileName) ? scriptOf(input) : input;

  // A: JSON that is a Composition Spec.
  if (looksJson(text) || /\.json$/i.test(fileName)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return fail([jsonIssue(text, error)]);
    }
    const { validateSpec } = await import('../ai-spec/validate');
    const result = validateSpec(parsed);
    if (!result.ok)
      return fail(
        result.errors.slice(0, 20).map((issue) => ({
          line: lineOfPath(text, issue.path),
          what: `${issue.path || '/'}: ${issue.message}`,
          fix: 'Correct this value as the Composition Spec v1 describes (docs/AI-SPEC.md).',
        })),
      );
    const spec = result.spec;
    const duration = spec.scenes.reduce(
      (sum, scene) => sum + scene.duration,
      0,
    );
    if (duration > MAX_CODE_DURATION)
      return fail([
        {
          line: 1,
          what: `The animation lasts ${duration} s; the limit is ${MAX_CODE_DURATION} s.`,
          fix: 'Shorten the scenes.',
        },
      ]);
    return {
      tier: 'A',
      spec,
      name: spec.title ?? spec.id,
      duration,
      scenes: spec.scenes.length,
      params: spec.parameters as unknown as readonly ParamSpec[],
    };
  }

  // B: a starter block named by a Composition Spec (`@block:<id>`).
  if (text.startsWith(STARTER_PREFIX)) {
    const { getBlock } = await import('../blocks/starters');
    const block = getBlock(text.slice(STARTER_PREFIX.length).trim());
    if (block)
      return { tier: 'B', source: text.trim(), meta: blockMeta(block) };
  }
  // B: the restricted block subset.
  const { compileBlock } = await import('../blocks/sandbox/compile');
  const block = compileBlock(text);
  if (block.ok) {
    const meta = blockMeta(block.value.info);
    if (meta.duration > MAX_CODE_DURATION)
      return fail([
        {
          line: 1,
          what: `defaultDuration is ${meta.duration} s; the limit is ${MAX_CODE_DURATION} s.`,
          fix: 'Lower defaultDuration.',
        },
      ]);
    return { tier: 'B', source: text, meta };
  }

  // C: free code.
  if (!runtime)
    return fail(
      looksBlock(text)
        ? [
            {
              line: 1,
              what: `This block cannot be used: ${block.error}`,
              fix: 'Use only the block subset (docs/CODE-LAYER.md), or write free code with meta and renderFrame.',
            },
          ]
        : [
            {
              line: 1,
              what: 'Free code (full mode) cannot run here: the sandboxed runtime is not available.',
              fix: 'Use a block or a Composition Spec instead.',
            },
          ],
    );
  const checked = runtime.validate(text);
  if (checked.ok) {
    if (checked.meta.duration > MAX_CODE_DURATION)
      return fail([
        {
          line: 1,
          what: `meta.duration is ${checked.meta.duration} s; the limit is ${MAX_CODE_DURATION} s.`,
          fix: 'Lower meta.duration.',
        },
      ]);
    return { tier: 'C', source: text, meta: checked.meta };
  }
  // Neither: report what fits the code best.
  if (looksBlock(text))
    return fail([
      {
        line: lineAt(text, text.search(/\brender\b/)),
        what: `The block is not accepted: ${block.error}`,
        fix: 'Use only the block subset, or write free code with meta and renderFrame.',
      },
    ]);
  return fail(
    checked.errors.slice(0, 20).map((error) => ({
      line: error.line,
      what: error.message,
      fix: 'Free code exports an object with meta, init and renderFrame (CODE-TIERS-SPEC section 3).',
    })),
  );
}
