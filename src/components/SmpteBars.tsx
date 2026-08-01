/**
 * SMPTE-style 75% colour bars, drawn to fill an arbitrary rectangle.
 *
 * This is a PICTURE OF a test pattern, not a test signal. The classic
 * SMPTE ECR 1-1978 pattern is defined for 4:3 and everything here is stretched
 * to whatever aspect the calculator is showing — which is exactly what a real
 * pattern generator does, and exactly why you should never grade against a
 * screenshot of one. The RGB values below are the standard 75% bar values so
 * the thing reads correctly at a glance; they are not colour-managed.
 *
 * Geometry, as fractions of the full height:
 *   0     - 2/3   seven equal 75% bars
 *   2/3   - 3/4   the reverse ("blue") strip
 *   3/4   - 1     -I / white / +Q / black / PLUGE / black
 *
 * The bottom row is NOT in sevenths: the first four blocks are 5/28 each, the
 * PLUGE is 1/7 split three ways, and the tail is 1/7. That is the real layout —
 * it is why the bottom blocks do not line up with the bars above them.
 */

const BAR_COLOURS = [
  '#bfbfbf', // 75% grey
  '#bfbf00', // yellow
  '#00bfbf', // cyan
  '#00bf00', // green
  '#bf00bf', // magenta
  '#bf0000', // red
  '#0000bf', // blue
]

/** Reverse strip: blue, black, magenta, black, cyan, black, grey. */
const REVERSE_COLOURS = [
  '#0000bf',
  '#0d0d0d',
  '#bf00bf',
  '#0d0d0d',
  '#00bfbf',
  '#0d0d0d',
  '#bfbfbf',
]

const MINUS_I = '#00214c'
const PLUS_Q = '#32006a'
const BLACK = '#101010'
const SUPER_BLACK = '#080808' // -4 IRE
const LIGHT_BLACK = '#181818' // +4 IRE

export interface SmpteBarsProps {
  x: number
  y: number
  width: number
  height: number
}

export function SmpteBars({ x, y, width: w, height: h }: SmpteBarsProps) {
  const topH = (h * 2) / 3
  const midH = h / 12
  const botY = y + topH + midH
  const botH = h - topH - midH
  const bar = w / 7

  // Bottom row, left to right, as fractions of the full width.
  const twentyEighth = w / 28
  const bottom: { fill: string; width: number }[] = [
    { fill: MINUS_I, width: 5 * twentyEighth },
    { fill: '#ffffff', width: 5 * twentyEighth },
    { fill: PLUS_Q, width: 5 * twentyEighth },
    { fill: BLACK, width: 5 * twentyEighth },
    { fill: SUPER_BLACK, width: w / 21 },
    { fill: BLACK, width: w / 21 },
    { fill: LIGHT_BLACK, width: w / 21 },
    { fill: BLACK, width: 4 * twentyEighth },
  ]

  let cursor = x

  return (
    <g aria-hidden="true">
      {BAR_COLOURS.map((fill, i) => (
        <rect key={`t${i}`} x={x + i * bar} y={y} width={bar + 0.5} height={topH} fill={fill} />
      ))}
      {REVERSE_COLOURS.map((fill, i) => (
        <rect
          key={`m${i}`}
          x={x + i * bar}
          y={y + topH}
          width={bar + 0.5}
          height={midH}
          fill={fill}
        />
      ))}
      {bottom.map((seg, i) => {
        const sx = cursor
        cursor += seg.width
        return (
          <rect
            key={`b${i}`}
            x={sx}
            y={botY}
            // The +0.5 closes the hairline seams antialiasing leaves between
            // adjacent rects at fractional scale factors.
            width={seg.width + 0.5}
            height={botH}
            fill={seg.fill}
          />
        )
      })}
    </g>
  )
}
