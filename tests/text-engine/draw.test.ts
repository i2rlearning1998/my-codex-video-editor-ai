import { it, expect, vi } from 'vitest';
import { drawStructuredText } from '../../src/text-engine/draw';
import { DEFAULT_TEXT_STYLE } from '../../src/render/text-style';
import { textEngineProperty } from '../../src/text-engine/layout';
it('draws whole RTL lines at right origin, with separate markers', () => {
  const calls: { text: string; x: number; align: string; direction: string }[] =
    [];
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    font: '',
    direction: 'ltr',
    textAlign: 'left',
    textBaseline: '',
    fillStyle: '',
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText(text: string, x: number) {
      calls.push({ text, x, align: this.textAlign, direction: this.direction });
    },
  };
  drawStructuredText(
    context as unknown as CanvasRenderingContext2D,
    'مرحبا',
    200,
    20,
    '#ffffff',
    DEFAULT_TEXT_STYLE,
    { direction: 'rtl', list: { kind: 'bullet', indent: 28 } },
  );
  expect(calls).toEqual([
    { text: 'مرحبا', x: 172, align: 'right', direction: 'rtl' },
    { text: '•', x: 178, align: 'left', direction: 'rtl' },
  ]);
  expect(context.restore).toHaveBeenCalledOnce();
});
it('draws table borders and backgrounds and returns cell handles', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    font: '',
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
  };
  const cells = drawStructuredText(
    context as unknown as CanvasRenderingContext2D,
    '',
    200,
    20,
    '#ffffff',
    DEFAULT_TEXT_STYLE,
    {
      table: {
        rows: [[{ text: 'हिंदी', style: { background: '#112233' } }]],
        columnWidths: [1],
      },
    },
  );
  expect(cells[0]?.id).toBe('cell-0-0');
  expect(context.strokeRect).toHaveBeenCalledOnce();
  expect(context.fillRect).toHaveBeenCalledOnce();
  expect(context.fillText.mock.calls[0]?.[0]).toBe('हिंदी');
});
it('property builder validates before the existing command bus', () => {
  expect(textEngineProperty({ direction: 'auto' })).toEqual({
    type: 'string',
    value: '{"direction":"auto"}',
    animated: false,
    keyframes: [],
    constraints: [],
  });
  expect(() =>
    textEngineProperty({ list: { kind: 'bullet', levels: [4] } }),
  ).toThrow();
});
