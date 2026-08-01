import { describe, expect, it } from 'vitest'
import {
  bestRational,
  decimalRatio,
  gcd,
  matchCaption,
  matchRatio,
  parseAspect,
  STANDARDS,
} from '../ratio'

const m = (w: number, h: number) => {
  const r = matchRatio(w, h)
  expect(r).not.toBeNull()
  return r!
}

describe('gcd and reduction', () => {
  it('reduces', () => {
    expect(gcd(1920, 1080)).toBe(120)
    expect(gcd(3440, 1440)).toBe(80)
    expect(gcd(7, 5)).toBe(1)
  })

  it('never returns zero', () => {
    expect(gcd(0, 0)).toBe(1)
  })
})

describe('the marketing name beats the reduced fraction', () => {
  // This is the reason the module exists. Both of these reduce to fractions no
  // human uses, and both are sold as 21:9.
  it('calls 3440x1440 21:9, not 43:18', () => {
    const r = m(3440, 1440)
    expect(r.exact).toEqual({ w: 43, h: 18 })
    expect(r.standard?.label).toBe('21:9')
    expect(r.kind).toBe('exact')
  })

  it('calls 2560x1080 21:9, not 64:27', () => {
    const r = m(2560, 1080)
    expect(r.exact).toEqual({ w: 64, h: 27 })
    expect(r.standard?.label).toBe('21:9')
    expect(r.kind).toBe('exact')
  })

  it('keeps the two 21:9s distinguishable, because they are 0.8% apart', () => {
    const a = m(3440, 1440)
    const b = m(2560, 1080)
    expect(a.value).not.toBeCloseTo(b.value, 3)
    expect(a.standard?.note).not.toBe(b.standard?.note)
    expect(Math.abs(a.value - b.value) / b.value).toBeGreaterThan(0.007)
  })

  it('calls 5120x1440 32:9', () => {
    expect(m(5120, 1440).standard?.label).toBe('32:9')
  })

  it('calls 2560x1600 16:10, not 8:5', () => {
    const r = m(2560, 1600)
    expect(r.exact).toEqual({ w: 8, h: 5 })
    expect(r.standard?.label).toBe('16:10')
  })

  it('calls 2048x1080 1.90:1, the DCI full container', () => {
    const r = m(2048, 1080)
    expect(r.exact).toEqual({ w: 256, h: 135 })
    expect(r.standard?.label).toBe('1.90:1')
  })

  it('calls 1998x1080 1.85:1 Flat', () => {
    expect(m(1998, 1080).standard?.label).toBe('1.85:1')
  })

  it('calls 3840x1600 2.40:1', () => {
    expect(m(3840, 1600).standard?.label).toBe('2.40:1')
  })
})

describe('plain exact matches', () => {
  it.each([
    [1920, 1080, '16:9'],
    [3840, 2160, '16:9'],
    [7680, 4320, '16:9'],
    [1024, 768, '4:3'],
    [1600, 1200, '4:3'],
    [1280, 1024, '5:4'],
    [1920, 1200, '16:10'],
    [3000, 2000, '3:2'],
    [1000, 1000, '1:1'],
  ])('%ix%i is %s exactly', (w, h, label) => {
    const r = m(w, h)
    expect(r.standard?.label).toBe(label)
    expect(r.kind).toBe('exact')
    expect(r.deviation).toBe(0)
  })
})

describe('near misses are named but not laundered', () => {
  it('calls 1366x768 a nominal 16:9 and says how far off', () => {
    const r = m(1366, 768)
    expect(r.exact).toEqual({ w: 683, h: 384 })
    expect(r.standard?.label).toBe('16:9')
    expect(r.kind).toBe('nominal')
    expect(Math.abs(r.deviation!)).toBeLessThan(0.001)
    expect(matchCaption(r)).toContain('nominal')
  })

  it('never calls a non-matching exact fraction "exact"', () => {
    // 1366x768 is 0.05% off 16:9. Close is not the same as equal, and an
    // installer who trusts "exact" here eventually pays for it.
    expect(m(1366, 768).kind).not.toBe('exact')
    expect(m(2732, 2048).kind).toBe('nominal')
    expect(m(2732, 2048).standard?.label).toBe('4:3')
  })

  it('reports nothing at all beyond 3%', () => {
    // 1.72 sits in the gap between 5:3 and 16:9, more than 3% from both.
    const r = m(1720, 1000)
    expect(r.standard).toBeNull()
    expect(r.kind).toBe('none')
    expect(matchCaption(r)).toContain('no standard')
  })
})

describe('portrait', () => {
  it('flips the label', () => {
    const r = m(1080, 1920)
    expect(r.portrait).toBe(true)
    expect(r.standard?.label).toBe('9:16')
    expect(r.exact).toEqual({ w: 9, h: 16 })
  })

  it('reports the decimal the right way up', () => {
    const r = m(1080, 1920)
    expect(r.value).toBeCloseTo(0.5625, 6)
    expect(r.inverse).toBeCloseTo(1.7778, 3)
    expect(decimalRatio(r)).toBe('1 : 1.778')
  })

  it('flips a decimal-named standard too', () => {
    expect(m(1080, 2000).standard?.label).toBe('1:1.85')
  })
})

describe('the two decimal forms', () => {
  it('gives x:1 and the 0.x', () => {
    const r = m(1920, 1080)
    expect(r.value).toBeCloseTo(1.7778, 4)
    expect(r.inverse).toBeCloseTo(0.5625, 6)
    expect(decimalRatio(r)).toBe('1.778 : 1')
  })
})

describe('measured (non-integer) sizes', () => {
  it('names the ratio of a physical panel', () => {
    const r = m(5993.2, 3371.1)
    expect(r.exact).toBeNull()
    expect(r.standard?.label).toBe('16:9')
    expect(r.kind).toBe('nominal')
  })

  it('offers a small-integer approximation when there is no exact one', () => {
    const r = m(5993.2, 3371.1)
    expect(r.approx.w / r.approx.h).toBeCloseTo(r.value, 3)
    expect(r.approx.h).toBeLessThanOrEqual(200)
  })

  it('treats a mathematically perfect ratio as exact', () => {
    const r = m(1.7777777777777777, 1)
    expect(r.kind).toBe('exact')
    expect(r.standard?.label).toBe('16:9')
  })
})

describe('bestRational', () => {
  it('finds the obvious ones', () => {
    expect(bestRational(16 / 9)).toEqual({ w: 16, h: 9 })
    expect(bestRational(1.5)).toEqual({ w: 3, h: 2 })
    expect(bestRational(2)).toEqual({ w: 2, h: 1 })
  })

  it('respects the denominator cap', () => {
    const r = bestRational(Math.PI, 20)
    expect(r.h).toBeLessThanOrEqual(20)
    expect(r.w / r.h).toBeCloseTo(Math.PI, 2)
  })
})

describe('parseAspect', () => {
  it('reads the forms people write', () => {
    expect(parseAspect('16:9')).toBeCloseTo(16 / 9, 9)
    expect(parseAspect('16/9')).toBeCloseTo(16 / 9, 9)
    expect(parseAspect('16 : 9')).toBeCloseTo(16 / 9, 9)
    expect(parseAspect('2.39:1')).toBeCloseTo(2.39, 9)
    expect(parseAspect('1.85')).toBeCloseTo(1.85, 9)
    expect(parseAspect('9:16')).toBeCloseTo(0.5625, 9)
  })

  it('rejects nonsense and division by zero', () => {
    expect(parseAspect('')).toBeNull()
    expect(parseAspect('16:0')).toBeNull()
    expect(parseAspect('wide')).toBeNull()
    expect(parseAspect('16:9:3')).toBeNull()
  })
})

describe('guards', () => {
  it('refuses zero and negative sizes', () => {
    expect(matchRatio(0, 100)).toBeNull()
    expect(matchRatio(100, 0)).toBeNull()
    expect(matchRatio(-16, 9)).toBeNull()
    expect(matchRatio(NaN, 9)).toBeNull()
  })
})

describe('the standards table itself', () => {
  it('agrees with its own integer forms', () => {
    for (const s of STANDARDS) {
      if (s.w && s.h) expect(s.value).toBeCloseTo(s.w / s.h, 9)
    }
  })

  it('is sorted, so the nearest-match scan is inspectable', () => {
    for (let i = 1; i < STANDARDS.length; i++) {
      expect(STANDARDS[i].value).toBeGreaterThan(STANDARDS[i - 1].value)
    }
  })

  it('keeps neighbouring standards far enough apart to be worth naming', () => {
    // The tightest real pair is 2.39:1 (DCI Scope, 43:18) against 2.40:1, which
    // are 0.47% apart — genuinely two names for two slightly different things,
    // so the bound sits just under that rather than pretending they merge.
    for (let i = 1; i < STANDARDS.length; i++) {
      const gap = (STANDARDS[i].value - STANDARDS[i - 1].value) / STANDARDS[i - 1].value
      expect(gap).toBeGreaterThan(0.004)
    }
  })
})
