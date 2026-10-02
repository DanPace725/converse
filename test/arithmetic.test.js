import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpression as calc } from '../lib/conclave/arithmetic.js';

test('whole formulas preserve precision, precedence and real-number functions', () => {
  assert.equal(calc('2 + 3 * 4'), 14);
  assert.equal(calc('2^3^2'), 512);
  assert.equal(calc('-2^2'), -4);
  assert.equal(calc('2^-2'), 0.25);
  assert.equal(calc('sqrt(16)+abs(-3)+log(e)'), 8);
  assert.equal(calc('1e3 * .5'), 500);
  const propellant = calc('12000 * (exp(3200 / (450 * 9.80665)) - 1)');
  assert.ok(Math.abs(propellant - 12780.0322837954) < 1e-8);
});
test('formula grammar rejects code, malformed syntax, excessive nesting and non-finite results', () => {
  for (const expression of ['process.exit()', 'constructor(1)', '1;2', '1 2', 'exp(1000)', 'sqrt(-1)', '1/0', '1+', '2**3', '', '('.repeat(40) + '1' + ')'.repeat(40), '1+'.repeat(100) + '1'])
    assert.throws(() => calc(expression), undefined, expression);
});
