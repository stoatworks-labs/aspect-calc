# Notes

Working notes for this repo: status, decisions, and the traps that have actually bitten.
Migrated out of Claude Code's memory on 2026-08-24, so they are written in the first
person and dated by when each thing was learned — that date is usually the useful part.

Cross-cutting notes that are not specific to this repo live in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).

*Aspect Calc — browser-only aspect ratio / pixel pitch / display geometry calculator, private repo feeding a live Cloudflare Worker, with a two-stage named-standard ratio matcher*

**PUBLIC since 2026-08-05** — the private-repo statements below are historical; the repo, its Docker packaging and its `/software` page are all live. See [browser tools published](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/project_browser_tools_published.md).

**Aspect Calc** — aspect ratio, pixel pitch and display geometry calculator.
React/TS/Vite static SPA, no backend, `localStorage` + URL-hash state.
`~/Projects/aspect-calc`, **GitHub PUBLIC** (stoatworks-labs/aspect-calc), MIT, v0.1.0,
created 2026-08-01. No CI. 100 tests green.
**Went public 2026-08-05** along with blend-calc, pixel-peeker, simpleRTA, test-card,
stagewash and thumbnail-generator — verified with `gh repo view`. So the website's
"no source link because the repo is private" behaviour no longer applies here.

**The screenshot is 1920x1420, not 1080** — the app is 1577 tall at 1920 wide now, so a
1080 shot stops at the stats strip and misses the whole slide panel. `shots.json` carries a
`crop` of `[440, 60, 1539, 1420]` for the thumbnail: full height into the 582x720 panel is
half scale and unreadable, and the default centre crop bleeds the controls column across the
seam. See [screenshot capture methods](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_screenshot_capture_methods.md) and [cdpshot tool](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_cdpshot_tool.md) —
`SHOT_W=1920 SHOT_H=1420 SHOT_READY="document.body.innerText.includes('35.833')"`.

**LIVE at aspect-calc.stoatworks-labs.com** — static-assets Worker (not Pages), custom
domain attached by API token in the same session. See [cloudflare access](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_cloudflare_access.md).
Same private-by-design shape as [blend calc](https://github.com/stoatworks-labs/blend-calc/blob/main/docs/NOTES.md) (`blend-calc`) and [pixel peeker](https://github.com/stoatworks-labs/pixel-peeker/blob/main/docs/NOTES.md) (`pixel-peeker`):
the repo exists only to feed the deployed web app, so no releases, no installers, no
download links.

**The one relation:** `resolution (px) x pixel pitch (mm) = physical size (mm)`. Any two
give the third, so the UI names one of three groups as *derived* and takes the other two as
input. Diagonal and aspect ratio are a second way of writing the physical size, not
independent quantities — hence `physicalEntry: 'diagonal'`, which is forced off when the
physical group is itself being solved.

**Lengths are MILLIMETRES internally**, deliberately not metres like blend-calc — pitch is
quoted in mm everywhere in the trade and pitch is the hinge every calculation turns on.

**The interesting module is `lib/ratio.ts`, and the insight is that a reduced fraction is
usually the WRONG answer to show a person:**

- 3440x1440 reduces *exactly* to 43:18. Nobody orders a 43:18 monitor — it is **21:9**.
- 2560x1080 reduces *exactly* to 64:27. **Also** sold as 21:9. These two are **0.8% apart**,
  far too wide to merge under a tolerance, so they are separate `EXACT_ALIASES` entries and
  each note says which panel you actually have.
- 1366x768 reduces to 683:384; the useful answer is "16:9, 0.05% off".

Two lookups in order: trade names keyed on the exact reduced fraction (can never mislabel
something merely close), then nearest-by-decimal with the deviation graded
exact / nominal (<=1%) / near (<=3%) / none. **A whole-number input that did not match a
fraction exactly is never `kind: 'exact'`** — 1366x768 is not 16:9 however close it lands.
Tested; don't relax it.

**Traps recorded in AGENTS.md, all cost real time or nearly did:**

- **Pitch is `N x pitch`, not `(N-1) x pitch`** — centre to centre, every pixel owns a cell.
  A 168x168 cabinet at 2.9 mm is 487.2 mm, not 484.3. Wrong by one pitch across a whole wall.
- **`squarePitch` is an input constraint and cannot be imposed when pitch is the OUTPUT** —
  both axes get computed and the disagreement is reported, not averaged. That warning is
  often the most useful thing on screen.
- **The badge drawn on the picture must describe the picture.** Drawn shape = *physical*
  ratio; the result card leads with the *pixel* ratio. With non-square pixels these differ,
  and stamping "32:9" on a 16:9 rectangle makes the picture argue with itself. Two separate
  variables (`shapeRatio` / `primary`) on purpose — do not collapse them.
- **`.col--main` is a flex column, so an unscoped `flex: 2 1 320px` on `.stats` reads as a
  320px HEIGHT basis with grow** and inflated the stats block down the page. Scoped to
  `.ratiocard .stats`. Generic flex shorthand + a flex-column parent is a recurring trap.
- `STANDARDS` must stay sorted with no two entries closer than 0.4%; the tightest real pair
  is 2.39:1 (43:18, DCI Scope) vs 2.40:1 at 0.47% — genuinely two names for two different
  things.

SMPTE bars in the viz are **a picture, not a signal**: stretched to whatever aspect is shown
(as a real generator does), standard 75% RGB values, not colour-managed. The bottom row is
**not** in sevenths — 4 blocks of 5/28, a 1/7 PLUGE split three ways, then 1/7 black.

**`lib/slides.ts` (added 2026-08-05) — PowerPoint slide sizing, both directions.**
`slide size (in) x export DPI = pixels`, i.e. the same relation with the pitch inverted
(`dpi = 25.4 / pitch_mm`). **Deliberately NOT a fourth derived group** in `solve.ts` — it is a
separate calculator rendered as a card in the results column, sharing only the resolution and
handing it back only via an explicit button. PowerPoint's limits have no business in the
LED-wall engine. Verified against Microsoft's own docs:

- **56 in cap / 1 in floor on either edge.** `fitScale` treats it as an interval
  `[1/shortest, 56/longest]`, empty exactly when the shape is steeper than **56:1** — that
  case is an *error*, no scale makes it a slide. Otherwise a whole divisor or multiplier only
  ("build at half, export at 200%" is followable; 1/2.37 is not).
- **100 MP bitmap cap**, so `maxdpi = sqrt(1e8 / (w x h))` inches. Checked on the pixel count
  directly, which is the same constraint stated honestly.
- **The two 16:9s.** Widescreen 13.333x7.5 vs On-screen Show (16:9) 10x5.625 (= Google Slides'
  default). Same ratio, 4:3 apart in size — every point size wrong by a third. Same species as
  the two 21:9s in `ratio.ts`.
- **The dialog rounds, the file does not.** Widescreen is **40/3 in = 12192000 EMU**; typing
  "13.333" gives 12191695. Presets carry exact inches and `slideFieldText` writes **six**
  decimals (five does not round-trip). Slide rounding warns at a **quarter pixel**, not
  `solve.ts`'s 0.005, because the last thousandths are the dialog's own display rounding.
- **`standardDeckDpi` is usually the better answer** — leave the deck on Widescreen and raise
  the export DPI (3840 px = 288 dpi), keeping templates and type intact. Withheld in three
  cases: ratio not 16:9, slide already IS the deck, or the DPI is not whole
  (`ExportBitmapResolution` is a DWORD; 1366 px needs 102.45 and a rounded 102 gives 1360).

100 tests. **Name shortlist, decision deferred 2026-08-05** — user kept "Aspect Calc" for now:
**Aspect Ratel** (ratel = honey badger, a mustelid, one letter off "aspect ratio" so it keeps
every search term — the recommendation), **Vison** (*Neogale vison*, the mink, reads as
"vision"), **Stoatio** (stoat + ratio).

Deliberately absent: no `diag` module (static page, nowhere to log), no viewing-distance
estimate (a rule of thumb, not a calculation), no PDF export (not asked).

**Website updated 2026-08-05** for the slide feature and DEPLOYED: feature block 05 + check 04
on `web-tools.astro`, plus the `webtools.json` hook and the `projects.json` summary/keywords —
the JSON-LD is generated from that same data, so `alternateName` and `keywords` follow for free.

**Listed on the website** since 2026-08-01 — `webtools.json` (position 04, after Pixel
Peeker), a `projects.json` entry (`status: building`, `public: false`, matching blend-calc
and pixel-peeker) and a per-slug section in `web-tools.astro`. Because the repo is private
the page **renders no GitHub source link** — that is the designed behaviour, not a gap.
See [stoatworks website](https://github.com/stoatworks-labs/stoatworks-website/blob/main/docs/NOTES.md) (`stoatworks-website`).
Related: [pages demo hosting](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_pages_demo_hosting.md), [agents md convention](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_agents_md_convention.md).
