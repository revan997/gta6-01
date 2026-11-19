// Solmar Bay — central tuning constants (Lane A).
// Round-13B: no tuning change — the 13B fixes are staging/HUD only
// (heli scale, officer arc, camera positions in main.js; dialogue echo in hud.js).
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
    road: 0x5f6874, // round-13: blue-grey asphalt (was 0x3a3f46) — the dark
    // tarmac read as black under the low sun; this is the same hue the
    // road texture paints (CONFIG.round13.road.base mirrors it)
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
  missionPar: { 1: 150, 2: 180, 3: 210, 4: 240, 5: 300, 6: 270, 7: 300, 8: 360 },
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

  // ---- Round-11 polish (Lane B): fill light for shadow-side facades ----
  // The round-10 defect: sunlit faces blow warm, shadow-side facades
  // read near-black (run1-facades.png: wall luminance ~8-30, windows
  // the only readable thing). A/B proof (round11-shots/ab-*.png, same
  // camera, same session): the defect face is a SOUTH face in CAST
  // SHADOW — with shadows off it reads mean 66.6 (only 4.2% of pixels
  // <30), with round-10 lights it reads 33.4 (82.8% <30). The sun
  // DOES reach it; the shadow map kills it, and the only other light
  // was the hemisphere at 0.7. So the fix has three parts, all tuned
  // here: (1) SHADOW LEAK — the sun's shadow.intensity drops 1.0 ->
  // 0.55, so ~45% of the warm direct sun leaks into shadowed areas
  // (dusk bounce does this in reality; three.js shadows are otherwise
  // pitch black). Shadows stay plainly visible, just not black.
  // (2) a shadowless warm BOUNCE directional from the opposite azimuth
  // (WNW sky), so faces the sun never reaches at all (true north /
  // west faces, dot <= 0 to the sun AND to the leak) get a readable
  // warm wash; warm, not cool, so the sunset mood survives. (3) a
  // modest hemisphere lift (0.7 -> 1.25) with a slightly warmer /
  // lighter ground bounce, so shadowed ground and roofs lift a touch
  // too. Sun intensity, sky gradient and Spire glow are untouched.
  // render.js reads this block; main.js probes it.
  // Round-11 final (re-touch): focusWindowMs is 4000 — the harness screenshots the settled focus view inside this window (re-arm L, shoot immediately); any rAF wait plus capture latency outruns it and catches the blend-back.
  round11: {
    fill: {
      hemiIntensity: 1.25, // was 0.7 (CONFIG.lighting / round5) — shadow lift
      hemiSky: 0xffb080, // unchanged warm sunset sky bounce
      hemiGround: 0x8a6a4a, // warmer/lighter ground bounce (was 0x7a5a40)
      shadowIntensity: 0.55, // sun shadow darkness (three r166+); 1.0
      // was pitch-black shadows, 0 would erase them. 0.55 keeps the
      // long dusk shadows readable while letting warm sun leak in.
      bounceColor: 0xff9a62, // warm dusk bounce (rosy-orange, not cool blue)
      bounceIntensity: 0.65, // shadow-face lift; 0 would be round-10
      bounceOffset: [-165, 70, -85], // opposite azimuth to the sun
      // (sun sits at +165,+85), a touch higher so it grazes facades
      // instead of raking straight across them
    },

    // Round-11 (Lane C): richer traffic variety. The round-10 gap:
    // only 12–14 cars, and the featured pickup only appears because
    // round 10 forced it (1-in-15 draw per car, fixed seed 1337).
    // The same deterministic-slot pattern now guarantees a City Bus
    // and a Palm Coupe too, the fleet grows modestly, and the random
    // tail cycles through every model before repeating, so the variety
    // is visible on the road, not just in the model list.
    // traffic.js reads this block; the Lane B fill block above is untouched.
    traffic: {
      maxCars: 20, // total cars (6 parked + 14 moving; was 14). The
      // TrafficManager constructor reads this over the main.js
      // maxCars: 14, so the fleet size is tuned here, in one place.
      // Guaranteed fleet slots, in spawn order — the first N moving
      // cars are exactly these models, so a bad seed draw can never
      // lose them. Slot 0 is the round-10 red Dune Pickup (kept);
      // slots 1–2 are the round-11 additions: the long City Bus and
      // the low, sleek Palm Coupe. Later spawns draw from the deck.
      guaranteed: [
        { model: 'Dune Pickup', colour: '#a04000' },
        { model: 'City Bus', colour: '#2471a3' },
        { model: 'Palm Coupe', colour: '#8e44ad' },
      ],
      busCruise: { min: 7, max: 10 }, // the 9.5 m bus cruises slower
      // than the 6–16 m/s car band — a bus at sedan speed reads wrong.
      // Long vehicles spawn with this much straight road ahead of them
      // (world.js roadPointForLength), so a 9.5 m body never straddles
      // a road end the moment it appears.
      longVehicleMinStraight: 25,
      // Round-11 (retry): how close to the player a guaranteed car must
      // spawn (metres). traffic.js re-picks until the slot lands inside
      // this radius, so the bus / coupe / pickup can never spawn far
      // away and be despawned in the same frame. Was a hardcoded 150
      // in traffic.js; tuned here now, in one place, with maxCars.
      guaranteedNearRadius: 150,
    },

    // Round-11 (Lane A): camera occlusion handling. Round 10 proved
    // the defect: 3 of 4 approaches to the Spire are blocked by
    // buildings (north puts the camera INSIDE a building; only east is
    // clear), because the L-key look only swings the look target while
    // the chase camera stays behind the player. The focus camera now
    // repositions onto a clear viewpoint instead: main.js sweeps
    // azimuths around the landmark (and rises in steps if no
    // ground-level azimuth is clear) until both the camera position
    // and the segment camera -> landmark focus are outside every
    // building box (world.js round11BuildingAtPoint /
    // round11SegmentBlocked), and the ordinary chase camera pulls in
    // toward the player when a building sits between them. All values
    // are tuning, never hardcoded in main.js / world.js. This `camera`
    // key lives INSIDE the shared CONFIG.round11 object (Lane B fill +
    // Lane C traffic above) — a second top-level `round11:` key would
    // silently shadow theirs.
    camera: {
      pad: 1.5, // clearance (m) around a building box when testing a camera position
      insideClearance: 2, // metres above a roof the rescued chase camera sits (last-resort fallback)
      maxRise: 40, // metres the focus camera may rise above its base height
      riseStep: 8, // rise levels tried: 0, 8, 16, ... maxRise
      sweepStepDeg: 15, // azimuth steps tried either side of the current view
      sweepMaxDeg: 180, // how far around the landmark the sweep may go
      minFrameDistance: 45, // framing ring never comes closer than this (m)
      maxFrameDistance: 100, // ... nor farther than this
      frameFill: 0.9, // fraction of the vertical FOV the landmark should fill
      baseHeight: 5, // focus-camera height above ground at rise 0
      blendRate: 2.5, // per-second ease toward the solved view (wall clock, so headless SwiftShader still converges inside the 4 s focus window)
      maxRescuePasses: 24, // pull-in steps for the chase-camera rescue
      focusWindowMs: 4000, // round-11 final: how long one L look holds the solved view (ms, wall clock) — the single source of truth: main.js opens the window for this long and the HUD landmark label shows for the same span, so the label never outlives the view it names.
      lowLandmarkMaxFocusY: 20, // round-11 final: landmarks this short (the 8 m Marina Bridge) get a lifted focus camera (below) — at street height the camera sits under the deck and the bridge reads as a brown slab, not a span.
      lowLandmarkLift: 6, // ... metres the focus camera sits above a low landmark's focus height (bridge: y = 8 + 6 = 14), so the deck is seen from above at an angle instead of edge-on from below. Round-12 (Lane C): the pylon tops (~20 m) now give that lifted view a vertical silhouette to read — the lift stays 6.
      lookFrac: 0.45, // round-11 final: the look target is this fraction of the focus height, not the apex — aiming at the apex crops the base out of the frame (pyramid-north showed brown tiers floating in red sky with no base; the Spire's base was cropped too). 0.45 centres the landmark in the 62° FOV with margin both ways at the solved framing distance.
    },
  },

  // ---- Round-12 polish (Lane C): Marina Bridge reads as a span ----
  // Round-11 defect: from N/S/W the bridge was a thin dark deck line
  // over black water (1 m slab, 6 m wide, one bare rail bar, nothing
  // above the deck). world.js reads this block; the bridge geometry
  // (arch peak 8 m, x0 150 / x1 330, z -240) is unchanged, and the
  // bridge stays purely visual — no gameplay code reads the deck.
  round12: {
    bridge: {
      deckWidth: 8, // was 6 — a more substantial deck from above
      deckThickness: 1.8, // was 1 — a real edge profile from N/S
      deckColor: 0x8a7a62, // warm taupe (was dark slate 0x4a4f58) — separates from the water
      fasciaColor: 0xd8c9a8, // bright sandstone edge band, proud of the deck side
      centreLineColor: 0xf5d76e, // gold road line on the deck top
      pylonHeight: 12, // pylon rise above the deck top (tops ~20 m at mid-span)
      cableSag: 2, // main-cable height above the deck at mid-span
      cableColor: 0x2e3138, // dark steel — silhouette against the sky
      edgeLightSpacing: 22.5, // metres between warm fascia marker lights
      reflectColor: 0x3a8ab0, // lighter water strip under the span
      reflectOpacity: 0.45,
      reflectWarmColor: 0xffb36b, // warm-gold strip under the deck centreline
      reflectWarmOpacity: 0.28,
    },
  },

  // ---- Round-13 polish (Lane 2: scene density + golden-hour art) ----
  // The round-12 gap: gameplay screenshots are EMPTY — no police visible
  // at wanted 3, no helicopter, no pedestrians in frame, flat grey
  // roofs, black tarmac. Everything here is tuning for the five files
  // Lane 2 owns (world / render / config / traffic / police); every
  // value has a fallback in the reader, so a missing block is the
  // round-12 behaviour. The additions are paid for by the `savings`
  // below + palm instancing (world.js bakePalmInstances): the round-12
  // profile is 4,262 calls / 149,560 tris against caps of 4,300 /
  // 150,000, so nothing here may add net cost. Pinned values are NOT
  // touched: sky zenith/horizon/fog colour, sky-mid hexes, facade
  // tints (8), fill-light values, maxCars 20, parked 6.
  round13: {
    road: {
      base: '#5a6e84', // blue-grey asphalt (was #5f6874, originally
      // #3a3f46) — the first blue-grey still read brown under the warm
      // sun/hemi, so the base is cooler: blue > green > red, still a
      // desaturated grey-blue. Value-only change: 0 rng / 0 tris.
    },
    haze: {
      fogNear: 220, fogFar: 800, // was 260/900 — a touch more haze so
      // the skyline softens into the sunset. Fog COLOUR stays 0xd96a35.
    },
    sun: {
      glowScale: 520, haloScale: 850, // was 480/700 — a bigger warm halo
      // so the low sun blooms into the haze. Disc scale + position
      // untouched (round-6 harness pins sun.y <= 160).
    },
    windows: {
      // Round 15: more lit panes at dusk again (was [0.1, 0.3, 0.5, 0.7,
      // 0.85] / [0.28, 0.48, 0.68, 0.88]) — the flat facades in the
      // combat + sunset shots read as dark grids, so more windows glow
      // warm. Same instance counts (lit vs dark just moves between
      // InstancedMeshes), so 0 draw calls / 0 tris.
      geometryLitRatios: [0.25, 0.45, 0.65, 0.8, 0.9],
      paintedLitRatios: [0.4, 0.6, 0.75, 0.9],
    },
    roofs: {
      // Per-building roof tone (render.js roofTintFor): grey (round-4b),
      // terracotta, dark slate — the skyline stops being one grey.
      // Shared materials, no new geometry: 0 draw calls / 0 tris.
      colours: [0x6a6a68, 0x8a5a44, 0x4a4a52],
    },
    palms: {
      chunkSize: 16, // instancing chunk (world.js bakePalmInstances)
      chunkSpan: 80, // max metres a chunk may span in x or z (tight culling)
      downtownExtras: 6, // extra palms planted in park gaps downtown
    },
    neon: {
      // NOTE: the shopfront neon CHANCE stays R4's 0.55 — raising it
      // would change which shopfronts take the neon branch, and the
      // branch consumes an extra rng.pick (neon colour), so the whole
      // seeded city layout would shift (measured: 118 -> 105 buildings
      // at 0.75). More glow instead comes from a brighter strip +
      // a glow sprite per neon shopfront (world.js), both 0-rng.
      stripEmissive: 2.4, // was 1.8 — the strip itself burns brighter
      secondBillboardFace: true, // the rooftop billboard reads from both sides
    },
    savings: {
      // Cheap tris wins that pay for the round-13 additions — all on
      // small / distant spheres whose segment count is invisible:
      cloudSegments: [6, 4], // was (10, 8) round 12, (8, 6) round 13 Lane 2 —
      // final agent: (6, 4) — a distant flattened blob reads identically,
      // and ~56 puffs save a further ~2,240 tris toward the wanted-4 cap
      trafficLampSegments: [6, 5], // was (8, 8) — 36 tiny lamps, -2,304 tris
    },
    traffic: {
      spawnRadius: 95, // was 120 — traffic + peds spawn closer to the
      // player, so the street in frame is denser at the same fleet size
      // (maxCars stays 20, parked stays 6 — round-11 harness pins both).
      maxPedestrians: 24, // was 18 — more walkers on the sidewalks
    },
    police: {
      spawnMin: 28, spawnMax: 55, // was 35/70 — pursuit cars arrive in frame
      lightBarGlowScale: 2.2, // was 1.35 — bigger bar glow sprites
      haloScale: 5.5, haloOpacity: 0.5, // big alternating red/blue halo
      // above each pursuit car, visible across the street
      heliMinWanted: 3, // air unit joins at 3+ stars
      heliAltitude: 38, // clears mid-rise roofs; the cone + ground pool
      // (not the body) are what read in the chase camera's frame
      heliOrbitRadius: 30, // orbit ring out in front of the player, so
      // the cone base + pool land ~30 m ahead, inside the frame
    },
  },

  // Round 16: the cover helicopter, readable as a helicopter. The
  // round-15 chopper was a face-on blue box (nose-tail 21 px on
  // screen, body-vs-sky contrast 15.7, rotor disc invisible) — it
  // read as a building with a white triangle under it. Round 16 flies
  // it SIDE-ON (yawOffset 90 deg, long axis across the screen, so the
  // tail boom + fin + skids all read), paints the fuselage near-white
  // with a navy stripe/tail (luminance contrast vs the orange sky),
  // darkens the rotor (dark bar + dark translucent disc — the pale
  // disc was invisible against the bright sky), and shrinks/dims the
  // searchlight cone so it stops dominating the frame. Scale 2.3
  // (rotor span ~330 px). Read by buildShotHeli + stageCoverChase
  // (main.js) with fallbacks to the round-15 values; validated by
  // main.ts so a copy that lost this block fails loudly.
  round16: {
    heli: {
      scale: 2.3,
      sideYawDeg: 90, // +90 deg from the face-the-car yaw: side profile
      coneRadius: 1.8, // was 3.0 — the cone read as a white triangle
      coneOpacity: 0.16, // was 0.30 — dimmed, no longer the subject
      poolOpacity: 0.30, // was 0.45
      poolScale: 10, // was 14
      discRadius: 4.25, // rotor blur disc radius, in scale units.
      // Iteration 3: back to the full 4.25 (was 3.8 in iteration 2) —
      // the smaller disc no longer covered the rotor-bar span, so the
      // disc-dark fraction fell to 0.20. The full disc's far edge
      // pokes above the frame top, but that reads as an overhead rotor
      // cropped by the frame, and the bars + disc together are the
      // rotor cue; a smaller disc reads as neither.
    },
    // Round 16: the sunset dialogue box moves right + narrows so the
    // MARINA neon sign reads in full — the centred 560 px box covered
    // 7,458 px^2 of the sign (its left half). The shifted box (left
    // 485, width 420) clears the sign's right edge (473) and the
    // police panel's left edge (980). Read by stageSunset (main.js).
    sunsetDialogue: { left: 485, width: 420 },
    // Round 16: the fallen officer's light pool — a warm glow plane on
    // the asphalt under the prone officer (combat staging only, 1 draw
    // call, 2 tris). Baseline: the dark body on dark asphalt measured
    // body-vs-ring contrast 15.2 (tight sampling); the pool must lift
    // the ring well above the body. The plane is ELONGATED along the
    // road (length 8 m along z, width 4 m) because the camera
    // foreshortens depth on screen — a 5 m square pool's top/bottom
    // fell outside the ring's screen extent. Read by stageCombat.
    fallenPool: { width: 4, length: 8, opacity: 0.8 },
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

// Round-12 final: bridge span config (deck 8 m, pylons, cables, fascia lights) — world.js buildBridge reads CONFIG.round12.bridge.

export default CONFIG;
