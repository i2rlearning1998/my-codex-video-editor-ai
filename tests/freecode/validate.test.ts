import { describe, it, expect } from 'vitest';
import { validate, SOURCE_LIMIT } from '../../src/freecode/validate';
const source = (body = '') =>
  `export default {meta:{id:'test',name:'Test',version:'1.0.0',category:'Test',duration:2,params:[]},init(){},renderFrame(){${body}}}`;
describe('Free code validator', () => {
  it('reads literal metadata without running source', () => {
    const r = validate(source('throw Error("never execute")'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meta.seekable).toBe(false);
  });
  it.each([
    'fetch("x")',
    'new XMLHttpRequest()',
    'new WebSocket("x")',
    'new EventSource("x")',
    'importScripts("x")',
    'new Worker("x")',
    'import("x")',
    'navigator.sendBeacon("x")',
    'localStorage.x=1',
    'sessionStorage.x=1',
    'indexedDB.open("x")',
    'document.cookie',
    'window.parent.document',
    'top.document',
    'opener.document',
    'frames[0]',
    'form.submit()',
    'form.requestSubmit()',
    'window["fetch"]("x")',
  ])('rejects %s with a line', (body) => {
    const r = validate(source('\n' + body));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.line === 2)).toBe(true);
  });
  it('accepts window.__block, classes and arrays', () =>
    expect(
      validate(
        source('const a=[1,2]; class Particle {}').replace(
          'export default',
          'window.__block =',
        ),
      ).ok,
    ).toBe(true));
  it('rejects computed metadata and invalid params', () => {
    expect(
      validate(source().replace('duration:2', 'duration:Math.random()')).ok,
    ).toBe(false);
    expect(
      validate(
        source().replace(
          'params:[]',
          "params:[{name:'x',label:'X',type:'number',default:4,min:0,max:1,step:1}]",
        ),
      ).ok,
    ).toBe(false);
  });
  it('enforces UTF-8 source byte limit and syntax', () => {
    expect(validate('é'.repeat(SOURCE_LIMIT / 2 + 1)).ok).toBe(false);
    expect(validate(source('const =')).ok).toBe(false);
  });
});
