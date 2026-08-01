# CLAUDE.md — Aspect Calc

Command reference. For the model, the invariants and the traps, read
[AGENTS.md](AGENTS.md) first.

## Commands

```bash
npm install
npm run dev          # vite dev server
npm test             # vitest — 72 tests
npm run test:watch
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the built dist/ (does NOT apply _headers)
npm run serve:dist   # serve dist/ WITH _headers applied — use this to check the CSP
npx tsc -b           # typecheck only
```

## Deploy

Static-assets Worker, not Cloudflare Pages.

```bash
cf-run npx wrangler deploy
```

Or connect the repo in the Cloudflare dashboard: build `npm ci && npm run build`,
deploy `npx wrangler deploy`.

## Ground rules

- All lengths are **millimetres** inside the engine. Convert only in `units.ts` and the UI.
- `solve.ts` owns `res × pitch = size`. Don't re-derive it anywhere else.
- A reduced fraction is usually the wrong answer to show a person — `ratio.ts` explains why.
  Don't "simplify" the two-stage lookup into a single tolerance match.
- Never grant `kind: 'exact'` to a whole-number input that didn't match a fraction exactly.
- `STANDARDS` stays sorted, with no two entries closer than 0.4%. Tested.
