/**
 * Length parsing and formatting.
 *
 * ALL lengths inside this app are MILLIMETRES. mm is the base unit rather than
 * metres (blend-calc's choice) because pixel pitch is quoted in mm everywhere in
 * the LED trade, and pitch is the hinge this calculator turns on. Converting to
 * metres and back around every pitch multiply is how you acquire float dust in a
 * number people read to three decimal places.
 *
 * Conversion happens here and at the UI boundary only. Do not let feet into the
 * solver.
 */

export const MM_PER_INCH = 25.4
export const MM_PER_FOOT = 304.8

/** Units offered in the UI. `ftin` is the compound feet-and-inches display. */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ftin'

export const LENGTH_UNITS: { id: LengthUnit; label: string; hint: string }[] = [
  { id: 'mm', label: 'mm', hint: 'millimetres' },
  { id: 'cm', label: 'cm', hint: 'centimetres' },
  { id: 'm', label: 'm', hint: 'metres' },
  { id: 'in', label: 'in', hint: 'inches' },
  { id: 'ftin', label: "ft ' in", hint: 'feet and inches' },
]

/** mm per one of the given unit. `ftin` measures in feet when a bare number is typed. */
const BASE_FACTOR: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: MM_PER_INCH,
  ftin: MM_PER_FOOT,
}

/**
 * Suffixes recognised *inside* a value, whatever unit the field is set to.
 * Typing `2500mm` into a field set to metres gives 2500 mm, not 2.5 km of
 * regret. Order matters: `mm` must beat `m`, so match on the whole token.
 */
const SUFFIX_MM: [RegExp, number][] = [
  [/^(mm|millimet(?:er|re)s?)$/, 1],
  [/^(cm|centimet(?:er|re)s?)$/, 10],
  [/^(m|met(?:er|re)s?)$/, 1000],
  [/^(in|ins|inch|inches|"|”|″|'')$/, MM_PER_INCH],
  [/^(ft|foot|feet|'|’|′)$/, MM_PER_FOOT],
]

function suffixFactor(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!s) return null
  for (const [re, mm] of SUFFIX_MM) if (re.test(s)) return mm
  return null
}

/**
 * One number: `12`, `12.5`, `1/2`, `4 1/2`. Mixed fractions are how tape
 * measures are actually read out, so they have to survive the trip.
 */
const NUMBER = String.raw`(?:\d+(?:\.\d+)?\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\.\d+)`
const TOKEN = new RegExp(String.raw`(${NUMBER})\s*([a-z"”″'’′]*)`, 'gi')
const WHOLE = new RegExp(String.raw`^(?:\s*${NUMBER}\s*[a-z"”″'’′]*\s*)+$`, 'i')

function numberValue(raw: string): number {
  const mixed = raw.match(/^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = raw.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  return Number(raw)
}

/**
 * Parse a typed length to mm. `unit` is the field's current unit and supplies
 * the factor for any number written without a suffix.
 *
 * Returns null for anything it cannot read, so a half-typed value leaves the
 * previous answer on screen rather than flashing NaN.
 */
export function parseLength(text: string, unit: LengthUnit): number | null {
  const cleaned = text.replace(/,/g, '').replace(/[-–—]/g, ' ').trim()
  if (!cleaned) return null
  if (!WHOLE.test(cleaned)) return null

  const parts: { value: number; factor: number | null }[] = []
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(cleaned)) !== null) {
    parts.push({ value: numberValue(m[1]), factor: suffixFactor(m[2]) })
  }
  if (parts.length === 0) return null

  // Two bare numbers in a feet-and-inches field read as feet then inches —
  // `16 4` off a tape is 16' 4", never 20 of anything.
  if (unit === 'ftin' && parts.length === 2 && parts.every((p) => p.factor === null)) {
    return parts[0].value * MM_PER_FOOT + parts[1].value * MM_PER_INCH
  }
  if (parts.length > 1 && parts.some((p) => p.factor === null)) return null

  let mm = 0
  for (const p of parts) mm += p.value * (p.factor ?? BASE_FACTOR[unit])
  return Number.isFinite(mm) ? mm : null
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** Reduce n/16 to lowest terms; returns null at zero. */
function sixteenths(inches: number): { whole: number; num: number; den: number } {
  let sixteenth = Math.round(inches * 16)
  const whole = Math.floor(sixteenth / 16)
  let num = sixteenth - whole * 16
  let den = 16
  while (num > 0 && num % 2 === 0) {
    num /= 2
    den /= 2
  }
  return { whole, num, den }
}

/** `4' 6 1/2"`, to the nearest sixteenth. Feet are dropped when there are none. */
export function formatFeetInches(mm: number): string {
  const neg = mm < 0
  const totalInches = Math.abs(mm) / MM_PER_INCH
  let feet = Math.floor(totalInches / 12)
  const { whole, num, den } = sixteenths(totalInches - feet * 12)
  let inches = whole
  if (inches >= 12) {
    feet += Math.floor(inches / 12)
    inches %= 12
  }
  const frac = num > 0 ? `${num}/${den}` : ''
  const inchPart =
    inches > 0 || !frac ? `${inches}${frac ? ` ${frac}` : ''}"` : `${frac}"`
  const out = feet > 0 ? `${feet}' ${inchPart}` : inchPart
  return neg ? `-${out}` : out
}

/** Format mm in the given unit, with the unit suffix. */
export function formatLength(mm: number | null | undefined, unit: LengthUnit): string {
  if (mm == null || !Number.isFinite(mm)) return '—'
  switch (unit) {
    case 'mm':
      return `${trimZeros(mm.toFixed(1))} mm`
    case 'cm':
      return `${trimZeros((mm / 10).toFixed(2))} cm`
    case 'm':
      return `${trimZeros((mm / 1000).toFixed(3))} m`
    case 'in':
      return `${trimZeros((mm / MM_PER_INCH).toFixed(2))}"`
    case 'ftin':
      return formatFeetInches(mm)
  }
}

/**
 * Decimal places that carry roughly a tenth of a millimetre — enough to be
 * exact for the trade, few enough that a computed field does not read like a
 * float dump. `450.9889"` is not a more useful answer than `450.99"`.
 */
const OUT_DP: Record<LengthUnit, number> = { mm: 1, cm: 2, m: 3, in: 2, ftin: 0 }

/** Bare number in the given unit, for putting back into an input box. */
export function toUnitValue(mm: number | null | undefined, unit: LengthUnit): string {
  if (mm == null || !Number.isFinite(mm)) return ''
  if (unit === 'ftin') return formatFeetInches(mm)
  return trimZeros((mm / BASE_FACTOR[unit]).toFixed(OUT_DP[unit]))
}

/**
 * The other-system reading, so a metric number always carries its imperial
 * twin and vice versa. Nobody on a site has only one kind of tape.
 */
export function altLength(mm: number | null | undefined, unit: LengthUnit): string {
  if (mm == null || !Number.isFinite(mm)) return ''
  const metric = unit === 'mm' || unit === 'cm' || unit === 'm'
  if (metric) return formatFeetInches(mm)
  return formatLength(mm, mm >= 1000 ? 'm' : 'mm')
}
