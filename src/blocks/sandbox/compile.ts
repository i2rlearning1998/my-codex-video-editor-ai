// The existing TypeScript development dependency parses syntax; no source executes here.
import ts from 'typescript';
import type { BlockInfo, Result } from '../types';
import { validateInfo } from '../params';
import {
  drawingMethods,
  drawingStyles,
  mathMembers,
  helperMembers,
  deniedNames,
} from './policy';
export interface CompiledBlock {
  readonly info: BlockInfo;
  readonly body: string;
}
const fail = (message: string): never => {
  throw new Error(message);
};
function literal(node: ts.Node): unknown {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = Object.create(null);
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name))
        return fail('Metadata must contain literal named properties');
      const key = p.name.text;
      if (
        ['__proto__', 'prototype', 'constructor'].includes(key) ||
        Object.hasOwn(out, key)
      )
        return fail('Unsafe or duplicate metadata key');
      out[key] = literal(p.initializer);
    }
    return out;
  }
  return fail('Metadata must be literal JSON values');
}
export function compileBlock(source: string): Result<CompiledBlock> {
  try {
    if (typeof source !== 'string' || source.length > 32768)
      return fail('Source limit: 32768 characters');
    let nesting = 0;
    for (const ch of source) {
      if ('({['.includes(ch) && ++nesting > 100)
        return fail('Source nesting limit');
      if (')}]'.includes(ch)) nesting--;
    }
    const file = ts.createSourceFile(
      'block.js',
      source,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.JS,
    );
    const diagnostics =
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, allowJs: true },
        reportDiagnostics: true,
        fileName: 'block.js',
      }).diagnostics ?? [];
    if (diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error))
      return fail('Invalid JavaScript syntax');
    if (
      file.statements.length !== 1 ||
      !ts.isExpressionStatement(file.statements[0]!)
    )
      return fail('Use one parenthesized block object');
    let expression = file.statements[0].expression;
    while (ts.isParenthesizedExpression(expression))
      expression = expression.expression;
    if (!ts.isObjectLiteralExpression(expression))
      return fail('Expected block object');
    const meta: Record<string, unknown> = Object.create(null);
    let render: ts.MethodDeclaration | undefined;
    for (const p of expression.properties) {
      if (!p.name || !ts.isIdentifier(p.name))
        return fail('Use ordinary named fields');
      const key = p.name.text;
      if (key === 'render') {
        if (
          render ||
          !ts.isMethodDeclaration(p) ||
          !p.body ||
          p.modifiers?.length ||
          p.asteriskToken
        )
          return fail('Use render(ctx,t,size,params,seed) method');
        render = p;
      } else {
        if (
          ![
            'id',
            'version',
            'name',
            'category',
            'defaultDuration',
            'params',
            'thumbnailTime',
          ].includes(key) ||
          Object.hasOwn(meta, key) ||
          !ts.isPropertyAssignment(p)
        )
          return fail('Unknown/duplicate block field');
        meta[key] = literal(p.initializer);
      }
    }
    if (
      !render?.body ||
      render.parameters.map((p) => p.name.getText(file)).join(',') !==
        'ctx,t,size,params,seed' ||
      render.parameters.some((p) => p.initializer || p.dotDotDotToken)
    )
      return fail('Expected render(ctx,t,size,params,seed)');
    const info = meta as unknown as BlockInfo;
    validateInfo(info);
    const roots = new Set([
      'ctx',
      't',
      'size',
      'params',
      'seed',
      'helpers',
      'Math',
      'Number',
      'String',
      'undefined',
    ]);
    const locals = new Set<string>();
    const denied = new Set<string>(deniedNames);
    function collect(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (
          !ts.isIdentifier(node.name) ||
          roots.has(node.name.text) ||
          denied.has(node.name.text) ||
          locals.has(node.name.text)
        )
          return fail('Use unique simple local variable names');
        locals.add(node.name.text);
      }
      ts.forEachChild(node, collect);
    }
    collect(render.body);
    const props = new Set<string>([
      ...drawingMethods,
      ...drawingStyles,
      ...mathMembers,
      ...helperMembers,
      ...info.params.map((p) => p.name),
      'width',
      'height',
      'length',
      'charAt',
      'toFixed',
      'isFinite',
    ]);
    function writable(node: ts.Node): boolean {
      return ts.isIdentifier(node)
        ? locals.has(node.text)
        : ts.isPropertyAccessExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'ctx' &&
            (drawingStyles as readonly string[]).includes(node.name.text);
    }
    function visit(node: ts.Node, depth = 0): void {
      if (depth > 80) return fail('AST nesting limit');
      if (ts.isIdentifier(node)) {
        if (denied.has(node.text))
          return fail('Forbidden identifier: ' + node.text);
        if (
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node
        ) {
          if (!props.has(node.text))
            return fail('Property not allowed: ' + node.text);
        } else if (!roots.has(node.text) && !locals.has(node.text))
          return fail('Unknown identifier: ' + node.text);
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression)
      ) {
        const root = node.expression.text,
          name = node.name.text;
        if (root === 'params' && !info.params.some((p) => p.name === name))
          return fail('Unknown parameter access');
        if (root === 'size' && !['width', 'height'].includes(name))
          return fail('Unknown size field');
        if (
          root === 'ctx' &&
          ![...drawingMethods, ...drawingStyles].includes(
            name as (typeof drawingMethods)[number],
          )
        )
          return fail('Context capability denied');
        if (
          root === 'Math' &&
          !(mathMembers as readonly string[]).includes(name)
        )
          return fail('Math capability denied');
        if (
          root === 'helpers' &&
          !(helperMembers as readonly string[]).includes(name)
        )
          return fail('Unknown helper');
      }
      if (ts.isCallExpression(node)) {
        const e = node.expression;
        const allowed = ts.isIdentifier(e)
          ? ['Number', 'String'].includes(e.text)
          : ts.isPropertyAccessExpression(e) &&
            ((ts.isIdentifier(e.expression) &&
              ['ctx', 'Math', 'helpers', 'Number'].includes(
                e.expression.text,
              )) ||
              ['charAt', 'toFixed'].includes(e.name.text));
        if (!allowed) return fail('Call target not allowed');
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        !writable(node.left)
      )
        return fail('Only locals and drawing styles may be assigned');
      if (
        (ts.isPostfixUnaryExpression(node) ||
          ts.isPrefixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          node.operator,
        ) &&
        !writable(node.operand)
      )
        return fail('Only locals may be incremented');
      if (
        ts.isElementAccessExpression(node) ||
        ts.isNewExpression(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isObjectLiteralExpression(node) ||
        ts.isArrayLiteralExpression(node) ||
        ts.isAwaitExpression(node) ||
        ts.isYieldExpression(node) ||
        ts.isDeleteExpression(node) ||
        ts.isRegularExpressionLiteral(node) ||
        ts.isTaggedTemplateExpression(node) ||
        ts.isWithStatement(node) ||
        ts.isThrowStatement(node) ||
        ts.isTryStatement(node) ||
        ts.isForInStatement(node) ||
        node.kind === ts.SyntaxKind.ThisKeyword ||
        node.kind === ts.SyntaxKind.ImportKeyword ||
        node.kind === ts.SyntaxKind.SuperKeyword ||
        ts.isTypeAssertionExpression(node) ||
        ts.isAsExpression(node)
      )
        return fail(
          'Unsupported or unsafe syntax: ' + ts.SyntaxKind[node.kind],
        );
      ts.forEachChild(node, (child) => visit(child, depth + 1));
    }
    visit(render.body);
    const body = render.body.getText(file).slice(1, -1);
    return { ok: true, value: { info, body } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid block source',
    };
  }
}
