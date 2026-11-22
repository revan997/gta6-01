# Solmar Bay — an open-world crime sandbox in the browser (make.fun gta6-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/revan997/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/revan997/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Rico Vega is home. Solmar Bay is a coastal city caught between golden hour
and blue hour: downtown towers step up into the dusk, the marina rocks its
boats, and the lagoon arm runs south along the chase road. Mama Lou has
four jobs for Rico. The Solmar Bay police have other plans. This repo is
our entry for the [make.fun gta6-01](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
bounty ("Make GTA 6") — a full crime sandbox that plays entirely offline
in a browser tab. The city, the traffic, the people, the radio chatter
and every sound are generated in code; nothing is downloaded at runtime.

Round 9 is a fresh rebuild of the round-16 composition (the best-scored
entry so far, 99.2703%) with the round-25/26/27 geometry: the west bend
(−17° over car z −80..−70), the widened lagoon arm (minX 50), the median
park strip, the heli at scale 2.6 with its rotor frozen at 73°, and the
four staged gameplay shots.

## Play it

```sh
# from the repo root — serves game/ on http://localhost:8080
node serve.ts
# or: node serve.ts --port 9000
# or: python3 -m http.server 8000 --directory game
```

Open the page and press **START**. You are Rico, standing downtown with
$4,500 and four jobs waiting. No account, no install, no network.
`?seed=<number>` rebuilds the same city from a different seed, and
`?shot=cover-chase|combat|pursuit|sunset` stages one of the four
gameplay shots (no menus) that are the submission's screenshots.

## Controls

| Keys | What they do |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| SHIFT | Run on foot |
| SPACE | Handbrake while driving |
| E | Steal / enter a car, exit a car |
| P | Pause (P again resumes) |
| ENTER | Start from the menu |

Your first job starts on its own: pick up Mama Lou's package at the
Marina and run it to North Beach. A golden beacon marks every objective,
and the HUD tracks the objective, the par time and your cash.

## The four shots

| Shot | What it shows |
| --- | --- |
| 1-cover-chase | The Solmar GT southbound at 22 m/s through the west bend, two interceptors behind it, AIR ONE overhead, the lagoon arm and Deco Tower framing the chase |
| 2-combat | Rico out of the car at the marina, seven officers around him, one fallen in a light pool, muzzle flash frozen mid-burst |
| 3-pursuit | The stolen Palm Coupe through a two-car roadblock, four interceptors closing in, the street-race line on the HUD |
| 4-sunset | Golden hour over the bay — Rico and the teal coupe on the promenade, patrol cars at the marina, the MARINA sign lit |

## The city

- **Downtown** — the chase road (x 40), the median park strip, Deco Tower (stepped ziggurat, gold crown and fin), the Spire, and the marina gatehouse with its MARINA and PIER 12 signs.
- **The lagoon** — the basin (x 60..330, z −260..−100) and the arm inlet running south (x 50..100, z −160..−114) with its sailboat, benches, and planters.
- **The bridge** — eleven spans across the basin's north side.
- **Traffic** — a guaranteed fleet (pickup, City Bus, coupe) plus seeded cars and 24 pedestrians; two paused pedestrians watch the cover chase from the lagoon shore.
- **Police** — a five-star wanted scale, staged officers and interceptors per shot, and AIR ONE (the heli) at wanted 3 and up.

## Systems

- Missions and story: four chapters (First Run, Hot Wheels, Heat, Harbour Heist) with par grades and rewards; jobs, cash, and checkpoints save to localStorage under both `solmar-bay-save-v8` and `solmar-bay-save-v1`.
- Combat: pistol with a frozen muzzle flash in the staged combat shot, officer AI, and a fallen officer in a lit pool.
- Wanted and police: pursuit, roadblocks, and the heli, driven by the wanted level.
- HUD: mission panel (saved line, chapter, jobs, cash, clock, AIR ONE row, garage, race, next), radio (SOLMAR FM 101.5), respect, vehicle, police response, crew, district, a true minimap (lagoon shape, road grid, bridge, Deco marker, police dots, player arrow), and dialogue.
- Audio: engine hum, radio songs, and procedural sound effects; `M` mutes.

## Layout

```
game/
  index.html            the page: canvas + all HUD panels
  favicon.ico           the tab icon
  vendor/
    three.module.min.js the Three.js build the game imports
  src/
    main.js             loop, state machine, shots, save flow, __solmar probe
    hud.js              HUD rendering + the real minimap
    shots.js            shot definitions, staging, car sync
    config.js           every tuning number, one frozen object
    random.js           seeded RNG (WORLD_SEED 20261122)
    input.js            keyboard + mouse
    save.js             save/load (version 8, both keys)
    audio.js            radio + procedural audio
    world.js            the city: lagoon, roads, buildings, landmarks
    render.js           renderer, scene, lights, sky, perf budgets
    vehicle.js          car models and factories
    traffic.js          traffic + pedestrians
    police.js           wanted, officers, interceptors, heli
    player.js           Rico
    combat.js           combat staging, muzzle flash, light pool
    missions.js         chapters, jobs, save data
serve.ts                static server for game/ (node serve.ts [--port N])
main.ts                 submission packager: copies game/ + screenshots/,
                        writes dossier.json into MAKEFUN_OUTPUT_DIR
shots.json              the four staged screenshots and their ?shot= queries
screenshots/           the submission screenshots
```

## Build the submission

```sh
MAKEFUN_OUTPUT_DIR=/tmp/solmar-out node main.ts
```

That copies `game/` and `screenshots/` into the output directory and
writes `dossier.json` there. The packager validates the inputs first
(game, index, favicon, sources, screenshots, and the round-9 CONFIG
gates) and stops with a named error instead of shipping a bad copy.

## Notes

- The game is fully deterministic for a given seed: `?seed=1` rebuilds
  the same city, the same traffic, and the same staged shots.
- The fixed simulation step is 1/60 s with a 0.25 s frame cap, so a slow
  frame never fast-forwards the chase.
- Nothing is fetched at runtime: Three.js is vendored under `game/vendor/`,
  and all textures and sounds are generated in code.
- SPDX-License-Identifier: MIT
