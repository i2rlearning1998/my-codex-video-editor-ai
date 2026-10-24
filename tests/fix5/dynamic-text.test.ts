import { describe, expect, it } from 'vitest';
import {
  applyDynamicText,
  fieldToken,
  resolveFields,
} from '../../src/render/dynamic-text';

const NOW = new Date(2026, 11, 5, 14, 7, 9).getTime(); // 5 Dec 2026, 14:07:09
const context = { time: 75.9, sceneNumber: 2, sceneCount: 12, now: NOW };

describe('[TXT-037] dynamic text fields', () => {
  it('resolves date, time, scene, counter and timecode with their formats', () => {
    expect(resolveFields('{{date}}', context)).toBe('5 Dec 2026');
    expect(resolveFields('{{date:YYYY-MM-DD}}', context)).toBe('2026-12-05');
    expect(resolveFields('{{date:MMMM D}}', context)).toBe('December 5');
    expect(resolveFields('{{time}}', context)).toBe('14:07');
    expect(resolveFields('{{time:hh:mm A}}', context)).toBe('02:07 PM');
    expect(resolveFields('{{scene:00}}', context)).toBe('02');
    expect(resolveFields('Page {{scene}} of {{scenes}}', context)).toBe(
      'Page 2 of 12',
    );
    expect(resolveFields('{{counter:000}}', context)).toBe('075');
    expect(resolveFields('{{timecode}}', context)).toBe('1:15');
    expect(resolveFields('{{timecode:mm:ss}}', context)).toBe('01:15');
  });
  it('leaves unknown braces and plain text exactly as typed', () => {
    expect(resolveFields('{{nope}} {x} hello', context)).toBe(
      '{{nope}} {x} hello',
    );
  });
  it('builds the token a panel inserts', () => {
    expect(fieldToken('date', 'YYYY-MM-DD')).toBe('{{date:YYYY-MM-DD}}');
    expect(fieldToken('scene')).toBe('{{scene}}');
  });
  it('rewrites text layers (also inside groups) and nothing else', () => {
    const text = (id: string, value: string) => ({
      id,
      type: 'text',
      properties: { text: { type: 'string', value } },
    });
    const composition = {
      layers: [
        text('a', 'Scene {{scene}}'),
        {
          id: 'g',
          type: 'group',
          properties: {},
          children: [text('b', '{{counter}}s')],
        },
        text('c', 'plain'),
      ],
    } as never;
    const out = applyDynamicText(composition, context) as never as {
      layers: {
        properties: { text?: { value: string } };
        children?: { properties: { text: { value: string } } }[];
      }[];
    };
    expect(out.layers[0]!.properties.text!.value).toBe('Scene 2');
    expect(out.layers[1]!.children![0]!.properties.text.value).toBe('75s');
    expect(out.layers[2]).toBe((composition as never as typeof out).layers[2]);
  });
});
