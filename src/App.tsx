import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DisplayViz } from './components/DisplayViz'
import { Field, Panel, Segmented, Stat } from './components/ui'
import {
  decimalRatio,
  matchCaption,
  matchRatio,
  parseAspect,
  type RatioMatch,
} from './lib/ratio'
import { PITCH_PRESETS, RESOLUTION_PRESETS } from './lib/presets'
import {
  DPI_PRESETS,
  resolutionFromSlide,
  slideFromResolution,
  slideFieldText,
  slideLabelText,
  SLIDE_PRESETS,
  toEmu,
  toPoints,
} from './lib/slides'
import { pixelCount, solve, type DerivedGroup, type PhysicalEntry } from './lib/solve'
import { altLength, formatLength, LENGTH_UNITS, MM_PER_INCH, parseLength, toUnitValue, type LengthUnit } from './lib/units'
import { encodeState, loadState, saveState } from './lib/urlstate'
import { DEFAULT_STATE, type UiState } from './types'

const GROUPS: DerivedGroup[] = ['resolution', 'physical', 'pitch']

/** Pixel counts are integers or they are fiction. */
function parseCount(text: string): number | null {
  const s = text.replace(/[\s,]/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Math.round(Number(s))
  return n > 0 ? n : null
}

function parsePitch(text: string): number | null {
  const s = text.replace(/[\s,]/g, '').replace(/mm$/i, '')
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

/** Dots per inch. Bounded because a typo of 96000 makes the page think for a while. */
function parseDpi(text: string): number | null {
  const s = text.replace(/[\s,]/g, '').replace(/dpi$/i, '')
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s)
  return n > 0 && n <= 20000 ? n : null
}

function trim(n: number, dp: number): string {
  const s = n.toFixed(dp)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/**
 * Slide inches to three places, which is what PowerPoint's own dialog shows and
 * accepts. Two places turns the 13.333 in Widescreen default into 13.33, which
 * is a different slide.
 */
const slideIn = (mm: number) => trim(mm / MM_PER_INCH, 3)
const slideCm = (mm: number) => trim(mm / 10, 2)

export default function App() {
  const [state, setState] = useState<UiState>(loadState)

  /**
   * Which group the user touched, most recent first. When they start typing in
   * the group that is currently being CALCULATED, that group has to become an
   * input — and something else has to give. The one that gives is whichever
   * they touched longest ago, which is almost always the one they have stopped
   * caring about.
   */
  const recency = useRef<DerivedGroup[]>(['resolution', 'pitch', 'physical'])

  const set = useCallback((patch: Partial<UiState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  /** Note a group as edited, demoting another one if this was the derived one. */
  const touch = useCallback((g: DerivedGroup) => {
    recency.current = [g, ...recency.current.filter((x) => x !== g)]
    setState((s) => {
      if (s.derived !== g) return s
      const rank = (x: DerivedGroup) => {
        const i = recency.current.indexOf(x)
        return i < 0 ? 99 : i
      }
      const demote = GROUPS.filter((x) => x !== g).sort((a, b) => rank(b) - rank(a))[0]
      return { ...s, derived: demote }
    })
  }, [])

  const claim = useCallback((g: DerivedGroup) => {
    setState((s) => {
      const next: Partial<UiState> = { derived: g }
      // Width and height are the ANSWER in this mode, so they cannot also be
      // arriving as a diagonal and a ratio.
      if (g === 'physical') next.physicalEntry = 'wh'
      return { ...s, ...next }
    })
  }, [])

  const setPhysicalEntry = useCallback((pe: PhysicalEntry) => {
    setState((s) => {
      if (pe === 'diagonal' && s.derived === 'physical') {
        const rank = (x: DerivedGroup) => {
          const i = recency.current.indexOf(x)
          return i < 0 ? 99 : i
        }
        const demote = GROUPS.filter((x) => x !== 'physical').sort((a, b) => rank(b) - rank(a))[0]
        return { ...s, physicalEntry: pe, derived: demote }
      }
      return { ...s, physicalEntry: pe }
    })
  }, [])

  // ------------------------------------------------------------------ parse
  const parsed = useMemo(
    () => ({
      hPixels: parseCount(state.hPixels),
      vPixels: parseCount(state.vPixels),
      widthMm: parseLength(state.widthText, state.unit),
      heightMm: parseLength(state.heightText, state.unit),
      diagonalMm: parseLength(state.diagonalText, state.diagUnit),
      aspect: parseAspect(state.aspectText),
      pitchXMm: parsePitch(state.pitchXText),
      pitchYMm: parsePitch(state.pitchYText),
    }),
    [state],
  )

  const sol = useMemo(
    () =>
      solve({
        ...parsed,
        squarePitch: state.squarePitch,
        derived: state.derived,
        physicalEntry: state.physicalEntry,
      }),
    [parsed, state.squarePitch, state.derived, state.physicalEntry],
  )

  // ------------------------------------------------------------------ ratios
  const pixelRatio = useMemo(
    () => (sol.hPixels && sol.vPixels ? matchRatio(sol.hPixels, sol.vPixels) : null),
    [sol.hPixels, sol.vPixels],
  )
  const physRatio = useMemo(
    () => (sol.widthMm && sol.heightMm ? matchRatio(sol.widthMm, sol.heightMm) : null),
    [sol.widthMm, sol.heightMm],
  )
  const typedRatio = useMemo(
    () => (parsed.aspect ? matchRatio(parsed.aspect, 1) : null),
    [parsed.aspect],
  )

  // Pixels first: "what ratio is 3840x2160" is the question people actually ask,
  // and a pixel count is exact where a measured panel is not.
  const primary: RatioMatch | null = pixelRatio ?? physRatio ?? typedRatio
  const ratioSource = pixelRatio
    ? 'from the pixel grid'
    : physRatio
      ? 'from the physical size'
      : typedRatio
        ? 'as entered'
        : ''

  // The drawn shape is the PHYSICAL one where we know it — that is what the
  // display looks like in the room, square pixels or not. The badge drawn on
  // the picture has to match, or a non-square-pixel display shows "32:9"
  // stamped on a 16:9 rectangle and the picture argues with itself. The pixel
  // ratio still leads in the result card below, where there is room to explain.
  const shapeRatio = physRatio ?? pixelRatio ?? typedRatio
  const shapeAspect = shapeRatio?.value ?? 16 / 9

  const nonSquare =
    pixelRatio && physRatio && Math.abs(pixelRatio.value - physRatio.value) / physRatio.value > 0.002

  // ------------------------------------------------------------------ slides
  // A second calculator on the same page, sharing only the resolution. It is
  // deliberately NOT a fourth derived group: `slide size x export DPI = pixels`
  // is the same relation with the pitch inverted, but PowerPoint's 56 inch cap
  // and 100 MP export ceiling have no business inside `solve.ts`.
  const slideDpi = useMemo(() => parseDpi(state.slideDpiText), [state.slideDpiText])
  const slideWidthMm = useMemo(
    () => parseLength(state.slideWidthText, state.slideUnit),
    [state.slideWidthText, state.slideUnit],
  )
  const slideHeightMm = useMemo(
    () => parseLength(state.slideHeightText, state.slideUnit),
    [state.slideHeightText, state.slideUnit],
  )
  const slide = useMemo(
    () =>
      state.slideSolve === 'size'
        ? slideFromResolution(sol.hPixels, sol.vPixels, slideDpi)
        : resolutionFromSlide(slideWidthMm, slideHeightMm, slideDpi),
    [state.slideSolve, sol.hPixels, sol.vPixels, slideDpi, slideWidthMm, slideHeightMm],
  )
  const slideSizeDerived = state.slideSolve === 'size'

  /** Note from the last preset picked. Not persisted — it explains a click. */
  const [presetNote, setPresetNote] = useState('')

  // ------------------------------------------------------------- persistence
  useEffect(() => {
    saveState(state)
    // replaceState, not the hash setter: every keystroke would otherwise be a
    // back-button entry and the browser would become unusable.
    const url = `${location.pathname}${location.search}#${encodeState(state)}`
    history.replaceState(null, '', url)
  }, [state])

  const [copied, setCopied] = useState('')
  const flash = (what: string) => {
    setCopied(what)
    setTimeout(() => setCopied(''), 1600)
  }

  /**
   * `navigator.clipboard` is undefined on a non-secure origin — serving this
   * off a LAN IP for a site crew is exactly when that bites, and an unguarded
   * call there throws into a promise nobody is watching, leaving a button that
   * silently does nothing. Fall back to the old execCommand path and, failing
   * that, say so instead of pretending it worked.
   */
  const copy = async (text: string, what: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('execCommand refused')
      }
      flash(what)
    } catch {
      flash('failed')
    }
  }

  const copyLink = () =>
    copy(`${location.origin}${location.pathname}#${encodeState(state)}`, 'link')

  const copySummary = () => copy(summaryText(), 'summary')

  function summaryText(): string {
    const L: string[] = []
    if (primary) {
      L.push(`Aspect ratio: ${primary.standard?.label ?? decimalRatio(primary)} (${matchCaption(primary)})`)
      if (primary.exact) L.push(`Exact ratio: ${primary.exact.w}:${primary.exact.h}`)
      L.push(`Decimal: ${decimalRatio(primary)}  /  ${primary.inverse.toFixed(4)} (H/W)`)
    }
    if (sol.hPixels && sol.vPixels) L.push(`Resolution: ${sol.hPixels} x ${sol.vPixels} px`)
    if (sol.widthMm && sol.heightMm) {
      L.push(`Size: ${formatLength(sol.widthMm, state.unit)} x ${formatLength(sol.heightMm, state.unit)}`)
      L.push(`      ${altLength(sol.widthMm, state.unit)} x ${altLength(sol.heightMm, state.unit)}`)
    }
    if (sol.diagonalMm) L.push(`Diagonal: ${formatLength(sol.diagonalMm, state.diagUnit)} (${altLength(sol.diagonalMm, state.diagUnit)})`)
    if (sol.pitchXMm) {
      const sq = sol.pitchYMm && Math.abs(sol.pitchXMm - sol.pitchYMm) / sol.pitchXMm > 0.001
      L.push(`Pixel pitch: ${sq ? `${trim(sol.pitchXMm, 4)} x ${trim(sol.pitchYMm!, 4)}` : trim(sol.pitchXMm, 4)} mm`)
      L.push(`Density: ${trim(25.4 / sol.pitchXMm, 1)} ppi`)
    }
    const px = pixelCount(sol.hPixels, sol.vPixels)
    if (px) L.push(`Total pixels: ${px.toLocaleString('en-GB')} (${(px / 1e6).toFixed(2)} MP)`)
    if (slide) {
      L.push('')
      L.push(`PowerPoint slide: ${slideIn(slide.buildWidthMm)}" x ${slideIn(slide.buildHeightMm)}"`)
      L.push(`                  ${slideCm(slide.buildWidthMm)} x ${slideCm(slide.buildHeightMm)} cm`)
      L.push(`Export at: ${trim(slide.buildDpi, 2)} dpi -> ${slide.hPixels} x ${slide.vPixels} px`)
      if (slide.buildScale !== 1) {
        L.push(`NOTE: built at ${trim(slide.buildScale, 4)}x full size — ${slideIn(slide.widthMm)}" x ${slideIn(slide.heightMm)}" is outside PowerPoint's limits.`)
      }
      L.push(`Type scale: ${trim(slide.typeScale, 3)}x the Widescreen default`)
      if (slide.standardDeckDpi) {
        L.push(`Or: leave the deck at Widescreen and export at ${slide.standardDeckDpi} dpi.`)
      }
    }
    return L.join('\n')
  }

  // --------------------------------------------------------------- rendering
  const out = (n: number | null, dp: number) => (n == null ? '' : trim(n, dp))
  const outLen = (n: number | null, u: LengthUnit) => (n == null ? '' : toUnitValue(n, u))

  const resDerived = state.derived === 'resolution'
  const physDerived = state.derived === 'physical'
  const pitchDerived = state.derived === 'pitch'

  const unitSuffix = (
    <select
      className="unit"
      value={state.unit}
      aria-label="Unit for width and height"
      onChange={(e) => set({ unit: e.target.value as LengthUnit })}
    >
      {LENGTH_UNITS.map((u) => (
        <option key={u.id} value={u.id} title={u.hint}>
          {u.label}
        </option>
      ))}
    </select>
  )

  const totalPx = pixelCount(sol.hPixels, sol.vPixels)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            Aspect Calc <em>Stoatworks Labs</em>
          </span>
        </div>
        <div className="spacer" />
        <button type="button" className="btn" onClick={copyLink}>
          {copied === 'link' ? 'Copied' : copied === 'failed' ? 'Copy blocked' : 'Copy link'}
        </button>
        <button type="button" className="btn" onClick={copySummary}>
          {copied === 'summary' ? 'Copied' : copied === 'failed' ? 'Copy blocked' : 'Copy summary'}
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => {
            recency.current = ['resolution', 'pitch', 'physical']
            setState(DEFAULT_STATE)
          }}
        >
          Reset
        </button>
        {/* Opens the shared About dialog — see public/about.js, which delegates
            this attribute from the document, so nothing needs importing here. */}
        <button type="button" className="btn btn--quiet" data-stoatworks-about>
          About
        </button>
      </header>

      <main className="layout">
        <div className="col col--controls">
          <p className="intro">
            Resolution &times; pixel pitch = physical size. Give any two and the third is
            calculated — the panel marked <span className="chip chip--out">calculated</span> is
            the one being solved. Type in it and it becomes an input instead.
          </p>

          <Panel
            title="Resolution"
            derived={resDerived}
            onClaim={() => claim('resolution')}
            aside={
              <select
                className="preset"
                value=""
                aria-label="Resolution preset"
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x')
                  if (!w) return
                  touch('resolution')
                  set({ hPixels: w, vPixels: h })
                }}
              >
                <option value="">preset…</option>
                {RESOLUTION_PRESETS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((r) => (
                      <option key={r.label} value={`${r.w}x${r.h}`}>
                        {r.label} — {r.w}&times;{r.h}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            }
          >
            <div className="grid2">
              <Field
                label="Horizontal"
                suffix="px"
                readOnly={resDerived}
                invalid={!resDerived && state.hPixels !== '' && parsed.hPixels === null}
                value={resDerived ? out(sol.hPixels, 0) : state.hPixels}
                onChange={(v) => {
                  touch('resolution')
                  set({ hPixels: v })
                }}
              />
              <Field
                label="Vertical"
                suffix="px"
                readOnly={resDerived}
                invalid={!resDerived && state.vPixels !== '' && parsed.vPixels === null}
                value={resDerived ? out(sol.vPixels, 0) : state.vPixels}
                onChange={(v) => {
                  touch('resolution')
                  set({ vPixels: v })
                }}
              />
            </div>
            {resDerived && sol.rawHPixels && (
              <p className="note">
                Before rounding: {sol.rawHPixels.toFixed(2)} &times; {sol.rawVPixels?.toFixed(2)} px
              </p>
            )}
          </Panel>

          <Panel
            title="Physical size"
            derived={physDerived}
            onClaim={() => claim('physical')}
            aside={
              <Segmented
                label="How to enter the physical size"
                value={physDerived ? 'wh' : state.physicalEntry}
                onChange={setPhysicalEntry}
                options={[
                  { id: 'wh', label: 'W × H' },
                  {
                    id: 'diagonal',
                    label: 'Diag + ratio',
                    title: 'Enter a diagonal and an aspect ratio; width and height are derived',
                  },
                ]}
              />
            }
          >
            {!physDerived && state.physicalEntry === 'diagonal' ? (
              <>
                <div className="grid2">
                  <Field
                    label="Diagonal"
                    value={state.diagonalText}
                    invalid={state.diagonalText !== '' && parsed.diagonalMm === null}
                    onChange={(v) => {
                      touch('physical')
                      set({ diagonalText: v })
                    }}
                    suffix={
                      <select
                        className="unit"
                        value={state.diagUnit}
                        aria-label="Diagonal unit"
                        onChange={(e) => set({ diagUnit: e.target.value as LengthUnit })}
                      >
                        {LENGTH_UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                  <Field
                    label="Aspect ratio"
                    value={state.aspectText}
                    inputMode="text"
                    placeholder="16:9"
                    invalid={state.aspectText !== '' && parsed.aspect === null}
                    list="ratio-presets"
                    onChange={(v) => {
                      touch('physical')
                      set({ aspectText: v })
                    }}
                  />
                </div>
                <div className="grid2 grid2--out">
                  <Field label="Width" readOnly value={outLen(sol.widthMm, state.unit)} suffix={unitSuffix} />
                  <Field label="Height" readOnly value={outLen(sol.heightMm, state.unit)} suffix={unitSuffix} />
                </div>
              </>
            ) : (
              <>
                <div className="grid2">
                  <Field
                    label="Width"
                    readOnly={physDerived}
                    suffix={unitSuffix}
                    invalid={!physDerived && state.widthText !== '' && parsed.widthMm === null}
                    value={physDerived ? outLen(sol.widthMm, state.unit) : state.widthText}
                    inputMode="text"
                    onChange={(v) => {
                      touch('physical')
                      set({ widthText: v })
                    }}
                  />
                  <Field
                    label="Height"
                    readOnly={physDerived}
                    suffix={unitSuffix}
                    invalid={!physDerived && state.heightText !== '' && parsed.heightMm === null}
                    value={physDerived ? outLen(sol.heightMm, state.unit) : state.heightText}
                    inputMode="text"
                    onChange={(v) => {
                      touch('physical')
                      set({ heightText: v })
                    }}
                  />
                </div>
                <div className="grid2 grid2--out">
                  <Field
                    label="Diagonal"
                    readOnly
                    value={outLen(sol.diagonalMm, state.diagUnit)}
                    suffix={
                      <select
                        className="unit"
                        value={state.diagUnit}
                        aria-label="Diagonal unit"
                        onChange={(e) => set({ diagUnit: e.target.value as LengthUnit })}
                      >
                        {LENGTH_UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                  <Field
                    label="Area"
                    readOnly
                    value={
                      sol.widthMm && sol.heightMm
                        ? `${trim((sol.widthMm * sol.heightMm) / 1e6, 2)}`
                        : ''
                    }
                    suffix="m²"
                  />
                </div>
              </>
            )}
            <p className="note">
              Type any unit you like — <code>2500mm</code>, <code>8' 2 1/2"</code>,
              <code> 16ft 4in</code> — and it is read as written, whatever the dropdown says.
            </p>
          </Panel>

          <Panel title="Pixel pitch" derived={pitchDerived} onClaim={() => claim('pitch')}>
            <div className="grid2">
              <Field
                label={state.squarePitch && !pitchDerived ? 'Pitch' : 'Horizontal pitch'}
                suffix="mm"
                readOnly={pitchDerived}
                list="pitch-presets"
                invalid={!pitchDerived && state.pitchXText !== '' && parsed.pitchXMm === null}
                value={pitchDerived ? out(sol.pitchXMm, 4) : state.pitchXText}
                onChange={(v) => {
                  touch('pitch')
                  set({ pitchXText: v, ...(state.squarePitch ? { pitchYText: v } : {}) })
                }}
              />
              <Field
                label="Vertical pitch"
                suffix="mm"
                readOnly={pitchDerived || state.squarePitch}
                invalid={!pitchDerived && !state.squarePitch && state.pitchYText !== '' && parsed.pitchYMm === null}
                value={
                  pitchDerived
                    ? out(sol.pitchYMm, 4)
                    : state.squarePitch
                      ? state.pitchXText
                      : state.pitchYText
                }
                onChange={(v) => {
                  touch('pitch')
                  set({ pitchYText: v })
                }}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={state.squarePitch}
                disabled={pitchDerived}
                onChange={(e) => {
                  touch('pitch')
                  set({
                    squarePitch: e.target.checked,
                    ...(e.target.checked ? { pitchYText: state.pitchXText } : {}),
                  })
                }}
              />
              <span>
                Square pixels
                {pitchDerived ? ' — both axes are computed here, so this is an output' : ''}
              </span>
            </label>
            <p className="note">
              Centre to centre. Physical width = horizontal pixels &times; pitch, so a
              168&nbsp;&times;&nbsp;168 cabinet at 2.9&nbsp;mm is 487.2&nbsp;mm, not 484.3.
            </p>
            {sol.pitchXMm ? (
              <p className="note">
                {trim(25.4 / sol.pitchXMm, 1)} ppi
                {sol.pitchYMm && Math.abs(sol.pitchXMm - sol.pitchYMm) / sol.pitchXMm > 0.001
                  ? ` × ${trim(25.4 / sol.pitchYMm, 1)} ppi`
                  : ''}
              </p>
            ) : null}
          </Panel>
        </div>

        <div className="col col--main">
          <DisplayViz
            aspect={shapeAspect}
            hPixels={sol.hPixels}
            vPixels={sol.vPixels}
            widthMm={sol.widthMm}
            heightMm={sol.heightMm}
            diagonalMm={sol.diagonalMm}
            pitchXMm={sol.pitchXMm}
            pitchYMm={sol.pitchYMm}
            unit={state.unit}
            diagUnit={state.diagUnit}
            ratio={shapeRatio}
          />

          {sol.problems.map((p, i) => (
            <p key={i} className={`alert alert--${p.level}`}>
              {p.text}
            </p>
          ))}

          {primary ? (
            <section className="ratiocard">
              <div className="ratiocard__main">
                <div className="ratiocard__big">{primary.standard?.label ?? decimalRatio(primary)}</div>
                <div className="ratiocard__caption">
                  {matchCaption(primary)}{' '}
                  <span className="dim">
                    · {ratioSource}
                    {/* The standard's note is written for the landscape form, so
                        say plainly that this one is on its side. */}
                    {primary.portrait ? ' · portrait' : ''}
                  </span>
                </div>
                {primary.standard?.note ? (
                  <div className="ratiocard__note">{primary.standard.note}</div>
                ) : null}
              </div>
              <div className="stats">
                {/* "Exact" in the caption above means "exactly this standard".
                    This is a different thing — the whole-number fraction — and
                    a measured size has no exact one, so say which you are
                    looking at rather than showing a dash. */}
                <Stat
                  label="Whole-number ratio"
                  value={`${primary.approx.w} : ${primary.approx.h}`}
                  sub={primary.exact ? 'exact, reduced by GCD' : 'nearest small whole numbers'}
                />
                <Stat label="Decimal (W/H)" value={decimalRatio(primary)} sub="width per unit height" />
                <Stat
                  label="Decimal (H/W)"
                  value={primary.inverse.toFixed(4)}
                  sub="height per unit width"
                />
              </div>
            </section>
          ) : (
            <p className="alert alert--info">
              Enter a resolution, a physical size, or a diagonal and a ratio.
            </p>
          )}

          {nonSquare && physRatio && pixelRatio ? (
            <section className="ratiocard ratiocard--second">
              <div className="ratiocard__main">
                <div className="ratiocard__big">{physRatio.standard?.label ?? decimalRatio(physRatio)}</div>
                <div className="ratiocard__caption">
                  geometric ratio of the panel itself · {matchCaption(physRatio)}
                </div>
                <div className="ratiocard__note">
                  The pixel grid is {pixelRatio.standard?.label ?? decimalRatio(pixelRatio)} but the
                  panel is this shape. Content mapped 1:1 to pixels will be stretched.
                </div>
              </div>
            </section>
          ) : null}

          <section className="stats stats--wide">
            <Stat
              label="Resolution"
              value={sol.hPixels && sol.vPixels ? `${sol.hPixels.toLocaleString('en-GB')} × ${sol.vPixels.toLocaleString('en-GB')}` : '—'}
              sub={totalPx ? `${totalPx.toLocaleString('en-GB')} px · ${(totalPx / 1e6).toFixed(2)} MP` : undefined}
            />
            <Stat
              label="Width"
              value={formatLength(sol.widthMm, state.unit)}
              sub={sol.widthMm ? altLength(sol.widthMm, state.unit) : undefined}
            />
            <Stat
              label="Height"
              value={formatLength(sol.heightMm, state.unit)}
              sub={sol.heightMm ? altLength(sol.heightMm, state.unit) : undefined}
            />
            <Stat
              label="Diagonal"
              value={formatLength(sol.diagonalMm, state.diagUnit)}
              sub={sol.diagonalMm ? altLength(sol.diagonalMm, state.diagUnit) : undefined}
              tone="accent"
            />
            <Stat
              label="Pixel pitch"
              value={sol.pitchXMm ? `${trim(sol.pitchXMm, 4)} mm` : '—'}
              sub={sol.pitchXMm ? `${trim(25.4 / sol.pitchXMm, 1)} ppi` : undefined}
            />
            <Stat
              label="Area"
              value={sol.widthMm && sol.heightMm ? `${trim((sol.widthMm * sol.heightMm) / 1e6, 2)} m²` : '—'}
              sub={
                sol.widthMm && sol.heightMm
                  ? `${trim((sol.widthMm * sol.heightMm) / 92903.04, 2)} sq ft`
                  : undefined
              }
            />
          </section>

          <section className="slidecard">
            <header className="slidecard__head">
              <h2>PowerPoint slide</h2>
              <Segmented
                label="Which side of the slide calculation to solve for"
                value={state.slideSolve}
                onChange={(v) => {
                  setPresetNote('')
                  set({ slideSolve: v })
                }}
                options={[
                  {
                    id: 'size',
                    label: 'Size from resolution',
                    title: 'Take the resolution above and give the slide size to type into PowerPoint',
                  },
                  {
                    id: 'resolution',
                    label: 'Resolution from size',
                    title: 'Type a slide size and get the pixels it exports to',
                  },
                ]}
              />
              {!slideSizeDerived ? (
                <select
                  className="preset"
                  value=""
                  aria-label="Slide size preset"
                  onChange={(e) => {
                    // Keyed by index, not by the dimensions: Letter, Overhead and
                    // On-screen Show (4:3) are all 10 x 7.5 and are three
                    // different entries with three different things to say.
                    const item = SLIDE_PRESETS.flatMap((g) => g.items)[Number(e.target.value)]
                    if (!item) return
                    setPresetNote(item.note ?? '')
                    set({
                      slideUnit: 'in',
                      slideWidthText: slideFieldText(item.wIn),
                      slideHeightText: slideFieldText(item.hIn),
                    })
                  }}
                >
                  <option value="">preset…</option>
                  {(() => {
                    let i = -1
                    return SLIDE_PRESETS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map((p) => {
                          i += 1
                          return (
                            <option key={`${g.group}/${p.label}`} value={i}>
                              {p.label} — {slideLabelText(p.wIn)}&times;{slideLabelText(p.hIn)}″
                            </option>
                          )
                        })}
                      </optgroup>
                    ))
                  })()}
                </select>
              ) : null}
            </header>

            <div className="slidecard__body">
              <div className="slideinputs">
                {slideSizeDerived ? (
                  <Field
                    label="Resolution"
                    readOnly
                    suffix="px"
                    value={
                      sol.hPixels && sol.vPixels ? `${sol.hPixels} × ${sol.vPixels}` : ''
                    }
                    hint="from the panels above"
                  />
                ) : (
                  <>
                    <Field
                      label="Slide width"
                      inputMode="text"
                      value={state.slideWidthText}
                      invalid={state.slideWidthText !== '' && slideWidthMm === null}
                      onChange={(v) => {
                        setPresetNote('')
                        set({ slideWidthText: v })
                      }}
                      suffix={
                        <select
                          className="unit"
                          value={state.slideUnit}
                          aria-label="Slide size unit"
                          onChange={(e) => set({ slideUnit: e.target.value as LengthUnit })}
                        >
                          {/* Inches, centimetres, millimetres. PowerPoint's dialog
                              offers no others and nobody sizes a slide in feet. */}
                          {LENGTH_UNITS.filter((u) => u.id === 'in' || u.id === 'cm' || u.id === 'mm').map(
                            (u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ),
                          )}
                        </select>
                      }
                    />
                    <Field
                      label="Slide height"
                      inputMode="text"
                      value={state.slideHeightText}
                      invalid={state.slideHeightText !== '' && slideHeightMm === null}
                      onChange={(v) => {
                        setPresetNote('')
                        set({ slideHeightText: v })
                      }}
                      suffix={state.slideUnit === 'in' ? '″' : state.slideUnit}
                    />
                  </>
                )}
                <Field
                  label="Export DPI"
                  suffix="dpi"
                  list="dpi-presets"
                  value={state.slideDpiText}
                  invalid={state.slideDpiText !== '' && slideDpi === null}
                  onChange={(v) => set({ slideDpiText: v })}
                  hint="96 unless you changed ExportBitmapResolution"
                />
              </div>

              {presetNote ? <p className="note">{presetNote}</p> : null}

              {slide ? (
                <>
                  <div className="slidecard__answer">
                    <div className="slidecard__big">
                      {slideIn(slide.buildWidthMm)}″ × {slideIn(slide.buildHeightMm)}″
                    </div>
                    <div className="slidecard__caption">
                      {slideCm(slide.buildWidthMm)} × {slideCm(slide.buildHeightMm)} cm ·{' '}
                      <span className="dim">Design &rsaquo; Slide Size &rsaquo; Custom</span>
                    </div>
                  </div>

                  <div className="stats">
                    <Stat
                      label="Resolution"
                      value={`${slide.hPixels.toLocaleString('en-GB')} × ${slide.vPixels.toLocaleString('en-GB')}`}
                      sub={`${((slide.hPixels * slide.vPixels) / 1e6).toFixed(2)} MP`}
                      tone={slideSizeDerived ? undefined : 'accent'}
                    />
                    <Stat
                      label="Export at"
                      value={`${trim(slide.buildDpi, 2)} dpi`}
                      sub={`ceiling ${slide.maxExportDpi.toLocaleString('en-GB')} dpi for this slide`}
                      tone={slideSizeDerived ? 'accent' : undefined}
                    />
                    <Stat
                      label="Points"
                      value={`${trim(toPoints(slide.buildWidthMm), 1)} × ${trim(toPoints(slide.buildHeightMm), 1)}`}
                      sub="the units a .pptx measures type in"
                    />
                    <Stat
                      label="EMU"
                      value={`${toEmu(slide.buildWidthMm).toLocaleString('en-GB')} × ${toEmu(slide.buildHeightMm).toLocaleString('en-GB')}`}
                      sub="what <p:sldSz> holds"
                    />
                    <Stat
                      label="Type scale"
                      value={`${trim(slide.typeScale, 3)}×`}
                      sub="vs the 13.333″ Widescreen default"
                      tone={slide.typeScale > 2 || slide.typeScale < 0.5 ? 'warn' : undefined}
                    />
                  </div>

                  {slide.problems.map((p, i) => (
                    <p key={i} className={`alert alert--${p.level}`}>
                      {p.text}
                    </p>
                  ))}

                  {slide.standardDeckDpi ? (
                    <p className="alert alert--info">
                      This is 16:9, so you do not have to resize the deck at all — leave it on
                      Widescreen (13.333″ × 7.5″) and export at{' '}
                      <strong>{slide.standardDeckDpi} dpi</strong> instead. Same{' '}
                      {slide.hPixels.toLocaleString('en-GB')} ×{' '}
                      {slide.vPixels.toLocaleString('en-GB')} px out, and every template, master
                      and point size stays exactly where it is.
                    </p>
                  ) : null}

                  {Math.abs(slide.typeScale - 1) > 0.02 ? (
                    <p className="note">
                      The slide above is {trim(slide.typeScale, 2)}× the width of a standard
                      Widescreen deck, so type has to scale with it: a 44&nbsp;pt title becomes{' '}
                      {trim(44 * slide.typeScale, 0)}&nbsp;pt to look the same. Pasting from a
                      normal deck will not do that for you.
                    </p>
                  ) : null}

                  {!slideSizeDerived ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        touch('resolution')
                        set({ hPixels: String(slide.hPixels), vPixels: String(slide.vPixels) })
                      }}
                    >
                      Use {slide.hPixels} × {slide.vPixels} as the resolution above
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="alert alert--info">
                  {slideSizeDerived
                    ? 'Needs a resolution above and an export DPI.'
                    : 'Needs a slide width, a height and an export DPI.'}
                </p>
              )}

              <p className="note">
                A slide is a display whose pixel pitch is fixed by the export DPI —{' '}
                <code>96 dpi</code> is a pitch of 0.265&nbsp;mm. PowerPoint caps an edge at{' '}
                <strong>56″</strong>, floors it at 1″, and will not write a bitmap over 100&nbsp;MP.
              </p>
            </div>
          </section>
        </div>
      </main>

      <datalist id="pitch-presets">
        {PITCH_PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="dpi-presets">
        {DPI_PRESETS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="ratio-presets">
        {['16:9', '16:10', '4:3', '3:2', '1:1', '21:9', '32:9', '2:1', '1.85:1', '2.39:1', '9:16'].map(
          (r) => (
            <option key={r} value={r} />
          ),
        )}
      </datalist>
    </div>
  )
}
