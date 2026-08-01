import { describe, expect, it } from 'vitest'
import { solve, type SolveInput } from '../solve'

const base: SolveInput = {
  hPixels: null,
  vPixels: null,
  widthMm: null,
  heightMm: null,
  diagonalMm: null,
  aspect: null,
  pitchXMm: null,
  pitchYMm: null,
  squarePitch: true,
  derived: 'physical',
  physicalEntry: 'wh',
}

const run = (over: Partial<SolveInput>) => solve({ ...base, ...over })

describe('physical size from resolution and pitch', () => {
  it('multiplies, using the full cell per pixel', () => {
    // 168x168 at 2.9 mm is a real LED cabinet: 487.2 mm, not 484.3.
    const s = run({ derived: 'physical', hPixels: 168, vPixels: 168, pitchXMm: 2.9 })
    expect(s.widthMm).toBeCloseTo(487.2, 6)
    expect(s.heightMm).toBeCloseTo(487.2, 6)
    expect(s.complete).toBe(true)
  })

  it('sizes a UHD wall', () => {
    const s = run({ derived: 'physical', hPixels: 3840, vPixels: 2160, pitchXMm: 2.6 })
    expect(s.widthMm).toBeCloseTo(9984, 6)
    expect(s.heightMm).toBeCloseTo(5616, 6)
    expect(s.diagonalMm).toBeCloseTo(Math.hypot(9984, 5616), 6)
  })

  it('honours an unlinked vertical pitch', () => {
    const s = run({
      derived: 'physical',
      hPixels: 100,
      vPixels: 100,
      pitchXMm: 2,
      pitchYMm: 4,
      squarePitch: false,
    })
    expect(s.widthMm).toBe(200)
    expect(s.heightMm).toBe(400)
    expect(s.problems.some((p) => p.level === 'warn')).toBe(true)
  })

  it('stays incomplete rather than guessing at a missing pitch', () => {
    const s = run({ derived: 'physical', hPixels: 3840, vPixels: 2160 })
    expect(s.complete).toBe(false)
    expect(s.widthMm).toBeNull()
  })
})

describe('pitch from resolution and physical size', () => {
  it('divides', () => {
    const s = run({
      derived: 'pitch',
      hPixels: 3840,
      vPixels: 2160,
      widthMm: 9984,
      heightMm: 5616,
    })
    expect(s.pitchXMm).toBeCloseTo(2.6, 9)
    expect(s.pitchYMm).toBeCloseTo(2.6, 9)
    expect(s.problems).toHaveLength(0)
  })

  it('reports non-square pixels instead of averaging them away', () => {
    // squarePitch is an input constraint. When pitch is the ANSWER it cannot be
    // imposed, so both axes are computed and the disagreement is the result.
    const s = run({
      derived: 'pitch',
      hPixels: 720,
      vPixels: 576,
      widthMm: 1000,
      heightMm: 750,
      squarePitch: true,
    })
    expect(s.pitchXMm).toBeCloseTo(1000 / 720, 9)
    expect(s.pitchYMm).toBeCloseTo(750 / 576, 9)
    const warn = s.problems.find((p) => p.level === 'warn')
    expect(warn?.text).toContain('not square')
  })
})

describe('resolution from physical size and pitch', () => {
  it('divides and lands on whole pixels', () => {
    const s = run({
      derived: 'resolution',
      widthMm: 9984,
      heightMm: 5616,
      pitchXMm: 2.6,
    })
    expect(s.hPixels).toBe(3840)
    expect(s.vPixels).toBe(2160)
    expect(s.problems).toHaveLength(0)
  })

  it('rounds to whole pixels and says what that cost, in mm', () => {
    const s = run({
      derived: 'resolution',
      widthMm: 10000,
      heightMm: 5600,
      pitchXMm: 2.6,
    })
    expect(s.rawHPixels).toBeCloseTo(10000 / 2.6, 6)
    expect(s.hPixels).toBe(3846)
    expect(s.fittedWidthMm).toBeCloseTo(3846 * 2.6, 6)
    const note = s.problems.find((p) => p.level === 'info')
    expect(note?.text).toContain('mm')
    expect(note?.text).toContain('Rounded')
  })

  it('never returns zero pixels for a tiny panel', () => {
    const s = run({ derived: 'resolution', widthMm: 1, heightMm: 1, pitchXMm: 10 })
    expect(s.hPixels).toBe(1)
    expect(s.vPixels).toBe(1)
  })
})

describe('diagonal and aspect as a way of writing the physical size', () => {
  it('splits a diagonal by ratio', () => {
    // A 55" 16:9 panel: h = d / sqrt(a^2+1) = 1397 / sqrt(337)/9 = 684.90 mm,
    // w = 16/9 h = 1217.59 mm. The hypotenuse check below is the real assertion
    // — the two components have to come back to the diagonal you asked for.
    const s = run({
      derived: 'pitch',
      physicalEntry: 'diagonal',
      diagonalMm: 55 * 25.4,
      aspect: 16 / 9,
      hPixels: 3840,
      vPixels: 2160,
    })
    expect(s.widthMm).toBeCloseTo(1217.59, 1)
    expect(s.heightMm).toBeCloseTo(684.9, 1)
    expect(Math.hypot(s.widthMm!, s.heightMm!)).toBeCloseTo(55 * 25.4, 6)
    expect(s.widthMm! / s.heightMm!).toBeCloseTo(16 / 9, 9)
  })

  it('recomputes the diagonal from the split, so a typed one is confirmed', () => {
    const s = run({
      derived: 'pitch',
      physicalEntry: 'diagonal',
      diagonalMm: 2500,
      aspect: 2,
      hPixels: 1000,
      vPixels: 500,
    })
    expect(s.diagonalMm).toBeCloseTo(2500, 6)
    expect(s.widthMm! / s.heightMm!).toBeCloseTo(2, 9)
  })

  it('drives a resolution straight off a diagonal and a ratio', () => {
    // The pitch that makes a 55" 16:9 panel exactly UHD.
    const width = ((16 / 9) * (55 * 25.4)) / Math.sqrt((16 / 9) ** 2 + 1)
    const s = run({
      derived: 'resolution',
      physicalEntry: 'diagonal',
      diagonalMm: 55 * 25.4,
      aspect: 16 / 9,
      pitchXMm: width / 3840,
    })
    expect(s.hPixels).toBe(3840)
    expect(s.vPixels).toBe(2160)
  })

  it('needs both the diagonal and the ratio', () => {
    const s = run({
      derived: 'pitch',
      physicalEntry: 'diagonal',
      diagonalMm: 2500,
      hPixels: 1000,
      vPixels: 500,
    })
    expect(s.complete).toBe(false)
    expect(s.widthMm).toBeNull()
  })
})

describe('round trips', () => {
  it('physical -> pitch -> physical', () => {
    const a = run({ derived: 'physical', hPixels: 1234, vPixels: 987, pitchXMm: 3.7 })
    const b = run({
      derived: 'pitch',
      hPixels: 1234,
      vPixels: 987,
      widthMm: a.widthMm,
      heightMm: a.heightMm,
    })
    expect(b.pitchXMm).toBeCloseTo(3.7, 9)
    expect(b.pitchYMm).toBeCloseTo(3.7, 9)
  })

  it('physical -> resolution -> physical', () => {
    const a = run({ derived: 'physical', hPixels: 1234, vPixels: 987, pitchXMm: 3.7 })
    const b = run({
      derived: 'resolution',
      widthMm: a.widthMm,
      heightMm: a.heightMm,
      pitchXMm: 3.7,
    })
    expect(b.hPixels).toBe(1234)
    expect(b.vPixels).toBe(987)
  })
})

describe('guards', () => {
  it('ignores zero and negative inputs rather than dividing by them', () => {
    expect(run({ derived: 'physical', hPixels: 0, vPixels: 100, pitchXMm: 2 }).complete).toBe(false)
    expect(run({ derived: 'pitch', hPixels: 100, vPixels: 100, widthMm: 0, heightMm: 5 }).complete).toBe(false)
    expect(run({ derived: 'resolution', widthMm: 100, heightMm: 100, pitchXMm: 0 }).complete).toBe(false)
  })

  it('returns a usable shape with no input at all', () => {
    const s = run({})
    expect(s.complete).toBe(false)
    expect(s.problems).toEqual([])
    expect(s.diagonalMm).toBeNull()
  })
})
