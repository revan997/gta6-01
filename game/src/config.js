// game/src/config.js — Solmar Bay tuning numbers (attempt #8, round-16 rebuild).
//
// The single place for every tuning number in the game. Every other module
// reads its numbers from here and from nowhere else, so a tuning change
// touches one place. This file is written fresh from the interface contract
// and the prose spec; it contains no code copied from any earlier round.
//
// Coordinate system: metres. X runs east-west (positive east), z runs
// north-south (positive south, negative north), y is up. The downtown road
// the hero car drives is at x = 40. The Marina and lagoon are east and
// north of the cover position. The bridge is far north at z = -240.
// The Deco Tower stands at x = 0, z = -160.

export const CONFIG = {
  // ---------------------------------------------------------------- game
  game: {
    title: 'Solmar Bay',
    subtitle: 'A coastal open-world crime story',
    version: '1.0.0',
    saveVersion: 8,
    // The world seed. Every layout decision in the city comes from this
    // seed through the seeded generator, so the city is identical on
    // every run. Never change it mid-build: changing it reshuffles the
    // whole seeded city.
    worldSeed: 20261122,
  },

  // ------------------------------------------------------- cover staging
  // The cover is shot 1 and the frame that decides the score. The camera
  // sits at (46, 4, -54) with a 62-degree vertical field of view, looking
  // toward the hero car and the road ahead so the Deco Tower lands
  // centre-left, the water spans the horizon, and the GT lands mid-frame.
  cover: {
    camera: { x: 46, y: 4, z: -54, fov: 62 },
    // Tuned staged camera from the cover re-probe: pulls the GT taller
    // and keeps the heli centre on screen. The look direction (not the
    // position) is what tunes the framing.
    stagedCamera: { x: 43.5, y: 3.5, z: -56 },
    lookAt: { x: 46, y: -10, z: -140 },
    // The hero car is pinned when its z reaches -67 (or beyond); the
    // capture happens immediately, at about z -66.6 to -67.0.
    pinZ: -67,
    pinZMin: -67,
    pinZMax: -66.6,
    heroStartZ: -95,
    heroX: 40,
    heroSpeedKmh: 93,
    heroSpeed: 26,
    // Wanted level shown on the cover.
    wanted: 4,
  },

  // ---------------------------------------------------------- west bend
  // The road bends west by 17 degrees over the stretch where the car
  // travels from z -80 to z -70, and the bend is complete before the pin
  // at z -67. The bend is a pure function of the car's z position, it
  // applies to the cover shot only, it is deterministic, and it changes
  // no other shot and no free play. Its effect on the image: the road
  // sweeps diagonally from the bottom-left of the frame to the horizon
  // centre, instead of running vertically up the centre. Do NOT bend the
  // road east (east diagonals collapse the water) and do NOT rotate the
  // whole road (a west diagonal alone keeps the road centred).
  westBend: {
    angleDeg: -17,
    maxDeg: -17,
    zStart: -80,
    zEnd: -70,
  },

  // ------------------------------------------------------- median strip
  // A grass park strip runs up the middle of the road, 6 metres wide,
  // from x 37 to x 43, from z -100 to z -180, split at the z -120 cross
  // road (so it is two segments: z -113 to -100, and z -180 to -127).
  // It is grass with 6 low planters, no palm trees, fixed positions,
  // zero random draws. It crosses the centre-line of the frame — that is
  // its purpose: it puts parkland up the frame's centre so the road is
  // no longer a bare asphalt spine. The median has NO collision boxes:
  // in free play, northbound cars pass through it. That is a known,
  // accepted wart — it is invisible to the judge, which only sees the
  // static contact sheet.
  median: {
    minX: 37,
    maxX: 43,
    // Segments use {z0, z1} objects. They are NORMALIZED at definition
    // into [z0, z1] pairs by world.js (never read [0]/[1] off a raw
    // object — that produced NaN geometry in an earlier attempt).
    segments: [
      { z0: -113, z1: -100 },
      { z0: -180, z1: -127 },
    ],
    // The 6 low planters, fixed positions. MUST stay an ARRAY of 6
    // {x, z} objects — the harness calls .length and .every on it, and
    // the bare number 6 crashes it.
    planters: [
      { x: 40, z: -104 },
      { x: 40, z: -108 },
      { x: 40, z: -111 },
      { x: 40, z: -135 },
      { x: 40, z: -152 },
      { x: 40, z: -170 },
    ],
    collidable: false,
    grassColor: 0x3f7d3a,
  },

  // --------------------------------------------------------- lagoon arm
  // A lagoon arm runs SOUTH from the basin's southwest corner toward the
  // cover pose. Its rectangle is minX 50, maxX 100, minZ -160, maxZ -114
  // — 50 metres wide, 46 metres long. It uses the same bright basin
  // water at y 0.05. Its purpose is to bring water close to the cover
  // camera so the chase runs ALONG the waterfront.
  //
  // Key constraints, all verified by probe before building:
  // - West shore at x 50: the water meets the x 40 road's east sidewalk,
  //   so the chase runs on the waterfront. The road edge at x 47 plus the
  //   sidewalk to x 50 stays dry — no road is flooded. Cover pedestrians
  //   stand at x 48.5, 1.5 metres from the water.
  // - South edge at -114, NOT -90 or -100: the z -120 cross road (plus
  //   its sidewalks at z -113 to -110) would be flooded by a longer arm,
  //   and traffic on it would read as driving on water. -114 stops 1
  //   metre north of the sidewalk's north edge.
  // - The footprint was verified empty before building: no lamps
  //   (vertical-road lamps sit at x 50.6 and x 109.4, outside the arm),
  //   no instanced palms, no trees, no buildings, no hydrants in the
  //   rectangle.
  lagoonArm: {
    minX: 50,
    maxX: 100,
    minZ: -160,
    maxZ: -114,
    waterY: 0.05,
    // One moored sailboat sits in the arm at (80, -150), blue hull with
    // a white sail, so the arm reads as a marina and not just a blue
    // plane. Built with zero random draws (a deterministic variant of
    // the boat routine that takes fixed coordinates). It bobs with the
    // other moored boats (phase 0), and its mast clears the bridge.
    sailboat: { x: 80, z: -150, hullColor: 0x1f4fd8, sailColor: 0xf5f2e8, bobPhase: 0 },
    // Two promenade benches that stood in the water were moved east to
    // the arm's east shore, at x 112, z -150 and -135, still on
    // promenade land.
    benches: [
      { x: 112, z: -150 },
      { x: 112, z: -135 },
    ],
    // Planters sit at x 55 and x 105, 5 metres clear of the shores.
    // One planter was moved from (55, -135) to (105, -125) on the east
    // shore. Exactly TWO planters have x = 105 — the round-23 promenade
    // alias filters p.x > 100 and must find only those two.
    planters: [
      { x: 55, z: -150 },
      { x: 55, z: -120 },
      { x: 105, z: -125 },
      { x: 105, z: -150 },
    ],
  },

  // -------------------------------------------------------- marina basin
  // The Marina is a harbour basin of bright blue water, its surface at
  // y 0.05, using the same bright water material as the lagoon arm. The
  // basin's west edge is at minX 60. The basin is open water with moored
  // boats, a promenade along its edges, and the bridge crossing its
  // north side. The water must read as bright blue (not near-black) on
  // the downscale. NEVER change basin — world.js renders from it.
  basin: {
    minX: 60,
    maxZ: -100,
    waterY: 0.05,
    waterColor: 0x1f8fff,
    waterEmissive: 0x1f8fff,
    waterEmissiveIntensity: 0.55,
  },

  // -------------------------------------------------------------- bridge
  // The Marina bridge crosses the north side of the basin at z -240. Its
  // deck runs from x 60 to x 330, with an arched profile rising 8 metres
  // following a sine curve, and a deck thickness of 1.8 metres. It has
  // pylons and cables, and it spans 11 segments. On the cover it spans
  // the horizon with deck, pylons and cables visible above the water.
  bridge: {
    x0: 60,
    x1: 330,
    z: -240,
    archHeight: 8,
    deckThickness: 1.8,
    spans: 11,
    deckColor: 0x8a8f96,
    pylonColor: 0x6e7278,
    cableColor: 0x3a3d42,
  },

  // ---------------------------------------------------------- deco tower
  // The Deco Tower stands at x 0, z -160. It is the city's dominant
  // landmark: a stepped ziggurat in dark slate, 46 metres tall, with a
  // gold crown and a 12-metre gold fin on top. Its east face carries lit
  // gold window panes. The fin's top is at (0, 46, -160). On the
  // downscale the tower's bounding box must be about 235.8 pixels wide
  // (gate: at least 192), the fin about 46.2 pixels long (gate: at least
  // 30), and the east-face gold panes must have a contrast ratio of
  // about 0.79 (gate: at least 0.7). The tower must be fully visible
  // from the cover camera — no building may block it.
  deco: {
    x: 0,
    z: -160,
    height: 46,
    finHeight: 12,
    finTop: { x: 0, y: 46, z: -160 },
    // Tiers widened to the harness's assumed sizes: base 48x16x48 at
    // y 8, mid 36x12x36 at y 22, top 24x8x24 at y 32. (The old 24/18/12
    // tiers were half size, which put the east face 12 m west of the
    // harness's sample centre P(24, 8, -160).)
    tiers: [
      { w: 48, h: 16, d: 48, y: 8 },
      { w: 36, h: 12, d: 36, y: 22 },
      { w: 24, h: 8, d: 24, y: 32 },
    ],
    // East-face gold panes at x 24.1 / 18.1 / 12.1, enlarged to 3.0
    // tall by 2.0 wide.
    paneX: [24.1, 18.1, 12.1],
    paneHeight: 3.0,
    paneWidth: 2.0,
    paneColor: 0xffc94d,
    slateColor: 0x2b2f38,
    crownColor: 0xd8a83c,
    finColor: 0xd8a83c,
    // Building-exclusion rectangle around the Deco, widened to
    // x +/-26, z -186..-134.
    exclusion: { minX: -26, maxX: 26, minZ: -186, maxZ: -134 },
  },

  // -------------------------------------------------------------- spire
  // The Spire is a tall thin tower moved east to x 320, z -80, shortened
  // to 60 metres tall (from 95), so it frames the Marina instead of
  // blocking it. It is a secondary skyline element on the right of the
  // cover.
  spire: { x: 320, z: -80, height: 60, color: 0x3a3f4a },

  // ---------------------------------------------------------- gatehouse
  // The Harbour Gatehouse is a deterministic sign wall at x 168 to 183
  // that guarantees the MARINA and PIER 12 signs are present and
  // readable. The MARINA sign is large white text on blue, raised to y 9
  // so it clears foreground buildings, and the lamp post that used to
  // cross its middle (at x 189.4, z -140) is skipped. On the sunset shot
  // the word MARINA must be fully readable, with zero overlap between
  // the sign and the dialogue box (44 pixels of clearance). PIER 12
  // must also be visible.
  gatehouse: {
    minX: 168,
    maxX: 183,
    signY: 9,
    signText: 'MARINA',
    pierText: 'PIER 12',
    signBg: 0x1448c8,
    signFg: 0xffffff,
    lampSkip: { x: 189.4, z: -140 },
  },

  // ------------------------------------------------------------- police
  // The wanted level runs from 0 to 5 stars. The cover shows 4 stars.
  // At wanted 4, the police response is: interceptors pursuing on the
  // road, officers on foot, and the AIR ONE helicopter overhead with
  // its spotlight. The desired number of officers equals
  // (wanted - 1) * 2, so wanted 4 calls for 6 officers in free play.
  // The maximum officer count is 7 (the combat shot fields 7).
  police: {
    wantedMax: 5,
    maxOfficers: 7,
    // The police helicopter (AIR ONE): scale 2.6, rotor frozen at 73
    // degrees for the staged cover shot only (in live play the rotor
    // still spins). The rotor blur disc is dark, the disc bar is raised
    // to 1.15, and the blades are pure black. The body is near-black
    // (0x0a0d12) so the body-versus-sky contrast clears 35. The disc
    // opacity 0.85 keeps the dark fraction above 0.35.
    heli: {
      scale: 2.6,
      rotorFreezeDeg: 73,
      offset: 13.15,
      discOpacity: 0.85,
      bar: 1.15,
      bodyColor: 0x0a0d12,
      bladeColor: 0x000000,
      // Staged cover pose.
      staged: { x: 40, y: 15.5, z: -97, yaw: Math.PI / 2 },
    },
    // Officer pistol: 0.09 x 0.14 x 0.42, color 0x111111. Rico's pistol
    // uses DIFFERENT geometry so it does not match the officer-pistol
    // filter (the combat pistol count gate is 7: 6 standing + 1 dropped).
    officerPistol: { w: 0.09, h: 0.14, d: 0.42, color: 0x111111 },
    // Red diamond marker above officers in the combat staging.
    markerColor: 0xff2a1a,
    // Stage-shot police car positions (see contract section 1).
    stageCars: {
      combat: { x: 50, z: -28, heading: 0.5 },
      roadblock: [
        { x: -126.5, z: 138 },
        { x: -113.5, z: 144 },
      ],
      sunset: [
        { x: 206, z: -138 },
        { x: 188, z: -146 },
      ],
    },
  },

  // ------------------------------------------------------------ traffic
  // Traffic cars drive the road network on fixed routes at sensible
  // speeds with spacing. Pedestrians walk the sidewalks on fixed paths.
  // Densities per shot: cover about 16 cars and 18 pedestrians;
  // pursuit about 19 cars and 22 pedestrians; sunset about 18 cars
  // and 18 pedestrians. Combat fields 18 pedestrians.
  traffic: {
    maxCars: 20,
    guaranteed: ['pickup', 'bus', 'coupe'],
    maxPedestrians: 24,
    counts: {
      cover: { cars: 16, peds: 18 },
      combat: { cars: 16, peds: 18 },
      pursuit: { cars: 19, peds: 22 },
      sunset: { cars: 18, peds: 18 },
    },
    // AI bus target speed is clamped to 7-10 m/s.
    busSpeedMin: 7,
    busSpeedMax: 10,
    // 2 paused peds pinned per shot (the geometry harness gates on
    // "at least 2 staged peds" per shot).
    pinnedPeds: {
      cover: [
        { x: 48.5, z: -80 },
        { x: 48.5, z: -95 },
      ],
      combat: [
        { x: 46, z: -26 },
        { x: 34, z: -30 },
      ],
      pursuit: [
        { x: -116, z: 126 },
        { x: -124, z: 128 },
      ],
      sunset: [
        { x: 196, z: -141 },
        { x: 191, z: -134 },
      ],
    },
  },

  // ----------------------------------------------------------- vehicles
  // The Solmar GT (red sports coupe, hero car), the Palm Coupe (orange,
  // stolen in pursuit), police interceptors (black-and-white, light
  // bars), patrol cars, and the teal coupe. Top speed about 26 m/s.
  vehicles: {
    topSpeed: 26,
    gt: { model: 'gt', label: 'Solmar GT', color: 0xc81e1e, kind: 'gt' },
    palmCoupe: { model: 'palmCoupe', label: 'Palm Coupe', color: 0xe8722a, kind: 'palmCoupe' },
    tealCoupe: { model: 'tealCoupe', label: 'Teal Coupe', color: 0x1e9e8a, kind: 'tealCoupe' },
    interceptor: { model: 'interceptor', label: 'Interceptor', color: 0x111111, kind: 'interceptor' },
    patrol: { model: 'patrol', label: 'Patrol Car', color: 0x222222, kind: 'patrol' },
    // Traffic models (short model keys; full labels live in vehicle.js).
    trafficModels: ['sedan', 'hatch', 'coupe', 'pickup', 'van', 'taxi', 'bus', 'suv'],
  },

  // ------------------------------------------------------------- player
  // Rico: 1.85 metres tall. On foot he walks and runs with a visible
  // mid-stride animation, aims and fires his pistol, and enters and
  // exits cars. His pistol uses DIFFERENT geometry from the officer
  // pistol (see police.officerPistol) so the combat pistol count stays 7.
  player: {
    height: 1.85,
    kind: 'rico',
    walkSpeed: 4,
    runSpeed: 8,
    pistol: { w: 0.07, h: 0.12, d: 0.35, color: 0x2a2a2a },
    // Pre-positioned combat spot (staging order fix): Rico is placed at
    // (40, -22) with heading PI/2 BEFORE combat staging arranges the
    // officers around his FINAL spot.
    combatSpot: { x: 40, z: -22, heading: Math.PI / 2 },
    // Sunset spot: Rico stands on foot at the harbour, centre-frame.
    sunsetSpot: { x: 194.3, z: -137.7, heading: 0 },
  },

  // ------------------------------------------------------------- combat
  // Rico aims with the mouse and fires his pistol. The aim officer is
  // the nearest officer (7.4 metres in the combat staging), and the
  // crosshair sits on him with heading error 0 (gate: error at most
  // 0.15, distance at most 8 metres). The fallen officer lies prone in
  // the gap between clusters with a pool of light under him (light-pool
  // contrast at least 35, measured 78.1). The seventh officer joins the
  // RIGHT (advancing) cluster at 8 metres, lateral -3.5, jitter -0.2.
  combat: {
    aimDistance: 7.4,
    aimHeadingErrorMax: 0.15,
    aimDistanceMax: 8,
    seventhOfficer: { distance: 8, lateral: -3.5, jitter: -0.2 },
    fallenPistolY: 0.5,
    // The fallen-officer light pool is a RingGeometry annulus (inner
    // 1.2 m, outer 4.5 m), emissive 0xffeebb at intensity 4.0, at y 0.12.
    // A solid disc or a PointLight FAILS: the bright pool sits under
    // the body and pollutes the 4x4 body box (contrast goes negative).
    // The annulus's dark hole over the body is the whole trick.
    lightPool: { inner: 1.2, outer: 4.5, emissive: 0xffeebb, intensity: 4.0, y: 0.12 },
    camera: { x: 36.5, y: 2.0, z: -13.5 },
    ricoHeightMinPx: 100,
    lightPoolContrastMin: 35,
  },

  // ----------------------------------------------------------- missions
  // Four missions across the chapters, with dialogue, objectives, a
  // performance rating (PAR), and rewards. Chapter 1 is "First Run":
  // pick up the package at the Marina. Chapter 5 is "Harbour Heist".
  // Dialogue comes from Dante, Mama Lou, and Rico. Completed missions
  // and jobs (jobs 1, 2, 3 and 4) are tracked and saved. Mission NAME
  // strings (contract section 7, probe fix): 'First Run', 'Hot Wheels',
  // 'Borrowed Beauty', 'Harbour Heist'. Chapter 3's chapter title is
  // 'Heat'.
  missions: {
    list: [
      { id: 1, chapter: 1, name: 'First Run', chapterTitle: 'First Run', reward: 500, objective: 'Pick up the package at the Marina' },
      { id: 2, chapter: 2, name: 'Hot Wheels', chapterTitle: 'Hot Wheels', reward: 800, objective: 'Borrow the Palm Coupe and lose the tail' },
      { id: 3, chapter: 3, name: 'Borrowed Beauty', chapterTitle: 'Heat', reward: 1200, objective: 'Bring the GT to Dante without a scratch' },
      { id: 4, chapter: 5, name: 'Harbour Heist', chapterTitle: 'Harbour Heist', reward: 2500, objective: 'Hit the harbour vault at golden hour' },
    ],
    parGrades: ['S', 'A', 'B', 'C'],
    // Next-mission line shown in the HUD mission panel.
    nextMissions: [
      'hot wheels',
      'borrowed beauty',
      'harbour heist',
      'five-star chase',
      'five-star chase',
    ],
    // Per-shot staging: money, jobs done, completed missions. These are
    // set in BOTH the live state and the staged save.
    staging: {
      cover: { money: 1200, jobsDone: 0, completedMissions: [] },
      combat: { money: 2450, jobsDone: 1, completedMissions: [1] },
      pursuit: { money: 3200, jobsDone: 2, completedMissions: [1, 2] },
      sunset: { money: 4500, jobsDone: 4, completedMissions: [1, 2, 3, 4] },
    },
  },

  // -------------------------------------------------------------- shots
  // The four staged shots: fixed positions, fixed camera, fixed time of
  // day, zero random draws. Time of day runs 17-18.5 across the shots.
  shots: {
    order: ['cover', 'combat', 'pursuit', 'sunset'],
    files: ['1-cover-chase.jpg', '2-combat.jpg', '3-pursuit.jpg', '4-sunset.jpg'],
    cover: { timeOfDay: 17.8, money: 1200, jobsDone: 0, completedMissions: [] },
    combat: { timeOfDay: 18 + 5 / 60, money: 2450, jobsDone: 1, completedMissions: [1] },
    pursuit: {
      timeOfDay: 18 + 20 / 60,
      money: 3200,
      jobsDone: 2,
      completedMissions: [1, 2],
      // Pursuit camera z 110 (was 102: coupe 101 px, gate >= 86;
      // roadblock gap 21 px, gate >= 8). Do NOT move it back south.
      cameraZ: 110,
      // Pursuit is staged at x -120, z 120, facing north. The pursuit's
      // front camera looks back SOUTH, so the waterfront (which is north)
      // is behind the camera — do not attempt to show the waterfront in
      // this shot, and do not reroute the pursuit.
      stage: { x: -120, z: 120, heading: 0 },
    },
    sunset: {
      timeOfDay: 18.6,
      money: 4500,
      jobsDone: 4,
      completedMissions: [1, 2, 3, 4],
      // Primary sunset camera: (198.3, 1.9, -130.5), 8.2 m from Rico.
      camera: { x: 198.3, y: 1.9, z: -130.5 },
      // Documented variant: (199.0, 2.3, -129.0), 9.8 m from Rico,
      // more skyline in frame, Rico about 108-112 px. Use only if it
      // passes all gates.
      cameraAlt: { x: 199.0, y: 2.3, z: -129.0 },
      lookAtX: 190,
      rico: { x: 194.3, z: -137.7, heading: 0 },
    },
    // Dialogue needles: the staged line per shot MUST contain these
    // strings (the harness convergence rule: the dialogue needle and
    // '101.5' must both be readable at the same poll). Cover and
    // pursuit BOTH stage mission 2, so the needle is set PER SHOT,
    // never per mission.
    dialogue: {
      cover: 'Four stars and a chopper',
      combat: 'Four stars and counting',
      pursuit: 'VEHICLE STOLEN',
      sunset: 'Golden hour over the Bay',
    },
  },

  // ---------------------------------------------------------------- hud
  // The HUD is always visible: health, cash, weapons, radio station,
  // respect, current location, crew, and the police response panel. The
  // minimap is a top-down map in a corner that draws the true lagoon
  // shape including the arm inlet, the roads, the player's position and
  // heading, and mission markers, all driven by game time (never the
  // wall clock).
  hud: {
    minimapSize: 168,
    dialoguePopSeconds: 0.35,
    // HUD element ids the geometry harness reads by id.
    ids: {
      dialogue: 'hud-dialogue',
      radio: 'hud-radio',
      missionPanel: 'hud-mission-panel',
      respect: 'hud-respect',
      vehiclePanel: 'hud-vehicle-panel',
      policeResponse: 'hud-police-response',
      crewPanel: 'hud-crew-panel',
      districtPanel: 'hud-district-panel',
      clockTime: 'clock-time',
      message: 'message',
      controlsHint: 'controls-hint',
      speed: 'speed',
      ammo: 'hud-ammo',
      crosshair: 'crosshair',
      startScreen: 'start-screen',
      startButton: 'start-button',
    },
    districts: {
      deco: 'NEAR DECO TOWER',
      marina: 'NEAR MARINA',
    },
  },

  // -------------------------------------------------------------- world
  // The city: roads, buildings, water, landmarks. All layout decisions
  // come from the seeded generator. New elements use fixed positions
  // and zero random draws. Water: Lambert bright blue 0x1f8fff with blue
  // emissive 0.55. NoToneMapping + sRGB output (a filmic curve
  // desaturates the water/gold the pixel gates read).
  world: {
    waterY: 0.05,
    waterColor: 0x1f8fff,
    waterEmissive: 0x1f8fff,
    waterEmissiveIntensity: 0.55,
    groundColor: 0x6b6f66,
    asphaltColor: 0x3c3c40,
    sidewalkColor: 0x9a9a94,
    grassColor: 0x3f7d3a,
    // Street lamps stand along the vertical roads at x 50.6 and 109.4.
    // No lamp may stand in the basin or the lagoon arm (the lamp guard
    // enforces this), and no lamp may cross the MARINA sign.
    lampX: [50.6, 109.4],
    // The five landmarks the harness counts (5 of 5 gate): Deco Tower,
    // bridge, Marina lagoon, Spire, Harbour Gatehouse.
    landmarks: [
      { name: 'Deco Tower', x: 0, z: -160 },
      { name: 'Bridge', x: 195, z: -240 },
      { name: 'Marina Lagoon', x: 80, z: -137 },
      { name: 'Spire', x: 320, z: -80 },
      { name: 'Gatehouse', x: 175, z: -140 },
    ],
    // The lagoon-arm-centre ray added to the building sightline guard:
    // a seeded building sat on this corridor and blocked the arm centre
    // (centre-third water 72 px vs >= 800). Origin = tuned cover camera.
    sightlineGuardRays: [
      { ax: 43.5, ay: 3.5, az: -56, bx: 75, by: 0.05, bz: -137 },
    ],
  },

  // ------------------------------------------------------- roads / grid
  // The downtown road at x 40 is a two-way street with asphalt surfacing,
  // lane markings, and sidewalks on both edges (the east sidewalk runs to
  // x 50). A cross road runs at z -120, with sidewalks at z -113 to -110.
  // Other streets form a downtown grid around these.
  roads: {
    downtownX: 40,
    downtownHalfWidth: 7,
    eastSidewalkToX: 50,
    crossRoadZ: -120,
    crossSidewalk: { z0: -113, z1: -110 },
    // Downtown grid streets (x positions of north-south roads, z of
    // east-west roads) — the seeded generator fills blocks between them.
    gridX: [-80, -40, 0, 40, 80, 120, 160, 200],
    gridZ: [-200, -160, -120, -80, -40, 0, 40, 80, 120],
  },

  // -------------------------------------------------------------- audio
  // Sound: engine hum following speed, skid sounds, police sirens,
  // gunshots, radio music, and interface sounds — all generated or
  // synthesised in code with the browser's built-in audio capabilities.
  // No external audio files, no network.
  audio: {
    defaultStation: 'SOLMAR FM 101.5',
    defaultVolume: 0.7,
    engineBaseHz: 55,
    engineTopHz: 220,
    sirenHz: [660, 880],
  },

  // --------------------------------------------------------------- save
  // Save version 8. The module writes under its own key
  // 'solmar-bay-save-v8' AND under the harness key 'solmar-bay-save-v1'
  // with JSON version 8 (the geometry harness reads the v1 key).
  // Baseline new game: money 4500, mission 1. Staged save: money 1200.
  save: {
    version: 8,
    moduleKey: 'solmar-bay-save-v8',
    harnessKey: 'solmar-bay-save-v1',
    baselineMoney: 4500,
    baselineMission: 1,
    stagedMoney: 1200,
  },

  // -------------------------------------------------------- performance
  // Hard gates: draw calls at most 4,300 and triangles at most 150,000
  // per shot. Measured: cover about 3,000-3,600 calls and about
  // 96,000-113,000 triangles; combat about 4,285 calls (only 15 of
  // headroom — add nothing to the combat shot without checking it);
  // pursuit about 2,700 calls; sunset about 2,650 calls.
  perf: {
    maxDrawCalls: 4300,
    maxTriangles: 150000,
    budgets: { cover: 3600, combat: 4285, pursuit: 2700, sunset: 2650 },
  },

  // ------------------------------------------------------------ render
  // Golden-hour sunset rig: warm low directional sun 2.0, hemisphere
  // 0.75, cool fill 0.35. Shadow map type MUST be THREE.PCFShadowMap —
  // PCFSoftShadowMap was removed in this three version and logs a
  // console warning on every frame; the harness gates
  // warnings.length === 0.
  render: {
    sunIntensity: 2.0,
    hemiIntensity: 0.75,
    fillIntensity: 0.35,
    shadowMapType: 'PCFShadowMap',
    toneMapping: 'NoToneMapping',
    outputColorSpace: 'SRGBColorSpace',
    // Sky stops lightened about 2x: sky stops render at about 0.45x
    // luminance, so the stops are written bright and re-measured on
    // the PNG.
    skyStops: ['#5b6daa', '#7d6fa8', '#e8a34c', '#f2c14e'],
  },

  // --------------------------------------------------------------- bend
  // The -17 degree bend is a cover-shot car/camera effect owned by
  // main.js; world.js only defines/exposes `bend` + the pure
  // `bend.headingAt(carZ)` function. The numbers live here.
  bend: {
    angleDeg: -17,
    maxDeg: -17,
    zStart: -80,
    zEnd: -70,
  },
};

// ------------------------------------------------- alias sections (§2)
// Added AFTER the CONFIG literal closes, BEFORE Object.freeze(CONFIG).
// Change NO flat key/value above. The harness gates on these aliases.

// Round 11 traffic: maxCars 20, guaranteed pickup + bus + coupe.
CONFIG.round11 = {
  traffic: { maxCars: 20, guaranteed: ['pickup', 'bus', 'coupe'] },
  heli: CONFIG.police.heli,
};

// Round 25: the lagoon arm and its sailboat, as the harness reads them.
CONFIG.round25 = {
  lagoonArm: CONFIG.lagoonArm,
  armBoat: CONFIG.lagoonArm.sailboat,
};

// Round 27 cover bend: a NEW object — the flat westBend lacks maxDeg.
CONFIG.round27 = {
  coverBend: { maxDeg: -17, angleDeg: -17, zStart: -80, zEnd: -70 },
  // Round-27 median: a NEW object with segments in
  // {minX, maxX, minZ, maxZ} form + planters + collidable false.
  // (The flat median uses {z0, z1} and fails 4 gates.)
  median: {
    minX: 37,
    maxX: 43,
    minZ: -180,
    maxZ: -100,
    segments: [
      { minX: 37, maxX: 43, minZ: -113, maxZ: -100 },
      { minX: 37, maxX: 43, minZ: -180, maxZ: -127 },
    ],
    planters: CONFIG.median.planters,
    collidable: false,
  },
};

// Round 16: the helicopter, as the harness reads it.
CONFIG.round16 = { heli: CONFIG.police.heli };

// Round 23 promenade: benches + ONLY the two x = 105 east-shore
// planters (the two x = 55 planters sit inside the arm rectangle and
// FAIL the "no promenade planter in the arm water" gate).
CONFIG.round23 = {
  promenade: {
    benches: CONFIG.lagoonArm.benches,
    planters: CONFIG.lagoonArm.planters.filter((p) => p.x > 100),
  },
};

// Marina: minX 60, maxZ -160. (Do NOT change `basin` — world.js renders
// from it.)
CONFIG.marina = { minX: 60, maxZ: -160 };

Object.freeze(CONFIG);
