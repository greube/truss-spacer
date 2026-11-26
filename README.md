# Truss CAD

CAD-style lighting plot tool for the people who put rigs in. Import the LD's Vectorworks rig (MVR), then use specialist tools (spacing, power and cabling) on the plot, on a phone or a laptop. Works offline.

Preview: https://greube.github.io/truss-spacer/cad/ (the live Truss Spacer v1 is at https://greube.github.io/truss-spacer/).

```sh
npm ci
npm run dev     # local dev server
npm test        # unit tests (set MVR_SAMPLE=path.mvr for real-file tests)
npm run build   # static, offline-ready build in dist/
```

See `CLAUDE.md` for the architecture and `docs/superpowers/` for the design and plans.
