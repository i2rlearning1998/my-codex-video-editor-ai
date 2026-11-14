// ROUND-B B1: the one function that builds what a Director model call reads.
//
// Order of the text (always): rulebook, Style playbook, Project memory,
// Video sheet, file notes, the chat's summary, its last N turns, the live
// canvas summary, the selection.
//
// When the pack is over the owner's token budget, parts leave in this order
// (the first is dropped first), one item at a time, until it fits:
//   1. older turns of the last N (the two newest always stay)
//   2. the chat summary
//   3. file notes, oldest first
//   4. Project memory facts that are not pinned, oldest first
//   5. the Style playbook
//   6. sheet decisions that are not pinned, oldest first
//   7. sheet asset lines, oldest first
//   8. canvas detail (the layer lines; the scene list stays)
//   9. pinned Project memory facts, oldest first
// Never dropped: the rulebook, the sheet's brief and scene lines, pinned
// sheet decisions, the canvas scene list, the selection and the two newest
// turns. If those alone are over the budget the pack says so (`over`).
import type { Entry, FileNote, Sheet, Turn } from '../project/video-memory';

export interface PackInput {
  readonly rulebook: string;
  /** Only when the Project came from a ready-made Style. */
  readonly playbook?: string;
  /** The Project's style record, as lines (part of Project memory). */
  readonly styleLines: readonly string[];
  readonly facts: readonly Entry[];
  readonly sheet: Sheet;
  readonly notes: readonly FileNote[];
  readonly summary: string;
  readonly turns: readonly Turn[];
  /** Live canvas: the scene list, then one line per layer of the open scene. */
  readonly canvas: {
    readonly scenes: readonly string[];
    readonly layers: readonly string[];
  };
  readonly selection: string;
  readonly budgetTokens: number;
  readonly lastTurns: number;
}
export interface Pack {
  readonly text: string;
  readonly tokens: number;
  /** What left, in the order it left (`turn`, `summary`, `note`, `fact` ...). */
  readonly dropped: readonly string[];
  /** True when even the parts that never leave are over the budget. */
  readonly over: boolean;
}

/** A rough token count: four characters a token (enough for a budget). */
export const tokensOf = (s: string) => Math.ceil([...s].length / 4);

const byAge = <T extends { at: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.at.localeCompare(b.at));

export function buildContextPack(x: PackInput): Pack {
  const turns = x.turns.slice(-Math.max(2, x.lastTurns));
  const state = {
    turns: [...turns],
    summary: x.summary,
    notes: byAge(x.notes),
    loose: byAge(x.facts.filter((f) => !f.pinned)),
    pinned: byAge(x.facts.filter((f) => f.pinned)),
    playbook: x.playbook ?? '',
    decisions: byAge(x.sheet.decisions.filter((e) => !e.pinned)),
    keptDecisions: x.sheet.decisions.filter((e) => e.pinned),
    assets: byAge(x.sheet.assets),
    layers: [...x.canvas.layers],
  };
  const block = (title: string, lines: readonly string[]) =>
    lines.length ? `${title}\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
  const render = () =>
    [
      x.rulebook.trim(),
      state.playbook ? `STYLE PLAYBOOK\n${state.playbook.trim()}` : '',
      block('PROJECT MEMORY', [
        ...x.styleLines,
        ...state.pinned.map((f) => f.text),
        ...state.loose.map((f) => f.text),
      ]),
      [
        block(
          'VIDEO SHEET: BRIEF',
          x.sheet.brief.map((e) => e.text),
        ),
        block(
          'VIDEO SHEET: SCENES',
          x.sheet.scenes.map((e) => e.text),
        ),
        block(
          'VIDEO SHEET: ASSETS',
          state.assets.map((e) => e.text),
        ),
        block('VIDEO SHEET: DECISIONS', [
          ...state.keptDecisions.map((e) => e.text),
          ...state.decisions.map((e) => e.text),
        ]),
      ]
        .filter(Boolean)
        .join('\n'),
      block(
        'FILE NOTES',
        state.notes.map((n) => `${n.name}: ${n.note}`),
      ),
      state.summary ? `EARLIER IN THIS CHAT\n${state.summary}` : '',
      state.turns.length
        ? `LAST TURNS\n${state.turns
            .map(
              (t) => `${t.role === 'user' ? 'Person' : 'Director'}: ${t.text}`,
            )
            .join('\n')}`
        : '',
      [
        block('CANVAS NOW: SCENES', x.canvas.scenes),
        block('CANVAS NOW: OPEN SCENE LAYERS', state.layers),
      ]
        .filter(Boolean)
        .join('\n'),
      x.selection ? `SELECTED\n${x.selection}` : 'SELECTED\n(nothing)',
    ]
      .filter(Boolean)
      .join('\n\n');

  const dropped: string[] = [];
  /** One step of the drop order; false when nothing more may leave. */
  const dropOne = (): boolean => {
    if (state.turns.length > 2) {
      state.turns.shift();
      dropped.push('turn');
    } else if (state.summary) {
      state.summary = '';
      dropped.push('summary');
    } else if (state.notes.length) {
      state.notes.shift();
      dropped.push('note');
    } else if (state.loose.length) {
      state.loose.shift();
      dropped.push('fact');
    } else if (state.playbook) {
      state.playbook = '';
      dropped.push('playbook');
    } else if (state.decisions.length) {
      state.decisions.shift();
      dropped.push('decision');
    } else if (state.assets.length) {
      state.assets.shift();
      dropped.push('asset');
    } else if (state.layers.length) {
      state.layers = [];
      dropped.push('canvas-layers');
    } else if (state.pinned.length) {
      state.pinned.shift();
      dropped.push('pinned-fact');
    } else return false;
    return true;
  };
  let text = render();
  while (tokensOf(text) > x.budgetTokens && dropOne()) text = render();
  const tokens = tokensOf(text);
  return { text, tokens, dropped, over: tokens > x.budgetTokens };
}
