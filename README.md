# Truss Spacer

Phone tool for spacing lighting fixtures evenly along a truss during bump-in. Enter the truss sections and fixture count, pick a layout and where you're measuring from, and get tape marks for each fixture. It flags any fixture that lands near a section join, and can export a plot image for the crew.

## Run it

Open `index.html` in any browser, or serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000 on your phone (same Wi-Fi) or desktop
```

The offline service worker only runs when served over http(s) (or `localhost`), not from `file://`.

## Install on Android

Live at **https://greube.github.io/truss-spacer/** (deployed from `main` by `.github/workflows/pages.yml`).

Open that URL in Chrome, then ⋮ → **Add to Home screen** → **Install**. It opens full screen from its own icon and works with no signal once it has loaded once.

## Features

- Truss as sections (`3+3+2`, `4x2.5`) with quick-add buttons
- Layouts: set end gaps (same or different each end), equal gaps, centred, fixed gap
- Measure from left, centre or right
- Metres, millimetres, or feet and inches, with tape-friendly rounding
- Join-proximity warnings
- Optional in-section distances
- Tick-off marks list, copy as text, keep screen on
- PNG plot export with dimensions: save, or share straight to Messages/WhatsApp
- Installable PWA that works fully offline (self-hosted fonts)

See `CLAUDE.md` for architecture, decisions and next steps.
