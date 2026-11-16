# Truss Spacer v2: plan

Agreed with the owner on 16 Nov 2026. Work happens on the `v2` branch. `main` (v1) stays live on GitHub Pages until v2 is merged.

## Goal

Turn Truss Spacer into a rig tool with three functions:

1. **Truss spacing**: as v1, for every truss in a rig.
2. **Power circuits**: assign a fixture type to each fixture, look up its wattage, group fixtures into circuits and Socapex runs.
3. **DMX cable lists**: jumper lengths between fixtures, with slack to tape up to the top chord, and a pull list.

Later, a photo or PDF of the plot and its key fills in the trusses and fixtures automatically.

## Decisions

### General
- **Jobs**: named jobs (e.g. "Rod Laver Arena, 12 Dec") are saved on the phone. They can be exported and shared as a file, for crew or another phone.
- **Files**: split into a few plain files, with no build step and no framework. For example: `index.html`, `app.js`, `spacing.js`, `power.js`, `cables.js`, `fixtures.json`. It must still work fully offline, so every new file goes into `ASSETS` in `sw.js`.
- **Outputs**:
  - A plot image for each truss, showing types, circuit and Socapex numbers, and DMX jumpers
  - A circuit and Socapex sheet
  - A cable pull list for the whole rig
- Australian English, phone-first, and the existing v1 conventions in `CLAUDE.md` still apply.

### 1. Spacing
- Each truss has its own sections, fixture list (ordered, with a type), truss depth and DMX start end.
- Fixtures are spaced evenly using the v1 maths, by default.
- If a scanned plot shows uneven spacing, **ask the user** whether to keep the plot's positions or space evenly.

### 2. Power
- Limit per circuit: **80% of 2400 W = 1920 W by default**, adjustable in settings.
- Use the spec-sheet maximum power for each fixture.
- **Proximity first**: a circuit is always a run of neighbouring fixtures on one truss. Fixtures that are far apart must never share a circuit.
- Within that rule, use the fewest circuits possible and balance the load between them. This is a linear partition of each truss's ordered fixtures.
- **Socapex**: 6 circuits each. **One Socapex per truss** unless told otherwise. A truss that needs more than 6 circuits gets 2 or more. Spare circuits stay empty rather than reaching another truss.
- **Phase balancing (L1/L2/L3)**: optional setting, off by default. When it's on, the app shows the load per phase.
- A single fixture over the limit gets a warning.
- Power links between fixtures (powerCON link-through or one tail per fixture) are **out of scope for now**.

### 3. DMX
- Each truss: the drop comes in at one end, then daisy-chains fixture to fixture. The start end is **chosen per truss** and defaults to stage left.
- Jumper length = gap between fixtures + 2 × truss depth (up to the top chord and back down) + 0.5 m. It's then rounded up to the next stock length.
- Stock lengths: **1, 2, 3, 5, 10, 20 and 50 m**.
- Truss depth is picked per truss: 290, 300, 400 or 520 mm box, or custom.
- Drop cables from the deck are **not included**. The list covers fixture-to-fixture cables only.

### 4. Plot scanning (last)
- Inputs: the LD's PDF export, or a photo of a printed plot, plus the plot key.
- Uses the Claude API, called directly from the browser with the **user's own API key**, stored only on the phone. It needs signal; everything else stays offline.
- Output: trusses, plus the fixtures on each truss with their types from the key. Then a **review screen** where the user confirms or fixes what was found and enters truss lengths.

## Fixture database: research so far

- **Open Fixture Library**: MIT licence, so it can be bundled.
  - 666 fixtures from 138 manufacturers, 614 of them with `physical.power` in watts.
  - Weak on current touring stock. No MegaPointe, Spiider, Esprite, BMFL, Strike or AX1, and only 10 Robe fixtures in total.
  - Mostly LED pars and DJ gear.
- **GDTF Share** (API docs at gdtf-share.com/help/developers/gdtf_share_dev/gdtf_share_api_1/):
  - Login, a list call and a download call. A free account is needed, and auth is a session cookie.
  - The list call has **no wattage**. Power is only inside each `.gdtf` file: the beam geometry `PowerConsumption` (defaults to 1000 W, so it's unreliable when left at the default) and `Properties/PowerConsumption` per connector.
  - Terms: cached GDTF files must be **no more than 24 hours old**. Attribution "Powered by GDTF" plus the logo is required. Listings must show the uploader (Manuf. or User).
  - **No CORS headers**, so the phone app can't call it directly. That would need a server.
  - Conclusion: not a good fit for an offline, serverless app that bundles data. Possibly useful later as a cross-check during research.
- **Manufacturer websites**: the most reliable source.
  - Robe's product pages state "Power consumption: 670 W" for the MegaPointe.
  - Some sites block automated requests (Martin returned 403), so research needs a per-fixture pass with web search.
- **Proposed approach for stage 2**:
  1. Bundle OFL wattages.
  2. Add a curated **touring list** of about 100–150 common rental fixtures. Wattages come from manufacturer spec pages, with the source URL recorded for each.
  3. Add **user-added fixtures**, saved on the phone and reused across jobs.
  4. Optionally, an **online lookup** for unknown fixtures through the user's Claude API key with web search, giving a suggested wattage and its source for the user to confirm. This needs signal.

## Build order

1. ✅ Jobs with multiple trusses, entered by hand. The v1 spacer works on each truss. Done on 16 Nov 2026.
2. ✅ Fixture database and circuit grouping, plus the circuit and Socapex sheet. Done on 16 Nov 2026.
3. DMX cable lists, plus the pull list.
4. Plot scanning.

Each stage should be usable at a bump-in on its own.
