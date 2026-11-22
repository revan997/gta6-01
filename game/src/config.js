// config.js — Solmar Bay tuning numbers.
// Attempt #9 (top10-rebuild). ONE frozen flat object: every other module
// reads its numbers from here and from nowhere else, so a tuning change
// touches exactly one place.
//
// Layout rules this file encodes (from the rebuild spec):
//  - Lagoon arm: x 50..100, z -160..-114, sailboat at (80,-150).
//  - Basin west edge x 60. Median strip x 37..43, z -100..-180.
//  - Deco Tower at (0,-160), 46 m tall, 12 m gold fin.
//  - Cover camera (46,4,-54), fov 62, pin at car z >= -67.
//  - West bend -17 deg over car z -80..-70.
//  - Heli AIR ONE scale 2.6, rotor frozen 73 deg.
//  - Top-10 visual direction (attempt #9): BRIGHT high-key light — vivid
//    warm sky, strong sun, saturated paint. No dark purple-grey dusk.
//    The lighting + paint + hud sections below carry those values so the
//    world, render and HUD builders all use the same bright palette.

export const CONFIG = {
  // ------------------------------------------------------------------
  // Determinism
  // ------------------------------------------------------------------
  // The single world seed. Every seeded decision in the city, traffic
  // and staging derives from this number. Never change it mid-build.
  seed: 20261122,

  // ------------------------------------------------------------------
  // Cover shot — camera, pin, bend
  // ------------------------------------------------------------------
  // Fixed staged camera for shot 1. Position is exact per spec; the
  // lookAt aims east enough that lagoon water spans the horizon band.
  coverCamera: {
    position: { x: 46, y: 4, z: -54 },
    lookAt: { x: 46, y: -10, z: -140 },
    fov: 62,
    near: 0.1,
    far: 900,
  },

  // The cover pin: the harness waits until the GT's z reaches this value
  // (or beyond) and captures immediately. Do not move the pin south —
  // water area is a steep function of car z.
  coverPin: { carZ: -67 },

  // West bend: the road bends west by 17 degrees over the stretch where
  // the car travels from z -80 to z -70, complete before the pin at -67.
  // Cover-shot car/camera effect only; never affects free play.
  westBend: { maxDeg: -17, angleDeg: -17, zStart: -80, zEnd: -70 },

  // ------------------------------------------------------------------
  // World geometry — lagoon, basin, median, bridge, landmarks
  // ------------------------------------------------------------------
  // Lagoon arm: runs SOUTH from the basin's southwest corner toward the
  // cover pose so the chase runs ALONG the waterfront. West shore at x 50
  // meets the x 40 road's east sidewalk; the south edge at -114 stops
  // 1 m north of the z -120 cross-road sidewalk so no road is flooded.
  lagoonArm: {
    minX: 50,
    maxX: 100,
    minZ: -160,
    maxZ: -114,
    waterY: 0.05,
    sailboat: { x: 80, z: -150 },
    benches: [
      { x: 112, z: -150 },
      { x: 112, z: -135 },
    ],
    // Promenade planters: x 55 (west shore, 5 m clear) and x 105 (east
    // shore, on promenade land). Exactly TWO have x > 100 — the harness
    // gates on round23.promenade.planters having only those two.
    planters: [
      { x: 55, z: -125 },
      { x: 55, z: -150 },
      { x: 105, z: -125 },
      { x: 105, z: -150 },
    ],
  },

  // Marina basin: harbour water, west edge at minX 60. NEVER change
  // these numbers — world.js renders the basin from them.
  basin: { minX: 60, maxZ: -100, waterY: 0.05 },

  // Median park strip: grass, 6 m wide (x 37..43), z -100..-180, split
  // at the z -120 cross road into two segments. NO collision boxes (the
  // known, accepted wart: northbound cars pass through in free play).
  // Segments are {z0, z1} objects — never read [0]/[1] off them.
  median: {
    minX: 37,
    maxX: 43,
    segments: [
      { z0: -113, z1: -100 },
      { z0: -180, z1: -127 },
    ],
    // Exactly 6 low planters, fixed positions, zero random draws.
    // This MUST stay an ARRAY of {x, z} — the harness calls .length
    // and .every on it; a bare number crashes the harness.
    planters: [
      { x: 40, z: -104 },
      { x: 40, z: -108 },
      { x: 40, z: -111 },
      { x: 40, z: -135 },
      { x: 40, z: -152 },
      { x: 40, z: -170 },
    ],
    collidable: false,
  },

  // Marina bridge: crosses the north side of the basin at z -240.
  bridge: {
    x0: 60,
    x1: 330,
    z: -240,
    archHeight: 8,
    deckThickness: 1.8,
    spans: 11,
  },

  // Deco Tower: the city's dominant landmark, stepped ziggurat in dark
  // slate with a gold crown and a 12 m gold fin. East-face gold panes
  // are widened (5.0 m) so the pane gate clears 0.7 on the downscale.
  deco: {
    x: 0,
    z: -160,
    height: 46,
    finHeight: 12,
    tiers: [
      { w: 48, h: 16, d: 48, y: 8 },
      { w: 36, h: 12, d: 36, y: 22 },
      { w: 24, h: 8, d: 24, y: 32 },
    ],
    paneX: [24.1, 18.1, 12.1],
    paneWidth: 5.0,
    paneHeight: 3.0,
    // Building-exclusion rectangle around the tower (no seeded building
    // may land inside it and block the cover view of the Deco).
    excludeMinX: -26,
    excludeMaxX: 26,
    excludeMinZ: -186,
    excludeMaxZ: -134,
  },

  // The Spire: tall thin secondary skyline element, moved east so it
  // frames the Marina instead of blocking it.
  spire: { x: 320, z: -80, height: 60 },

  // Harbour Gatehouse: deterministic sign wall guaranteeing the MARINA
  // and PIER 12 signs are present and readable. Sign raised to y 9 so
  // it clears foreground buildings.
  gatehouse: { minX: 168, maxX: 183, signY: 9, signZ: -140 },

  // The five landmarks the harness counts (must stay exactly 5).
  landmarks: [
    { name: 'Deco Tower', x: 0, z: -160 },
    { name: 'Marina Bridge', x: 195, z: -240 },
    { name: 'Lagoon', x: 75, z: -137 },
    { name: 'Spire', x: 320, z: -80 },
    { name: 'Harbour Gatehouse', x: 175, z: -140 },
  ],

  // ------------------------------------------------------------------
  // Lighting — bright high-key golden hour (top-10 direction)
  // ------------------------------------------------------------------
  // The top 10 all read BRIGHT at a glance: blue sky with clouds or
  // vivid golden-hour pink/orange, high overall luminance. The sky
  // stops below are the lightened ones (zenith/mid lifted so the heli
  // body-vs-sky contrast clears 35); the horizon stays warm gold.
  // Tone mapping stays OFF on purpose: a filmic curve desaturates the
  // water and the gold the pixel gates read.
  lighting: {
    sunIntensity: 2.0,
    sunColor: 0xffd9a0,
    sunPosition: { x: -120, y: 90, z: -60 },
    hemiIntensity: 0.75,
    hemiSky: 0xbfd4ff,
    hemiGround: 0x8a6a4a,
    fillIntensity: 0.35,
    fillColor: 0x9db8e8,
    skyZenith: '#8a5cf0',
    skyMid: '#c05fe0',
    skyHorizon: '#ffa04d',
    skySunGlow: '#ffd9a0',
    // skyStops is what createSkyTexture actually reads (zenith/mid/
    // horizon/low/sun); the skyZenith/skyMid names above are metadata.
    // Vivid violet-purple zenith/mid + hot orange horizon (rank 5's
    // purple-gold sky): the old pale mauve/gold stops rendered as flat
    // beige-pink and the whole frame read muddy.
    skyStops: { zenith: '#8a5cf0', mid: '#c05fe0', horizon: '#ffa04d', low: '#f07a40', sun: '#fff3c0' },
    waterColor: 0x1f8fff,
    waterEmissive: 0.55,
    fogColor: 0xe8a06a,
    fogNear: 180,
    fogFar: 420,
    toneMapping: 'NoToneMapping',
  },

  // ------------------------------------------------------------------
  // Paint + materials — vivid saturated palette (top-10 direction)
  // ------------------------------------------------------------------
  // Hero and traffic cars must read as detailed, saturated objects, not
  // flat boxes: vivid body paint, dark glass, visible wheels, bright
  // head/taillights. The heli body is near-black on purpose — it is
  // what makes the body-vs-sky contrast gate pass.
  paint: {
    gtBody: 0xe5322a,
    gtTrim: 0x1a1d22,
    gtGlass: 0x10151c,
    palmCoupeBody: 0xff7a1a,
    tealCoupeBody: 0x1fb6a6,
    interceptorWhite: 0xf2f2f2,
    interceptorBlack: 0x14181d,
    taxiYellow: 0xffc21c,
    busTeal: 0x2a9d8f,
    sedanColors: [0x3f6fb5, 0x8a8f96, 0x5b3f8a, 0xc8c2b4],
    asphalt: 0x3d3a38,
    asphaltLine: 0xe8e4d8,
    sidewalk: 0x8a8578,
    kerb: 0x6f6a5e,
    grass: 0x4a8f3c,
    grassDark: 0x3a7a30,
    sand: 0xd9b380,
    water: 0x1f8fff,
    buildingSlate: 0x2b3442,
    buildingGlass: 0x1c2733,
    goldPane: 0xffc857,
    goldCrown: 0xd9a441,
    signBlue: 0x1c4f9c,
    signWhite: 0xffffff,
    palmTrunk: 0x6a4a2a,
    palmLeaf: 0x2f7a33,
    heliBody: 0x0a0d12,
    heliDisc: 0x0a0a0a,
    officerUniform: 0x1c2733,
    ricoShirt: 0xd94f3d,
    ricoPants: 0x2a2f38,
  },

  // ------------------------------------------------------------------
  // Police + helicopter
  // ------------------------------------------------------------------
  police: {
    maxOfficers: 7,
    wantedMax: 5,
    coverWanted: 4,
    // Desired officers in free play: (wanted - 1) * 2.
    heli: {
      scale: 2.6,
      rotorFreezeDeg: 73,
      offset: 13.15,
      discOpacity: 0.85,
      bar: 1.15,
      bodyColor: 0x0a0d12,
      position: { x: 40, y: 15.5, z: -97 },
      yaw: Math.PI / 2,
    },
    interceptor: { lightBar: true, siren: true },
    roadblock: { count: 2 },
  },

  // ------------------------------------------------------------------
  // Traffic + pedestrians
  // ------------------------------------------------------------------
  traffic: {
    maxCars: 20,
    guaranteed: ['pickup', 'bus', 'coupe'],
    perShot: {
      cover: { cars: 16, peds: 18 },
      combat: { cars: 14, peds: 18 },
      pursuit: { cars: 19, peds: 22 },
      sunset: { cars: 18, peds: 18 },
    },
    // Pinned staged pedestrians (2 per shot, paused, fixed spots).
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

  pedestrians: {
    maxPeds: 24,
    walkSpeed: 1.4,
    runSpeed: 3.2,
  },

  // ------------------------------------------------------------------
  // Player
  // ------------------------------------------------------------------
  player: {
    name: 'Rico',
    height: 1.85,
    walkSpeed: 4.0,
    runSpeed: 7.5,
    pistol: { w: 0.07, h: 0.12, d: 0.35, color: 0x2a2a2a },
  },

  // ------------------------------------------------------------------
  // Missions + chapters + story
  // ------------------------------------------------------------------
  missions: {
    chapters: [
      { number: 1, title: 'First Run', name: 'First Run', reward: 500, jobs: [1] },
      { number: 2, title: 'Hot Wheels', name: 'Hot Wheels', reward: 800, jobs: [2] },
      { number: 3, title: 'Heat', name: 'Borrowed Beauty', chapterTitle: 'Heat', reward: 1200, jobs: [3] },
      { number: 5, title: 'Harbour Heist', name: 'Harbour Heist', reward: 2500, jobs: [4] },
    ],
    rewards: [500, 800, 1200, 2500],
    jobsTotal: 4,
  },

  // ------------------------------------------------------------------
  // Staging — per-shot money / jobs / missions (live state + staged save)
  // ------------------------------------------------------------------
  staging: {
    cover: { money: 1200, jobsDone: 0, completedMissions: [] },
    combat: { money: 2450, jobsDone: 1, completedMissions: [1] },
    pursuit: { money: 3200, jobsDone: 2, completedMissions: [1, 2] },
    sunset: { money: 4500, jobsDone: 4, completedMissions: [1, 2, 3, 4] },
  },

  // ------------------------------------------------------------------
  // Shot cameras + times of day
  // ------------------------------------------------------------------
  shots: {
    cover: {
      camera: { x: 46, y: 4, z: -54 },
      lookAt: { x: 46, y: -10, z: -140 },
      timeOfDay: 17.8,
      fov: 62,
    },
    combat: {
      camera: { x: 36.5, y: 2.0, z: -13.5 },
      timeOfDay: 18 + 5 / 60,
    },
    pursuit: {
      cameraZ: 110,
      timeOfDay: 18 + 20 / 60,
    },
    sunset: {
      camera: { x: 199.0, y: 2.3, z: -129.0 },
      lookAtX: 190,
      timeOfDay: 18.6,
    },
  },

  // ------------------------------------------------------------------
  // HUD layout + palette — dense six-zone HUD (top-10 direction)
  // ------------------------------------------------------------------
  // The top 10 fill all six zones on the cover shot: mission panel,
  // money+stars, police dispatch list, weapon slots, circular minimap
  // with health/armour, portrait dialogue, huge speed readout. The
  // values below are the shared palette + sizes the HUD builder uses.
  hud: {
    minimapSize: 168,
    zones: ['mission', 'money', 'police', 'weapons', 'minimap', 'dialogue', 'speed'],
    panelBg: 'rgba(10,14,20,0.82)',
    panelBorder: '#2a3648',
    panelRadius: 10,
    text: '#f2f5f8',
    muted: '#9fb0c3',
    accentGold: '#ffc857',
    starGold: '#ffd23f',
    moneyGreen: '#7ddc8a',
    healthRed: '#ff5a4e',
    armourBlue: '#6db7ff',
    radioColor: '#8fd0ff',
    chipBg: 'rgba(255,42,26,0.85)',
    speedSize: 64,
    moneySize: 30,
  },

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------
  save: {
    version: 8,
    keyV8: 'solmar-bay-save-v8',
    keyV1: 'solmar-bay-save-v1',
    baselineMoney: 4500,
    baselineMission: 1,
    stagedMoney: 1200,
  },

  // ------------------------------------------------------------------
  // Performance budgets (hard gates)
  // ------------------------------------------------------------------
  perf: { maxDrawCalls: 4300, maxTriangles: 150000 },

  // ------------------------------------------------------------------
  // Round alias placeholders — filled by the alias block below.
  // (The harness gates on these sections; they are built AFTER the
  // literal closes so they can reference the flat keys above.)
  // ------------------------------------------------------------------
  round11: {},
  round25: {},
  round27: {},
  round16: {},
  round23: {},
  marina: {},
};

// ======================================================================
// Alias block — AFTER the literal, BEFORE Object.freeze.
// Change NO flat key/value above; only build the round sections here.
// ======================================================================
CONFIG.round11.traffic = { maxCars: 20, guaranteed: ['pickup', 'bus', 'coupe'] };
CONFIG.round11.heli = CONFIG.police.heli;

CONFIG.round25 = {
  lagoonArm: CONFIG.lagoonArm,
  armBoat: CONFIG.lagoonArm.sailboat,
};

CONFIG.round27.coverBend = { maxDeg: -17, angleDeg: -17, zStart: -80, zEnd: -70 };
CONFIG.round27.median = {
  segments: [
    { minX: 37, maxX: 43, minZ: -113, maxZ: -100 },
    { minX: 37, maxX: 43, minZ: -180, maxZ: -127 },
  ],
  planters: CONFIG.median.planters,
  collidable: false,
};

CONFIG.round16 = { heli: CONFIG.police.heli };

CONFIG.round23.promenade = {
  benches: CONFIG.lagoonArm.benches,
  planters: CONFIG.lagoonArm.planters.filter((p) => p.x > 100),
};

CONFIG.marina = { minX: 60, maxZ: -160 };

// Freeze the top level. Nested objects stay mutable by design (the
// world builder normalises median segments at load); the harness gates
// on Object.isFrozen(CONFIG) itself, not on deep freezing.
Object.freeze(CONFIG);

export default CONFIG;
