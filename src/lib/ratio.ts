/**
 * Aspect ratio reduction and named-standard matching.
 *
 * The whole point of this module is that a reduced fraction is usually the
 * WRONG answer to give a person. 3440x1440 reduces exactly to 43:18, and nobody
 * has ever ordered a 43:18 monitor. It is called 21:9. Meanwhile 1366x768
 * reduces to 683:384, which is not a ratio so much as an accusation — the useful
 * answer is "16:9, near enough (0.05% off)".
 *
 * So there are two lookups, in this order:
 *
 *   1. EXACT_ALIASES — keyed on the exactly reduced integer fraction. This is
 *      the trade-name layer. It fires only on an exact fraction match, so it
 *      can never mislabel something that merely happens to be close.
 *   2. STANDARDS — nearest named ratio by decimal value, with the deviation
 *      reported and graded. Never silently rounds a real difference away.
 *
 * Both the exact fraction and the decimal are always returned as well. The
 * named answer is a convenience laid over the arithmetic, never a substitute
 * for it.
 */

export interface RatioStandard {
  /** What a person says out loud. Not necessarily w:h. */
  label: string
  /** Exact integer form, where the standard has one. */
  w?: number
  h?: number
  /** Decimal width/height. Authoritative for standards defined as a decimal. */
  value: number
  note?: string
}

/**
 * Landscape only. Portrait is handled by inverting the query and flipping the
 * label, so `1080x1920` reports 9:16 without a duplicate table to drift.
 */
export const STANDARDS: RatioStandard[] = [
  { label: '1:1', w: 1, h: 1, value: 1, note: 'square' },
  { label: '5:4', w: 5, h: 4, value: 1.25, note: 'SXGA 1280x1024' },
  { label: '4:3', w: 4, h: 3, value: 4 / 3, note: 'SD video, XGA, most single-chip projectors' },
  { label: '11:8', w: 11, h: 8, value: 1.375, note: 'Academy 1.375:1' },
  { label: '1.43:1', value: 1.43, note: 'IMAX 70 mm' },
  { label: '3:2', w: 3, h: 2, value: 1.5, note: '35 mm still, Surface, classic slide' },
  { label: '14:9', w: 14, h: 9, value: 14 / 9, note: 'broadcast 4:3/16:9 compromise' },
  { label: '16:10', w: 16, h: 10, value: 1.6, note: 'WUXGA, most laptop and LCD panels' },
  { label: '5:3', w: 5, h: 3, value: 5 / 3, note: 'also written 15:9' },
  { label: '16:9', w: 16, h: 9, value: 16 / 9, note: 'HD, UHD — the default everywhere' },
  { label: '1.85:1', value: 1.85, note: 'DCI Flat' },
  { label: '1.90:1', w: 256, h: 135, value: 256 / 135, note: 'DCI full container, 2048x1080' },
  { label: '2:1', w: 2, h: 1, value: 2, note: 'Univisium' },
  { label: '2.20:1', value: 2.2, note: '70 mm' },
  { label: '2.35:1', value: 2.35, note: 'anamorphic scope, pre-1970' },
  { label: '21:9', w: 64, h: 27, value: 64 / 27, note: 'ultrawide' },
  { label: '2.39:1', w: 43, h: 18, value: 43 / 18, note: 'DCI Scope' },
  { label: '2.40:1', w: 12, h: 5, value: 2.4, note: 'modern anamorphic delivery' },
  { label: '3:1', w: 3, h: 1, value: 3, note: 'banner' },
  { label: '32:10', w: 16, h: 5, value: 3.2, note: 'dual 16:10' },
  { label: '32:9', w: 32, h: 9, value: 32 / 9, note: 'super ultrawide — two 16:9 side by side' },
  { label: '4:1', w: 4, h: 1, value: 4, note: 'banner' },
  { label: '5:1', w: 5, h: 1, value: 5, note: 'banner' },
  { label: '6:1', w: 6, h: 1, value: 6, note: 'banner' },
]

/**
 * Trade names keyed on the EXACT reduced landscape fraction.
 *
 * This is where the marketing and the arithmetic are reconciled. Both 64:27 and
 * 43:18 ship as "21:9" and they are 0.8% apart, which is far too wide a gap to
 * paper over with a tolerance — so they are listed separately and each says
 * what it actually is.
 */
const EXACT_ALIASES: Record<string, { label: string; note: string }> = {
  '64:27': {
    label: '21:9',
    note: 'ultrawide (2560x1080, 5120x2160) — geometrically 2.37:1, and exactly 16:9 stretched by 4:3',
  },
  '43:18': {
    label: '21:9',
    note: 'ultrawide (3440x1440) — geometrically 2.39:1, the same ratio as DCI Scope. Not the same as 2560x1080',
  },
  '8:5': { label: '16:10', note: 'WUXGA, most laptop and LCD panels' },
  '15:9': { label: '5:3', note: 'also written 15:9' },
  '37:20': { label: '1.85:1', note: 'DCI Flat, 1998x1080' },
  '256:135': { label: '1.90:1', note: 'DCI full container, 2048x1080 and 4096x2160' },
  '12:5': { label: '2.40:1', note: 'modern anamorphic delivery, 3840x1600' },
  '16:5': { label: '32:10', note: 'dual 16:10' },
  '32:9': { label: '32:9', note: 'super ultrawide — two 16:9 side by side' },
  '11:8': { label: '11:8', note: 'Academy 1.375:1' },
  '256:81': { label: '3.16:1', note: '(4:3) to the fourth — an unusual one' },
}

/** How close counts as what. */
export const NOMINAL_TOLERANCE = 0.01 // 1%
export const NEAR_TOLERANCE = 0.03 // 3%

export type MatchKind = 'exact' | 'nominal' | 'near' | 'none'

export interface RatioMatch {
  /** width / height. Always >0. */
  value: number
  /** height / width — the "0.5625" form. */
  inverse: number
  /** True when the display is taller than it is wide. */
  portrait: boolean
  /** Exact reduced integer fraction, when both inputs were whole numbers. */
  exact: { w: number; h: number } | null
  /** Best small-integer approximation. Equals `exact` when there is one. */
  approx: { w: number; h: number }
  /** The named standard, already flipped for portrait. */
  standard: { label: string; note?: string } | null
  /** Signed fractional deviation from the standard: 0.004 is 0.4% wide. */
  deviation: number | null
  kind: MatchKind
}

export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a))
  b = Math.abs(Math.round(b))
  while (b) [a, b] = [b, a % b]
  return a || 1
}

const isWhole = (n: number) => Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9

/**
 * Best rational approximation of `r` with denominator <= maxDenom, by continued
 * fractions. Used for measured (non-integer) sizes, where "1.7778" is true but
 * "16:9" is what gets written on the drawing.
 */
export function bestRational(r: number, maxDenom = 200): { w: number; h: number } {
  if (!Number.isFinite(r) || r <= 0) return { w: 0, h: 0 }
  // Stern-Brocot walk. Converges fast and never overshoots the denominator cap.
  let loN = 0,
    loD = 1,
    hiN = 1,
    hiD = 0
  let bestN = Math.round(r),
    bestD = 1
  let bestErr = Math.abs(r - bestN)
  for (let i = 0; i < 64; i++) {
    const midN = loN + hiN
    const midD = loD + hiD
    if (midD > maxDenom) break
    const mid = midN / midD
    const err = Math.abs(r - mid)
    if (err < bestErr) {
      bestErr = err
      bestN = midN
      bestD = midD
    }
    if (err < 1e-12) break
    if (mid < r) {
      loN = midN
      loD = midD
    } else {
      hiN = midN
      hiD = midD
    }
  }
  return { w: bestN, h: bestD }
}

/** `16:9` -> `9:16`, `1.85:1` -> `1:1.85`. */
function flipLabel(label: string): string {
  const parts = label.split(':')
  return parts.length === 2 ? `${parts[1]}:${parts[0]}` : label
}

/**
 * Classify a width and height into a named ratio.
 *
 * Pass pixel counts or millimetres — it only cares whether the numbers happen
 * to be whole, because that is what makes an exact fraction meaningful.
 */
export function matchRatio(width: number, height: number): RatioMatch | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null

  const portrait = height > width
  // Everything below works in landscape, then the label is flipped back.
  const long = portrait ? height : width
  const short = portrait ? width : height
  const r = long / short

  const bothWhole = isWhole(long) && isWhole(short)
  let exact: { w: number; h: number } | null = null
  if (bothWhole) {
    const g = gcd(long, short)
    exact = { w: Math.round(long) / g, h: Math.round(short) / g }
  }

  let standard: { label: string; note?: string } | null = null
  let deviation: number | null = null
  let kind: MatchKind = 'none'

  // 1. exact fraction -> trade name
  if (exact) {
    const key = `${exact.w}:${exact.h}`
    const alias = EXACT_ALIASES[key]
    if (alias) {
      standard = { label: alias.label, note: alias.note }
      deviation = 0
      kind = 'exact'
    } else {
      const hit = STANDARDS.find((s) => s.w === exact!.w && s.h === exact!.h)
      if (hit) {
        standard = { label: hit.label, note: hit.note }
        deviation = 0
        kind = 'exact'
      }
    }
  }

  // 2. nearest named standard by decimal
  if (!standard) {
    let best: RatioStandard | null = null
    let bestDev = Infinity
    for (const s of STANDARDS) {
      const dev = (r - s.value) / s.value
      if (Math.abs(dev) < Math.abs(bestDev)) {
        bestDev = dev
        best = s
      }
    }
    if (best) {
      const abs = Math.abs(bestDev)
      if (abs <= NEAR_TOLERANCE) {
        standard = { label: best.label, note: best.note }
        deviation = bestDev
        // An exact integer input that did NOT match a fraction above is, by
        // definition, not that standard however close it lands. 1366x768 is
        // 0.05% off 16:9 and calling it "16:9 exactly" would be a lie a panel
        // installer eventually pays for.
        if (!bothWhole && abs < 1e-9) kind = 'exact'
        else if (abs <= NOMINAL_TOLERANCE) kind = 'nominal'
        else kind = 'near'
      }
    }
  }

  const approx = exact ?? bestRational(r)

  return {
    value: portrait ? short / long : r,
    inverse: portrait ? long / short : short / long,
    portrait,
    exact: exact ? (portrait ? { w: exact.h, h: exact.w } : exact) : null,
    approx: portrait ? { w: approx.h, h: approx.w } : approx,
    standard: standard ? { label: portrait ? flipLabel(standard.label) : standard.label, note: standard.note } : null,
    deviation,
    kind,
  }
}

/**
 * Read an aspect ratio the way people write them: `16:9`, `16/9`, `2.39:1`,
 * `1.85`, `9:16`. A bare number is width/height, which is the convention every
 * cinema ratio is quoted in.
 */
export function parseAspect(text: string): number | null {
  const s = text.trim().replace(/\s+/g, '')
  if (!s) return null
  const pair = s.match(/^(\d+(?:\.\d+)?)[:/x×](\d+(?:\.\d+)?)$/i)
  if (pair) {
    const w = Number(pair[1])
    const h = Number(pair[2])
    return h > 0 && w > 0 ? w / h : null
  }
  const single = s.match(/^(\d+(?:\.\d+)?)$/)
  if (single) {
    const v = Number(single[1])
    return v > 0 ? v : null
  }
  return null
}

/** `2.389 : 1`, or `1 : 2.389` for portrait. */
export function decimalRatio(m: RatioMatch): string {
  return m.portrait
    ? `1 : ${(1 / m.value).toFixed(3)}`
    : `${m.value.toFixed(3)} : 1`
}

/** Human phrasing for how good the match is. */
export function matchCaption(m: RatioMatch): string {
  if (!m.standard) return 'no standard ratio within 3%'
  const pct = Math.abs((m.deviation ?? 0) * 100)
  switch (m.kind) {
    case 'exact':
      return 'exact'
    // Deliberately no "wider"/"taller": the deviation is measured on the
    // landscape equivalent, so those words invert their meaning for a portrait
    // display and quietly mislead. "off" is true in both orientations.
    case 'nominal':
      return `nominal — ${pct.toFixed(pct < 0.1 ? 3 : 2)}% off true ${m.standard.label}`
    case 'near':
      return `close only — ${pct.toFixed(1)}% off ${m.standard.label}`
    default:
      return ''
  }
}
