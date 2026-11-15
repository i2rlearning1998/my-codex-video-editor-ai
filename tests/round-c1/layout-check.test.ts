// RDC1-040: the layout validator (pure): safe area, text fit (also Hindi),
// overlapping text, contrast, wrong media shape; it runs inside validatePlan.
import { describe, expect, it } from 'vitest';
import { checkLayout } from '../../src/video-plan/layout-check';
import { validatePlan } from '../../src/video-plan';
import { defaultConfig, platformConfigSchema } from '../../src/platform-config';
import { runTool } from '../../src/tools';

const plan = (layers: unknown[], aspect = '9:16', palette?: unknown) =>
  validatePlan({
    format: 'video-plan',
    version: 4,
    meta: { title: 'T', aspect },
    ...(palette ? { feel: { palette } } : {}),
    scenes: [{ id: 's', layers }],
  }).plan!;
describe('[RDC1-040] layout validator', () => {
  it('[RDC1-040] text longer than its box is an error (Hindi too); short text is fine in 9:16, 1:1 and 16:9', () => {
    const long = 'बहुत लंबा शीर्षक '.repeat(14).trim().slice(0, 270);
    expect(
      checkLayout(
        plan([
          {
            id: 't',
            kind: 'title',
            text: long,
            anchor: 'bottom',
            size: 'large',
          },
        ]),
      ).some((f) => f.level === 'error' && /does not fit/.test(f.text)),
    ).toBe(true);
    for (const aspect of ['9:16', '1:1', '16:9'])
      expect(
        checkLayout(
          plan([{ id: 't', kind: 'title', text: 'How rain forms' }], aspect),
        ),
      ).toEqual([]);
  });
  it('[RDC1-040] safe margin, overlap, contrast, media shape and outside the canvas are warnings with a fix', () => {
    const f = checkLayout(
      plan(
        [
          { id: 'a', kind: 'text', text: 'Edge', at: { x: 50, y: 4 } },
          { id: 'b', kind: 'text', text: 'One', at: { x: 50, y: 50 } },
          {
            id: 'c',
            kind: 'text',
            text: 'Two',
            at: { x: 50, y: 50 },
            color: '#111111',
          },
          {
            id: 'm',
            kind: 'media',
            size: 'full',
            mediaIntent: { query: 'x', orientation: 'landscape' },
          },
          { id: 'o', kind: 'shape', shape: 'rectangle', at: { x: 140, y: 50 } },
        ],
        '9:16',
      ),
    );
    const text = f.map((x) => `${x.level}: ${x.text} ${x.fix}`).join('\n');
    expect(text).toMatch(
      /warning: .*"a": the text reaches into the 5% safe margin/,
    );
    expect(text).toMatch(/texts "b" and "c" cover each other/);
    expect(text).toMatch(/asks for landscape media on a portrait canvas/);
    expect(text).toMatch(/"o" is placed outside the canvas/);
    const dark = checkLayout(
      plan([{ id: 'd', kind: 'text', text: 'Hi', color: '#222222' }], '16:9', {
        background: '#101010',
        text: '#ffffff',
        accent: '#ff0000',
      }),
    );
    expect(dark[0]!.text).toMatch(/hard to read/);
  });
  it('[RDC1-040] validatePlan (the tool) reports layout errors and blocks; warnings show', async () => {
    const c = platformConfigSchema.parse(defaultConfig());
    const out = await runTool(
      'validatePlan',
      {
        plan: {
          format: 'video-plan',
          version: 4,
          meta: { title: 'T', aspect: '9:16' },
          scenes: [
            {
              id: 's',
              layers: [
                {
                  id: 't',
                  kind: 'title',
                  text: 'x '.repeat(130),
                  anchor: 'bottom',
                  size: 'large',
                },
              ],
            },
          ],
        },
      },
      {
        config: c,
        planId: 'free',
        userId: 'u',
        media: { builtin: {}, rest: async () => [] },
      },
    );
    expect(out.ok && out.output.ok).toBe(false);
    expect(out.ok && out.output.errors[0]).toMatch(
      /does not fit.*Shorten the text/,
    );
  });
});
