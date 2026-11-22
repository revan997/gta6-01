# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/revan997/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/revan997/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A coastal open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Playable
offline in a desktop browser from its own static files — no network, no
install, no build step.

You are Rico, a driver and gunman in the sun-soaked coastal city of
Solmar Bay, working for a crew run by Dante and Mama Lou. Drive the
red Solmar GT down the Marina road, steal the Palm Coupe, lose the
police helicopter, and pull the Harbour Heist at golden hour.

## How to play

```sh
node serve.ts            # serves game/ on http://127.0.0.1:8080
```

Open the page, press **START**, and play:

| Key | Action |
| --- | ------ |
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A / D | Steer |
| E | Enter / exit a car |
| Mouse | Aim (on foot) |
| Click | Fire the pistol |
| Shift | Sprint |
| P / Esc | Pause |

## The world

- **A city on foot and by car.** Downtown streets, the Marina basin and
  lagoon arm, the suspension bridge, the Deco Tower, the Spire, and the
  Harbour Gatehouse — all seeded and deterministic, so every run looks
  the same.
- **Traffic and pedestrians.** A guaranteed fleet (Dune Pickup, City Bus,
  Palm Coupe and more) plus pedestrians on the sidewalks and the
  promenade.
- **Cars to steal.** Walk up to any parked car and take it. Stealing
  raises your wanted level.
- **Wanted level and police.** One to five stars. Patrol cars, officers
  on foot, and — at four stars — AIR ONE, the police helicopter, tracking
  you from 13 metres out with its rotor frozen mid-beat.
- **Missions and a story.** Four chapters: *First Run*, *Hot Wheels*,
  *Borrowed Beauty*, and *Harbour Heist*. Dante and Mama Lou talk you
  through each job; the HUD tracks chapters, jobs done, cash, and the
  next job.
- **Combat.** Aim with the mouse, fire the pistol, watch officers take
  cover, advance in clusters, and go down — one of them stays down in a
  pool of light.
- **HUD and minimap.** Mission panel, respect, vehicle, police response,
  crew, district, dialogue, radio (SOLMAR FM 101.5), and a real 168×168
  minimap with the lagoon, the bridge, the Deco, police dots, and your
  heading tick.
- **Start and save.** A start screen, pause (P), and a version-8 save
  that round-trips money, mission, jobs, and position.

## The four screenshots

The entry carries four real renders of the game's own code, captured
from the staged shots:

1. **1-cover-chase.jpg** — the coastal chase: the red GT mid-drift on
   the west bend, two interceptors behind, AIR ONE overhead, the lagoon
   and the bridge spanning the horizon.
2. **2-combat.jpg** — the firefight: Rico aiming, seven officers, one
   fallen in a light pool, a patrol car at (50, −28).
3. **3-pursuit.jpg** — the stolen Palm Coupe, four interceptors, and a
   two-car roadblock.
4. **4-sunset.jpg** — golden hour at the harbour: Rico on foot, Dante,
   two patrol cars, the MARINA sign, and the bridge.

Capture them with the staged URLs (`?shot=cover-chase&seed=1`,
`?shot=combat&seed=1`, `?shot=pursuit&seed=1`, `?shot=sunset&seed=1`).

## Layout

```
main.ts            entrypoint: validates, copies game/ + screenshots/,
                   writes dossier.json to $MAKEFUN_OUTPUT_DIR (/output)
serve.ts           dev server: node serve.ts --port 9000
shots.json         the four screenshot files
game/
  index.html       the shell: canvas + HUD root, loads src/main.js
  favicon.ico      tab icon
  vendor/          Three.js, copied unchanged from the kit
  src/
    config.js      all tuning numbers (frozen CONFIG)
    random.js      seeded RNG (WORLD_SEED 20261122) + easings
    world.js       the city: roads, water, bridge, Deco, Spire, Gatehouse
    render.js      renderer, golden-hour light rig, materials, budgets
    main.js        loop, state machine, cameras, staging, __solmar probe
    hud.js         HUD panels, dialogue, minimap
    shots.js       the four staged shots
    vehicle.js     13 car models + factories
    traffic.js     traffic fleet + pedestrians
    police.js      wanted level, officers, helicopter
    player.js      Rico on foot + driving
    combat.js      aiming, firing, muzzle flash, fallen officer
    missions.js    chapters, story, dialogue, save shape
    input.js       keyboard + mouse
    save.js        save/load v8 (keys solmar-bay-save-v8/-v1)
    audio.js       synthesised engine, sirens, gunshots, radio
vendor/
  makefun-game.ts  the kit's dossier builder (copied unchanged)
screenshots/      the four staged renders
```

## Determinism

The city, the staging, and every screenshot are fully deterministic:
one seed (`WORLD_SEED = 20261122`), one sequence, identical on every
run. The only use of the current time is a display-only save timestamp.
No network requests are made at any point.

## Entry point

`node main.ts` (or `MAKEFUN_OUTPUT_DIR=/path/to/out node main.ts`)
validates the inputs, copies `game/` and `screenshots/` into the output
directory, and writes `dossier.json` with the kit's vendored builder.
It exits 0 on success and names the missing input on failure.

## License

MIT — see [LICENSE](LICENSE).
