// Turns a Style's Brief fields into a form model and a validated Brief JSON.
// Pure: the panel only renders it. A new field is a config change.
import type { BriefField, Style } from './schema';

export type Answers = Record<
  string,
  string | number | boolean | string[] | undefined
>;
export interface FormIssue {
  field: string;
  code: 'required' | 'option' | 'range';
}

export const isVisible = (f: BriefField, a: Answers): boolean => {
  if (!f.showIf) return true;
  const v = a[f.showIf.field];
  return typeof v === 'string' && f.showIf.in.includes(v);
};
const empty = (v: Answers[string]) =>
  v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

export const visibleFields = (s: Style, a: Answers): BriefField[] =>
  [...s.brief.fields]
    .filter((f) => isVisible(f, a))
    .sort((x, y) => x.order - y.order);

export function validateBrief(s: Style, a: Answers): FormIssue[] {
  const issues: FormIssue[] = [];
  for (const f of visibleFields(s, a)) {
    const v = a[f.id];
    if (empty(v)) {
      if (f.required) issues.push({ field: f.id, code: 'required' });
      continue;
    }
    if (f.type === 'choice' && !f.options.some((o) => o.value === v))
      issues.push({ field: f.id, code: 'option' });
    if (
      f.type === 'multi' &&
      (!Array.isArray(v) ||
        v.some((x) => !f.options.some((o) => o.value === x)))
    )
      issues.push({ field: f.id, code: 'option' });
    if (
      (f.type === 'number' || f.type === 'slider') &&
      typeof v === 'number' &&
      ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))
    )
      issues.push({ field: f.id, code: 'range' });
  }
  return issues;
}

/** Brief JSON for Director: only visible, answered fields. */
export function buildBrief(
  s: Style,
  a: Answers,
): { style: string; answers: Answers } {
  const answers: Answers = {};
  for (const f of visibleFields(s, a))
    if (!empty(a[f.id])) answers[f.id] = a[f.id];
  return { style: s.id, answers };
}

/** Interview questions still worth asking: unanswered, in order, capped. */
export function nextQuestions(s: Style, a: Answers) {
  return [...s.interview.questions]
    .sort((x, y) => x.order - y.order)
    .filter((q) => !q.fills || empty(a[q.fills]))
    .slice(0, s.interview.maxQuestions);
}
