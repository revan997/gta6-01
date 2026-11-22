// Solmar Bay — configuration (W1, attempt #7, fresh build).
// ONE frozen FLAT object. Every module reads its numbers from here and
// from nowhere else. Values come from the round-9 interface contract
// (sections 1-2, fixes 6 and 7) and the rebuild spec. Nothing here is
// copied from an old repo: every line below is written fresh for this
// recording. Where the prose spec and the contract disagree, the contract
// wins (noted inline).

export const CONFIG = {
  // ---- World grid -------------------------------------------------------
  // Road centrelines (grid). The downtown road the GT drives is x = 40.
  roadLines: [-280, -200, -120, -40, 40, 120, 200, 280],
  // South strip (z > 280) is beach + sea; north-east corner is the marina.
  beachStartZ: 272,
  seaStartZ: 300,

  // ---- Marina basin + lagoon arm ---------------------------------------
  // The basin extends WEST to x 60 (round 24) so the cover camera on the
  // x=40 road can see real water. The strict water run is bounded left by
  // the basin's diagonal west shore. No buildings are removed: the
  // (80,-240) block is already empty (basin skip).
  // NEVER change basin.minX / basin.maxZ — world.js renders from them.
  basin: { minX: 60, maxX: 340, minZ: -260, maxZ: -100 },
  // The marina district rectangle (used by the district panel + minimap).
  marina: { minX: 60, maxX: 320, minZ: -320, maxZ: -160 },

  // Lagoon arm: a 50 m wide, 46 m long tongue of basin water running south
  // from the basin's south-west corner toward the cover pose, so the chase
  // runs ALONG the waterfront. West shore at x 50 meets the x=40 road's
  // east sidewalk (road edge x 47 + sidewalk to x 50 stays dry). South
  // edge at z -114 stops 1 m north of the z=-120 cross-road sidewalk
  // (z -113..-110) so no road is flooded.
  lagoonArm: {
    minX: 50,
    maxX: 100,
    minZ: -160,
    maxZ: -114,
    // One moored sailboat in the arm so it reads as a marina, not a plane.
    sailboat: { x: 80, z: -150 },
    // Benches moved east to the arm's east shore, still on promenade land.
    benches: [
      { x: 112, z: -150 },
      { x: 112, z: -135 },
    ],
    // Planters 5 m clear of the shores. The two x=55 planters sit inside
    // the arm rectangle (water's edge); the two x=105 planters are on the
    // east shore. round23.promenade keeps ONLY the x=105 pair.
    planters: [
      { x: 55, z: -150 },
      { x: 55, z: -125 },
      { x: 105, z: -150 },
      { x: 105, z: -125 },
    ],
  },

  // ---- Districts (name -> rectangle, x/z bounds) ------------------------
  districts: {
    marina: { minX: 60, maxX: 320, minZ: -320, maxZ: -120, label: 'Marina' },
    downtown: { minX: -120, maxX: 160, minZ: -200, maxZ: 40, label: 'Downtown' },
    oldTown: { minX: -320, maxX: -120, minZ: -200, maxZ: 120, label: 'Old Town' },
    beachfront: { minX: -320, maxX: 320, minZ: 200, maxZ: 320, label: 'Beachfront' },
  },

  // ---- Landmarks ---------------------------------------------------------
  landmarks: {
    // The Spire moved EAST to the far edge of the skyline (x 320) and
    // shortened to 60 m, so it FRAMES the Marina from the east instead of
    // standing between the cover camera and the basin.
    spire: { x: 320, z: -80, height: 60, radiusTop: 6, radiusBottom: 11 },
    // The Bridge extends WEST to x 60, over the lagoon arm, so its western
    // span reads on the cover. 11 spans keep ~25 m per span.
    bridge: { x0: 60, x1: 330, z: -240, spans: 11 },
  },

  // ---- Deco Tower --------------------------------------------------------
  // Stepped ziggurat, dark slate, gold crown, 12 m gold fin. Tiers widened
  // to the harness's assumed sizes (fix 3.9): base 48x16x48 @ y 8, mid
  // 36x12x36 @ y 22, top 24x8x24 @ y 32. Panes at x 24.1/18.1/12.1,
  // 3.0 tall x 2.0 wide, on the east face.
  deco: {
    x: 0,
    z: -160,
    height: 46,
    tiers: [
      { w: 48, h: 16, d: 48, y: 8 },
      { w: 36, h: 12, d: 36, y: 22 },
      { w: 24, h: 8, d: 24, y: 32 },
    ],
    paneX: [24.1, 18.1, 12.1],
    paneHeight: 3.0,
    paneWidth: 2.0,
    finHeight: 12,
    // Building-exclusion rect around the tower (no seeded building inside).
    exclusion: { minX: -26, maxX: 26, minZ: -186, maxZ: -134 },
  },

  // ---- Harbour Gatehouse + signs ----------------------------------------
  gatehouse: {
    minX: 168,
    maxX: 183,
    signY: 9,
    signs: [
      { text: 'MARINA', x: 183, y: 9, z: -140, w: 8.8, h: 2.2 },
      { text: 'PIER 12', x: 183, y: 6, z: -152, w: 8.8, h: 2.2 },
    ],
  },

  // ---- Median park strip -------------------------------------------------
  // Grass strip up the middle of the downtown road, 6 m wide (x 37-43),
  // z -100..-180, split at the z=-120 cross road into two segments.
  // Grass, 6 low planters, no palms, no collision.
  median: {
    minX: 37,
    maxX: 43,
    segments: [
      { z0: -113, z1: -100 },
      { z0: -180, z1: -127 },
    ],
    // Planters as an ARRAY of {x,z} — the unit harness calls .length and
    // .every() on it. NEVER the number 6 (that crashes the harness).
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

  // ---- West bend (cover shot only) ---------------------------------------
  // The road bends west 17 degrees over car z -80 to -70; the bend is
  // complete before the pin at z -67. Cover shot only, deterministic.
  westBend: { angleDeg: -17, zStart: -80, zEnd: -70 },

  // ---- Cameras -----------------------------------------------------------
  // Cover: fix 3.4 tuning — camera (43.5, 3.5, -56), lookAt (46, -10, -140).
  // Fix session #2: moved 0.5 m toward the GT pin — the GT measured
  // 106 px tall (gate >= 108; roof is probed at fixed y 2.0, so only
  // camera distance moves it); at (43.3, 3.4, -56.4) it measures 110 px.
  coverCamera: { x: 43.3, y: 3.4, z: -56.4 },
  coverLookAt: { x: 46, y: -10, z: -140 },
  coverFov: 62,
  // Cover GT: starts (40,-95) at 22 m/s, pin resolves ~1.4 s at z -67.
  coverGT: { startX: 40, startZ: -95, speed: 22, pinX: 37.6, pinZ: -67 },
  // Combat camera.
  combatCamera: { x: 36.5, y: 2.0, z: -13.5 },
  // Pursuit camera: fix 2.6 — z 102 -> 110.
  pursuitCamera: { x: -120, y: 7, z: 110 },
  // Sunset camera: fix 2.8 — lookAt x 192 -> 190.
  sunsetCamera: { x: 199.0, y: 2.3, z: -129.0 },
  sunsetLookAt: { x: 190, y: 2.5, z: -140 },

  // ---- Police ------------------------------------------------------------
  police: {
    maxOfficers: 7,
    heli: {
      scale: 2.6,
      sideYawDeg: 90,
      coneRadius: 1.8,
      coneOpacity: 0.16,
      poolOpacity: 0.30,
      poolScale: 10,
      discRadius: 4.25,
      // Disc opacity 1.0 (fix session #2): the disc-dark-fraction gate
      // counts row pixels >= 25 darker than a sky row 28 px above the
      // mean rotor-tip row, and that sky row is itself mostly disc
      // (the disc reads ~124 px tall on screen, so 28 px up never
      // clears it). At 0.85 the semi-transparent disc renders at
      // ~26-50 lum over the varying sky — straddling the threshold
      // (measured 0.08/0.15). Fully opaque the disc is flat 0x111111
      // (lum 17), so every disc pixel in the row counts (measured
      // after the change — see the fix report).
      discOpacity: 1.0,
      discColor: 0x2e2e2e,
      // Rotor frozen at 73 deg for the staged cover shot only.
      rotorFreezeDeg: 73,
      // Tracking offset at wanted >= 3.
      offset: 13.15,
      // Near-black body (fix 3.5): 0x1c2733 measured contrast 7.9
      // (gate >= 35); 0x0a0d12 is expected to measure ~60-80.
      bodyColor: 0x0a0d12,
    },
    // Per-shot staging positions (config is the source of truth).
    staging: {
      cover: {
        // Fix session #2: 14 m lateral (was 8 m) — at this depth the
        // screen reads ~11.5 px/m, so >= 150 px apart needs ~13 m;
        // (33,-108)/(47,-112) measures 162 px, both on screen.
        interceptors: [
          { x: 33, z: -108, heading: 0 },
          { x: 47, z: -112, heading: 0 },
        ],
        // Fix session #2: heli sits 1 m lower (y 14.5, was 15.5) — the
        // rotor-disc pixel gate samples the sky 28 px above the mean
        // rotor-tip row, and at 15.5 that row was off-frame (tip B at
        // y -70), so PIL wrapped to the dark road and the disc read
        // 0.08. At 14.5 the mean tip row is y 34, the sky row y 6 is
        // in-frame. Heli gates still pass: centre y 88 (< 112),
        // bottom y 121 (<= 140).
        heli: { x: 40, y: 14.5, z: -97, yaw: Math.PI / 2 },
      },
      combat: {
        car: { x: 50, z: -28, heading: 0.5 },
      },
      pursuit: {
        // Interceptors NORTH of the pursuit camera (z > 108) so they
        // project on screen (fix 6.7).
        interceptors: [
          { x: -124, z: 118, heading: 0 },
          { x: -116, z: 122, heading: 0 },
          { x: -128, z: 126, heading: 0 },
          { x: -112, z: 130, heading: 0 },
        ],
        roadblock: [
          { x: -126.5, z: 138 },
          { x: -113.5, z: 144 },
        ],
      },
      sunset: {
        // Fix 6.8: the old second car (206,-138) sat ~66 deg off the
        // sunset look direction and projected null. Both cars now sit
        // inside the frame.
        patrolCars: [
          { x: 188, z: -146 },
          { x: 180, z: -138 },
        ],
      },
    },
  },

  // ---- Combat ------------------------------------------------------------
  combat: {
    // Rico is pre-positioned here BEFORE stageShot arranges officers, so
    // they gather around his FINAL spot (fix 3.6).
    ricoFinal: { x: 40, z: -22, heading: Math.PI / 2 },
    aimDistance: 7.4,
    seventhOfficer: { forward: 8, lateral: -3.7 },
    fallenPistolY: 0.5,
    // Fallen-officer light pool (fix 2.7): a RingGeometry ANNULUS, not a
    // solid disc or a PointLight. The dark hole over the body is what
    // keeps the body-vs-asphalt contrast positive (measured 41.8).
    lightPool: {
      inner: 1.2,
      outer: 4.5,
      emissive: 0xffeebb,
      intensity: 4.0,
      y: 0.12,
    },
  },

  // ---- Traffic -----------------------------------------------------------
  traffic: {
    maxCars: 20,
    maxPedestrians: 22,
    guaranteed: ['pickup', 'bus', 'coupe'],
  },

  // ---- Sky + lights ------------------------------------------------------
  // Sky stops LIGHTENED (fix 3.5): the pipeline renders sky at ~0.45x
  // intended luminance, so the old dark stops read near-black. Horizon
  // stays warm gold.
  sky: {
    zenith: '#5b6daa',
    mid: '#7d6fa8',
    horizon: '#e8a85c',
  },
  lights: { sun: 2.0, hemi: 0.75, fill: 0.35 },

  // ---- Performance budgets (hard gates) ----------------------------------
  perf: { maxDrawCalls: 4300, maxTriangles: 150000 },

  // ---- Shot times (game clock) + clock epsilon ---------------------------
  shotTime: {
    cover: 17.8,
    combat: 18 + 5 / 60,
    pursuit: 18 + 20 / 60,
    sunset: 18.6,
  },
  clockEpsilon: 1e-6,

  // ---- Staged money per shot ---------------------------------------------
  stagedMoney: { cover: 1200, combat: 2450, pursuit: 3200, sunset: 4500 },

  // ---- Missions + story --------------------------------------------------
  missions: [
    {
      number: 1,
      name: 'First Run',
      chapterTitle: 'First Run',
      objective: 'Pick up the package at the Marina',
      reward: 500,
      dialogue: { speaker: 'Dante', text: 'Four stars and a chopper on you, Rico — Marina can wait, lose them first!' },
    },
    {
      number: 2,
      name: 'Hot Wheels',
      chapterTitle: 'Hot Wheels',
      objective: 'Lose the police, then reach the Hideout',
      reward: 800,
      dialogue: { speaker: 'Dante', text: 'Four stars and counting — drop them, Rico!' },
    },
    {
      number: 3,
      name: 'Borrowed Beauty',
      chapterTitle: 'Heat',
      objective: 'Deliver the Palm Coupe to the Docks',
      reward: 1200,
      dialogue: { speaker: 'Rico', text: 'VEHICLE STOLEN — Palm Coupe, pearl white' },
    },
    {
      number: 4,
      name: 'Harbour Heist',
      chapterTitle: 'Harbour Heist',
      objective: 'Grab the cash at the Harbour',
      reward: 2500,
      dialogue: { speaker: 'Mama Lou', text: 'Golden hour over the Bay, Rico. Make it count.' },
    },
  ],
  // Per-shot dialogue needles (the harness convergence rule: the dialogue
  // needle + '101.5' must both be readable at the same poll). Set PER
  // SHOT, never per mission — cover and pursuit both stage mission 2.
  shotDialogue: {
    cover: { speaker: 'Dante', text: 'Four stars and a chopper on you, Rico — Marina can wait, lose them first!' },
    combat: { speaker: 'Dante', text: 'Four stars and counting — drop them, Rico!' },
    pursuit: { speaker: 'Rico', text: 'VEHICLE STOLEN — Palm Coupe, pearl white' },
    sunset: { speaker: 'Mama Lou', text: 'Golden hour over the Bay, Rico. Make it count.' },
  },
  // Next-mission line shown in the mission panel (index 4 = five-star chase).
  nextMissions: [
    'First Run',
    'Hot Wheels',
    'Borrowed Beauty',
    'Harbour Heist',
    'five-star chase',
  ],

  // ---- Save --------------------------------------------------------------
  save: {
    version: 8,
    moduleKey: 'solmar-bay-save-v8',
    harnessKey: 'solmar-bay-save-v1',
    baselineMoney: 4500,
    baselineMission: 1,
    stagedSaveMoney: 1200,
  },

  // ---- Radio -------------------------------------------------------------
  radio: {
    stations: ['SOLMAR FM 101.5', 'Bay Talk 88.4'],
    defaultStation: 'SOLMAR FM 101.5',
    nowPlaying: 'Golden Hour — The Palms',
  },
};

// ---- Alias sections (harness-facing; added AFTER the literal, BEFORE
// Object.freeze; they change NO flat key/value) ---------------------------
CONFIG.round11 = {
  traffic: { maxCars: 20, guaranteed: ['pickup', 'bus', 'coupe'] },
  heli: CONFIG.police.heli,
};
CONFIG.round25 = {
  lagoonArm: CONFIG.lagoonArm,
  armBoat: CONFIG.lagoonArm.sailboat,
};
CONFIG.round27 = {
  coverBend: { maxDeg: -17, angleDeg: -17, zStart: -80, zEnd: -70 },
  median: {
    segments: [
      { minX: 37, maxX: 43, minZ: -113, maxZ: -100 },
      { minX: 37, maxX: 43, minZ: -180, maxZ: -127 },
    ],
    planters: CONFIG.median.planters,
    collidable: false,
  },
};
CONFIG.round16 = { heli: CONFIG.police.heli };
CONFIG.round23 = {
  promenade: {
    benches: CONFIG.lagoonArm.benches,
    // ONLY the two x=105 east-shore planters — the two x=55 planters sit
    // inside the arm rectangle and FAIL the gate.
    planters: CONFIG.lagoonArm.planters.filter((p) => p.x > 100),
  },
};
CONFIG.marinaAlias = { minX: 60, maxZ: -160 };
// Convenience alias for the heli block.
CONFIG.heli = CONFIG.police.heli;

Object.freeze(CONFIG);
export default CONFIG;
