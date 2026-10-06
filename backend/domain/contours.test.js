const test = require('node:test');
const assert = require('node:assert/strict');
const { contourSegments, generateContours } = require('../spatial/contours');

test('Marching Squares genera un segmento sobre una pendiente', () => {
  const segments = contourSegments([[0, 10], [0, 10]], 5);
  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0], [[0.5, 0], [0.5, 1]]);
});

test('genera intervalos y marca cada quinta curva como maestra', () => {
  const contours = generateContours([[0, 100], [0, 100]], { min: 10, max: 50, interval: 10 });
  assert.equal(contours.length, 5);
  assert.equal(contours.at(-1).major, true);
});

test('rechaza matrices o intervalos inválidos', () => {
  assert.throws(() => contourSegments([[1]], 1));
  assert.throws(() => generateContours([[0, 1], [0, 1]], { interval: 0 }));
});
