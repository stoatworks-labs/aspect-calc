import { describe, expect, it } from 'vitest'
import {
  DECK_WIDESCREEN_EMU,
  DEFAULT_DECK_WIDTH_IN,
  PPT_MAX_IN,
  PPT_MIN_IN,
  resolutionFromSlide,
  slideFieldText,
  slideFromResolution,
  SLIDE_PRESETS,
  toEmu,
  toPoints,
} from '../slides'
import { MM_PER_INCH } from '../units'

const inches = (n: number) => n * MM_PER_INCH
const has = (
  s: { problems: { level: string; text: string }[] } | null,
  level: string,
  fragment: string,
) => !!s?.problems.some((p) => p.level === level && p.text.includes(fragment))

describe('slide size from a target resolution', () => {
  it('gives PowerPoint its own Widescreen default back', () => {
    // 1280 x 720 at 96 dpi IS the Widescreen slide. If this ever drifts, the
    // whole module is measuring something other than a PowerPoint slide.
    const s = slideFromResolution(1280, 720, 96)!
    expect(s.widthMm / MM_PER_INCH).toBeCloseTo(DEFAULT_DECK_WIDTH_IN, 9)
    expect(s.heightMm / MM_PER_INCH).toBeCloseTo(7.5, 9)
    expect(s.buildScale).toBe(1)
    expect(s.typeScale).toBeCloseTo(1, 9)
    expect(s.problems).toHaveLength(0)
  })

  it('sizes a UHD slide at 40 x 22.5 inches', () => {
    const s = slideFromResolution(3840, 2160, 96)!
    expect(s.widthMm / MM_PER_INCH).toBeCloseTo(40, 9)
    expect(s.heightMm / MM_PER_INCH).toBeCloseTo(22.5, 9)
    expect(s.buildScale).toBe(1)
    expect(s.buildDpi).toBe(96)
    // Three times the width of a standard deck, so three times the point size.
    expect(s.typeScale).toBeCloseTo(3, 9)
  })

  it('scales a 4:1 wall without inventing a ratio', () => {
    const s = slideFromResolution(3840, 1080, 96)!
    expect(s.widthMm / MM_PER_INCH).toBeCloseTo(40, 9)
    expect(s.heightMm / MM_PER_INCH).toBeCloseTo(11.25, 9)
    expect(s.hPixels / s.vPixels).toBeCloseTo(s.widthMm / s.heightMm, 9)
  })

  it('is null until it has all three inputs', () => {
    expect(slideFromResolution(null, 1080, 96)).toBeNull()
    expect(slideFromResolution(1920, null, 96)).toBeNull()
    expect(slideFromResolution(1920, 1080, null)).toBeNull()
    expect(slideFromResolution(1920, 1080, 0)).toBeNull()
  })
})

describe("PowerPoint's 56 inch ceiling", () => {
  it('halves an 8K slide and doubles the export DPI', () => {
    // 7680 x 4320 at 96 dpi wants 80 x 45 in. PowerPoint refuses anything over
    // 56, so build at half and export at 2x — which lands back on 7680 x 4320.
    const s = slideFromResolution(7680, 4320, 96)!
    expect(s.widthMm / MM_PER_INCH).toBeCloseTo(80, 9)
    expect(s.buildScale).toBe(0.5)
    expect(s.buildWidthMm / MM_PER_INCH).toBeCloseTo(40, 9)
    expect(s.buildHeightMm / MM_PER_INCH).toBeCloseTo(22.5, 9)
    expect(s.buildDpi).toBe(192)
    expect(has(s, 'warn', "over PowerPoint's 56")).toBe(true)
  })

  it('divides by whole numbers only, never by 1/2.37', () => {
    // 160 in needs a third, not a 2.857th. "Print at 300%" is followable.
    const s = slideFromResolution(15360, 8640, 96)!
    expect(s.buildScale).toBeCloseTo(1 / 3, 12)
    expect(s.buildWidthMm / MM_PER_INCH).toBeCloseTo(53.3333, 3)
  })

  it('leaves a slide sitting exactly on 56 inches alone', () => {
    const s = slideFromResolution(56 * 96, 96, 96)!
    expect(s.widthMm / MM_PER_INCH).toBeCloseTo(56, 9)
    expect(s.buildScale).toBe(1)
    expect(has(s, 'warn', '56')).toBe(false)
  })
})

describe("PowerPoint's 1 inch floor", () => {
  it('scales a ticker strip up rather than leaving it unbuildable', () => {
    // 1920 x 64 at 96 dpi is 20 x 0.667 in — the height is illegal.
    const s = slideFromResolution(1920, 64, 96)!
    expect(s.buildScale).toBe(2)
    expect(s.buildHeightMm / MM_PER_INCH).toBeCloseTo(1.3333, 3)
    expect(s.buildDpi).toBe(48)
    expect(has(s, 'warn', "under PowerPoint's 1")).toBe(true)
  })

  it('refuses a shape steeper than 56:1, because no scale satisfies both limits', () => {
    // 60 x 1 in: shrink it and the height goes under 1", grow it and the width
    // goes over 56". The two limits leave an empty interval at 56:1.
    const s = slideFromResolution(5760, 96, 96)!
    expect(s.buildScale).toBe(1)
    expect(has(s, 'error', 'steeper than 56:1')).toBe(true)
  })

  it('accepts exactly 56:1', () => {
    const s = slideFromResolution(56 * 96, 96, 96)!
    expect(s.problems.filter((p) => p.level === 'error')).toHaveLength(0)
  })
})

describe('the 100 megapixel bitmap ceiling', () => {
  it('reports the real cap, which is on pixels and not on DPI', () => {
    const s = slideFromResolution(15360, 8640, 96)!
    expect(s.hPixels * s.vPixels).toBeGreaterThan(100_000_000)
    expect(has(s, 'warn', '100 MP')).toBe(true)
    // sqrt(1e8 / (53.333 x 30)) = 250 dpi, against the 288 the job needs.
    expect(s.maxExportDpi).toBe(250)
    expect(s.buildDpi).toBeGreaterThan(s.maxExportDpi)
  })

  it('stays quiet on a slide that fits inside it', () => {
    const s = slideFromResolution(3840, 2160, 96)!
    expect(has(s, 'warn', '100 MP')).toBe(false)
    expect(s.maxExportDpi).toBeGreaterThan(s.buildDpi)
  })
})

describe('the standard-deck alternative', () => {
  it('offers a whole export DPI when the target is 16:9', () => {
    // The good answer for a 3840-wide 16:9 job is NOT a 40 inch slide — it is
    // the deck you already have, exported at 288 dpi.
    expect(slideFromResolution(3840, 2160, 96)!.standardDeckDpi).toBe(288)
    expect(slideFromResolution(1920, 1080, 96)!.standardDeckDpi).toBe(144)
  })

  it('withholds it when the slide already IS the Widescreen deck', () => {
    // 1280 x 720 at 96 dpi is the standard deck, so "leave it on Widescreen and
    // export at 96 dpi" is advice to change nothing.
    expect(slideFromResolution(1280, 720, 96)!.standardDeckDpi).toBeNull()
    expect(resolutionFromSlide(inches(13.333), inches(7.5), 96)!.standardDeckDpi).toBeNull()
  })

  it('withholds it when the ratio is not 16:9', () => {
    expect(slideFromResolution(3840, 1080, 96)!.standardDeckDpi).toBeNull()
    expect(slideFromResolution(1024, 768, 96)!.standardDeckDpi).toBeNull()
  })

  it('withholds it when the DPI would not be a whole number', () => {
    // 1366x768 is near enough 16:9 to pass the ratio test, but 1366/13.333 is
    // 102.45 dpi and ExportBitmapResolution is a DWORD. Rounding to 102 would
    // quietly deliver 1360 px and nobody would notice until the wall was lit.
    const s = slideFromResolution(1366, 768, 96)!
    expect(s.standardDeckDpi).toBeNull()
  })
})

describe('resolution from a slide size', () => {
  it('reverses the Widescreen default exactly', () => {
    const s = resolutionFromSlide(inches(DEFAULT_DECK_WIDTH_IN), inches(7.5), 96)!
    expect(s.hPixels).toBe(1280)
    expect(s.vPixels).toBe(720)
    expect(s.problems).toHaveLength(0)
  })

  it('reverses On-screen Show (16:9), which is a different slide entirely', () => {
    const s = resolutionFromSlide(inches(10), inches(5.625), 96)!
    expect(s.hPixels).toBe(960)
    expect(s.vPixels).toBe(540)
    // Same ratio as Widescreen, three quarters the size. That is the trap.
    expect(s.typeScale).toBeCloseTo(0.75, 9)
  })

  it('rounds to whole pixels and says so when the rounding is real', () => {
    // 33.3 x 19 cm at 96 dpi is 1258.58 x 718.11 px — over a third of a pixel
    // adrift on the width, so the answer is a pixel count nobody would pick.
    const s = resolutionFromSlide(333, 190, 96)!
    expect(s.hPixels).toBe(1259)
    expect(s.rawHPixels).toBeCloseTo(1258.583, 3)
    expect(has(s, 'info', 'lands on')).toBe(true)
  })

  it("stays quiet about the dialog's own three-decimal rounding", () => {
    // 13.333" is 1279.97 px. That is the Slide Size dialog rounding its display,
    // not a size anyone got wrong, and nagging about it on the default state
    // would train people to ignore the message that matters.
    const s = resolutionFromSlide(inches(13.333), inches(7.5), 96)!
    expect(s.hPixels).toBe(1280)
    expect(s.problems).toHaveLength(0)
  })

  it('is null until it has all three inputs', () => {
    expect(resolutionFromSlide(null, inches(7.5), 96)).toBeNull()
    expect(resolutionFromSlide(inches(10), null, 96)).toBeNull()
    expect(resolutionFromSlide(inches(10), inches(7.5), null)).toBeNull()
  })
})

describe('the units a .pptx actually stores', () => {
  it('gives the documented EMU for the Widescreen slide', () => {
    const s = slideFromResolution(1280, 720, 96)!
    expect(toEmu(s.widthMm)).toBe(DECK_WIDESCREEN_EMU.cx)
    expect(toEmu(s.heightMm)).toBe(DECK_WIDESCREEN_EMU.cy)
  })

  it('gives 960 x 540 points for the same slide', () => {
    const s = slideFromResolution(1280, 720, 96)!
    expect(toPoints(s.widthMm)).toBeCloseTo(960, 9)
    expect(toPoints(s.heightMm)).toBeCloseTo(540, 9)
  })

  it('holds the Widescreen default at exactly 16:9, which the rounded decimal is not', () => {
    expect(DECK_WIDESCREEN_EMU.cx / DECK_WIDESCREEN_EMU.cy).toBeCloseTo(16 / 9, 12)
    // The dialog's "13.333" is not, which is why the constant comes from EMU.
    expect(Math.abs(13.333 / 7.5 - 16 / 9)).toBeGreaterThan(0)
  })
})

describe('the preset table', () => {
  const all = SLIDE_PRESETS.flatMap((g) => g.items)

  it('is entirely buildable in PowerPoint', () => {
    for (const p of all) {
      expect(Math.max(p.wIn, p.hIn), p.label).toBeLessThanOrEqual(PPT_MAX_IN)
      expect(Math.min(p.wIn, p.hIn), p.label).toBeGreaterThanOrEqual(PPT_MIN_IN)
    }
  })

  it('keeps the two 16:9 entries as separate sizes', () => {
    const wide = all.find((p) => p.label === 'Widescreen')!
    const onScreen = all.find((p) => p.label === 'On-screen Show (16:9)')!
    expect(wide.wIn / wide.hIn).toBeCloseTo(16 / 9, 9)
    expect(onScreen.wIn / onScreen.hIn).toBeCloseTo(16 / 9, 9)
    // Same ratio, a third apart in size. Merging them would destroy the point.
    expect(wide.wIn / onScreen.wIn).toBeCloseTo(4 / 3, 9)
  })

  it('carries exact dimensions, not the dialog\'s displayed decimals', () => {
    // Widescreen is 40/3 in. If this ever becomes 13.333 the tool starts
    // reporting 12,191,695 EMU for the standard slide, which is wrong.
    const wide = all.find((p) => p.label === 'Widescreen')!
    expect(toEmu(inches(wide.wIn))).toBe(DECK_WIDESCREEN_EMU.cx)
    expect(toEmu(inches(wide.hIn))).toBe(DECK_WIDESCREEN_EMU.cy)
  })

  it('round-trips every preset through its input-box text without moving', () => {
    // The field holds TEXT, so a preset only survives being clicked if its
    // decimal form is precise enough to land back on the same EMU.
    for (const p of all) {
      expect(toEmu(inches(Number(slideFieldText(p.wIn)))), p.label).toBe(toEmu(inches(p.wIn)))
      expect(toEmu(inches(Number(slideFieldText(p.hIn)))), p.label).toBe(toEmu(inches(p.hIn)))
    }
  })
})
