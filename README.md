# Solmar Bay — an open-world crime sandbox in the browser (make.fun gta6-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/revan997/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/revan997/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Rico Vega is home. Solmar Bay is a coastal city caught between golden hour
and blue hour: downtown towers step up into the dusk, the old town glows
neon, the marina rocks its boats, and the beach hums with surf. Mama Lou
has five jobs for Rico. The Solmar Bay police have other plans. This repo
is our entry for the [make.fun gta6-01](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
bounty ("Make GTA 6") — a full crime sandbox that plays entirely offline
in a browser tab. The city, the traffic, the people, the radio chatter
and every sound are generated in code; nothing is downloaded at runtime.

## Play it

```sh
# from the repo root — serves game/ on http://localhost:8080
node serve.ts
# or: python3 -m http.server 8000 --directory game
```

Open the page and press **START**. You are Rico, standing downtown with
$250 and five jobs waiting. No account, no install, no network.
`?seed=<number>` rebuilds the same city from a different seed, and
`?shot=start|play|end` stages the entry screenshots.

## Controls

| Keys | What they do |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| SHIFT | Run on foot |
| SPACE | Jump on foot, handbrake while driving |
| E | Steal / enter a car, exit a car |
| F | Punch, shoot (pistol) |
| H | Horn (in a car) |
| C | Camera near / far |
| M | Mute / unmute |
| P | Pause |
| Mouse | Look around (click to lock the pointer) |

Your first job starts on its own: pick up Mama Lou's package at the
Marina and run it to North Beach. A golden beacon marks every objective,
and the HUD tracks the objective, the par time and your cash. Finish
under par and a $100 bonus lands on top of the reward.

## The city

Solmar Bay is one continuous map, built from a seeded generator, so the
same seed always builds the same streets:

- **Downtown** — stepped towers with setbacks and pitched roofs,
  balconies on the mid-rise blocks, rooftop billboards and a helipad,
  traffic lights at every junction.
- **Old Town** — neon shopfronts, awnings, street-name blades, bus
  stops, planters and bins.
- **Marina** — moored boats that bob on the swell, docks, cranes and
  containers.
- **Beach** — sand, umbrellas and loungers, a lifeguard tower, buoys
  and cruising boats offshore, birds overhead.
- **The sea** — a textured, breathing water plane with a foam strip at
  the shoreline.

The sun sits low over the water, the sky is a sunset gradient, and the
shadows stretch long across the roads. At street level the ground is
mottled grass and paved sidewalks, not flat colour.

## The law

Every crime adds heat, from one star to five. Police interceptors with
flashing light bars chase you down — at three stars and up, one of them
breaks off and tries to cut you off ahead while dispatch warns you over
the radio (the lines vary; the same heat level does not always say the
same thing). Foot officers spill out at two stars and will arrest you
if they get close. Stay out of sight and the stars decay; get caught
and it is the busted screen, run out of health and it is wasted.

## The story

Five jobs from fixer Mama Lou, with Dante riding shotgun and Priya
running the plans:

1. **First Run** — $500. A package, a marina, a beach. Keep it clean.
2. **Hot Wheels** — $800. Two stars on your tail. Lose them, then vanish.
3. **Borrowed Beauty** — $1,200. Lift a pearl-white Palm Coupe. No scratches.
4. **Long Tail** — $1,500. Follow a courier from the Palms Hotel. Do not be seen.
5. **Harbour Heist** — $5,000. A vault boat at midnight, four stars, one way out.

Each job has its own intro card and crew chatter, a par time to beat,
and a best time that is saved to your profile.

## Feel, sound, and the HUD

Driving has weight: five car models plus traffic variety (taxi with a
checker band and roof sign, a six-wheel city bus, beach buggy, food
truck, limo), brake lights that flare, tyre screech on a hard skid, an
engine whose pitch follows your speed through five gears, and a camera
whose field of view opens up as you go faster. On foot, Rico leans into
turns, hunches when he sprints, and casts a soft shadow that keeps him
planted on the pavement. Punches knock targets back and freeze the
action for a beat; consecutive hits build a combo (COMBO x2, x3, …)
with a sting that climbs in pitch. Shots leave tracers, muzzle flashes
and impact bursts.

All sound is synthesised live with the Web Audio API — engine hum,
sirens that swell as the nearest unit closes in, footsteps, door slams,
a laid-back chord loop, a city hum that gives way to surf near the
beach, and stings for mission starts, rising heat, combos and cash
earned. Pressing SPACE a fraction early still jumps, thanks to jump
buffering.

The HUD keeps it all readable: wanted stars that flash red when the
heat rises, health and armour bars, a cash readout with floating
"+$" popups, a speedo that warms from white to gold to red, the district
you are standing in, a clock, an objective tracker with a progress bar
and a par countdown that turns urgent under thirty seconds, hit markers
on every landed blow, a combo label, and a live minimap with traffic
dots, flashing police blips (rings for cars, squares for officers on
foot), a pulsing mission marker and your own arrow — gold while the law
is after you.

Progress persists in localStorage: cash, lifetime earnings, completed
missions and best times, position, wanted level and health — across
save versions, so an old profile still loads. The menu shows your
saved profile (missions done, cash earned, games finished) before you
press START.

## Inside the code

- **three.js r187**, vendored under `game/vendor/` (MIT). Nothing else.
- `game/src/` is plain ES modules: `world.js` builds the city,
  `vehicle.js` the cars, `traffic.js` and `police.js` the AI,
  `missions.js` the story, `combat.js`, `hud.js`, `audio.js` and
  `save.js` the systems, `player.js` Rico himself, `main.js` the loop.
- `main.ts` (Node 22, standard library only) assembles the submission
  dossier and validates the inputs first — including that the favicon
  is a real ICO file; `serve.ts` is the local dev server (it steps to
  the next port when the first one is taken).
- Deterministic: the city, the traffic and the sound effects all come
  from seeded generators, so the same seed reproduces the same Bay.

## Screenshots

The `screenshots/` folder holds staged shots from the test harness
(menu, driving, chase, pause). The test itself (`round4-test.mjs` in
the workdir) loads the game in headless Chromium, drives it (menu →
START → driving → carjack → wanted 1 → police spawn → mission advance
→ pause/resume), lands a live punch, completes mission 1, checks the
save round-trip, triggers a busted, and requires zero console errors,
zero warnings, zero failed requests and zero external requests in two
separate full runs.

## Credits

Built for the make.fun gta6-01 bounty. Solmar Bay is an original work:
no Rockstar or GTA assets, names or trademarks are used. Rico Vega,
Mama Lou and the city of Solmar Bay are invented for this game.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
