import { expect, it } from 'vitest';
import { compileBlock } from '../../src/blocks/sandbox/compile';
import { drawingFacade } from '../../src/blocks/sandbox/facade';
import { recording } from './recording';
export const source = (body: string) =>
  `({id:'custom',version:'1.0.0',name:'Custom',category:'Test',defaultDuration:4,params:[],render(ctx,t,size,params,seed){${body}}})`;
it('B2 metadata parses without execution and valid source uses drawing/math/helpers', () => {
  const r = compileBlock(
    source(
      "ctx.fillStyle='#ff0088';const x=helpers.rngFor(seed,1)*size.width;ctx.fillRect(x,t,10,10);",
    ),
  );
  expect(r.ok).toBe(true);
  expect(compileBlock(source('while(true){}')).ok).toBe(true);
  expect(compileBlock("fetch('x');").ok).toBe(false);
});
for (const body of [
  "fetch('https://example.com')",
  'new XMLHttpRequest()',
  "new WebSocket('x')",
  "importScripts('x')",
  "eval('1')",
  "Function('1')()",
  "indexedDB.open('x')",
  'localStorage.x',
  'window.x',
  'document.x',
  "import('x')",
  'Math.random()',
  'Date.now()',
  'performance.now()',
  'ctx.canvas.width=90000',
  "ctx['con'+'structor']",
  "ctx.fillRect.constructor('return this')()",
  "globalThis.fetch('x')",
  'const x=() => 1;',
  'params.x=1',
  'Math.sin=0',
  'this.x=1',
  "f\\u0065tch('x')",
])
  it('B2 rejects ' + body, () =>
    expect(compileBlock(source(body)).ok).toBe(false),
  );
it('B2 facade hides canvas, rejects restore underflow and repairs unmatched saves', () => {
  const r = recording(),
    f = drawingFacade(r.ctx);
  expect(Object.getPrototypeOf(f.ctx)).toBeNull();
  expect(f.ctx.canvas).toBeUndefined();
  expect(() => (f.ctx.restore as () => void)()).toThrow('Unbalanced');
  (f.ctx.save as () => void)();
  expect(() => f.finish()).toThrow('Unbalanced');
  expect(r.depth).toBe(0);
  expect(() =>
    (f.ctx.fillRect as (...x: number[]) => void)(NaN, 0, 1, 1),
  ).toThrow();
});
