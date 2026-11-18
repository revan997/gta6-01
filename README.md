# Solmar Bay — an open-world crime game (make.fun gta6-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/revan997/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/revan997/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** is a complete open-world crime game in three.js, built for the
[make.fun gta6-01](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
bounty ("Make GTA 6"). You are Rico Vega, back in the coastal city that
raised him: explore it on foot and by car, run jobs for fixer Mama Lou,
steal cars, outrun the law — and make the Bay yours.

Everything is procedural and fully offline: the city, the cars, the
characters and all sound are generated in code. No downloads, no accounts,
no network needed to play.

## What is in the game

- **A living coastal city** — downtown towers, old town, marina basin with
  piers, beachfront promenade and docks; textured building facades, rooftop
  props, shop awnings, road markings, crosswalks, palms, lamps and a
  gradient sky with sun and clouds. Real-time shadows follow the player.
- **Drive and walk** — five car models (coupe, sedan, pickup, van, sports),
  carjacking (E), handbrake slides, traffic (14 cars) and pedestrians (18)
  cruising the road network, plus parked cars to steal.
- **Wanted system** — 0–5 stars. Crimes raise the heat; police interceptors
  with flashing light bars chase and ram, foot officers try to arrest you,
  and the heat decays once you stay out of sight.
- **A 5-mission story chain** — First Run, Hot Wheels, Borrowed Beauty,
  Long Tail and Harbour Heist, with a mission beacon, objectives and cash
  rewards (up to $5,000).
- **Combat** — fists and a pistol (tracer fire, muzzle flash, ammo), health
  and armour, busted / wasted screens.
- **HUD + live minimap** — wanted stars, health, cash, speed, clock,
  objective tracker and a top-down map with traffic, police blips and the
  mission marker.
- **Saves** — mission progress, cash, position and wanted level persist in
  localStorage. Synthesised sound throughout (engine, siren, music) with a
  mute toggle. No audio files.

## Run it

```sh
# from this repo root — serves game/ on http://localhost:8080
node serve.ts
# or: python3 -m http.server 8000 --directory game
```

Open the page, click **START**, and play. Controls: WASD move / drive,
SHIFT run, SPACE jump / handbrake, E enter / exit car, F punch / shoot,
H horn, P pause, M mute, mouse to look (click to lock the pointer).

## Tech notes

- three.js r187, vendored under `game/vendor/` (MIT). No other dependency.
- `game/src/` is plain ES modules: `world.js` builds the city,
  `vehicle.js` the cars, `traffic.js` + `police.js` the AI,
  `missions.js` the story, `combat.js` / `hud.js` / `audio.js` /
  `save.js` the systems, `main.js` the loop. `main.ts` (Node 22, stdlib
  only) assembles the submission dossier.
- Deterministic: `?seed=<number>` reproduces the same city and behaviour;
  `?shot=start|play|end` stages the four entry screenshots.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
