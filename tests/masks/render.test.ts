import { it, expect } from 'vitest';
import { drawMaskedItems, type MaskItem } from '../../src/masks/render';
import { IDENTITY_MATRIX } from '../../src/core/transforms';
// One-pixel Canvas fake: source-over and destination-in alpha only.
function canvas() {
  let alpha = 0;
  const c = { width: 1, height: 1, getContext: () => ctx };
  const ctx = {
    canvas: c,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() {},
    restore() {},
    setTransform() {},
    createImageData() {
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData(p: { data: Uint8ClampedArray }) {
      alpha = p.data[3]! / 255;
    },
    getImageData() {
      return {
        data: new Uint8ClampedArray([255, 255, 255, Math.round(alpha * 255)]),
      };
    },
    drawImage(source: ReturnType<typeof canvas>) {
      const a = source.getContext().getImageData().data[3]! / 255;
      alpha =
        this.globalCompositeOperation === 'destination-in'
          ? alpha * a
          : a + alpha * (1 - a);
    },
  };
  return c;
}
it('group children composite before feather/opacity is applied once', () => {
  const scope = {
    id: 'group',
    matrix: IDENTITY_MATRIX,
    masks: [
      {
        id: 'm',
        type: 'rect' as const,
        geometry: [
          [0, 0],
          [1, 1],
        ] as [number, number][],
        opacity: 0.25,
      },
    ],
  };
  const items: MaskItem[] = [
    { id: 'a', ancestors: ['group'], maskScopes: [scope] },
    { id: 'b', ancestors: ['group'], maskScopes: [scope] },
  ];
  const target = canvas(),
    errors: string[] = [];
  const paint = (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) => {
    const source = canvas();
    source
      .getContext()
      .putImageData({ data: new Uint8ClampedArray([0, 0, 0, 128]) });
    ctx.drawImage(source as unknown as HTMLCanvasElement, 0, 0);
  };
  expect(
    drawMaskedItems(
      target.getContext() as unknown as CanvasRenderingContext2D,
      items,
      items,
      paint,
      errors,
      () => canvas() as unknown as HTMLCanvasElement,
    ),
  ).toBe(true);
  expect(target.getContext().getImageData().data[3]).toBe(48);
  expect(errors).toEqual([]);
});
it('missing matte fails closed and produces a readable warning', () => {
  const target = canvas(),
    errors: string[] = [],
    items: MaskItem[] = [
      {
        id: 'a',
        ancestors: [],
        maskScopes: [
          {
            id: 'a',
            matrix: IDENTITY_MATRIX,
            masks: [],
            matte: { layerId: 'missing', type: 'alpha' },
          },
        ],
      },
    ];
  drawMaskedItems(
    target.getContext() as unknown as CanvasRenderingContext2D,
    items,
    items,
    (ctx) =>
      ctx.putImageData(
        { data: new Uint8ClampedArray([0, 0, 0, 255]) } as ImageData,
        0,
        0,
      ),
    errors,
    () => canvas() as unknown as HTMLCanvasElement,
  );
  expect(target.getContext().getImageData().data[3]).toBe(0);
  expect(errors[0]).toContain('missing');
});
