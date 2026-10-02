// A bounded numeric grammar, never JavaScript evaluation. Exponentiation is
// right associative; unary minus binds outside it, so -2^2 equals -4.
export function calculateExpression(expression) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 1000)
    throw Error('Supply a numeric expression of at most 1000 characters');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]+|[^\s]/g) || [];
  if (tokens.length > 128) throw Error('Expression exceeds 128 tokens');
  let index = 0, depth = 0;
  const finite = value => {
    if (!Number.isFinite(value)) throw Error('Calculation must produce finite real numbers');
    return value;
  };
  const expect = value => { if (tokens[index++] !== value) throw Error(`Expected ${value}`); };
  const functions = { exp: Math.exp, sqrt: Math.sqrt, log: Math.log, abs: Math.abs };
  function primary() {
    const token = tokens[index++];
    if (token === '(') { const result = sum(); expect(')'); return result; }
    if (token === 'pi') return Math.PI;
    if (token === 'e') return Math.E;
    if (Object.hasOwn(functions, token)) {
      expect('('); const result = sum(); expect(')'); return finite(functions[token](result));
    }
    if (token && /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) return finite(Number(token));
    throw Error('Use numbers, pi/e, + - * / ^, parentheses, exp/sqrt/log/abs');
  }
  function unary() {
    if (++depth > 32) throw Error('Expression nesting exceeds 32');
    try {
      if (tokens[index] === '+' || tokens[index] === '-') {
        const sign = tokens[index++]; return sign === '-' ? -unary() : unary();
      }
      const value = primary();
      if (tokens[index] === '^') { index++; return finite(value ** unary()); }
      return value;
    } finally { depth--; }
  }
  function product() {
    let value = unary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const op = tokens[index++], right = unary();
      value = finite(op === '*' ? value * right : value / right);
    }
    return value;
  }
  function sum() {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++], right = product();
      value = finite(op === '+' ? value + right : value - right);
    }
    return value;
  }
  const result = sum();
  if (index !== tokens.length) throw Error('Unexpected trailing expression tokens');
  return finite(result);
}
