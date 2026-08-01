/**
 * The display, drawn to scale, with every dimension on it.
 *
 * One SVG in a fixed coordinate space: the display's long edge is always
 * LONG units and the padding around it is constant, so the annotation text
 * stays the same size relative to the frame at any aspect ratio and the whole
 * thing scales to its container without a resize observer.
 *
 * Everything drawn over the bars sits on a dark plate, because white text on
 * 75% yellow is unreadable and this pattern exists to be looked at.
 */

import type { LengthUnit } from '../lib/units'
import { altLength, formatLength } from '../lib/units'
import type { RatioMatch } from '../lib/ratio'
import { decimalRatio } from '../lib/ratio'
import { SmpteBars } from './SmpteBars'
import markUrl from '../assets/stoat-mark.png'

const LONG = 1000
const PAD = { top: 104, right: 184, bottom: 52, left: 40 }

const FONT = 27
const SMALL = 22
/** Monospace advance width, so plate widths can be computed without measuring. */
const CHAR = 0.6

export interface DisplayVizProps {
  /** Drawn shape, width/height. */
  aspect: number
  hPixels: number | null
  vPixels: number | null
  widthMm: number | null
  heightMm: number | null
  diagonalMm: number | null
  pitchXMm: number | null
  pitchYMm: number | null
  unit: LengthUnit
  diagUnit: LengthUnit
  ratio: RatioMatch | null
}

/** A rounded dark label plate, sized from the longest line of text. */
function Plate({
  cx,
  cy,
  lines,
  font = FONT,
  accent,
  anchorX,
}: {
  cx: number
  cy: number
  lines: string[]
  font?: number
  accent?: boolean
  /** 'start' anchors the plate's left edge at cx, 'end' its right edge. */
  anchorX?: 'start' | 'end'
}) {
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 0)
  const w = longest * font * CHAR + font * 1.1
  const lineH = font * 1.28
  const h = lines.length * lineH + font * 0.5
  const x = anchorX === 'start' ? cx : anchorX === 'end' ? cx - w : cx - w / 2
  const y = cy - h / 2
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={font * 0.42}
        fill="rgba(6,14,24,0.86)"
        stroke={accent ? 'var(--accent)' : 'rgba(255,255,255,0.22)'}
        strokeWidth={accent ? 2.5 : 1.5}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={x + w / 2}
          y={y + font * 0.25 + lineH * (i + 0.72)}
          textAnchor="middle"
          fontSize={font}
          fill={i === 0 ? (accent ? 'var(--accent)' : '#eef4fb') : '#9db2c8'}
          fontWeight={i === 0 ? 650 : 400}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

export function DisplayViz(props: DisplayVizProps) {
  const {
    aspect,
    hPixels,
    vPixels,
    widthMm,
    heightMm,
    diagonalMm,
    pitchXMm,
    pitchYMm,
    unit,
    diagUnit,
    ratio,
  } = props

  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  const w = a >= 1 ? LONG : LONG * a
  const h = a >= 1 ? LONG / a : LONG
  const x0 = PAD.left
  const y0 = PAD.top
  const vbW = PAD.left + w + PAD.right
  const vbH = PAD.top + h + PAD.bottom

  // ---------------------------------------------------------------- labels
  // The word "width" only appears when there is nothing else to say — on a
  // dimension line pointing along the width it is otherwise just noise.
  const widthLines = [
    hPixels ? `${hPixels.toLocaleString('en-GB')} px` : '',
    widthMm ? formatLength(widthMm, unit) : '',
    widthMm ? altLength(widthMm, unit) : '',
  ].filter(Boolean)
  if (widthLines.length === 0) widthLines.push('width')

  const heightLines = [
    vPixels ? `${vPixels.toLocaleString('en-GB')} px` : '',
    heightMm ? formatLength(heightMm, unit) : '',
    heightMm ? altLength(heightMm, unit) : '',
  ].filter(Boolean)
  if (heightLines.length === 0) heightLines.push('height')

  const diagLines = diagonalMm
    ? [formatLength(diagonalMm, diagUnit), altLength(diagonalMm, diagUnit)]
    : []

  const pitchLines =
    pitchXMm && pitchYMm
      ? Math.abs(pitchXMm - pitchYMm) / pitchXMm > 0.001
        ? [`${pitchXMm.toFixed(3)} x ${pitchYMm.toFixed(3)} mm`, 'pitch (not square)']
        : [`${pitchXMm.toFixed(3)} mm`, 'pixel pitch']
      : []

  // ------------------------------------------------------------ logo plate
  const plateH = Math.min(Math.min(w, h) * 0.34, 190)
  const plateW = Math.min(plateH * 2.9, w * 0.82)
  const plateX = x0 + (w - plateW) / 2
  const plateY = y0 + (h - plateH) / 2
  const markH = plateH * 0.62
  const markW = markH * (207 / 160)
  const textX = plateX + plateW * 0.14 + markW + plateH * 0.11
  const logoFont = Math.min(plateH * 0.2, 30)

  // Dimension lines sit in the padding, clear of the picture.
  const topY = y0 - 46
  const rightX = x0 + w + 52

  return (
    <svg
      className="viz"
      viewBox={`0 0 ${vbW} ${vbH}`}
      role="img"
      aria-label={`Display ${hPixels ?? '?'} by ${vPixels ?? '?'} pixels, aspect ratio ${
        ratio?.standard?.label ?? 'unknown'
      }`}
    >
      <defs>
        <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L10,5 L0,9 z" fill="var(--text-dim)" />
        </marker>
        <clipPath id="screen">
          <rect x={x0} y={y0} width={w} height={h} rx={4} />
        </clipPath>
      </defs>

      <g clipPath="url(#screen)">
        <SmpteBars x={x0} y={y0} width={w} height={h} />
      </g>
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        rx={4}
        fill="none"
        stroke="var(--line)"
        strokeWidth={3}
      />

      {/* diagonal, bottom-left to top-right */}
      {diagLines.length > 0 && (
        <>
          <line
            x1={x0}
            y1={y0 + h}
            x2={x0 + w}
            y2={y0}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={2}
            strokeDasharray="14 10"
          />
          <Plate
            cx={x0 + w * 0.24}
            cy={y0 + h * 0.76}
            lines={diagLines}
            font={SMALL}
          />
        </>
      )}

      {/* logo plate */}
      <g>
        <rect
          x={plateX}
          y={plateY}
          width={plateW}
          height={plateH}
          rx={plateH * 0.14}
          fill="rgba(8,17,28,0.92)"
          stroke="rgba(255,255,255,0.24)"
          strokeWidth={2}
        />
        <image
          href={markUrl}
          x={plateX + plateW * 0.07}
          y={plateY + (plateH - markH) / 2}
          width={markW}
          height={markH}
          preserveAspectRatio="xMidYMid meet"
        />
        <text
          x={textX}
          y={plateY + plateH * 0.43}
          fontSize={logoFont}
          fill="#eef4fb"
          fontWeight={700}
          letterSpacing={logoFont * 0.09}
        >
          STOATWORKS
        </text>
        <text
          x={textX}
          y={plateY + plateH * 0.72}
          fontSize={logoFont * 0.82}
          fill="var(--accent)"
          fontWeight={600}
        >
          {hPixels && vPixels ? `${hPixels} x ${vPixels}` : 'aspect calc'}
        </text>
      </g>

      {/* aspect badge, top left inside the picture */}
      {ratio && (
        <Plate
          cx={x0 + 22}
          cy={y0 + 46}
          lines={[ratio.standard?.label ?? decimalRatio(ratio), decimalRatio(ratio)]}
          font={SMALL}
          accent
          anchorX="start"
        />
      )}

      {/* pitch badge, bottom right inside the picture */}
      {pitchLines.length > 0 && (
        <Plate
          cx={x0 + w - 22}
          cy={y0 + h - 46}
          lines={pitchLines}
          font={SMALL}
          anchorX="end"
        />
      )}

      {/* width dimension, above */}
      <g stroke="var(--text-dim)" strokeWidth={1.6}>
        <line x1={x0} y1={topY} x2={x0 + w} y2={topY} markerStart="url(#arw)" markerEnd="url(#arw)" />
        <line x1={x0} y1={topY - 9} x2={x0} y2={y0 - 4} />
        <line x1={x0 + w} y1={topY - 9} x2={x0 + w} y2={y0 - 4} />
      </g>
      <Plate cx={x0 + w / 2} cy={topY - 8} lines={widthLines} font={SMALL} />

      {/* height dimension, to the right */}
      <g stroke="var(--text-dim)" strokeWidth={1.6}>
        <line x1={rightX} y1={y0} x2={rightX} y2={y0 + h} markerStart="url(#arw)" markerEnd="url(#arw)" />
        <line x1={rightX + 9} y1={y0} x2={x0 + w + 4} y2={y0} />
        <line x1={rightX + 9} y1={y0 + h} x2={x0 + w + 4} y2={y0 + h} />
      </g>
      <g transform={`rotate(-90 ${rightX + 62} ${y0 + h / 2})`}>
        <Plate cx={rightX + 62} cy={y0 + h / 2} lines={heightLines} font={SMALL} />
      </g>
    </svg>
  )
}
