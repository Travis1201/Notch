// CLAUDE.md "Units": weight is always stored in lb internally. Convert only at the UI
// boundary (display + entry) so switching units is purely presentational.
import type { UnitPreference } from '../db/schema';

const LB_PER_KG = 2.20462262185;

export function fromLb(valueLb: number, unit: UnitPreference): number {
  return unit === 'kg' ? valueLb / LB_PER_KG : valueLb;
}

export function toLb(valueInUnit: number, unit: UnitPreference): number {
  return unit === 'kg' ? valueInUnit * LB_PER_KG : valueInUnit;
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}
