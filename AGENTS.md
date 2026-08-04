# AGENTS.md — bringing an LLM up to speed on Aspect Calc

Orientation for an AI assistant (or a new human) picking this project up cold. `CLAUDE.md`
holds the short command reference; this file explains the model and the traps.

---

## 1. What this is

An **aspect ratio and display geometry calculator**. Browser-only, no backend: React +
TypeScript + Vite, built to a static `dist/` and served by a Cloudflare Worker with static
assets. State lives in `localStorage` and in the URL hash.

It answers: what ratio is this, what is it actually called, how big is it, what pitch is it,
and what is the diagonal — from whichever two of those you happen to know.

## 2. Layout

```
src/
  types.ts               UiState — everything the user typed, held as TEXT
  lib/units.ts           mm in, mm out. Feet-and-inches parsing lives here
  lib/ratio.ts           reduction + NAMED-STANDARD matching. The interesting module
  lib/solve.ts           THE ENGINE. res x pitch = size, solved in any direction
  lib/slides.ts          PowerPoint. slide size x export DPI = pixels, plus PPT's limits
  lib/presets.ts         resolution / pitch / diagonal starting points
  lib/urlstate.ts        hash + localStorage
  components/DisplayViz.tsx   the picture: one SVG, fixed coordinate space
  components/SmpteBars.tsx    the colour bars
  components/ui.tsx      Field / Panel / Segmented / Stat
  App.tsx                wiring and all the state
```

**All lengths are MILLIMETRES internally.** Not metres (blend-calc's choice) — pixel pitch
is quoted in mm everywhere in the trade and pitch is the hinge this whole app turns on.
Converting to metres and back around every pitch multiply is how you acquire float dust in a
number people read to three decimal places. Conversion happens in `units.ts` and at the UI
boundary only. Do not let feet into the solver.

## 3. The one relation everything derives from

```
resolution (px)  ×  pixel pitch (mm)  =  physical size (mm)
```

Any two give the third. `solve.ts` names one of the three as the **derived group** and takes
the other two as input. There is no fourth mode and no hidden coupling.

`slides.ts` is the same relation with the pitch inverted — `dpi = 25.4 / pitch_mm` — but it
is **deliberately not a fourth derived group**. It is a second, self-contained calculator
that borrows the solved resolution and gives it back only when the user presses a button.
Folding it into `solve.ts` would drag PowerPoint's 56-inch cap into the LED-wall engine,
where it means nothing. Keep them apart. The UI reinforces this: the slide section is a card
in the results column, not a fourth `Panel` in the solver trio.

Diagonal and aspect ratio are **not** independent members of the system — they are another
way of writing the physical size, which is why `physicalEntry: 'diagonal'` exists. When the
physical group is itself being derived, diagonal entry is forced off; the app does this for
you in `claim()` and `setPhysicalEntry()`.

## 4. Traps

### A reduced fraction is usually the WRONG answer to show a person

This is the reason `ratio.ts` exists and it is the thing to not "simplify" away.

- 3440×1440 reduces **exactly** to 43:18. Nobody has ever ordered a 43:18 monitor. It is
  called **21:9**.
- 2560×1080 reduces **exactly** to 64:27. Also called 21:9. **These are 0.8% apart** — far
  too wide to paper over with a tolerance, so they are separate entries in `EXACT_ALIASES`
  and each note says which panel it is.
- 1366×768 reduces to 683:384. The useful answer is "16:9, 0.05% off".

Two lookups, in order: `EXACT_ALIASES` keyed on the exactly reduced fraction (the trade-name
layer, which can never mislabel something merely close), then nearest-by-decimal against
`STANDARDS` with the deviation graded `exact` / `nominal` (≤1%) / `near` (≤3%) / `none`.

### An exact integer input that did not match a fraction is NOT "exact"

1366×768 is 0.05% off 16:9. Calling that "exact" is a lie an installer eventually pays for.
`matchRatio` only grants `kind: 'exact'` on fraction identity for whole-number inputs. There
is a test asserting this; do not relax it.

### `STANDARDS` must stay sorted and no two entries closer than 0.4%

Tested. The tightest real pair is 2.39:1 (43:18, DCI Scope) against 2.40:1 at 0.47% — those
are genuinely two names for two slightly different things, so the bound sits just under.

### Pitch is N × pitch, not (N−1) × pitch

Centre to centre, every pixel owns a full cell. A 168×168 cabinet at 2.9 mm is 487.2 mm.
See the header comment in `solve.ts`.

### `squarePitch` is an input constraint, not an output one

When pitch is the *derived* group it cannot be imposed — both axes are computed independently
and any disagreement is **reported as a warning**, not averaged. That warning is often the
most useful thing on the screen.

### The badge on the picture must describe the picture

The drawn shape is the **physical** ratio where known; the **pixel** ratio leads in the result
card. When pixels are not square these differ, and stamping "32:9" on a 16:9 rectangle makes
the picture argue with itself. `App.tsx` passes `shapeRatio` to the viz and `primary` to the
card. Do not collapse those two into one variable.

### `.stats` and flex shorthand

`.col--main` is a flex **column**, so an unscoped `flex: 2 1 320px` on `.stats` reads as a
320px *height* basis with grow, and the standalone stats block inflates to fill the page.
The rule is scoped to `.ratiocard .stats` for that reason.

### PowerPoint's two 16:9 slide sizes are different sizes

"Widescreen" is 13.333 × 7.5 in. "On-screen Show (16:9)" is 10 × 5.625 in, which is also
Google Slides' default. Both are **exactly** 16:9 and they are 4:3 apart in absolute size, so
a deck built in one and resized to the other has every point size on every slide wrong by a
third. Same species of trap as the two 21:9s in `ratio.ts`: the ratio is not the answer, the
size is. There is a test holding them apart; do not merge them.

### The Slide Size dialog rounds to three decimals, the file does not

Widescreen is **40/3 inches = 12,192,000 EMU**. Typing the dialog's own "13.333" gives
12,191,695 EMU, which is a genuinely different slide. `SLIDE_PRESETS` therefore carries
`DEFAULT_DECK_WIDTH_IN` and not `13.333`, and `slideFieldText` writes **six** decimals into
the input box because five does not round-trip back to 12,192,000. There is a test that
round-trips every preset through its own field text. This is also why the slide rounding
warning fires at a quarter of a pixel and not at `solve.ts`'s 0.005 — the last few
thousandths of a pixel are the dialog's display rounding coming back, not an error anyone
made, and nagging about it on the default state trains people to ignore the message.

### 56 inches is a cap, 1 inch is a floor, and both at once is unsatisfiable

`fitScale` expresses this as an interval — `s` must satisfy `s × longest ≤ 56` and
`s × shortest ≥ 1` — which is empty exactly when the shape is steeper than 56:1. That case
is an **error**, not a warning: no scale makes it a slide. Everything else gets a whole
divisor or a whole multiplier, never 1/2.37, because "build at half and export at 200%" is
an instruction someone can follow on site.

### The export ceiling is on the bitmap, not on the DPI

PowerPoint will not write over 100 megapixels, so `maxdpi = sqrt(1e8 / (w × h))` in inches.
The check in the code is on the pixel count directly because that is the honest statement of
the same constraint; `maxExportDpi` is reported alongside as the number people can act on.

### Usually the right answer is not to resize the deck at all

For a 16:9 target, leaving the deck on Widescreen and raising the export DPI keeps every
template, master and font size intact — 3840 px wide is just 288 dpi. `standardDeckDpi`
offers that route, and **withholds it in three cases**: when the ratio is not 16:9, when the
slide already is the Widescreen deck (advice to change nothing), and when the required DPI is
not a whole number. That last one matters: `ExportBitmapResolution` is a DWORD, 1366 px wide
needs 102.45 dpi, and a helpfully rounded 102 delivers 1360 px that nobody notices until the
wall is lit.

### The colour bars are a picture, not a signal

Stretched to whatever aspect is on screen (which is what a real generator does), standard 75%
RGB values, not colour-managed. The bottom row is **not** in sevenths — four blocks of 5/28,
a 1/7 PLUGE split three ways, then 1/7 of black. That is the real SMPTE layout and it is why
the bottom blocks do not line up with the bars above them.

## 5. Deliberately not here

- **No `diag` module.** Static browser page; nowhere for a rotating log to go. Same call as
  blend-calc and pixel-peeker.
- **No viewing-distance estimate.** The "pitch in mm = minimum viewing distance in metres"
  rule of thumb is a rule of thumb, not a calculation, and it varies by content and by
  vendor. Out of scope on purpose.
- **No PDF export.** Not asked for. `Copy summary` puts the numbers on the clipboard.
