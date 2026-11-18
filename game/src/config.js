// Solmar Bay — central tuning constants (Lane A).
// Single source of truth for sizes, colours, speeds, camera and wanted rules.
// All values are plain data; no code in this file reads input or the network.

export const CONFIG = {
  // ---- City layout ----
  cityName: 'Solmar Bay',
  citySize: 640, // playable square, metres, centred on (0, 0); x and z in [-320, 320]
  halfCity: 320,
  blockSize: 80, // distance between road centrelines
  roadWidth: 14,
  sidewalkWidth: 3,
  // Road centrelines run at these coordinates (grid).
  roadLines: [-280, -200, -120, -40, 40, 120, 200, 280],
  // South strip (z > 280) is beach + sea; north-east corner is the marina basin.
  beachStartZ: 272,
  seaStartZ: 300,
  marina: { minX: 160, maxX: 320, minZ: -320, maxZ: -160 },

  // ---- Districts (name -> rectangle, x/z bounds) ----
  districts: {
    marina: { minX: 160, maxX: 320, minZ: -320, maxZ: -120, label: 'Marina' },
    downtown: { minX: -120, maxX: 160, minZ: -200, maxZ: 40, label: 'Downtown' },
    oldTown: { minX: -320, maxX: -120, minZ: -200, maxZ: 120, label: 'Old Town' },
    beachfront: { minX: -320, maxX: 320, minZ: 200, maxZ: 320, label: 'Beachfront' },
    docks: { minX: -320, maxX: -120, minZ: 120, maxZ: 320, label: 'Docks' },
  },

  // ---- Colours (hex) ----
  colors: {
    sky: 0x7ec8e3,
    skyHorizon: 0xcfeef7,
    sun: 0xfff2c4,
    fog: 0xa8d8ea,
    ground: 0x8a9a6b,
    road: 0x3a3f46,
    roadLine: 0xf5d76e,
    sidewalk: 0xb8b0a0,
    sand: 0xe8d5a0,
    water: 0x1e7fa8,
    waterDeep: 0x146080,
    buildingPalette: [0xd8c9a8, 0xc9a06a, 0x9db8c4, 0xb98a7a, 0x8fa98f, 0xd0d0d0, 0xe8b45a, 0x7a9cc4],
    downtownGlass: 0x5a7a9a,
    windowLit: 0xffe9a8,
    windowDark: 0x2a3a4a,
    palmTrunk: 0x8a6a42,
    palmLeaf: 0x3f9e4d,
    lampPole: 0x2e3138,
    lampGlow: 0xffe9a0,
    bench: 0x7a5a34,
    hydrant: 0xc23a2a,
    curb: 0x8f8880,
    // Round-2 polish: sky gradient, sunset palette, awning colours.
    skyTop: 0x4a90d9,
    skyHorizon: 0xd8f0f8,
    sunsetTop: 0x5a3a6e,
    sunsetHorizon: 0xe8833a,
    sunsetFog: 0xe08a4a,
    awningPalette: [0xc23a2a, 0x2e86c1, 0x1e8449, 0xe67e22, 0x8e44ad],
    grassPatch: [0x7d8f60, 0x93a86e, 0x6b8256, 0xa8b878],
  },

  // ---- Lighting (round-2 polish) ----
  // The sun sits lower than round 1 so shadows are long and visible, and
  // the shadow frustum is tight because main.js re-centres the light on
  // the camera focus every frame (a city-wide frustum made shadows faint).
  lighting: {
    sunIntensity: 2.9,
    hemiIntensity: 0.85,
    sunOffset: [110, 95, 60], // light position relative to the shadow focus
    shadowFrustum: 120, // half-extent (metres) of the shadow camera box
  },

  // ---- Round-3 polish: traffic lights, billboards, neon, beach, boats ----
  // Traffic lights cycle green -> amber -> red on a fixed game-time loop;
  // traffic.js reads world.trafficLights and stops cars at red.
  trafficLights: {
    greenSeconds: 8,
    amberSeconds: 2,
    redSeconds: 8,
    stopDistance: 14, // metres ahead of the light where a car must stop
  },
  // Rooftop billboard copy (weighted: the city name shows most often).
  billboards: [
    { text: 'SOLMAR BAY', weight: 4 },
    { text: "MAMA LOU'S", weight: 2 },
    { text: 'PALMS HOTEL', weight: 2 },
    { text: 'HARBOUR', weight: 1 },
    { text: 'DANTE AUTO', weight: 1 },
  ],
  neonPalette: [0xff2a6d, 0x05d9e8, 0xffd319, 0x39ff6a, 0xb537f2],
  beachUmbrellaPalette: [0xe74c3c, 0xf39c12, 0x2ecc71, 0x3498db, 0xe67e22],
  boatPalette: [0xe8e8e8, 0x2e86c1, 0xc0392b, 0xf39c12],
  // Drifting clouds: slow eastward drift, wrapping at the sky-dome edge.
  clouds: {
    driftSpeed: 1.6, // metres per game-second
    wrapAt: 520, // x beyond which a cloud re-enters from the west
  },
  // Driving feel (round 3): camera FOV kicks up at speed, brake lights
  // flare, and a hard handbrake turn at speed counts as a skid (screech).
  drivingFeel: {
    fovBase: 62,
    fovKick: 8, // extra degrees at top speed
    skidSpeed: 18, // m/s above which a handbrake turn skids
    screechCooldown: 0.9, // seconds between skid sounds
  },
  // Mission par times (seconds): finish under par for a $100 bonus.
  missionPar: { 1: 150, 2: 180, 3: 210, 4: 240, 5: 300 },
  parBonus: 100,

  // ---- Player movement (metres / second) ----
  player: {
    walkSpeed: 4.2,
    runSpeed: 8.0,
    accel: 28,
    jumpSpeed: 7.5,
    gravity: 20,
    radius: 0.45,
    height: 1.8,
    maxHealth: 100,
    enterCarDistance: 3.2,
  },

  // ---- Driving ----
  vehicle: {
    accel: 16,
    brake: 30,
    reverseAccel: 9,
    maxSpeed: 38, // ~137 km/h, sports car raises this via its own multiplier
    maxReverseSpeed: 10,
    drag: 0.55,
    rollingDrag: 1.6,
    steerAngle: 0.55, // radians at standstill
    steerSpeedScale: 0.35, // steering authority retained at top speed
    handbrakeGripLoss: 0.55,
    radius: 1.4,
  },
  // Per-model top-speed multiplier and acceleration multiplier.
  vehicleModels: {
    coupe: { topSpeed: 1.0, accel: 1.0 },
    sedan: { topSpeed: 0.9, accel: 0.9 },
    pickup: { topSpeed: 0.85, accel: 0.85 },
    van: { topSpeed: 0.75, accel: 0.75 },
    sports: { topSpeed: 1.25, accel: 1.25 },
  },

  // ---- Camera ----
  // Round-2 polish: the on-foot camera sits a little higher and farther
  // than round 1, so Rico no longer blocks the centre of the screen.
  camera: {
    fov: 62,
    near: 0.1,
    far: 1400,
    onFootDistance: 8.5,
    onFootHeight: 4.0,
    drivingDistance: 10.5,
    drivingHeight: 4.2,
    lookAhead: 4,
  },

  // ---- Wanted levels ----
  wanted: {
    maxStars: 5,
    // Seconds a star level takes to decay when the player is unseen / calm.
    decaySecondsPerStar: 45,
    // Heat added by events (Lane B consumes these).
    heat: { minorCrime: 0.4, assault: 1.0, kill: 1.6, policeKill: 2.0 },
    // Police spawn radius per star level (metres).
    policeSpawnRadius: [0, 60, 55, 50, 45, 40],
    // How many police cars may chase at each star level (index = stars).
    maxPoliceCars: [0, 1, 2, 3, 4, 6],
  },

  // ---- World generation ----
  world: {
    seed: 1337,
    buildingsPerBlockMin: 1,
    buildingsPerBlockMax: 3,
    downtownMinHeight: 28,
    downtownMaxHeight: 68,
    normalMinHeight: 8,
    normalMaxHeight: 26,
    palmCount: 90,
    lampSpacing: 40,
    cloudCount: 14,
  },
};

export default CONFIG;
