export type Expression =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; op: string; arg: Expression }
  | { kind: 'binary'; op: string; left: Expression; right: Expression }
  | { kind: 'call'; name: string; args: Expression[] };
const functions: Record<string, readonly [number, number]> = {
  sin: [1, 1],
  cos: [1, 1],
  abs: [1, 1],
  round: [1, 1],
  min: [2, 16],
  max: [2, 16],
  clamp: [3, 3],
  lerp: [3, 3],
};
export function parseExpression(source: string): Expression {
  if (source.length > 2048) throw Error('Expression exceeds 2048 characters.');
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    const rest = source.slice(offset),
      space = /^\s+/.exec(rest);
    if (space) {
      offset += space[0].length;
      continue;
    }
    const match =
      /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^\$[a-zA-Z][a-zA-Z0-9_]*|^[a-zA-Z]+|^[+*/(),-]/.exec(
        rest,
      );
    if (!match)
      throw Error(`Expression column ${offset + 1}: unexpected character.`);
    tokens.push(match[0]);
    offset += match[0].length;
    if (tokens.length > 512) throw Error('Expression token limit exceeded.');
  }
  let index = 0,
    depth = 0;
  const take = () => tokens[index++];
  const need = (token: string) => {
    if (take() !== token) throw Error(`Expression: expected ${token}.`);
  };
  function atom(): Expression {
    if (++depth > 64) throw Error('Expression nesting limit exceeded.');
    const token = take();
    let value: Expression;
    if (token === '+' || token === '-')
      value = { kind: 'unary', op: token, arg: atom() };
    else if (token === '(') {
      value = sum();
      need(')');
    } else if (token && /^(?:\d|\.)/.test(token)) {
      const n = Number(token);
      if (!Number.isFinite(n)) throw Error('Expression number must be finite.');
      value = { kind: 'number', value: n };
    } else if (
      token &&
      (token.startsWith('$') || ['PI', 'W', 'H', 'w', 'h'].includes(token))
    )
      value = { kind: 'variable', name: token };
    else if (token && Object.hasOwn(functions, token)) {
      need('(');
      const args = [sum()];
      while (tokens[index] === ',') {
        take();
        args.push(sum());
      }
      need(')');
      const [min, max] = functions[token]!;
      if (args.length < min || args.length > max)
        throw Error(
          `Expression: ${token} needs ${min === max ? min : `${min}–${max}`} arguments.`,
        );
      value = { kind: 'call', name: token, args };
    } else
      throw Error(
        `Expression: unknown name or missing value ${token ?? '(end)'}.`,
      );
    depth--;
    return value;
  }
  function product(): Expression {
    let value = atom();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const op = take()!;
      value = { kind: 'binary', op, left: value, right: atom() };
    }
    return value;
  }
  function sum(): Expression {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = take()!;
      value = { kind: 'binary', op, left: value, right: product() };
    }
    return value;
  }
  const result = sum();
  if (index !== tokens.length)
    throw Error(`Expression: unexpected token ${tokens[index]}.`);
  return result;
}
export function expressionReferences(node: Expression): string[] {
  if (node.kind === 'variable')
    return node.name.startsWith('$') ? [node.name.slice(1)] : [];
  if (node.kind === 'unary') return expressionReferences(node.arg);
  if (node.kind === 'binary')
    return [
      ...expressionReferences(node.left),
      ...expressionReferences(node.right),
    ];
  if (node.kind === 'call') return node.args.flatMap(expressionReferences);
  return [];
}
export interface Dimensions {
  W: number;
  H: number;
  w: number;
  h: number;
}
export const defaultDimensions: Dimensions = {
  W: 1920,
  H: 1080,
  w: 640,
  h: 360,
};
export function evaluateExpression(
  expression: Expression | string,
  values: Record<string, unknown> = {},
  dimensions: Dimensions = defaultDimensions,
): number {
  const root =
    typeof expression === 'string' ? parseExpression(expression) : expression;
  function evaluate(n: Expression): number {
    let value: number;
    if (n.kind === 'number') value = n.value;
    else if (n.kind === 'variable') {
      const v =
        n.name === 'PI'
          ? Math.PI
          : n.name.startsWith('$')
            ? Object.hasOwn(values, n.name.slice(1))
              ? values[n.name.slice(1)]
              : undefined
            : dimensions[n.name as keyof Dimensions];
      if (typeof v !== 'number')
        throw Error(
          `Expression ${n.name}: supply a numeric control/context value.`,
        );
      value = v;
    } else if (n.kind === 'unary')
      value = (n.op === '-' ? -1 : 1) * evaluate(n.arg);
    else if (n.kind === 'binary') {
      const a = evaluate(n.left),
        b = evaluate(n.right);
      value =
        n.op === '+'
          ? a + b
          : n.op === '-'
            ? a - b
            : n.op === '*'
              ? a * b
              : a / b;
    } else {
      const args = n.args.map(evaluate),
        a = args[0]!,
        b = args[1]!,
        c = args[2]!;
      switch (n.name) {
        case 'sin':
          value = Math.sin(a);
          break;
        case 'cos':
          value = Math.cos(a);
          break;
        case 'abs':
          value = Math.abs(a);
          break;
        case 'round':
          value = Math.round(a);
          break;
        case 'min':
          value = Math.min(...args);
          break;
        case 'max':
          value = Math.max(...args);
          break;
        case 'clamp':
          if (b > c) throw Error('clamp minimum exceeds maximum.');
          value = Math.min(c, Math.max(b, a));
          break;
        case 'lerp':
          value = a + (b - a) * c;
          break;
        default:
          throw Error('Unknown expression function.');
      }
    }
    if (!Number.isFinite(value))
      throw Error(
        'Expression produced NaN or Infinity; remove zero division or overflow.',
      );
    return value;
  }
  return evaluate(root);
}
