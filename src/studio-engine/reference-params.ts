import { paramDeclSchema, type ParamDecl } from '../contracts/p3';
/** UNVERIFIED starting points, not Platform Config or claims of provider support.
 * The owner must compare with Autodraft AI and each chosen model before copying.
 */
export const REFERENCE_PARAMS_STATUS = 'unverified' as const;
const field = (
  id: string,
  type: ParamDecl['type'],
  role: ParamDecl['role'],
  label: string,
  extra: Partial<ParamDecl> = {},
): ParamDecl =>
  paramDeclSchema.parse({ id, type, role, label: { en: label }, ...extra });
const options = (...values: string[]) =>
  values.map((value) => ({ value, label: { en: value } }));
const prompt = () =>
  field('prompt', 'longtext', 'prompt', 'Prompt', {
    required: true,
    default: '',
  });
const negative = () =>
  field('negative', 'longtext', 'negative', 'Avoid', {
    default: '',
    group: 'advanced',
  });
const param = (
  id: string,
  label: string,
  type: ParamDecl['type'],
  extra: Partial<ParamDecl> = {},
) => field(id, type, 'param', label, { sends: id, ...extra });
const aspect = () =>
  param('aspect', 'Aspect ratio', 'aspect', {
    default: '16:9',
    options: options('16:9', '9:16', '1:1'),
  });
const seed = () =>
  param('seed', 'Seed', 'seed', {
    default: -1,
    min: -1,
    max: 2147483647,
    group: 'advanced',
  });
const style = () =>
  field('style', 'style-card', 'prompt-part', 'Style', {
    default: 'natural',
    options: options('natural', 'illustration', 'cinematic'),
  });
const count = (
  id: string,
  label: string,
  min: number,
  max: number,
  value: number,
) =>
  field(id, 'number', 'units', label, { sends: id, min, max, default: value });
const ordered = (items: ParamDecl[]) =>
  items.map((p, order) => ({ ...p, order }));
export const REFERENCE_PARAMS: Record<string, ParamDecl[]> = {
  image: ordered([
    prompt(),
    negative(),
    aspect(),
    count('count', 'Images', 1, 8, 1),
    seed(),
    param('strength', 'Prompt strength', 'slider', {
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.7,
    }),
    style(),
    param('quality', 'Quality', 'choice', {
      default: 'standard',
      options: options('standard', 'high'),
    }),
  ]),
  video: ordered([
    prompt(),
    negative(),
    aspect(),
    count('duration', 'Seconds', 1, 30, 5),
    param('resolution', 'Resolution', 'choice', {
      default: '720p',
      options: options('480p', '720p'),
    }),
    seed(),
    field('camera', 'choice', 'prompt-part', 'Camera motion', {
      default: 'still',
      options: options('still', 'pan', 'dolly'),
    }),
    param('audio', 'Audio', 'toggle', { default: false }),
    field('reference', 'file', 'reference', 'Reference image', {
      accept: ['image'],
      default: [],
    }),
  ]),
  voice: ordered([
    field('text', 'longtext', 'prompt', 'Text', {
      required: true,
      default: '',
    }),
    param('language', 'Language', 'choice', {
      default: 'en',
      options: options('en', 'hi'),
    }),
    param('voice', 'Voice', 'voice', { required: true, default: '' }),
    param('speed', 'Speed', 'slider', {
      min: 0.5,
      max: 2,
      step: 0.1,
      default: 1,
    }),
    param('pitch', 'Pitch', 'slider', { min: -12, max: 12, default: 0 }),
    field('emotion', 'choice', 'prompt-part', 'Emotion', {
      default: 'neutral',
      options: options('neutral', 'warm', 'excited'),
    }),
    param('pauses', 'Pauses', 'toggle', { default: true }),
  ]),
  music: ordered([
    prompt(),
    field('mood', 'choice', 'prompt-part', 'Mood', {
      default: 'calm',
      options: options('calm', 'upbeat', 'dramatic'),
    }),
    field('genre', 'choice', 'prompt-part', 'Genre', {
      default: 'ambient',
      options: options('ambient', 'orchestral', 'electronic'),
    }),
    count('minutes', 'Minutes', 0.1, 10, 1),
    param('instrumental', 'Instrumental', 'toggle', { default: true }),
  ]),
  captions: ordered([
    param('language', 'Language', 'choice', {
      default: 'en',
      options: options('en', 'hi'),
    }),
    style(),
    param('maxLineLength', 'Characters per line', 'number', {
      min: 10,
      max: 80,
      step: 1,
      default: 40,
    }),
  ]),
  thumbnail: ordered([
    field('title', 'text', 'prompt', 'Title', { required: true, default: '' }),
    field('subject', 'text', 'prompt-part', 'Subject', { default: '' }),
    field('overlay', 'text', 'prompt-part', 'Text overlay', { default: '' }),
    style(),
  ]),
};
