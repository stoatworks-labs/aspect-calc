/**
 * The display geometry solver.
 *
 * Three quantities describe a pixel-addressable display, and ANY TWO GIVE THE
 * THIRD. That is the whole model:
 *
 *     resolution (px)  x  pixel pitch (mm)  =  physical size (mm)
 *
 * So the UI names one of the three as the DERIVED group and takes the other two
 * as input. There is no fourth mode and no hidden coupling. Diagonal and aspect
 * ratio are not independent members of the system — they are two ways of
 * writing the physical size (or the resolution), which is why `physicalEntry`
 * lets you type a diagonal and a ratio instead of a width and a height.
 *
 * PITCH CONVENTION: physical width = horizontal pixels x pitch. Pitch is
 * centre-to-centre and every pixel owns a full cell, so it is N x pitch and not
 * (N-1) x pitch. This matches how LED cabinets are specified — a 168 x 168 px
 * cabinet at 2.9 mm is 487.2 mm square, not 484.3 mm. Getting this wrong loses
 * you one pitch across the whole wall, which is invisible in a spreadsheet and
 * very visible when the last cabinet does not fit the frame.
 */

export type DerivedGroup = 'resolution' | 'physical' | 'pitch'
export type PhysicalEntry = 'wh' | 'diagonal'

export interface SolveInput {
  hPixels: number | null
  vPixels: number | null
  widthMm: number | null
  heightMm: number | null
  diagonalMm: number | null
  /** width/height, from the aspect field. Only used when entering by diagonal. */
  aspect: number | null
  pitchXMm: number | null
  pitchYMm: number | null
  /** When true the vertical pitch follows the horizontal one. */
  squarePitch: boolean
  derived: DerivedGroup
  physicalEntry: PhysicalEntry
}

export interface Problem {
  level: 'error' | 'warn' | 'info'
  text: string
}

export interface Solution {
  hPixels: number | null
  vPixels: number | null
  widthMm: number | null
  heightMm: number | null
  diagonalMm: number | null
  pitchXMm: number | null
  pitchYMm: number | null
  /** Unrounded pixel counts, present only when resolution is the derived group. */
  rawHPixels: number | null
  rawVPixels: number | null
  /** Physical size actually covered by the ROUNDED pixel count. */
  fittedWidthMm: number | null
  fittedHeightMm: number | null
  /** True when the derived group could be computed at all. */
  complete: boolean
  problems: Problem[]
}

const pos = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0

const EMPTY: Solution = {
  hPixels: null,
  vPixels: null,
  widthMm: null,
  heightMm: null,
  diagonalMm: null,
  pitchXMm: null,
  pitchYMm: null,
  rawHPixels: null,
  rawVPixels: null,
  fittedWidthMm: null,
  fittedHeightMm: null,
  complete: false,
  problems: [],
}

/**
 * Turn the physical inputs into a width and a height, whichever way they were
 * typed. Returns nulls rather than guessing when the pair is incomplete.
 */
function physicalFromInput(
  input: SolveInput,
): { widthMm: number | null; heightMm: number | null } {
  if (input.physicalEntry === 'diagonal') {
    if (!pos(input.diagonalMm) || !pos(input.aspect)) return { widthMm: null, heightMm: null }
    // d^2 = w^2 + h^2 and w = a*h  =>  h = d / sqrt(a^2 + 1)
    const h = input.diagonalMm / Math.sqrt(input.aspect * input.aspect + 1)
    return { widthMm: input.aspect * h, heightMm: h }
  }
  return {
    widthMm: pos(input.widthMm) ? input.widthMm : null,
    heightMm: pos(input.heightMm) ? input.heightMm : null,
  }
}

export function solve(input: SolveInput): Solution {
  const problems: Problem[] = []
  const out: Solution = { ...EMPTY, problems }

  const pitchX = pos(input.pitchXMm) ? input.pitchXMm : null
  const pitchY = input.squarePitch ? pitchX : pos(input.pitchYMm) ? input.pitchYMm : null

  const hPx = pos(input.hPixels) ? input.hPixels : null
  const vPx = pos(input.vPixels) ? input.vPixels : null

  // Physical is only read from the inputs when it is not the group being solved.
  const phys =
    input.derived === 'physical'
      ? { widthMm: null, heightMm: null }
      : physicalFromInput(input)

  switch (input.derived) {
    case 'pitch': {
      out.hPixels = hPx
      out.vPixels = vPx
      out.widthMm = phys.widthMm
      out.heightMm = phys.heightMm
      if (hPx && vPx && pos(phys.widthMm) && pos(phys.heightMm)) {
        out.pitchXMm = phys.widthMm / hPx
        out.pitchYMm = phys.heightMm / vPx
        out.complete = true
        // `squarePitch` is an input constraint, not something we can impose on a
        // measurement. When pitch is the ANSWER, both axes are computed and any
        // disagreement is reported rather than averaged away.
        const skew = Math.abs(out.pitchXMm - out.pitchYMm) / out.pitchXMm
        if (skew > 0.001) {
          problems.push({
            level: 'warn',
            text: `Pixels are not square: ${out.pitchXMm.toFixed(3)} mm across, ${out.pitchYMm.toFixed(3)} mm down (${(skew * 100).toFixed(1)}% apart). Check the resolution against the physical size.`,
          })
        }
      }
      break
    }

    case 'physical': {
      out.hPixels = hPx
      out.vPixels = vPx
      out.pitchXMm = pitchX
      out.pitchYMm = pitchY
      if (hPx && vPx && pos(pitchX) && pos(pitchY)) {
        out.widthMm = hPx * pitchX
        out.heightMm = vPx * pitchY
        out.complete = true
      }
      break
    }

    case 'resolution': {
      out.widthMm = phys.widthMm
      out.heightMm = phys.heightMm
      out.pitchXMm = pitchX
      out.pitchYMm = pitchY
      if (pos(phys.widthMm) && pos(phys.heightMm) && pos(pitchX) && pos(pitchY)) {
        const rawH = phys.widthMm / pitchX
        const rawV = phys.heightMm / pitchY
        out.rawHPixels = rawH
        out.rawVPixels = rawV
        out.hPixels = Math.max(1, Math.round(rawH))
        out.vPixels = Math.max(1, Math.round(rawV))
        out.fittedWidthMm = out.hPixels * pitchX
        out.fittedHeightMm = out.vPixels * pitchY
        out.complete = true

        // A pixel count is an integer or it is fiction. Say how much was thrown
        // away, in mm, because that is the number that decides whether the
        // frame still fits.
        const dh = Math.abs(rawH - out.hPixels)
        const dv = Math.abs(rawV - out.vPixels)
        if (dh > 0.005 || dv > 0.005) {
          const dw = out.fittedWidthMm - phys.widthMm
          const dhh = out.fittedHeightMm - phys.heightMm
          problems.push({
            level: 'info',
            text: `Rounded to whole pixels from ${rawH.toFixed(2)} x ${rawV.toFixed(2)}. The real size becomes ${fmtDelta(dw)} wide and ${fmtDelta(dhh)} tall against what you asked for.`,
          })
        }
      }
      break
    }
  }

  // The diagonal always comes back out of the width and height, even when it
  // was the input — so a typed diagonal is confirmed rather than echoed.
  if (pos(out.widthMm) && pos(out.heightMm)) {
    out.diagonalMm = Math.hypot(out.widthMm, out.heightMm)
  } else if (input.derived !== 'physical' && input.physicalEntry === 'diagonal' && pos(input.diagonalMm)) {
    out.diagonalMm = input.diagonalMm
  }

  // Pixel aspect vs physical aspect: if a pitch was given per axis these agree
  // by construction, but in `pitch` mode they are independent measurements and
  // the mismatch is the interesting result.
  if (out.hPixels && out.vPixels && pos(out.widthMm) && pos(out.heightMm) && input.derived !== 'pitch') {
    const pixelAspect = out.hPixels / out.vPixels
    const physAspect = out.widthMm / out.heightMm
    const skew = Math.abs(pixelAspect - physAspect) / physAspect
    if (skew > 0.002) {
      problems.push({
        level: 'warn',
        text: `The pixel grid is ${pixelAspect.toFixed(4)}:1 but the panel is ${physAspect.toFixed(4)}:1 — the pixels are not square, so a circle on this display will not be round.`,
      })
    }
  }

  return out
}

function fmtDelta(mm: number): string {
  const sign = mm >= 0 ? '+' : '-'
  return `${sign}${Math.abs(mm).toFixed(1)} mm`
}

/** Total addressable pixels, for the "am I within the processor" question. */
export function pixelCount(h: number | null, v: number | null): number | null {
  return h && v ? h * v : null
}
