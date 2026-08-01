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
import { pixelCount, solve, type DerivedGroup, type PhysicalEntry } from './lib/solve'
import { altLength, formatLength, LENGTH_UNITS, parseLength, toUnitValue, type LengthUnit } from './lib/units'
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

function trim(n: number, dp: number): string {
  const s = n.toFixed(dp)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

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

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${encodeState(state)}`)
    flash('link')
  }

  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryText())
    flash('summary')
  }

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
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" className="btn" onClick={copySummary}>
          {copied === 'summary' ? 'Copied' : 'Copy summary'}
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
        </div>
      </main>

      <datalist id="pitch-presets">
        {PITCH_PRESETS.map((p) => (
          <option key={p} value={p} />
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
