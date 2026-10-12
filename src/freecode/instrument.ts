import ts from 'typescript';
/** Cooperative budgets supplement (never replace) the host timeout. */
export function instrument(source: string): string {
  const result = ts.transpileModule(source, {
    fileName: 'animation.js',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    },
    transformers: {
      before: [
        (context) => {
          const f = context.factory;
          const tick = () =>
            f.createExpressionStatement(
              f.createCallExpression(
                f.createIdentifier('__fcGuard'),
                undefined,
                [],
              ),
            );
          const body = (s: ts.Statement) => f.createBlock([tick(), s], true);
          const visitor: ts.Visitor = (node) => {
            const n = ts.visitEachChild(node, visitor, context);
            if (
              ts.isNewExpression(n) &&
              ts.isIdentifier(n.expression) &&
              [
                'Array',
                'ArrayBuffer',
                'Uint8Array',
                'Uint8ClampedArray',
                'Int8Array',
                'Uint16Array',
                'Int16Array',
                'Uint32Array',
                'Int32Array',
                'Float32Array',
                'Float64Array',
                'BigInt64Array',
                'BigUint64Array',
              ].includes(n.expression.text)
            ) {
              return f.createCallExpression(
                f.createIdentifier('__fcAllocate'),
                undefined,
                [
                  f.createStringLiteral(n.expression.text),
                  f.createArrayLiteralExpression(n.arguments ?? []),
                ],
              );
            }

            if (ts.isExportAssignment(n))
              return f.createExpressionStatement(
                f.createBinaryExpression(
                  f.createPropertyAccessExpression(
                    f.createIdentifier('window'),
                    '__block',
                  ),
                  f.createToken(ts.SyntaxKind.EqualsToken),
                  n.expression,
                ),
              );
            if (ts.isWhileStatement(n))
              return f.updateWhileStatement(n, n.expression, body(n.statement));
            if (ts.isDoStatement(n))
              return f.updateDoStatement(n, body(n.statement), n.expression);
            if (ts.isForStatement(n))
              return f.updateForStatement(
                n,
                n.initializer,
                n.condition,
                n.incrementor,
                body(n.statement),
              );
            if (ts.isForOfStatement(n))
              return f.updateForOfStatement(
                n,
                n.awaitModifier,
                n.initializer,
                n.expression,
                body(n.statement),
              );
            if (ts.isForInStatement(n))
              return f.updateForInStatement(
                n,
                n.initializer,
                n.expression,
                body(n.statement),
              );
            if (ts.isBlock(n))
              return f.updateBlock(n, [tick(), ...n.statements]);
            if (ts.isArrowFunction(n) && !ts.isBlock(n.body))
              return f.updateArrowFunction(
                n,
                n.modifiers,
                n.typeParameters,
                n.parameters,
                n.type,
                n.equalsGreaterThanToken,
                f.createBlock([tick(), f.createReturnStatement(n.body)], true),
              );
            return n;
          };
          return (file) => ts.visitNode(file, visitor) as ts.SourceFile;
        },
      ],
    },
  });
  return result.outputText;
}
