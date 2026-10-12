import ts from 'typescript';
import { validateInfo } from '../blocks/params';
import type { FreeCodeMeta, ValidationError, ValidationResult } from './types';
export const SOURCE_LIMIT = 1024 * 1024;
const denied = new Set([
  '__fcGuard',
  '__fcAllocate',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'Worker',
  'SharedWorker',
  'sendBeacon',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'cookie',
  'parent',
  'top',
  'opener',
  'frames',
  'submit',
  'requestSubmit',
  'eval',
  'Function',
  'constructor',
  '__proto__',
  'prototype',
  'location',
  'open',
  'serviceWorker',
]);
function literal(n: ts.Expression): unknown {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (n.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(n) &&
    n.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(n.operand)
  )
    return -Number(n.operand.text);
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(literal);
  if (ts.isObjectLiteralExpression(n)) {
    const result: Record<string, unknown> = Object.create(null);
    for (const p of n.properties) {
      if (
        !ts.isPropertyAssignment(p) ||
        (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name))
      )
        throw Error(
          'Metadata needs literal named fields, without spreads or getters.',
        );
      const name = p.name.text;
      if (denied.has(name) || Object.hasOwn(result, name))
        throw Error('Duplicate or unsafe metadata field: ' + name);
      result[name] = literal(p.initializer);
    }
    return result;
  }
  throw Error(
    'Metadata must be literal JSON values, not variables or function calls.',
  );
}
export function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(
    'freecode.js',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
}
/** Static diagnostics only. This deny scan is NOT a complete JavaScript security proof. */
export function validate(source: string): ValidationResult {
  const errors: ValidationError[] = [];
  if (
    typeof source !== 'string' ||
    new TextEncoder().encode(source).byteLength > SOURCE_LIMIT
  )
    return {
      ok: false,
      errors: [{ line: 1, message: 'Source exceeds the 1 MB UTF-8 limit.' }],
    };
  try {
    const file = parse(source);
    const error = (n: ts.Node, message: string) => {
      if (errors.length < 100)
        errors.push({
          line: file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1,
          message,
        });
    };
    const diagnostics =
      ts.transpileModule(source, {
        fileName: 'freecode.js',
        reportDiagnostics: true,
        compilerOptions: {
          allowJs: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).diagnostics ?? [];
    for (const d of diagnostics)
      if (d.category === ts.DiagnosticCategory.Error)
        errors.push({
          line: file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1,
          message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
        });
    let object: ts.ObjectLiteralExpression | undefined;
    for (const statement of file.statements) {
      let expression: ts.Expression | undefined;
      if (ts.isExportAssignment(statement) && !statement.isExportEquals)
        expression = statement.expression;
      if (
        ts.isExpressionStatement(statement) &&
        ts.isBinaryExpression(statement.expression)
      ) {
        const b = statement.expression;
        if (
          b.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(b.left) &&
          b.left.getText(file) === 'window.__block'
        )
          expression = b.right;
      }
      if (expression) {
        while (ts.isParenthesizedExpression(expression))
          expression = expression.expression;
        if (object || !ts.isObjectLiteralExpression(expression))
          error(
            statement,
            'Define exactly one literal object with export default or window.__block =.',
          );
        else object = expression;
      }
    }
    const visit = (n: ts.Node, depth: number): void => {
      if (depth > 150) {
        error(n, 'Code is nested too deeply; split it into smaller functions.');
        return;
      }
      if (ts.isIdentifier(n) && denied.has(n.text))
        error(
          n,
          `${n.text} is unavailable. Use inline assets and the canvas/helpers only.`,
        );
      if (
        ts.isElementAccessExpression(n) &&
        ts.isStringLiteralLike(n.argumentExpression) &&
        denied.has(n.argumentExpression.text)
      )
        error(n, 'This browser capability is unavailable in Free code.');
      if (
        n.kind === ts.SyntaxKind.ImportKeyword ||
        ts.isImportDeclaration(n) ||
        ts.isExportDeclaration(n)
      )
        error(
          n,
          'Imports are unavailable. Select bundled libraries with meta.libs.',
        );
      ts.forEachChild(n, (c) => visit(c, depth + 1));
    };
    visit(file, 0);
    if (!object)
      return {
        ok: false,
        errors: [
          ...errors,
          {
            line: 1,
            message:
              'Export a literal animation object using export default or window.__block =.',
          },
        ],
      };
    const props = object.properties;
    const metas = props.filter(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name.getText(file).replace(/['"]/g, '') === 'meta',
    );
    if (metas.length !== 1 || !ts.isPropertyAssignment(metas[0]!))
      throw Error('Provide exactly one literal meta object.');
    const metaNode = metas[0];
    const raw = literal(metaNode.initializer) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw Error('meta must be an object.');
    const meta = {
      ...raw,
      seekable: raw.seekable ?? false,
      keepFrame: raw.keepFrame ?? false,
      thumbnailTime: raw.thumbnailTime ?? 0,
      libs: raw.libs ?? [],
    } as unknown as FreeCodeMeta;
    validateInfo({ ...meta, defaultDuration: meta.duration });
    if (
      meta.duration > 120 ||
      typeof meta.seekable !== 'boolean' ||
      typeof meta.keepFrame !== 'boolean' ||
      !Number.isFinite(meta.thumbnailTime) ||
      meta.thumbnailTime < 0 ||
      meta.thumbnailTime > meta.duration ||
      (meta.fps !== undefined &&
        (!Number.isFinite(meta.fps) || meta.fps < 1 || meta.fps > 120))
    )
      throw Error(
        'Use duration 0.1–120 seconds, fps 1–120, boolean flags and a thumbnail time within duration.',
      );
    if (
      !Array.isArray(meta.libs) ||
      meta.libs.some((v) => !['three', 'pixi', 'lottie'].includes(v)) ||
      new Set(meta.libs).size !== meta.libs.length
    )
      throw Error(
        'meta.libs allows three, pixi and lottie once each. GSAP is not licensed for this build.',
      );
    for (const name of ['init', 'renderFrame']) {
      const methods = props.filter((p) => p.name?.getText(file) === name);
      if (
        methods.length !== 1 ||
        !ts.isMethodDeclaration(methods[0]!) ||
        !methods[0].body
      )
        error(object, `Provide exactly one ${name}(...) method.`);
    }
    return errors.length ? { ok: false, errors } : { ok: true, meta };
  } catch (e) {
    return {
      ok: false,
      errors: [
        ...errors,
        {
          line: 1,
          message:
            e instanceof Error ? e.message : 'Invalid JavaScript source.',
        },
      ],
    };
  }
}
