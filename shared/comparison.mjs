import { evaluateComparison as legacy, COMPARISON_VERSION as LEGACY_VERSION, DATA_TYPES } from './comparison.v1.mjs';
import { evaluateComparison as current, COMPARISON_VERSION } from './comparison.v2.mjs';
export { LEGACY_VERSION, COMPARISON_VERSION, DATA_TYPES };
export { DECIMAL_POLICY } from './decimal.mjs';
export const SUPPORTED_COMPARISON_VERSIONS = Object.freeze([LEGACY_VERSION, COMPARISON_VERSION]);
export function evaluateComparison(input, { version = COMPARISON_VERSION } = {}) {
  if (version === COMPARISON_VERSION) return current(input);
  if (version === LEGACY_VERSION) return legacy(input);
  return { version, status: 'unsupported_version', errors: ['Versión de motor no disponible.'], ranking: [], excluded: [] };
}
