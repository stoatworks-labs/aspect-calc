# CLAUDE.md — Aspect Calc

Command reference. For the model, the invariants and the traps, read
[AGENTS.md](AGENTS.md) first.

## Commands

```bash
npm install
npm run dev          # vite dev server
npm test             # vitest — 100 tests
npm run test:watch
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the built dist/ (does NOT apply _headers)
npm run serve:dist   # serve dist/ WITH _headers applied — use this to check the CSP
npx tsc -b           # typecheck only
```

## Deploy

Static-assets Worker, not Cloudflare Pages.

**Automatic.** `.github/workflows/deploy.yml` tests, builds, smoke-checks and
deploys on every push to `main` that touches something a visitor sees, then
verifies the live `<head>` hash matches the build. Doc-only pushes are skipped.

Needs `CLOUDFLARE_API_TOKEN` (repo secret) and `CLOUDFLARE_ACCOUNT_ID` (repo
variable). The workflow fails in one second with instructions if the token is
missing, rather than after a build.

Manual fallback, for when Actions is down:

```bash
cf-run npx wrangler deploy
```

**Do not connect a Cloudflare dashboard build.** None was ever connected; the
comment that used to claim one is why this repo went weeks without shipping.

## Ground rules

- All lengths are **millimetres** inside the engine. Convert only in `units.ts` and the UI.
- `solve.ts` owns `res × pitch = size`. Don't re-derive it anywhere else.
- `slides.ts` owns `slide size × export DPI = pixels` and PowerPoint's limits. It is a
  **separate calculator, not a fourth derived group** — don't fold it into `solve.ts`.
- Slide presets carry **exact** inches, never the dialog's rounded decimals. Widescreen is
  40/3 in / 12192000 EMU, and 13.333 is a different slide.
- A reduced fraction is usually the wrong answer to show a person — `ratio.ts` explains why.
  Don't "simplify" the two-stage lookup into a single tolerance match.
- Never grant `kind: 'exact'` to a whole-number input that didn't match a fraction exactly.
- `STANDARDS` stays sorted, with no two entries closer than 0.4%. Tested.
