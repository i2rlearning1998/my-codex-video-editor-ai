// ROUND-B B3: after the build, every message is first sorted into one of
// five kinds, and the person is shown what Director is about to do. Several
// asks in one message become a list. Deterministic and pure (no model call
// decides what a message costs).
export type AskKind =
  'question' | 'selection' | 'scene' | 'new-scene' | 'new-video';
export interface Ask {
  readonly text: string;
  readonly kind: AskKind;
  /** Too little to act on: Director asks ONE question with choices. */
  readonly unsure: boolean;
}

const NEW_VIDEO =
  /\b(new|another|next|second|separate)\s+video\b|नया\s+वीडियो|दूसरा\s+वीडियो|अगला\s+वीडियो/i;
const NEW_SCENE =
  /\b(add|insert|create)\b[^.]{0,24}\bscene\b|\b(new|another|extra|one more)\s+scene\b|नया\s+सीन|सीन\s+जोड़|एक\s+और\s+सीन/i;
const QUESTION_START =
  /^(what|why|how|which|when|where|who|is|are|can|could|do|does|did|should|will|would|क्या|क्यों|कैसे|कौन|कब|कहाँ|कितन)/i;
const SCENE_WORD =
  /\b(scene|whole|everything|all|background)\b|सीन|पूरा|सब|बैकग्राउंड/i;
const VAGUE =
  /^(change|fix|improve|better|do it|make it better|edit|बदल(ो|ें)?|ठीक कर(ो|ें)?|सुधार(ो|ें)?)[\s.!]*(it|this|that|इसे|यह)?[\s.!]*$/i;

/** Splits a message into its separate asks. */
export function splitAsks(text: string): string[] {
  const parts = text
    .split(
      /\n+|;|\.\s+(?=\S)|\s+(?:and then|then also|and also|after that|also,)\s+|,\s*(?:then|and then)\s+|\s+फिर\s+|\s+और फिर\s+|।\s*/i,
    )
    .map((p) => p.trim().replace(/^(and|then|also|और)\s+/i, ''))
    .filter((p) => p.length > 1);
  // A numbered or bulleted list: one ask per item.
  const out = parts.flatMap((p) =>
    p
      .split(/(?:^|\s)(?:\d+[.)]|[-•])\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 1),
  );
  return out.length ? out.slice(0, 8) : [text.trim()].filter(Boolean);
}

export function sortAsk(text: string, hasSelection: boolean): Ask {
  const t = text.trim();
  const kind: AskKind = NEW_VIDEO.test(t)
    ? 'new-video'
    : NEW_SCENE.test(t)
      ? 'new-scene'
      : /[?？]\s*$/.test(t) || QUESTION_START.test(t)
        ? 'question'
        : hasSelection && !SCENE_WORD.test(t)
          ? 'selection'
          : 'scene';
  return {
    text: t,
    kind,
    unsure: (kind === 'scene' || kind === 'selection') && VAGUE.test(t),
  };
}
export const sortMessage = (text: string, hasSelection: boolean): Ask[] =>
  splitAsks(text).map((part) => sortAsk(part, hasSelection));
