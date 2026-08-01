import type { DerivedGroup, PhysicalEntry } from './lib/solve'
import type { LengthUnit } from './lib/units'

/**
 * Everything the user typed, held as TEXT.
 *
 * Deliberately not parsed numbers: a field mid-edit ("2.", "16' ") has no
 * numeric value, and storing the parse would either clobber what is on screen
 * or need a second shadow copy of it. Parsing happens on every render instead,
 * which is free at this size and means there is exactly one source of truth.
 */
export interface UiState {
  hPixels: string
  vPixels: string
  widthText: string
  heightText: string
  diagonalText: string
  aspectText: string
  pitchXText: string
  pitchYText: string
  squarePitch: boolean
  /** Unit for the width/height fields. */
  unit: LengthUnit
  /** Diagonals get their own unit — screens are sold in inches whatever else is metric. */
  diagUnit: LengthUnit
  derived: DerivedGroup
  physicalEntry: PhysicalEntry
}

export const DEFAULT_STATE: UiState = {
  hPixels: '3840',
  vPixels: '2160',
  widthText: '',
  heightText: '',
  diagonalText: '',
  aspectText: '16:9',
  pitchXText: '2.6',
  pitchYText: '2.6',
  squarePitch: true,
  unit: 'm',
  diagUnit: 'in',
  derived: 'physical',
  physicalEntry: 'wh',
}
