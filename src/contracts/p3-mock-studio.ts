// P3U: a stand-in for Part 1's StudioEngine and Part 2's StudioService, so the
// Studio screens can be built and tested before they land. When the real ones
// are merged, src/panel/p3-services.ts is the only file that changes.
//
// The reference parameter sets below are a SAMPLE, marked unverified: the
// owner replaces them with the real list after comparing with Autodraft AI
// (docs/CONTRACTS-P3.md section 5, Studio fields).
import {
  paramDeclSchema,
  type AssembledRequest,
  type FormSpec,
  type FormValues,
  type ParamDecl,
  type P3Failure,
  type P3Text,
  type Result,
  type StudioEngine,
  type StudioService,
} from './p3';

type Raw = Record<string, unknown> & { id: string; type: string };
const L = (en: string, hi?: string): P3Text => (hi ? { en, hi } : { en });
const opts = (...o: [string, string, string?][]) =>
  o.map(([value, en, hi]) => ({ value, label: L(en, hi) }));
const decl = (raws: Raw[]): ParamDecl[] =>
  raws.map((r, i) =>
    paramDeclSchema.parse({ order: i + 1, label: L(r.id), ...r }),
  );

const ASPECTS = opts(['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']);

/** SAMPLE parameter sets, by studio and model tier. Unverified. */
export function sampleParams(studioId: string, modelId: string): ParamDecl[] {
  const pro = /-(pro|max)$/.test(modelId);
  switch (studioId) {
    case 'image':
    case 'images':
      return decl([
        {
          id: 'prompt',
          type: 'longtext',
          role: 'prompt',
          required: true,
          label: L('What should the picture show?', 'तस्वीर में क्या दिखे?'),
          help: L('Describe the subject, place and mood.'),
        },
        ...(pro
          ? ([
              {
                id: 'negative',
                type: 'text',
                role: 'negative',
                group: 'advanced',
                label: L('Leave out', 'क्या न हो'),
              },
              {
                id: 'style',
                type: 'style-card',
                role: 'prompt-part',
                label: L('Style', 'स्टाइल'),
                options: opts(
                  ['photo', 'Photo', 'फ़ोटो'],
                  ['cinema', 'Cinema', 'सिनेमा'],
                  ['paint', 'Painting', 'पेंटिंग'],
                  ['flat', 'Flat', 'फ़्लैट'],
                ),
                default: 'photo',
              },
              {
                id: 'strength',
                type: 'slider',
                role: 'param',
                sends: 'prompt_strength',
                group: 'advanced',
                min: 0,
                max: 100,
                step: 5,
                default: 70,
                label: L(
                  'How closely to follow the text',
                  'टेक्स्ट कितना माने',
                ),
              },
              {
                id: 'quality',
                type: 'choice',
                role: 'param',
                sends: 'quality',
                group: 'advanced',
                options: opts(['std', 'Standard'], ['hd', 'High']),
                default: 'std',
                label: L('Quality', 'क्वालिटी'),
              },
            ] as Raw[])
          : []),
        {
          id: 'aspect',
          type: 'aspect',
          role: 'param',
          sends: 'aspect_ratio',
          options: ASPECTS,
          default: '16:9',
          label: L('Shape', 'आकार'),
        },
        {
          id: 'count',
          type: 'number',
          role: 'units',
          sends: 'n',
          min: 1,
          max: 4,
          step: 1,
          default: 1,
          label: L('How many', 'कितनी'),
        },
        {
          id: 'seed',
          type: 'seed',
          role: 'param',
          sends: 'seed',
          group: 'advanced',
          label: L('Seed', 'सीड'),
          help: L('Same seed and text give the same picture.'),
        },
      ]);
    case 'video':
      return decl([
        {
          id: 'prompt',
          type: 'longtext',
          role: 'prompt',
          required: true,
          label: L('What happens in the clip?', 'क्लिप में क्या होता है?'),
        },
        {
          id: 'camera',
          type: 'choice',
          role: 'prompt-part',
          label: L('Camera', 'कैमरा'),
          options: opts(
            ['static', 'Still'],
            ['pan', 'Slow pan'],
            ['zoom', 'Push in'],
          ),
          default: 'static',
        },
        {
          id: 'aspect',
          type: 'aspect',
          role: 'param',
          sends: 'aspect_ratio',
          options: ASPECTS,
          default: '16:9',
          label: L('Shape', 'आकार'),
        },
        {
          id: 'seconds',
          type: 'slider',
          role: 'units',
          sends: 'duration',
          min: 2,
          max: pro ? 10 : 5,
          step: 1,
          default: 4,
          label: L('Seconds', 'सेकंड'),
        },
        {
          id: 'res',
          type: 'choice',
          role: 'param',
          sends: 'resolution',
          options: opts(['480p', '480p'], ['720p', '720p']),
          default: '480p',
          label: L('Resolution', 'रेज़ोल्यूशन'),
        },
        {
          id: 'audio',
          type: 'toggle',
          role: 'param',
          sends: 'audio',
          group: 'advanced',
          default: false,
          label: L('Make sound too', 'आवाज़ भी बनाएँ'),
        },
        {
          id: 'ref',
          type: 'file',
          role: 'reference',
          accept: ['image'],
          group: 'advanced',
          label: L('Start from a picture', 'तस्वीर से शुरू करें'),
        },
        {
          id: 'negative',
          type: 'text',
          role: 'negative',
          group: 'advanced',
          label: L('Leave out', 'क्या न हो'),
        },
      ]);
    case 'voice':
      return decl([
        {
          id: 'text',
          type: 'longtext',
          role: 'prompt',
          required: true,
          label: L('What should be said?', 'क्या बोलना है?'),
        },
        {
          id: 'lang',
          type: 'choice',
          role: 'param',
          sends: 'language',
          options: opts(['hi', 'Hindi', 'हिन्दी'], ['en', 'English']),
          default: 'hi',
          label: L('Language', 'भाषा'),
        },
        {
          id: 'voice',
          type: 'voice',
          role: 'param',
          sends: 'voice',
          options: opts(['asha', 'Asha'], ['dev', 'Dev'], ['mira', 'Mira']),
          default: 'asha',
          label: L('Voice', 'आवाज़'),
        },
        {
          id: 'speed',
          type: 'slider',
          role: 'param',
          sends: 'speed',
          min: 0.5,
          max: 2,
          step: 0.1,
          default: 1,
          label: L('Speed', 'गति'),
        },
        {
          id: 'emotion',
          type: 'choice',
          role: 'param',
          sends: 'emotion',
          group: 'advanced',
          showIf: { field: 'lang', in: ['en'] },
          options: opts(
            ['neutral', 'Neutral'],
            ['warm', 'Warm'],
            ['excited', 'Excited'],
          ),
          default: 'neutral',
          label: L('Feeling', 'भाव'),
        },
      ]);
    case 'music':
    case 'audio':
      return decl([
        {
          id: 'prompt',
          type: 'longtext',
          role: 'prompt',
          required: true,
          label: L('What kind of music?', 'कैसा संगीत?'),
        },
        {
          id: 'mood',
          type: 'choice',
          role: 'prompt-part',
          options: opts(
            ['calm', 'Calm'],
            ['happy', 'Happy'],
            ['tense', 'Tense'],
          ),
          default: 'calm',
          label: L('Mood', 'मूड'),
        },
        {
          id: 'minutes',
          type: 'slider',
          role: 'units',
          sends: 'minutes',
          min: 1,
          max: 3,
          step: 1,
          default: 1,
          label: L('Minutes', 'मिनट'),
        },
        {
          id: 'instrumental',
          type: 'toggle',
          role: 'param',
          sends: 'instrumental',
          default: true,
          label: L('No singing', 'बिना गाने के'),
        },
      ]);
    case 'captions':
      return decl([
        {
          id: 'text',
          type: 'longtext',
          role: 'prompt',
          required: true,
          label: L('Script', 'स्क्रिप्ट'),
        },
        {
          id: 'maxline',
          type: 'number',
          role: 'param',
          sends: 'max_line',
          min: 10,
          max: 60,
          step: 1,
          default: 32,
          label: L('Letters per line', 'एक लाइन में अक्षर'),
        },
      ]);
    case 'thumbnail':
      return decl([
        {
          id: 'title',
          type: 'text',
          role: 'prompt',
          required: true,
          label: L('Title', 'शीर्षक'),
        },
        {
          id: 'subject',
          type: 'text',
          role: 'prompt-part',
          label: L('Main subject', 'मुख्य विषय'),
        },
        {
          id: 'overlay',
          type: 'text',
          role: 'param',
          sends: 'overlay_text',
          group: 'advanced',
          label: L('Text on top', 'ऊपर लिखा टेक्स्ट'),
        },
      ]);
    default:
      return [];
  }
}

const labelOf = (d: ParamDecl) => d.label.en;
const isEmpty = (v: unknown) =>
  v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** The StudioEngine contract, as small as it can be (reports, never fixes). */
export function createMockStudioEngine(): StudioEngine {
  const all = (f: FormSpec) =>
    [...f.basic, ...f.advanced].sort((a, b) => a.order - b.order);
  const visible = (f: FormSpec, v: FormValues): ParamDecl[] =>
    all(f).filter((d) => {
      if (!d.showIf) return true;
      const cur = v[d.showIf.field];
      return d.showIf.in.includes(String(cur));
    });
  return {
    buildForm(modelParams, ids, canEnhance) {
      const sorted = [...modelParams].sort((a, b) => a.order - b.order);
      return {
        ...ids,
        basic: sorted.filter((d) => d.group === 'basic'),
        advanced: sorted.filter((d) => d.group === 'advanced'),
        canEnhance,
      };
    },
    visible,
    defaults(form) {
      const out: Record<string, string | number | boolean | string[]> = {};
      for (const d of all(form))
        if (d.default !== undefined)
          out[d.id] = Array.isArray(d.default) ? [...d.default] : d.default;
      return out;
    },
    validate(form, values) {
      const errors: Record<string, P3Text> = {};
      for (const d of visible(form, values)) {
        const v = values[d.id];
        if (isEmpty(v)) {
          if (d.required) errors[d.id] = L(`${labelOf(d)} is needed.`);
          continue;
        }
        if (['number', 'slider', 'seed'].includes(d.type)) {
          if (typeof v !== 'number' || Number.isNaN(v))
            errors[d.id] = L(`${labelOf(d)} must be a number.`);
          else if (d.min !== undefined && v < d.min)
            errors[d.id] = L(`${labelOf(d)} is at least ${d.min}.`);
          else if (d.max !== undefined && v > d.max)
            errors[d.id] = L(`${labelOf(d)} is at most ${d.max}.`);
        } else if (
          ['choice', 'style-card', 'aspect', 'voice'].includes(d.type) &&
          d.options.length &&
          !d.options.some((o) => o.value === String(v))
        )
          errors[d.id] = L(`${labelOf(d)}: pick one of the choices.`);
      }
      return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
    },
    assemble(form, values) {
      const shown = visible(form, values);
      const main = shown.find((d) => d.role === 'prompt');
      const parts = shown
        .filter((d) => d.role === 'prompt-part' && !isEmpty(values[d.id]))
        .map((d) => `${labelOf(d)}: ${String(values[d.id])}`);
      const base = main ? String(values[main.id] ?? '') : '';
      const prompt = [base, ...parts].filter(Boolean).join('\n');
      const neg = shown.find((d) => d.role === 'negative');
      const negative = neg ? String(values[neg.id] ?? '') : '';
      const params: Record<string, string | number | boolean> = {};
      const references: Record<string, string[]> = {};
      let units = 1;
      for (const d of shown) {
        const v = values[d.id];
        if (isEmpty(v)) continue;
        if ((d.role === 'param' || d.role === 'units') && d.sends)
          params[d.sends] = Array.isArray(v) ? v.join(',') : (v as never);
        if (d.role === 'units' && typeof v === 'number') units = v;
        if (d.role === 'reference')
          references[d.id] = Array.isArray(v) ? [...v] : [String(v)];
      }
      const lines = [
        prompt,
        negative ? `Leave out: ${negative}` : '',
        ...Object.entries(params).map(([k, v]) => `${k} = ${String(v)}`),
        ...Object.entries(references).map(
          ([k, v]) => `${k}: ${v.length} file${v.length === 1 ? '' : 's'}`,
        ),
      ].filter(Boolean);
      const req: AssembledRequest = {
        prompt,
        ...(negative ? { negativePrompt: negative } : {}),
        params,
        references,
        units,
        preview: lines.join('\n'),
      };
      return req;
    },
  };
}

export interface MockSavedRun {
  readonly studioId: string;
  readonly modelId: string;
  readonly values: FormValues;
  readonly request: AssembledRequest;
  readonly projectId: string | null;
}
export interface MockStudioOptions {
  /** Saves the result (the screen turns it into an Asset Library item). */
  save(run: MockSavedRun): string;
  /** Milliseconds between progress steps (tests keep it tiny). */
  stepMs?: number;
}

const MODEL_ROWS = [
  { suffix: 'fast', en: 'Fast', tier: 'fast', rate: 2, locked: false },
  { suffix: 'pro', en: 'Pro', tier: 'balanced', rate: 5, locked: false },
  { suffix: 'max', en: 'Max', tier: 'best', rate: 12, locked: true },
] as const;

export function createMockStudioService(
  opts: MockStudioOptions,
): StudioService {
  const engine = createMockStudioEngine();
  const rate = (modelId: string) =>
    MODEL_ROWS.find((r) => modelId.endsWith(`-${r.suffix}`))?.rate ?? 2;
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    async form(studioId, modelId) {
      return engine.buildForm(
        sampleParams(studioId, modelId),
        { studioId, modelId },
        true,
      );
    },
    async models(studioId) {
      if (!sampleParams(studioId, `${studioId}-fast`).length) return [];
      return MODEL_ROWS.map((r) => ({
        id: `${studioId}-${r.suffix}`,
        name: L(r.en),
        tier: r.tier,
        connected: true,
        locked: r.locked,
      }));
    },
    preview: (form, values) => engine.assemble(form, values),
    async estimate(studioId, modelId, values) {
      const form = engine.buildForm(
        sampleParams(studioId, modelId),
        { studioId, modelId },
        true,
      );
      const units = engine.assemble(form, values).units;
      const max = Math.max(1, Math.ceil(units * rate(modelId)));
      return { min: Math.max(1, Math.floor(max * 0.8)), max };
    },
    async enhance(studioId, modelId, values) {
      const form = engine.buildForm(
        sampleParams(studioId, modelId),
        { studioId, modelId },
        true,
      );
      const main = form.basic.find((d) => d.role === 'prompt');
      const cur = main ? String(values[main.id] ?? '').trim() : '';
      if (!main || !cur) {
        const failure: P3Failure = {
          code: 'enhance-empty',
          message: L(
            'Write a few words first, then Director can improve them.',
          ),
        };
        return { ok: false, failure } satisfies Result<FormValues>;
      }
      const better = /, cinematic light/.test(cur)
        ? cur
        : `${cur}, cinematic light, sharp detail, natural colours`;
      return { ok: true, value: { ...values, [main.id]: better } };
    },
    async *run(studioId, modelId, values, projectId) {
      const form = engine.buildForm(
        sampleParams(studioId, modelId),
        { studioId, modelId },
        true,
      );
      const request = engine.assemble(form, values);
      const step = opts.stepMs ?? 120;
      for (const pct of [15, 55]) {
        await pause(step);
        yield { type: 'progress', pct } as const;
      }
      if (/fail this one/i.test(request.prompt)) {
        yield {
          type: 'failure',
          failure: {
            code: 'provider',
            message: L('The model could not make this. No credits were used.'),
          },
        } as const;
        return;
      }
      await pause(step);
      yield { type: 'progress', pct: 100 } as const;
      yield {
        type: 'result',
        assetId: opts.save({ studioId, modelId, values, request, projectId }),
      } as const;
    },
  };
}
