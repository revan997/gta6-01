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
| L | Look at the nearest landmark (Solmar Spire / Marina Bridge) |
| M | Mute / unmute |
| P | Pause |
| Mouse | Look around (click to lock the pointer) |
| Mouse wheel | Zoom the chase camera in / out |

Your first job starts on its own: pick up Mama Lou's package at the
Marina and run it to North Beach. A golden beacon marks every objective,
and the HUD tracks the objective, the par time and your cash. Finish
under par and a $100 bonus lands on top of the reward.

## The city

Solmar Bay is one continuous map, built from a seeded generator, so the
same seed always builds the same streets:

- **Downtown** — stepped towers with setbacks and pitched roofs,
  balconies on the mid-rise blocks, rooftop billboards and a helipad,
  traffic lights at every junction — and the **Solmar Spire**, a curved
  glass tower that rises above the whole skyline, crowned with a glowing
  ring and a beacon. Press **L** to look at it from anywhere.
- **Old Town** — neon shopfronts, awnings, street-name blades, bus
  stops, planters and bins.
- **Marina** — moored boats that bob on the swell, docks, cranes and
  containers — and the **Marina Bridge**, an arched span across the
  basin with lamps along its rails.
- **Beach** — sand, umbrellas and loungers, a lifeguard tower, buoys
  and cruising boats offshore, birds overhead.
- **The sea** — a textured, breathing water plane with a foam strip at
  the shoreline.

The sun sits low over the water — a big low disc with a halo, hanging
in a warm orange-to-gold sky — and the shadows stretch long across
the roads. Clouds catch the orange and gold light, and the buildings
wear real recessed windows: dark frames set into the facades, warm lit
glass, sloped awnings that throw shade, parapets and stepped towers
that read in profile. At street level the ground is mottled grass and
paved sidewalks, not flat colour. Reach a landmark for the first time
and the game marks it visited (a gold label, a chime, and a line in
your saved profile) — land a punch near one and it pays a $25
showdown bonus.

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
truck, limo), all sculpted now — sloped hoods and windshields, glass
cabins with body-coloured roofs — the roof crown is sunk into the
body now, so the roofline runs hood → crown → trunk as one continuous
curve instead of a dome perched on a flat deck, and the taxi sign,
roof rack, roof vent and police light bar sit on that curve —
silhouette of its own per model, so the red pickup no longer reads as
a box on a box — sitting planted on bigger wheels with arches and side
skirts, brake lights that flare, tyre screech on a hard skid, an engine
whose pitch follows your speed through five gears, and a camera whose
field of view opens up as you go faster (scroll the mouse wheel to zoom
it in or out, press L to look at the nearest landmark).
On foot, Rico leans into turns, hunches when he sprints, catches the
sunset on his shoulders, and casts a soft shadow that keeps him
planted on the pavement. Punches knock targets back and freeze the
action for a beat; consecutive hits build a combo (COMBO x2, x3, …)
with a sting that climbs in pitch. Shots leave warm gold tracers,
muzzle flashes and impact bursts.

All sound is synthesised live with the Web Audio API — engine hum,
sirens that swell as the nearest unit closes in, footsteps, door slams,
a laid-back chord loop, a city hum that gives way to surf near the
beach, a warm golden-hour chord pad underneath it all, and stings for
mission starts, rising heat, combos, cash earned, the sunset itself —
and a bright chime the first time you reach a landmark. Dispatch
names the Spire and the Bridge when the chase runs past them.
Pressing SPACE a fraction early still jumps, thanks to jump
buffering.

The HUD keeps it all readable: wanted stars that flash red when the
heat rises, health and armour bars, a cash readout with floating
"+$" popups, a speedo that warms from white to gold to red, the district
you are standing in, a clock, an objective tracker with a progress bar
and a par countdown that turns urgent under thirty seconds, hit markers
on every landed blow, a combo label, and a live minimap with traffic
dots, flashing police blips (rings for cars, squares for officers on
foot), a pulsing mission marker, gold stars for the three landmarks
(the Spire's star is bigger, with a glow ring — it is the luminous
one), and your own arrow — gold while the law
is after you.

Progress persists in localStorage: cash, lifetime earnings, completed
missions and best times, position, wanted level and health, the pistol
magazine's loaded rounds, and the
landmarks you have visited — across save versions, so an old profile
still loads. The menu shows your saved profile (missions done, cash
earned, games finished) before you press START.

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
(menu, driving, chase, pause). The test itself (`round7-test.mjs` in
the workdir) loads the game in headless Chromium, drives it (menu →
START → driving → carjack → wanted 1 → police spawn → mission advance
→ pause/resume), lands a live punch, completes mission 1, checks the
save round-trip, triggers a busted, proves the round-7 luminous Solmar
Spire, the burnt-sienna zenith, the Solmar Pyramid and the red pickup's
open bed, and requires zero console errors, zero warnings, zero failed
requests and zero external requests in two separate full runs.

## Round 7 — luminous Spire, warmer zenith, skyline variation

Round 7 closes the three gaps round 6 left open: the Solmar Spire
tower is now luminous (an unlit warm-gradient glass material with lit
window rows, wider glow bands and a soft additive halo, so the tower
body reads as lit glass from the driving view instead of near-black
metal); the sky zenith is burnt sienna (`0x4a2a20`, with the 0.30 mid
stop warmed mauve → sienna) so the whole sky reads as a warm sunset
from every camera angle, not just the driving view; and the skyline
gains a third silhouette — the Solmar Pyramid, a 64 m stepped tower
with a glowing gold cap at (-80, 80) — while the red pickup gets a
dark bed-liner floor and a tailgate seam so it reads as a pickup (cab
+ open bed) from the chase view. Pressing L always frames the nearest
landmark; the tour bus now stops at the Pyramid too; saves are v6.

## Round 8 — sculpted car bodies, stepped-tower skyline, V camera distance

Round 8 closes the gaps round 7 left open: car bodies are sculpted
(fender flares, arch liners, a glasshouse and crowned rooflines, with a
vehicle fill light and a paint boost so the sculpt reads at dusk); the
skyline gains a second building archetype — stepped (ziggurat) towers
on downtown blocks — plus varied rooflines on ordinary towers
(pitched, mansard, crowned and stepped-parapet), and the district
label near a stepped tower reads "Stepped Quarter"; pressing V cycles
the chase-camera distance (near / mid / far, default mid) with a HUD
toast; police rams now spark at the bumper contact point; road/wind
noise scales with speed under the engine hum; saves are v7 (the
chase-camera distance is persisted, v6 and older saves still load and
default to mid).

## Round 9 — integrated roofs, luminous Spire, eye-level sky, sun streak

Round 9 closes the gaps round 8 left open: the car roofs are
integrated — the round-8 crown was a half-dome perched on a flat
roofline, so the taxi sign, roof rack, roof vent and police light bar
floated on a dome; the crown is sunk into the body now (its equator
inside the deck, only the cap emerging) with sloped fore/aft roofline
bridges, so the roofline runs hood → crown → trunk as one continuous
curve and every roof-mounted fitting sits on it; the Solmar Spire is
luminous glass — a bright warm core shining through a
semi-transparent shell, eight vertical light bands around the tower,
taller lit window rings and two additive halo shells, so the tower
reads as glowing from the driving view instead of dark metal, and its
discovery chime gains a high shimmer above the triad; the sky gradient
is remapped onto the visible sky — the old stops sat above 0.5 on the
sky sphere, below the horizon and never seen, so the driving view saw
one flat burnt-orange slice, while now the whole sunset (sienna →
burnt orange → deep orange → bright gold) sits between zenith and
horizon and reads at eye level, painted on a 64 px-wide canvas with
mipmaps off so the gradient is sampled at full resolution instead of
averaged flat; and the sun streak is gone — the "thin vertical yellow
streak" in the round-8 shots was not the sun at all, it was the
mission waypoint beacon, a 160 m tall yellow pillar drawn on top of
every building (depthTest off, renderOrder 999) whenever the objective
lay ahead of the camera. The beacon is removed, not moved: the
waypoint still shows in the HUD objective text and as the gold diamond
on the minimap, and missions stay purely position-based, so no
gameplay system changes. The minimap gains gold
stars for the three landmarks (the Spire's star is bigger, with a glow
ring; visited landmarks dim), the start screen lists the V camera
key, and saves are v8 (the pistol magazine's loaded rounds are
persisted now — a half-empty mag no longer silently refills on
reload; v7 and older saves still load).

## Credits

Built for the make.fun gta6-01 bounty. Solmar Bay is an original work:
no Rockstar or GTA assets, names or trademarks are used. Rico Vega,
Mama Lou and the city of Solmar Bay are invented for this game.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
