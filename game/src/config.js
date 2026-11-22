// Solmar Bay — every tuning number in one place.
//
// One frozen object, CONFIG. Every other module reads its numbers from here
// and from nowhere else, so a tuning change touches exactly one file.
// Coordinates are metres: x east, z south (negative north), y up.
// The flat keys are the section objects below; the alias block at the bottom
// (§2 of the interface contract) adds the round-marker views the harness
// reads, after the literal closes and before Object.freeze.

export const CONFIG = {
  // ---- game identity + loop ----
  game: {
    title: 'Solmar Bay',
    version: '0.9.0',
    // Logical playfield the HUD is laid out against (1280x720).
    fieldWidth: 1280,
    fieldHeight: 720,
  },
  // Fixed simulation step: 60 updates a second whatever the display rate.
  step: 1 / 60,
  // Slowest frame the loop will simulate in one go (seconds). A 0.05
  // experiment was reverted — slow motion broke the pursuit capture.
  maxFrame: 0.25,

  // ---- cover shot (shot 1) ----
  // Contract §7 fix #3 item 4 (UNVERIFIED estimates — the test session must
  // re-measure all cover gates after any camera move). The prose spec §4.1
  // lists the older camera (46, 4, -54); §7 wins.
  cover: {
    camera: { x: 43.5, y: 3.5, z: -56 },
    lookAt: { x: 46, y: -10, z: -140 },
    fov: 62,
    // The harness waits until the GT's z reaches this value, then captures.
    pinZ: -67,
    gtStart: { x: 40, z: -95 },
    gtSpeed: 22,
    // GT height on the 768x480 downscale must be >= 108 px.
    gtHeightGate: 108,
    // Water gates on the downscale.
    waterAreaGate: 4057,
    waterCentreThirdGate: 800,
  },

  // ---- west bend: the road bends west by 17 degrees over car z -80..-70.
  // A pure function of the car's z, cover shot only, never free play.
  westBend: { angleDeg: -17, zStart: -80, zEnd: -70 },

  // ---- downtown road ----
  road: {
    x: 40, // the downtown road the GT drives, southbound in the cover
    halfWidth: 7,
    eastSidewalkToX: 50,
    crossRoadZ: -120,
    crossSidewalkZ0: -113,
    crossSidewalkZ1: -110,
  },

  // ---- median park strip: grass up the middle of the road, x 37..43,
  // z -100..-180, split at the z -120 cross road. NO collision boxes.
  median: {
    minX: 37,
    maxX: 43,
    segments: [
      { z0: -113, z1: -100 },
      { z0: -180, z1: -127 },
    ],
    planters: [
      { x: 38.5, z: -106 },
      { x: 41.5, z: -106 },
      { x: 38.5, z: -140 },
      { x: 41.5, z: -140 },
      { x: 38.5, z: -168 },
      { x: 41.5, z: -168 },
    ],
    collidable: false,
  },

  // ---- lagoon arm: bright water running south from the basin's corner,
  // so the chase runs ALONG the waterfront. South edge -114 stops 1 m
  // north of the cross-road sidewalk; the road edge at x 47 stays dry.
  lagoonArm: {
    minX: 50,
    maxX: 100,
    minZ: -160,
    maxZ: -114,
    waterY: 0.05,
    sailboat: { x: 80, z: -150, phase: 0 },
    // The two benches moved east to the arm's east shore.
    benches: [
      { x: 112, z: -150 },
      { x: 112, z: -135 },
    ],
    // Planters 5 m clear of the shores; two at x 55, two at x 105.
    // round23.promenade keeps ONLY the x > 100 ones.
    planters: [
      { x: 55, z: -150 },
      { x: 55, z: -125 },
      { x: 105, z: -150 },
      { x: 105, z: -125 },
    ],
  },

  // ---- Marina basin: bright blue harbour water. NEVER change these two
  // numbers — world.js renders from them and the gates depend on them.
  basin: { minX: 60, maxZ: -100, waterY: 0.05 },

  // ---- bridge: crosses the basin's north side, deck x 60..330.
  bridge: {
    x0: 60,
    x1: 330,
    z: -240,
    archHeight: 8,
    deckThickness: 1.8,
    spans: 11,
  },

  // ---- Deco Tower: stepped ziggurat, dark slate, gold crown + fin.
  // Contract §7 fix #3 item 9: tiers widened to the harness's assumed
  // sizes (was 24/18/12 — half size, which put the east face 12 m west
  // of the harness's sample centre). Crown/fin unchanged.
  deco: {
    x: 0,
    z: -160,
    height: 46,
    finHeight: 12,
    finTopY: 46,
    tiers: [
      { size: 48, height: 16, y: 8 },
      { size: 36, height: 12, y: 22 },
      { size: 24, height: 8, y: 32 },
    ],
    // Lit gold panes on the east face: x per tier, 3.0 tall x 2.0 wide.
    paneX: [24.1, 18.1, 12.1],
    paneHeight: 3.0,
    paneWidth: 2.0,
    paneColor: 0xffb800,
    paneEmissive: 1.0,
    bodyColor: 0x1c2733,
    // Keep seeded buildings out of this rectangle.
    exclusion: { minX: -26, maxX: 26, minZ: -186, maxZ: -134 },
  },

  // ---- Spire: tall thin tower framing the Marina, moved east.
  spire: { x: 320, z: -80, height: 60 },

  // ---- Harbour Gatehouse: deterministic sign wall, MARINA + PIER 12.
  gatehouse: {
    minX: 168,
    maxX: 183,
    signY: 9,
    // The lamp post that used to cross the MARINA sign is skipped.
    skippedLamp: { x: 189.4, z: -140 },
  },

  // ---- marina signs ----
  marinaSigns: [
    { text: 'MARINA', x: 175, y: 9, z: -140, width: 15, height: 4 },
    { text: 'PIER 12', x: 175, y: 9, z: -146, width: 10, height: 3 },
  ],

  // ---- police ----
  police: {
    maxOfficers: 7,
    // desiredOfficers = (wanted - 1) * 2, capped at 7.
    heli: {
      scale: 2.6,
      rotorFreezeDeg: 73,
      offset: 13.15,
      // Contract §7: disc opacity 0.85, not 0.55 (was dark fraction 0.09).
      discOpacity: 0.85,
      bar: 1.15,
      bodyColor: 0x0a0d12, // §7: near-black (was 0x1c2733, contrast 7.9)
      discColor: 0x050505,
      staged: { x: 40, y: 15.5, z: -97, yaw: Math.PI / 2 },
    },
    // Cover interceptors: proven positions from re-test #2/#3.
    // Contract §1 lists (36,-108)/(44,-112); the (30,-106)/(50,-114)
    // positions are the ones that passed the >= 150 px apart gate.
    coverInterceptors: [
      { x: 30, z: -106, heading: 0 },
      { x: 50, z: -114, heading: 0 },
    ],
    // Combat patrol car.
    combatCar: { x: 50, z: -28, heading: 0.5 },
    // Pursuit: all interceptors NORTH of the pursuit camera (z > 108).
    // Contract §7 fix #3 item 7: (-128,116) -> (-124,118); it was 53
    // degrees off-axis, outside the ~47 degree half-FOV.
    pursuit: {
      interceptors: [
        { x: -124, z: 118 },
        { x: -112, z: 120 },
        { x: -128, z: 128 },
        { x: -116, z: 132 },
      ],
      roadblock: [
        { x: -126.5, z: 138 },
        { x: -113.5, z: 144 },
      ],
    },
    // Sunset patrol cars: proven positions from re-test #3 (sunset 0 FAIL).
    // Contract §1 lists (206,-138)/(188,-146); the (206,-138) car was
    // ~66 degrees off-axis, outside the FOV.
    sunsetPatrol: [
      { x: 190, z: -148 },
      { x: 186, z: -144 },
    ],
  },

  // ---- traffic ----
  traffic: {
    maxCars: 20,
    maxPedestrians: 24,
    guaranteed: ['pickup', 'bus', 'coupe'],
    // Per-shot counts the harness gates on.
    shotCounts: {
      cover: { cars: 16, peds: 18 },
      combat: { cars: 14, peds: 18 },
      pursuit: { cars: 19, peds: 22 },
      sunset: { cars: 18, peds: 18 },
    },
    // AI bus target speed clamp (m/s).
    busSpeedMin: 7,
    busSpeedMax: 10,
  },

  // ---- pedestrians ----
  pedestrians: {
    // Cover peds stand 1.5 m from the lagoon water.
    coverPins: [
      { x: 48.5, z: -80 },
      { x: 48.5, z: -95 },
    ],
  },

  // ---- player (Rico) ----
  player: {
    height: 1.85,
    walkSpeed: 4,
    runSpeed: 8,
    // Contract §7 fix #3 item 6: Rico is pre-positioned here with
    // heading PI/2 BEFORE shots.stageShot, so combat.stageShot arranges
    // the officers around his FINAL spot (aim officer 7.4 m), not his
    // stage-time position 28.5 m away.
    combatFinal: { x: 40, z: -22, heading: Math.PI / 2 },
    sunset: { x: 194.3, z: -137.7 },
  },

  // ---- combat ----
  combat: {
    officers: 7,
    aimDistance: 7.4,
    aimHeadingErrGate: 0.15,
    aimDistanceGate: 8,
    nearestGateMin: 6,
    nearestGateMax: 13,
    seventh: { distance: 8, lateral: -3.5, jitter: -0.2 },
    fallenGapGate: 70,
    fallenPistolY: 0.5,
    // Contract §7 fix #2 item 7: RingGeometry annulus (inner 1.2 m,
    // outer 4.5 m), emissive 0xffeebb at intensity 4.0, at y 0.12.
    // Measured contrast 41.8 (gate >= 35). A solid disc or a PointLight
    // FAILS: the bright pool pollutes the 4x4 body box (contrast -28..-82).
    lightPool: {
      inner: 1.2,
      outer: 4.5,
      emissive: 0xffeebb,
      intensity: 4.0,
      y: 0.12,
    },
    camera: { x: 36.5, y: 2.0, z: -13.5 },
    ricoHeightGate: 100,
  },

  // ---- pursuit shot ----
  pursuit: {
    camera: { x: -120, y: 7, z: 110 },
    lookAt: { x: -120, y: 2, z: 130 },
    fov: 62,
    coupeHeightGate: 86,
    roadblockGapGate: 8,
    race: 'STREET RACE · 1/3',
  },

  // ---- sunset shot ----
  sunset: {
    camera: { x: 199.0, y: 2.3, z: -129.0 },
    // Contract §7 fix #2 item 8: lookAt x 192 -> 190 (all 4 MARINA
    // corners on screen).
    lookAt: { x: 190, y: 2.5, z: -140 },
    fov: 62,
    ricoHeightGate: 90,
  },

  // ---- missions ----
  missions: {
    chapters: [
      { number: 1, name: 'First Run', par: 'S', reward: 500, jobs: 1 },
      { number: 2, name: 'Hot Wheels', par: 'A', reward: 800, jobs: 2 },
      { number: 3, name: 'Heat', par: 'B', reward: 1200, jobs: 3 },
      { number: 5, name: 'Harbour Heist', par: 'C', reward: 2500, jobs: 4 },
    ],
    pars: ['S', 'A', 'B', 'C'],
  },

  // ---- HUD ----
  hud: {
    minimapSize: 168,
    radioStation: 'SOLMAR FM 101.5',
    dialoguePopMs: 350,
  },

  // ---- audio ----
  audio: {
    masterVolume: 0.8,
    radioVolume: 0.35,
    engineVolume: 0.5,
  },

  // ---- save ----
  save: {
    version: 8,
    moduleKey: 'solmar-bay-save-v8',
    harnessKey: 'solmar-bay-save-v1',
  },

  // ---- rendering ----
  render: {
    waterColor: 0x1f8fff,
    waterEmissive: 0.55,
    waterEmissiveColor: 0x1f8fff,
    // Contract §7 fix #3 item 5: sky zenith stops lightened so the dark
    // heli body reads against them (was '#2a3a6e'/'#6a5a8a', contrast 7.9).
    // Horizon stays warm gold.
    skyZenith: '#5b6daa',
    skyMid: '#7d6fa8',
    skyHorizon: '#e8a85c',
    sunIntensity: 2.0,
    hemisphereIntensity: 0.75,
    fillIntensity: 0.35,
    shadowMap: 'PCFShadowMap',
    fogNear: 120,
    fogFar: 520,
  },

  // ---- world: sightline guard ----
  // Contract §7 fix #3 item 8: a seeded building sat on the ray from the
  // tuned cover camera to the lagoon-arm centre and blocked it
  // (centre-third water 72 px vs >= 800; attempt #3 measured 1,801 with
  // the same camera). world.js must keep this corridor clear.
  coverSightline: { ax: 43.5, ay: 3.5, az: -56, bx: 75, by: 0.05, bz: -137 },

  // ---- performance budgets (hard gates) ----
  perf: { maxDrawCalls: 4300, maxTriangles: 150000 },

  // ---- round-marker parents (filled in by the alias block below) ----
  round11: {},
  round25: {},
  round27: {},
  round16: {},
  round23: {},
  marina: {},
};

// ---- §2 alias block (contract): AFTER the literal, BEFORE Object.freeze.
// Change NO flat key/value above.
CONFIG.round11.traffic = { maxCars: 20, guaranteed: ['pickup', 'bus', 'coupe'] };
CONFIG.round11.heli = CONFIG.police.heli;
CONFIG.round25 = { lagoonArm: CONFIG.lagoonArm, armBoat: CONFIG.lagoonArm.sailboat };
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

Object.freeze(CONFIG);
