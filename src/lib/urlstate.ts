/**
 * State in the URL hash, so a calculation can be pasted into an email.
 *
 * The hash rather than the query string: it never reaches a server, and this
 * app has no server to reach. localStorage carries the last state across
 * visits; an explicit hash always wins over it, so a shared link opens showing
 * what the sender saw and not what the recipient was last doing.
 */

import { DEFAULT_STATE, type SlideSolve, type UiState } from '../types'
import type { DerivedGroup, PhysicalEntry } from './solve'
import type { LengthUnit } from './units'

const STORAGE_KEY = 'aspect-calc/state/v1'

const UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in', 'ftin']
const GROUPS: DerivedGroup[] = ['resolution', 'physical', 'pitch']
const ENTRIES: PhysicalEntry[] = ['wh', 'diagonal']
const SLIDE_SOLVES: SlideSolve[] = ['size', 'resolution']

/** Short keys — the hash is meant to be pasted, not parsed by a human. */
const KEYS: Record<keyof UiState, string> = {
  hPixels: 'hp',
  vPixels: 'vp',
  widthText: 'w',
  heightText: 'h',
  diagonalText: 'd',
  aspectText: 'a',
  pitchXText: 'px',
  pitchYText: 'py',
  squarePitch: 'sq',
  unit: 'u',
  diagUnit: 'du',
  derived: 'g',
  physicalEntry: 'pe',
  slideSolve: 'ss',
  slideWidthText: 'sw',
  slideHeightText: 'sh',
  slideUnit: 'su',
  slideDpiText: 'sd',
}

export function encodeState(s: UiState): string {
  const p = new URLSearchParams()
  for (const [field, key] of Object.entries(KEYS) as [keyof UiState, string][]) {
    const v = s[field]
    if (typeof v === 'boolean') p.set(key, v ? '1' : '0')
    else if (v) p.set(key, String(v))
  }
  return p.toString()
}

function pick<T extends string>(raw: string | null, allowed: T[], fallback: T): T {
  return raw && (allowed as string[]).includes(raw) ? (raw as T) : fallback
}

export function decodeState(hash: string): UiState | null {
  const q = hash.replace(/^#/, '')
  if (!q) return null
  const p = new URLSearchParams(q)
  if ([...p.keys()].length === 0) return null
  const text = (k: string, d: string) => p.get(k) ?? d
  return {
    hPixels: text(KEYS.hPixels, ''),
    vPixels: text(KEYS.vPixels, ''),
    widthText: text(KEYS.widthText, ''),
    heightText: text(KEYS.heightText, ''),
    diagonalText: text(KEYS.diagonalText, ''),
    aspectText: text(KEYS.aspectText, ''),
    pitchXText: text(KEYS.pitchXText, ''),
    pitchYText: text(KEYS.pitchYText, ''),
    squarePitch: p.get(KEYS.squarePitch) !== '0',
    unit: pick(p.get(KEYS.unit), UNITS, DEFAULT_STATE.unit),
    diagUnit: pick(p.get(KEYS.diagUnit), UNITS, DEFAULT_STATE.diagUnit),
    derived: pick(p.get(KEYS.derived), GROUPS, DEFAULT_STATE.derived),
    physicalEntry: pick(p.get(KEYS.physicalEntry), ENTRIES, DEFAULT_STATE.physicalEntry),
    slideSolve: pick(p.get(KEYS.slideSolve), SLIDE_SOLVES, DEFAULT_STATE.slideSolve),
    // The slide fields fall back to the DEFAULTS rather than to empty, unlike
    // every field above. A link made before the slide section existed carries
    // none of these keys, and decoding those to blanks would open a shared link
    // with a dead slide panel. The cost is that deliberately clearing a slide
    // field does not survive being shared, which is not a state worth sharing.
    slideWidthText: text(KEYS.slideWidthText, DEFAULT_STATE.slideWidthText),
    slideHeightText: text(KEYS.slideHeightText, DEFAULT_STATE.slideHeightText),
    slideUnit: pick(p.get(KEYS.slideUnit), UNITS, DEFAULT_STATE.slideUnit),
    slideDpiText: text(KEYS.slideDpiText, DEFAULT_STATE.slideDpiText),
  }
}

export function loadState(): UiState {
  const fromHash = decodeState(typeof location === 'undefined' ? '' : location.hash)
  if (fromHash) return fromHash
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      // Merged over the defaults so an older stored shape cannot leave a field
      // undefined and turn an input into an uncontrolled one mid-session.
      return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<UiState>) }
    }
  } catch {
    // A corrupt or blocked localStorage is not worth a broken page.
  }
  return DEFAULT_STATE
}

export function saveState(s: UiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Private browsing, quota, whatever. The app works without it.
  }
}
