# Solmar Bay — drive it, walk it, outrun the law (make.fun gta6-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/revan997/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/revan997/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** is a playable open-world crime game in three.js, built for
the [make.fun gta6-01](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
bounty ("Make GTA 6"). Rico Vega is home again in the coastal city that
raised him — and the city is not glad to see him. Take jobs from fixer
Mama Lou, lift the cars you need, lose the cops when the stars come out,
and turn the Bay into your own.

The whole thing is generated in code and runs fully offline: the streets,
the buildings, the cars, the people and every sound. Nothing to download,
no account, no network.

## Playing it

```sh
# from the repo root — serves game/ on http://localhost:8080
node serve.ts
# or: python3 -m http.server 8000 --directory game
```

Open the page, hit **START**, and go. Controls: WASD to move / drive,
SHIFT to run, SPACE to jump (or handbrake in a car), E to get in and out
of cars, F to punch / shoot, H to honk, C to switch the chase camera,
P to pause, M to mute, mouse to look (click to lock the pointer).

## What you get

- **A coastal city that feels alive** — downtown towers with lit windows
  and rooftop billboards, old town storefronts with neon signs, a marina
  basin with piers and moored boats, a beachfront with palms and
  umbrellas, parks, zebra crossings, and traffic lights that actually
  cycle — and traffic that stops at red. Clouds drift overhead, the sun
  throws long shadows that follow you, and the sky turns orange at dusk.
- **Driving with feel** — five car models (coupe, sedan, pickup, van,
  sports) plus traffic variety (taxi, bus, buggy, food truck, limo),
  brake lights that flare, tyre screech on a hard handbrake turn, and a
  camera whose field of view opens up as you go faster. Steal any car
  with E — parked or moving.
- **A wanted system with a voice** — 0–5 stars. Every crime adds heat,
  police interceptors with flashing light bars chase and ram, foot
  officers try to arrest you, and dispatch talks back over the radio as
  the stars climb. The siren gets louder as the nearest unit closes in.
  Stay out of sight and the heat decays.
- **Five story missions** — First Run, Hot Wheels, Borrowed Beauty,
  Long Tail and Harbour Heist. A golden beacon marks each objective,
  the HUD tracks your progress and the par time, and finishing under
  par pays a bonus on top of the reward (up to $5,000).
- **Combat and consequences** — fists and a pistol with tracer fire,
  muzzle flash and hit impacts, health and armour, ammo and reloads,
  and busted / wasted screens when the law (or a bullet) catches you.
- **HUD and live minimap** — wanted stars that flash when the heat
  rises, health, cash, a speedo that warms up with speed, the district
  you are standing in, a clock, the objective tracker, and a top-down
  map with traffic dots, flashing police blips and the mission marker.
- **Saves and sound** — mission progress, cash, lifetime earnings,
  position and wanted level persist in localStorage. Engine hum, sirens,
  footsteps, horns, door slams and a laid-back chord loop, all
  synthesised live with the Web Audio API. No audio files.

## Under the hood

- three.js r187, vendored under `game/vendor/` (MIT). Nothing else.
- `game/src/` is plain ES modules: `world.js` builds the city,
  `vehicle.js` the cars, `traffic.js` + `police.js` the AI,
  `missions.js` the story, `combat.js` / `hud.js` / `audio.js` /
  `save.js` the systems, `main.js` the loop. `main.ts` (Node 22, stdlib
  only) assembles the submission dossier.
- Deterministic: `?seed=<number>` reproduces the same city and
  behaviour; `?shot=start|play|end` stages the four entry screenshots.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
