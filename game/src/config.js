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
    // Round-6: zenith warmed violet -> warm plum (less magenta).
    // Round-7 (Lane A): zenith warmed again plum -> burnt sienna.
    skyTop: 0x4a2a20,
    skyHorizon: 0xffc46b,
    sunsetTop: 0x4a2a20,
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
    // Round-6: mids warmed — magenta/rose replaced by warm mauve /
    // burnt orange so the sky reads golden sunset, not pink.
    // Round-7: the 0.30 stop goes warmer still (mauve -> sienna) —
    // paintSky() reads THESE mids (R5.sky.mids), not round6.sky.mids,
    // so this is the value that actually renders.
    // Round-9 (Lane B): the stops are REMAPPED onto the visible sky.
    // On the sky sphere, stop s renders at elevation (0.5 - s) * 180
    // degrees — so stops above 0.5 are BELOW the horizon and never
    // seen. The old 0.52 / 0.72 / 0.88 stops buried the burnt-orange
    // and gold bands underground, and the eye-level driving view saw
    // only a flat burnt-orange slice. Now the whole sunset — sienna
    // -> burnt orange -> deep orange -> bright gold — sits between
    // the zenith (0) and the horizon (0.5), so a street-level frame
    // already shows the gradient.
    // Round-10 (Lane B): the gradient is STRENGTHENED — same stops
    // (still all in the visible 0..0.5 range), same zenith 0x4a2a20
    // and horizon 0xffc46b anchors, but the mids are much deeper and
    // more saturated so the eye-level band reads as a STRIKING
    // sunset, not a subtle orange wash. Measured fact that drove the
    // values: an eye-level frame's sky band spans only ~6-14 deg
    // elevation (stops ~0.42-0.47 — the chase cam pitches down), so
    // the contrast that matters lives in the 0.40 -> 0.47 segment,
    // and ACES tone mapping compresses the R channel (screen R sits
    // ~207-220 whatever the stop), so the separation is bought with
    // G/B: 0.40 goes from (255,112,28) to (199,51,21) while 0.47
    // stays bright gold (255,196,107) — canvas G-gap 84 -> 145.
    // 0.18 deep rust (was warm sienna 0x9a4a2e), 0.30 deep
    // red-orange (was 0xd84a2e). NOTE: this deliberately moves the
    // hexes the round-9 harness pinned (mids[0] 0x9a4a2e / wantMids
    // list) — the round-10 harness gates must be updated to these
    // values. Luminance still rises monotonically toward the
    // horizon, so the sky stays a sunset, not a rainbow.
    sky: {
      mids: [
        { stop: 0.18, hex: 0x7e2c1a }, // deep rust (round 10, was warm sienna 0x9a4a2e)
        { stop: 0.30, hex: 0xa8230f }, // deep red-orange (round 10, was burnt orange 0xd84a2e)
        { stop: 0.40, hex: 0xc73315 }, // strong red-orange (round 10, was deep orange 0xff7a2a)
        { stop: 0.47, hex: 0xffc46b }, // bright gold just above the horizon (unchanged)
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

  // ---- Round-6 polish (Lane L): warmer sky + skyline landmarks ----
  // Warmer sunset (warm plum zenith, mauve/burnt-orange mids, gold
  // horizon), a lower sun on the horizon, and two signature landmarks
  // (Solmar Spire downtown, Marina Bridge over the basin) so the
  // skyline is not uniform boxes. world.js reads this block; the plain
  // CONFIG.colors / CONFIG.round5 values above mirror it.
  round6: {
    sky: {
      top: 0x4a2a20, // burnt sienna zenith (round 7: was warm plum 0x40203a)
      // Round-9: mirror of the round-5 mids, remapped onto the visible
      // sky (see the round-5 note) — same stops, same hexes.
      // Round-10 (Lane B): mirror of the strengthened round-5 mids —
      // keep in sync with round5.sky.mids (paintSky reads round-5).
      mids: [
        { stop: 0.18, hex: 0x7e2c1a }, // deep rust (round 10, was warm sienna 0x9a4a2e)
        { stop: 0.30, hex: 0xa8230f }, // deep red-orange (round 10, was burnt orange 0xd84a2e)
        { stop: 0.40, hex: 0xc73315 }, // strong red-orange (round 10, was deep orange 0xff7a2a)
        { stop: 0.47, hex: 0xffc46b }, // bright gold just above the horizon (unchanged)
      ],
      horizon: 0xffc46b,
    },
    // Sun sprites: lower on the horizon (y 130, was 215) and bigger,
    // so the disc sits visibly low in the main view.
    sun: {
      x: 730, y: 130, z: 375,
      glowScale: 480, discScale: 170, haloScale: 700,
    },
    landmarks: {
      spire: { x: 80, z: -80, height: 95, radiusTop: 7, radiusBottom: 13 },
      bridge: { x0: 150, x1: 330, z: -240, spans: 7 },
    },
  },

  // ---- Round-7 polish (Lane B): second skyline variation ----
  // A stepped pyramid tower (Solmar Pyramid) on the empty block centred
  // (-80, 80), south-west of the Spire, so the skyline has a third
  // signature silhouette beyond the Spire and the Bridge. world.js reads
  // this block; the round6 block above is untouched.
  round7: {
    landmarks: {
      pyramid: { x: -80, z: 80, height: 64, tiers: 4 },
    },
    // The burnt-sienna zenith is darker than the plum, so the exposure
    // lifts slightly (1.28, was 1.25) to keep the sky luminous.
    exposure: 1.28,
  },

  // ---- Round-8 polish (Lane B): skyline diversity ----
  // A second building archetype (stepped / ziggurat tower) on downtown
  // blocks, plus varied rooflines on ordinary box towers, so the
  // skyline stops reading as flat-roofed boxes + 3 landmarks.
  // world.js reads this block; round4b / round7 are untouched.
  round8: {
    steppedTower: {
      chance: 0.5, // weighted pick vs a plain box tower, downtown only
      minHeight: 34, // only tall downtown towers step up
      tierFracs: [0.55, 0.28, 0.17], // base / middle / top tier heights
      tierShrinkMin: 0.68, // middle tier width as a fraction of the base
      tierShrinkMax: 0.78,
      topShrinkMin: 0.62, // top tier width as a fraction of the middle
      topShrinkMax: 0.72,
      crownHeight: 1.6, // lantern crown box on the top tier
      // Round-8 re-touch: crown beacon — one small warm lamp on top of
      // the lantern crown per stepped tower, so the ziggurats read at
      // dusk. world.js reads these; the sizes are never hardcoded there.
      beacon: { height: 0.7, size: 0.55 },
    },
    roofline: {
      pitchedChance: 0.75, // raised from round4b 0.5 — more pyramid roofs
      pitchedMaxHeight: 18, // raised from round4b 14: the low-building
      // population is small in this seed's draw, so 14 capped pitched
      // roofs at ~5; 18 lets more low roofs read as pyramids
      crownChance: 0.32, // rooftop crown box + lantern, tall towers
      crownMinHeight: 20,
      crownHeight: 1.8, // crown box height on ordinary towers
      mansardChance: 0.3, // flat-topped mansard frustum, mid-rise
      mansardMinHeight: 14,
      mansardMaxHeight: 30,
      steppedParapetChance: 0.35, // share of parapets built stepped
      parapetHeightMin: 0.5, // parapet height now varies per building
      parapetHeightMax: 1.4,
    },
    steppedQuarterRadius: 45, // metres from a stepped tower: "Stepped Quarter"
  },

  // ---- Round-9 polish (Lane B): luminous Spire glass + visible sky ----
  // world.js reads this block; round5 / round6 / round7 / round8 are
  // untouched except for the sky-mid remap noted above. All values are
  // tuning, never hardcoded in world.js.
  round9: {
    // Sky dome: the gradient canvas is widened (4 -> 64 px) and its
    // mipmaps are off — a 4 px-wide texture around a 5.6 km dome
    // forced a coarse mip level that averaged the gradient flat.
    skyCanvas: { width: 64, height: 512 },
    // Solmar Spire, luminous glass (see world.js): a bright inner core
    // shining through a semi-transparent glass shell, vertical light
    // bands wrapping the tower, and two additive halo shells.
    spire: {
      shellOpacity: 0.72, // glass shell over the bright core (was opaque)
      coreRadiusFrac: 0.62, // inner core radius as a fraction of the tower
      coreTop: 0xfff6c8, coreMid: 0xffa83c, coreBase: 0xe87a24, // core gradient
      shellBase: 0xe07828, // shell gradient base, lifted (was 0x8a3a14)
      shellMid: 0xff8a2a, // shell gradient mid, lifted (was 0xc85a1e)
      glowOpacity: 0.22, // inner halo shell (was 0.10)
      haloOpacity: 0.08, // outer halo shell (new)
      haloRadiusPad: 2.6, // outer halo shell radius beyond the tower
      bandCount: 8, // vertical light bands around the circumference
      bandWidth: 10, // band width in texture px (canvas 256 wide)
      bandCoreWidth: 3, // bright core line inside each band, px
      ringHeight: 2.0, // lit window-band ring height, metres (was 1.6)
      // Round-10 (Lane A): distance falloff — the near-white core +
      // 0.72 shell + lit windows/bands + two additive halos sum past
      // 1.0 at 16 m and clip to a flat white-gold blob, while the 60 m
      // look-up is proven good. Below falloffNear (metres from the
      // tower axis) the tower dims toward the near* values; at and
      // beyond falloffFar every value is exactly the round-9 value,
      // so the 60 m look is unchanged. Shell opacity is NEVER touched
      // (stays 0.72); only material colour multipliers and halo
      // opacities move, so the round-9 probe still reads shell 0.72,
      // opaque core, 2 additive halos.
      falloffNear: 20, // metres from the tower axis: full near dimming
      falloffFar: 60, // metres from the tower axis: round-9 values
      nearCore: 0.52, // core material colour multiplier when close
      nearShell: 0.60, // shell material colour multiplier when close
      nearGlow: 0.04, // inner halo opacity when close (far: 0.22)
      nearHalo: 0.015, // outer halo opacity when close (far: 0.08)
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
