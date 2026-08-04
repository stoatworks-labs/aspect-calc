import type { DerivedGroup, PhysicalEntry } from './lib/solve'
import type { LengthUnit } from './lib/units'

/**
 * Which side of `slide size x export DPI = resolution` the slide section solves
 * for. Separate from `derived` on purpose — the slide calculator is a second
 * calculator that borrows the resolution, not a fourth member of the main trio.
 */
export type SlideSolve = 'size' | 'resolution'

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

  /** PowerPoint slide section. `size` derives the slide from the resolution above. */
  slideSolve: SlideSolve
  slideWidthText: string
  slideHeightText: string
  /** Slide sizes are quoted in inches or centimetres and nothing else. */
  slideUnit: LengthUnit
  slideDpiText: string
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
  slideSolve: 'size',
  // The Widescreen slide, to enough places to land on 12192000 EMU. See
  // `slideFieldText` — the dialog's own "13.333" is a measurably different slide.
  slideWidthText: '13.333333',
  slideHeightText: '7.5',
  slideUnit: 'in',
  slideDpiText: '96',
}
