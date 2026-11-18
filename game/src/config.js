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
  // Round-5 (Lane A): the default palette is now a dramatic sunset, not
  // a pale blue day — the sky, fog, sun and hemi light are all warm.
  colors: {
    sky: 0xff8a3c,
    skyHorizon: 0xffc46b,
    sun: 0xffb36b,
    fog: 0xd96a35,
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
    // Round-5: the default sky IS the sunset (deep violet zenith, gold
    // horizon); stageEnd reuses the same deep palette.
    skyTop: 0x2e1a4e,
    skyHorizon: 0xffc46b,
    sunsetTop: 0x2e1a4e,
    sunsetHorizon: 0xff7a2a,
    sunsetFog: 0xd96a35,
    awningPalette: [0xc23a2a, 0x2e86c1, 0x1e8449, 0xe67e22, 0x8e44ad],
    grassPatch: [0x7d8f60, 0x93a86e, 0x6b8256, 0xa8b878],
  },

  // ---- Lighting (round-2 polish, round-5 sunset defaults) ----
  // Round-5: the sun sits low (~14° elevation) so shadows are long and
  // warm; the shadow frustum is tight because main.js re-centres the
  // light on the camera focus every frame (a city-wide frustum made
  // shadows faint). Values mirror CONFIG.round5.lighting.
  lighting: {
    sunIntensity: 3.1,
    hemiIntensity: 0.7,
    sunOffset: [165, 50, 85], // light position relative to the shadow focus
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

  // ---- Round-4 polish (Lane W): richer city, living water & sky ----
  round4: {
    // Rooftop clutter: AC units on most roofs, water towers / antennas
    // on any roof above tallMinHeight (not just the tallest tower).
    rooftop: {
      acChance: 0.75,
      acMax: 2,
      bulkheadChance: 0.3, // stair bulkhead on low roofs
      tallMinHeight: 18,
      towerChance: 0.4,
      antennaChance: 0.5,
    },
    // Facade base colours per district (labels match CONFIG.districts).
    districtFacades: {
      Downtown: [0x7a8a99, 0x6f7f8c, 0x5a7a9a, 0x8a9aa8, 0x9aa3ab],
      'Old Town': [0xb0a08a, 0x8a6f5a, 0xc9a06a, 0xa89478, 0xb98a7a],
      Beachfront: [0xe8d5a0, 0x9db8c4, 0xd8c9a8, 0x8fa98f, 0xf0e0c0],
      Marina: [0xd0d0d0, 0x9db8c4, 0xe8e8e8, 0x7a9cc4, 0xb8c8d8],
      Docks: [0x8a6f5a, 0x6f5a4a, 0x9a7a5a, 0x7a6a58, 0xa08a6a],
    },
    // Ground-floor shopfronts on low-rise buildings.
    shopfront: { awningChance: 0.55, glassChance: 0.3, neonChance: 0.55 },
    // Street furniture counts.
    streetProps: { busStopCount: 4, trashBinCount: 24, planterCount: 20 },
    // Beach + docks dressing.
    beach: { lifeguardX: -80, lifeguardZ: 288 },
    docks: {
      containerPalette: [0xc23a2a, 0x2e86c1, 0x1e8449, 0xe67e22, 0x8e44ad, 0x7f8c8d],
      craneCount: 2,
    },
    // Water & sky life (updateWater / updateBuoys / updateBirds read these).
    water: {
      foamOpacityMin: 0.22,
      foamOpacityMax: 0.5,
      foamPulseSpeed: 0.9, // radians per second
      waterOpacityBase: 0.88,
      waterOpacityAmp: 0.03,
      buoySeaCount: 8,
      buoyMarinaCount: 4,
      buoyBobAmp: 0.22, // metres
      buoyBobSpeed: 1.1,
      mooredBobAmp: 0.09,
      mooredRockAmp: 0.035, // radians
      cruiseBoatCount: 2,
    },
    birds: { flocks: 3, perFlock: 4 },
    // Traffic life (traffic.js): zebra-crossing probability per second
    // near a crossing, and the per-car cruise-speed breathing amplitude.
    traffic: {
      pedCrossChance: 0.15,
      speedWobble: 0.08,
      parkedPalette: ['#c0392b', '#2e86c1', '#f1c40f', '#ecf0f1', '#8e44ad', '#16a085',
        '#e67e22', '#1abc9c', '#d35400', '#7f8c8d', '#2c3e50', '#f5f5f5'],
    },
    // Car looks (vehicle.js): headlight / taillight glow sprite tuning.
    vehicle: {
      headlightGlowScale: 1.5,
      headlightGlowOpacity: 0.75,
      tailGlowScale: 1.3,
      tailGlowIdle: 0.45,
      tailGlowBrake: 0.95,
    },
  },

  // ---- Round-4b: ambitious visual pass (coordinator) ----
  // Geometry-level building variation + ground/sidewalk texture + sun.
  // These close the audit's remaining visual gap (flat boxes, flat green).
  round4b: {
    // Stepped towers: tall downtown buildings get a narrower upper tier.
    // Round-5: chance raised 0.65 -> 0.75 so more towers read in profile.
    setbacks: { minHeight: 40, chance: 0.75, widthFracMin: 0.55, widthFracMax: 0.68, heightFracMin: 0.3, heightFracMax: 0.45 },
    // Balconies on mid-rise residential facades (south face, a few floors).
    balconies: { minHeight: 14, maxHeight: 30, chance: 0.5, perBuildingMin: 2, perBuildingMax: 4 },
    // Pitched (pyramid) roofs on low buildings instead of a flat cap.
    pitchedRoof: { maxHeight: 14, chance: 0.5, heightFracMin: 0.18, heightFracMax: 0.3 },
    // Parapet rim around the roof edge on mid/high buildings.
    // Round-5: chance raised 0.4 -> 0.55 so more roofs read in profile.
    parapet: { minHeight: 14, chance: 0.55, height: 0.5, thickness: 0.25 },
    // Ground + sidewalk procedural texture tiling.
    groundTex: { repeat: 9, patchCount: 90 },
    sidewalkTex: { repeat: 24 },
    // Sunset sun glow sprite (toward the sun light direction).
    sun: { glowScale: 300, glowColor: 0xff9a3c, discScale: 90, x: 520, y: 110, z: 280 },
  },

  // ---- Round-5 polish (Lane A): dramatic sunset sky + recessed windows ----
  // world.js / render.js read this block; the plain CONFIG.lighting and
  // CONFIG.colors defaults above mirror it so main.js (which reads those
  // directly) picks the sunset up with no change.
  round5: {
    exposure: 1.12, // render.js tone-mapping exposure (was 1.05)
    // Multi-stop sunset gradient (zenith -> horizon). paintSky(top,
    // horizon) uses these mids unless the caller passes its own.
    sky: {
      mids: [
        { stop: 0.30, hex: 0x7a2d6e }, // magenta
        { stop: 0.52, hex: 0xc13a5e }, // rose
        { stop: 0.72, hex: 0xff7a2a }, // deep orange band
        { stop: 0.88, hex: 0xffc46b }, // bright gold right at the horizon
      ],
    },
    // Sun sprites: low, big and warm, aligned with the low sun light.
    sun: {
      x: 730, y: 215, z: 375,
      glowScale: 430, glowColor: 0xff8a2a,
      discScale: 150, discColor: 0xfff0b0,
      haloScale: 700, haloOpacity: 0.35,
    },
    lighting: {
      sunOffset: [165, 50, 85], // ~14° elevation, long warm shadows
      sunColor: 0xffb36b,
      sunIntensity: 3.1,
      hemiSky: 0xffb080,
      hemiGround: 0x7a5a40,
      hemiIntensity: 0.7,
      fog: 0xd96a35, fogNear: 260, fogFar: 900,
      background: 0xff8a3c, // warm horizon orange
    },
    // Clouds: warm tints (pink / orange / cream) with a slight warm
    // emissive so shadowed sides never go grey.
    clouds: {
      tints: [0xffc0a0, 0xffd9b0, 0xffe8c8],
      emissiveIntensity: 0.3,
    },
    // Real recessed geometry windows (InstancedMesh, see world.js).
    geometryWindows: {
      buildingChance: 0.15, // low-rise / non-downtown buildings
      downtownChance: 0.35, // downtown or height >= tallPreferHeight
      tallPreferHeight: 20,
      minFaceWidth: 18, // faces narrower than this get no geometry windows
      colSpacing: 6, // metres between window columns
      floorSpacing: 3.2, // metres between window floors
      groundFloorHeight: 3.2, // shopfront zone — no geometry windows
      windowW: 1.7,
      windowH: 2.0,
      frameProtrude: 0.14, // frame outer face stands this far off the wall
      glassOffset: 0.03, // glass pane centre stands this far off the wall
      // Per-floor lit ratios (one picked per floor, so floors cluster
      // mostly-lit or mostly-dark); mean ~0.31 lit overall.
      floorLitRatios: [0.05, 0.2, 0.4, 0.6],
      awningChance: 0.3, // upper floors only (floor index >= 2)
    },
  },

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
    // Round-4 models: the taxi drives like a sedan; the bus is slow.
    taxi: { topSpeed: 1.0, accel: 1.0 },
    bus: { topSpeed: 0.6, accel: 0.55 },
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
