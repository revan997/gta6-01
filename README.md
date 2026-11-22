# Solmar Bay

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/revan997/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/revan997/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01).
Playable offline in a desktop browser from its own static files — no
network, no build step, no install.

You are Rico, a driver and gunman in Solmar Bay, a sun-soaked coastal
city run by Dante's crew. Drive the red Solmar GT along the waterfront,
steal cars, outrun the police under a four-star wanted level, fight
through the combat, and finish the jobs — from the First Run to the
Harbour Heist.

## How to play

Serve the game and open it in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. The game runs
entirely from the files under `game/`.

## Controls

- **W / A / S / D** — drive (accelerate, steer, brake, reverse) and move on foot
- **Mouse** — aim
- **Left click** — fire the pistol
- **E** — enter / exit a car
- **P** — pause / resume
- **Enter** — start from the menu

## The city

Solmar Bay is a deterministic coastal open world: the downtown road, the
Marina basin and its lagoon arm, the bridge, the Deco Tower with its gold
fin, the Spire, the Harbour Gatehouse with the MARINA and PIER 12 signs,
the promenade, traffic and pedestrians — all laid out by a seeded
generator, identical on every run.

## Missions and story

Four jobs across five chapters, with dialogue from Dante, Mama Lou and
Rico, objectives, performance ratings and rewards:

1. **First Run** — pick up the package at the Marina ($500)
2. **Hot Wheels** — lift the Palm Coupe ($800)
3. **Borrowed Beauty** — lose the tail ($1,200)
4. **Harbour Heist** — the big one ($2,500)

Completed jobs and cash are saved (version 8) and restored exactly on
load.

## Systems

- Open world on foot and by car, with a chase camera and a staged
  cover-shot camera
- Traffic and pedestrians on fixed routes, cars to steal and drive
- Wanted level 0–5 with interceptors, officers on foot and the AIR ONE
  helicopter overhead
- Combat: aim, muzzle flash, officers who return fire, a fallen officer
  with a light pool
- Full HUD: mission panel with stage bar and NEXT objective, big cash and
  stars, police response list with distances, weapon slots, crew panel,
  circular minimap with the true lagoon shape, health and armour, portrait
  dialogue, huge speed readout and radio
- Start menu, pause, and a save system
- Sound: engine hum, skid, sirens, gunshots, radio (SOLMAR FM 101.5) and
  interface sounds, all synthesised in code

## Screenshots

Four real renders of the game's own code:

1. `1-cover-chase.jpg` — the coastal chase (the cover)
2. `2-combat.jpg` — the firefight
3. `3-pursuit.jpg` — the stolen Palm Coupe and the roadblock
4. `4-sunset.jpg` — golden hour at the harbour

## Tech

Three.js (vendored under `game/vendor/`), plain ES modules, no build
step. The entrypoint is `main.ts` (Node 22, standard library only): it
copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.

## License

MIT. See [LICENSE](LICENSE).
