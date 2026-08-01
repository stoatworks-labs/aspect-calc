import { describe, expect, it } from 'vitest'
import {
  altLength,
  formatFeetInches,
  formatLength,
  MM_PER_FOOT,
  MM_PER_INCH,
  parseLength,
  toUnitValue,
} from '../units'

describe('parseLength — bare numbers take the field unit', () => {
  it('reads each metric unit', () => {
    expect(parseLength('2500', 'mm')).toBe(2500)
    expect(parseLength('250', 'cm')).toBe(2500)
    expect(parseLength('2.5', 'm')).toBe(2500)
  })

  it('reads inches and feet', () => {
    expect(parseLength('10', 'in')).toBeCloseTo(254, 6)
    expect(parseLength('10', 'ftin')).toBeCloseTo(3048, 6)
  })

  it('rejects empty and junk without throwing', () => {
    expect(parseLength('', 'mm')).toBeNull()
    expect(parseLength('   ', 'mm')).toBeNull()
    expect(parseLength('abc', 'mm')).toBeNull()
    expect(parseLength('12..5', 'mm')).toBeNull()
  })
})

describe('parseLength — an explicit suffix always wins', () => {
  // The whole point: typing a unit you meant must never be overridden by the
  // dropdown you forgot to change.
  it('honours mm typed into a metres field', () => {
    expect(parseLength('2500mm', 'm')).toBe(2500)
    expect(parseLength('2500 mm', 'm')).toBe(2500)
  })

  it('does not let mm be swallowed by the m rule', () => {
    expect(parseLength('5m', 'mm')).toBe(5000)
    expect(parseLength('5mm', 'm')).toBe(5)
  })

  it('accepts spelled-out and primed units', () => {
    expect(parseLength('3 metres', 'mm')).toBe(3000)
    expect(parseLength('12"', 'mm')).toBeCloseTo(304.8, 6)
    expect(parseLength("6'", 'mm')).toBeCloseTo(1828.8, 6)
    expect(parseLength('18 inches', 'm')).toBeCloseTo(457.2, 6)
  })
})

describe('parseLength — feet and inches off a tape', () => {
  it('reads the compound form', () => {
    expect(parseLength(`16' 4"`, 'ftin')).toBeCloseTo(16 * MM_PER_FOOT + 4 * MM_PER_INCH, 6)
    expect(parseLength('16ft 4in', 'mm')).toBeCloseTo(16 * MM_PER_FOOT + 4 * MM_PER_INCH, 6)
  })

  it('reads mixed fractions', () => {
    expect(parseLength(`4' 6 1/2"`, 'ftin')).toBeCloseTo(
      4 * MM_PER_FOOT + 6.5 * MM_PER_INCH,
      6,
    )
    expect(parseLength('1/2"', 'mm')).toBeCloseTo(12.7, 6)
  })

  it('reads two bare numbers in a feet-and-inches field as feet then inches', () => {
    expect(parseLength('16 4', 'ftin')).toBeCloseTo(16 * MM_PER_FOOT + 4 * MM_PER_INCH, 6)
    expect(parseLength('16-4', 'ftin')).toBeCloseTo(16 * MM_PER_FOOT + 4 * MM_PER_INCH, 6)
  })

  it('refuses two bare numbers anywhere else, rather than inventing a rule', () => {
    expect(parseLength('16 4', 'mm')).toBeNull()
    expect(parseLength('16 4', 'm')).toBeNull()
  })
})

describe('formatFeetInches', () => {
  it('drops the feet when there are none', () => {
    expect(formatFeetInches(6 * MM_PER_INCH)).toBe('6"')
    expect(formatFeetInches(0.5 * MM_PER_INCH)).toBe('1/2"')
  })

  it('reduces the fraction', () => {
    expect(formatFeetInches(6.5 * MM_PER_INCH)).toBe('6 1/2"')
    expect(formatFeetInches(6.25 * MM_PER_INCH)).toBe('6 1/4"')
    expect(formatFeetInches(6.0625 * MM_PER_INCH)).toBe('6 1/16"')
  })

  it('carries into feet', () => {
    expect(formatFeetInches(4 * MM_PER_FOOT + 6.5 * MM_PER_INCH)).toBe(`4' 6 1/2"`)
    // 11.99" must not print as 4' 12"
    expect(formatFeetInches(4 * MM_PER_FOOT + 11.999 * MM_PER_INCH)).toBe(`5' 0"`)
  })

  it('round-trips through the parser', () => {
    for (const mm of [1234, 5000, 25400, 304.8, 7777.7]) {
      const text = formatFeetInches(mm)
      const back = parseLength(text, 'ftin')
      expect(back).not.toBeNull()
      // A sixteenth of an inch is the display resolution, so that is the bound.
      expect(Math.abs(back! - mm)).toBeLessThan(MM_PER_INCH / 16)
    }
  })
})

describe('formatLength and friends', () => {
  it('formats per unit with the suffix', () => {
    expect(formatLength(2500, 'mm')).toBe('2500 mm')
    expect(formatLength(2500, 'cm')).toBe('250 cm')
    expect(formatLength(2500, 'm')).toBe('2.5 m')
    expect(formatLength(254, 'in')).toBe('10"')
  })

  it('shows an em dash rather than NaN for missing values', () => {
    expect(formatLength(null, 'm')).toBe('—')
    expect(formatLength(NaN, 'm')).toBe('—')
  })

  it('gives a bare value for putting back in an input', () => {
    expect(toUnitValue(2500, 'm')).toBe('2.5')
    expect(toUnitValue(2500, 'mm')).toBe('2500')
    expect(toUnitValue(null, 'mm')).toBe('')
  })

  it('crosses the system so both tapes are served', () => {
    expect(altLength(3048, 'm')).toBe(`10' 0"`)
    expect(altLength(3048, 'ftin')).toBe('3.048 m')
    expect(altLength(500, 'in')).toBe('500 mm')
  })
})
