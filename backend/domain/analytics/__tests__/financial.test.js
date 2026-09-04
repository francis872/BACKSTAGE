const test = require('node:test');
const assert = require('node:assert/strict');
const {
  netPresentValue, internalRateOfReturn, capRate, paybackPeriod,
  discountedPaybackPeriod, discountedCashFlowValue,
} = require('../financial');

test('netPresentValue: golden case -100 today + 110 next period at 10% => NPV = 0', () => {
  const npv = netPresentValue([-100, 110], 0.10);
  assert.ok(Math.abs(npv - 0) < 1e-6);
});

test('netPresentValue: undiscounted sum when rate is 0', () => {
  const npv = netPresentValue([-100, 40, 40, 40], 0);
  assert.equal(npv, 20);
});

test('netPresentValue: rejects invalid discount rate', () => {
  assert.throws(() => netPresentValue([-100, 110], -1.5));
});

test('netPresentValue: rejects too-short cash flow series', () => {
  assert.throws(() => netPresentValue([-100], 0.1));
});

test('internalRateOfReturn: golden case -100 -> 110 has IRR = 10%', () => {
  const { irr, converged } = internalRateOfReturn([-100, 110]);
  assert.equal(converged, true);
  assert.ok(Math.abs(irr - 0.10) < 1e-4);
});

test('internalRateOfReturn: returns null (not NaN/0) when cash flows never change sign', () => {
  const result = internalRateOfReturn([100, 100, 100]);
  assert.equal(result.irr, null);
  assert.equal(result.converged, false);
  assert.ok(result.reason.length > 0);
});

test('internalRateOfReturn is consistent with netPresentValue (NPV at IRR ~= 0)', () => {
  const cashFlows = [-1000, 500, 500, 500];
  const { irr } = internalRateOfReturn(cashFlows);
  const npvAtIrr = netPresentValue(cashFlows, irr);
  assert.ok(Math.abs(npvAtIrr) < 0.01);
});

test('capRate: golden case NOI 50000 / value 1000000 = 5%', () => {
  assert.equal(capRate(50000, 1000000), 5);
});

test('capRate: rejects non-positive property value', () => {
  assert.throws(() => capRate(1000, 0));
  assert.throws(() => capRate(1000, -1));
});

test('paybackPeriod: golden case interpolates within the recovery period', () => {
  const payback = paybackPeriod([-1000, 400, 400, 400, 400]);
  assert.equal(payback, 2.5);
});

test('paybackPeriod: returns null when investment is never recovered', () => {
  const payback = paybackPeriod([-1000, 100, 100]);
  assert.equal(payback, null);
});

test('discountedPaybackPeriod: is never shorter than the simple payback period', () => {
  const cashFlows = [-1000, 400, 400, 400, 400];
  const simple = paybackPeriod(cashFlows);
  const discounted = discountedPaybackPeriod(cashFlows, 0.08);
  assert.ok(discounted >= simple);
});

test('discountedCashFlowValue: golden case with zero discount rate is a plain sum', () => {
  const { presentValueOfFlows, totalValue } = discountedCashFlowValue([100, 100], 0, 0);
  assert.equal(presentValueOfFlows, 200);
  assert.equal(totalValue, 200);
});

test('discountedCashFlowValue: includes discounted terminal value', () => {
  const { presentValueOfTerminal, totalValue } = discountedCashFlowValue([100], 0.10, 1100);
  assert.ok(Math.abs(presentValueOfTerminal - 1000) < 1e-6);
  assert.ok(Math.abs(totalValue - 1090.909091) < 1e-4);
});
