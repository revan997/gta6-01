// Cars — Solmar Bay traffic (Lane A).
// Five original box-built models (coupe, sedan, pickup, van, sports), each a
// distinct shape with wheels, windows and lights. Arcade driving: accelerate,
// brake, reverse, speed-scaled steering, handbrake slide, and simple
// collision against building boxes. A car object is the contract Lane B
// reads: position, heading, speed, model, color, setDriver(driver), update().
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeGlowTexture, makeCheckerTexture, makeSignTexture, boostGlassSheen } from './render.js';

export const VEHICLE_MODELS = ['coupe', 'sedan', 'pickup', 'van', 'sports', 'taxi', 'bus'];

// Round-4: glow / sign textures are built lazily once (canvas work only
// happens in the browser, never at module import).
let headGlowTex = null;
let tailGlowTex = null;
let blueGlowTex = null;
let checkerTex = null;
let taxiSignTex = null;
function glowTextures() {
  if (!headGlowTex) {
    headGlowTex = makeGlowTexture('rgba(255,240,170,0.9)');
    tailGlowTex = makeGlowTexture('rgba(255,60,50,0.9)');
    blueGlowTex = makeGlowTexture('rgba(70,120,255,0.9)');
    checkerTex = makeCheckerTexture(8, 2);
    taxiSignTex = makeSignTexture('TAXI', '#f7c948', '#111111');
  }
  return { headGlowTex, tailGlowTex, blueGlowTex, checkerTex, taxiSignTex };
}

// Round-10: the dimensions / cabin proportions for one model, as a
// copy (callers cannot mutate MODEL_SHAPES through the result). An
// unknown model falls back to the sedan shape instead of returning
// undefined — the buildCarMesh default path.
export function getModelShape(model) {
  const shape = MODEL_SHAPES[model] || MODEL_SHAPES.sedan;
  return { ...shape };
}

// Round-11: the visible silhouette of one model, as a plain object
// a probe can count by type — length / width / total height in metres,
// wheel count, and a shape kind ('long' bus, 'low' coupe/sports,
// 'open-bed' pickup, 'tall' van, 'standard' sedan/taxi). The bus
// (9.5 m long, 6 wheels) and the coupe (1.78 m tall, low sleek body)
// are the two extremes; a fleet probe can tell them apart by numbers
// alone, without rendering a frame. Unknown models fall back to the
// sedan silhouette, like getModelShape above.
export function getVehicleSilhouette(model) {
  const shape = MODEL_SHAPES[model] || MODEL_SHAPES.sedan;
  const totalH = shape.wheels * 2 + shape.bodyH + shape.cabinH - (shape.stance || 0);
  let kind = 'standard';
  if (model === 'bus') kind = 'long';
  else if (model === 'coupe' || model === 'sports') kind = 'low';
  else if (model === 'pickup') kind = 'open-bed';
  else if (model === 'van') kind = 'tall';
  return {
    key: MODEL_SHAPES[model] ? model : 'sedan',
    length: shape.length,
    width: shape.width,
    height: +totalH.toFixed(2),
    wheels: model === 'bus' ? 6 : 4,
    kind,
  };
}

// Model dimensions (length x width x body height) and cabin proportions.
// Round-5: bigger wheels + a per-model `stance` drop so the body sits
// planted on the wheels — bodyY = wheels*2 + bodyH/2 - stance, so the
// wheel tops overlap the body bottom by `stance` instead of the car
// floating on tiny wheels. Length/width/topSpeed/accel are untouched.
const MODEL_SHAPES = {
  coupe: { length: 4.4, width: 1.9, bodyH: 0.58, cabinL: 2.0, cabinH: 0.5, cabinZ: -0.2, wheels: 0.38, stance: 0.06 },
  sedan: { length: 4.8, width: 1.9, bodyH: 0.62, cabinL: 2.5, cabinH: 0.58, cabinZ: -0.1, wheels: 0.40, stance: 0.06 },
  pickup: { length: 5.2, width: 2.0, bodyH: 0.66, cabinL: 1.7, cabinH: 0.62, cabinZ: 0.9, wheels: 0.42, stance: 0.05 },
  van: { length: 5.0, width: 2.1, bodyH: 0.92, cabinL: 4.2, cabinH: 0.85, cabinZ: 0.1, wheels: 0.46, stance: 0.10 },
  sports: { length: 4.5, width: 2.0, bodyH: 0.48, cabinL: 1.9, cabinH: 0.42, cabinZ: -0.3, wheels: 0.38, stance: 0.06 },
  // Round-4 models: the taxi rides on the sedan shape; the bus is long,
  // tall and wide, with a long glass band for windows.
  taxi: { length: 4.8, width: 1.9, bodyH: 0.62, cabinL: 2.5, cabinH: 0.58, cabinZ: -0.1, wheels: 0.40, stance: 0.06 },
  bus: { length: 9.5, width: 2.5, bodyH: 1.42, cabinL: 8.0, cabinH: 0.9, cabinZ: 0, wheels: 0.50, stance: 0.08 },
};

// Round-6 car sculpting: angled-panel angles (radians) for the sloped
// hood / windshield / fastback glass. Nose-down hood = +rotation.x
// (front edge drops); windshield leaning back = -rotation.x (top edge
// moves rearward); fastback rear glass = +rotation.x (top edge forward).
// Local constants — config.js is owned by another lane.
const SCULPT = {
  hoodSlope: 0.24,
  windshieldSlope: -0.32,
  rearGlassSlope: 0.38,
  trunkSlope: -0.10,
  vanHoodSlope: 0.25,
  busWindshieldSlope: -0.28,
};

function buildCarMesh(model, color) {
  const shape = MODEL_SHAPES[model] || MODEL_SHAPES.sedan;
  const group = new THREE.Group();
  group.name = 'round11-car-' + model; // round-11 final: named per model, so a scene traversal can find the bus / coupe / pickup by name and verify each from multiple angles (img2threejs: a single front shot is not evidence a model holds up).
  // Round-11 final (re-touch): the name is also how the side-shot harness finds the same car it just drove, for the multi-angle check (driving view + true side profile).
  // Round-6 sculpt flags: set as the angled panels / hub caps are added,
  // and reported via car.sculpt in createCar.
  let sculptHood = false;
  let sculptWindshield = false;
  let sculptHubCaps = 0;
  // Round-8 sculpt counters: fender flares, arch liners and glasshouse
  // panels, counted honestly from the built group and reported via
  // car.sculpt (traffic.js getSculptedCarsReport reads them).
  let sculptFenders = 0;
  let sculptArchLiners = 0;
  let sculptGlasshouse = 0;
  // Round-8: roof-crown lift per model — the curved crown rises this far
  // above the flat roofline, so anything mounted on the roof (taxi sign,
  // roof rack, roof vent) must sit this much higher or it clips the
  // crown. These numbers are the single source of truth: the domes
  // below scale by crownLift and report it as sculpt.crownH.
  const CROWN_LIFT = { coupe: 0.15, sedan: 0.15, taxi: 0.15, sports: 0.15, pickup: 0.15, van: 0.12, bus: 0.06 };
  const crownLift = CROWN_LIFT[model] || 0;
  let sculptRoofCrown = false;
  let sculptCrownH = 0;
  const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.15, metalness: 0.6 });
  // Round-9 re-touch (new recording): warm dusk sheen on the glass, so
  // the tapered glasshouse under the integrated roof reads as glass at
  // dusk instead of a black hole. Applied at build time, every car.
  boostGlassSheen(matGlass);
  const matTrim = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.7 });
  const matHead = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe98a, emissiveIntensity: 0.9 });
  const matTail = new THREE.MeshStandardMaterial({ color: 0xc22a2a, emissive: 0x881111, emissiveIntensity: 0.7 });
  const matWheel = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const matHub = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.8 });

  function box(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Round-6: a box rotated around X — the sculpting primitive. Positive
  // rotX drops the +z (front) edge, negative rotX leans the top rearward.
  function angledBox(material, w, h, d, x, y, z, rotX) {
    const mesh = box(material, w, h, d, x, y, z);
    mesh.rotation.x = rotX;
    return mesh;
  }

  // Round-8: a box rotated around X and/or Z — the side-glass taper
  // primitive. rotZ leans the top edge sideways (inward on the side it
  // sits on), so the glasshouse narrows toward the roof instead of
  // standing as a vertical slab.
  function tiltedBox(material, w, h, d, x, y, z, rotX, rotZ) {
    const mesh = box(material, w, h, d, x, y, z);
    if (rotX) mesh.rotation.x = rotX;
    if (rotZ) mesh.rotation.z = rotZ;
    return mesh;
  }

  // Round-8: a shallow half-dome — the curved-form primitive. A unit
  // hemisphere scaled flat, used for fender flares (over a wheel) and
  // the roof crown (over the cabin). `geo` is shared across the meshes
  // that use it, so one geometry serves all four fenders / the crown.
  function dome(geo, material, sx, sy, sz, x, y, z) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Round-9: integrated roof — the round-8 crown was a half-dome perched
  // ON the flat cabin top, so its elliptical rim read as a bubble/disc
  // sitting on the roof. The fix buries the rim: the crown is sunk
  // `sink` below the roof deck (its equator is INSIDE the body, only
  // the upper cap emerges), and it rises through a body-coloured roof
  // deck (same matBody, same paint — the crown-to-body join is
  // body-on-body, so there is no colour/material seam to see). Two
  // inward-leaning body fillets hug the crown where it leaves the deck,
  // and sloped body panels bridge the crown fore/aft toward the
  // windshield and the trunk, so the roofline runs hood -> crown ->
  // trunk as one continuous curve instead of dome-on-box. The visible
  // crown height is UNCHANGED (sy = lift + sink, base = deck top -
  // sink, so the top still sits exactly `lift` above the roofline) —
  // taxi sign, roof rack, roof vent and the police light bar keep
  // seating on sculpt.crownH exactly as in round 8.
  let sculptRoofFillets = 0;
  let sculptRoofDeck = false;
  let sculptRoofIntegrated = false;
  function integratedRoof(opts) {
    const sink = opts.sink ?? 0.08;
    const deckTopY = opts.deckY + 0.035;
    const crownBaseY = deckTopY - sink;
    dome(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      matBody, opts.crownSX, opts.lift + sink, opts.crownSZ, 0, crownBaseY, opts.crownZ);
    // Body-coloured deck the crown rises through — its top is flush
    // with the old flat roofline and it overhangs the glass sides by a
    // hair, hiding the glass top edge the dome rim used to sit on.
    box(matBody, opts.deckW, 0.07, opts.deckL, 0, opts.deckY, opts.deckZ);
    sculptRoofDeck = true;
    // Side fillets: body strips leaning inward over the crown's flanks.
    for (const sx of [-1, 1]) {
      tiltedBox(matBody, 0.12, 0.06, opts.crownSZ * 1.64,
        sx * (opts.deckW / 2 - 0.07), opts.deckY + 0.03, opts.crownZ, 0, sx * 0.32);
      sculptRoofFillets += 1;
    }
    // Fore/aft roofline bridges: sloped body panels from the crown ends
    // down toward the windshield (front, nose-down) and the trunk/rear
    // (rear, sloping down rearward) — the continuous roofline.
    angledBox(matBody, opts.deckW * 0.94, 0.06, 0.62, 0, opts.frontY, opts.frontZ, 0.30);
    angledBox(matBody, opts.deckW * 0.94, 0.06, 0.62, 0, opts.rearY, opts.rearZ, -0.22);
    sculptRoofCrown = true;
    sculptCrownH = opts.lift;
    sculptRoofIntegrated = true;
    return deckTopY + opts.lift;
  }

  const L = shape.length;
  const W = shape.width;
  // Round-5 planted stance: the wheel tops overlap the body bottom by
  // `stance`, so the car sits ON its wheels instead of floating above them.
  const bodyY = shape.wheels * 2 + shape.bodyH / 2 - (shape.stance || 0);
  // Round-8: the roofline the police light bar and the roof crown sit
  // on — the top of the cabin glass for cars with a cabin, the body top
  // for the van. Round-9: the bus now has a shallow integrated crown
  // too (crownH 0.06), so every model carries a curved, integrated roof.
  const roofTopY = model === 'van'
    ? bodyY + shape.bodyH / 2 + 0.02
    : bodyY + shape.bodyH / 2 + shape.cabinH - 0.04;

  // Main body. Pickup gets a bed instead of a full rear cabin.
  box(matBody, W, shape.bodyH, L, 0, bodyY, 0);
  if (model === 'pickup') {
    // Round-6: a real open bed, not a flat slab — the body top is the bed
    // floor, with body-coloured raised side walls and a tailgate at the
    // rear, so the pickup reads cab + bed instead of box + black box.
    const bedL = L * 0.42;
    const bedZ = -L * 0.26;
    const wallY = bodyY + shape.bodyH / 2 + 0.16;
    box(matBody, 0.08, 0.32, bedL, -(W / 2 - 0.06), wallY, bedZ);
    box(matBody, 0.08, 0.32, bedL, W / 2 - 0.06, wallY, bedZ);
    box(matBody, W - 0.3, 0.32, 0.08, 0, wallY, bedZ - bedL / 2);
    // Round-7: dark bed-liner floor + tailgate seam, so the bed reads
    // OPEN from the rear 3/4 chase view instead of a solid trunk. The
    // liner sits just proud of the body top inside the walls (visible
    // over the tailgate from a normal chase camera); the seam is a thin
    // dark strip on the tailgate's rear face at mid-height. Two meshes,
    // both matTrim — no new materials, no rotated boxes (sculpt probe
    // counts unchanged).
    box(matTrim, W - 0.24, 0.03, bedL - 0.1, 0, bodyY + shape.bodyH / 2 + 0.015, bedZ);
    box(matTrim, W - 0.34, 0.035, 0.02, 0, wallY, bedZ - bedL / 2 - 0.045);
    box(matGlass, W - 0.3, shape.cabinH, shape.cabinL, 0, bodyY + shape.bodyH / 2 + shape.cabinH / 2, shape.cabinZ);
  } else if (model === 'van') {
    // Tall single-box van: body is the cabin.
    box(matGlass, W - 0.24, 0.6, 1.4, 0, bodyY + shape.bodyH / 2 + 0.35, L / 2 - 0.9);
    box(matGlass, W - 0.24, 0.55, 0.9, 0, bodyY + shape.bodyH / 2 + 0.3, -L / 2 + 0.6);
  } else {
    box(matGlass, W - 0.28, shape.cabinH, shape.cabinL, 0,
      bodyY + shape.bodyH / 2 + shape.cabinH / 2 - 0.04, shape.cabinZ);
  }
  // Sports car: low nose spoiler + rear wing.
  if (model === 'sports') {
    box(matTrim, W + 0.1, 0.08, 0.5, 0, bodyY - 0.1, L / 2 - 0.1);
    box(matTrim, W - 0.2, 0.07, 0.4, 0, bodyY + shape.bodyH + 0.25, -L / 2 + 0.3);
    box(matTrim, 0.08, 0.28, 0.08, -W / 2 + 0.2, bodyY + shape.bodyH + 0.12, -L / 2 + 0.3);
    box(matTrim, 0.08, 0.28, 0.08, W / 2 - 0.2, bodyY + shape.bodyH + 0.12, -L / 2 + 0.3);
    // Round-4: side skirts + rear diffuser so the sports car reads lower.
    box(matTrim, 0.1, 0.14, L * 0.72, -W / 2 + 0.02, bodyY - shape.bodyH / 2 + 0.1, 0);
    box(matTrim, 0.1, 0.14, L * 0.72, W / 2 - 0.02, bodyY - shape.bodyH / 2 + 0.1, 0);
    box(matTrim, W - 0.3, 0.16, 0.3, 0, bodyY - shape.bodyH / 2 + 0.08, -L / 2 + 0.15);
  }
  // Round-4: roof racks on the workhorses (pickup cabin roof, van roof
  // centre — clear of the van's front/rear glass boxes). Round-8: the
  // rails sit on the crown lift, so they clear the curved roof crown
  // instead of clipping it (pickup +0.15, van +0.12).
  if (model === 'pickup' || model === 'van') {
    const rackY = model === 'pickup'
      ? bodyY + shape.bodyH / 2 + shape.cabinH + 0.06 + crownLift
      : bodyY + shape.bodyH / 2 + 0.12 + crownLift;
    const rackL = model === 'pickup' ? shape.cabinL * 0.9 : 1.8;
    const rackZ = model === 'pickup' ? shape.cabinZ : 0;
    for (const sx of [-1, 1]) box(matTrim, 0.07, 0.07, rackL, sx * (W / 2 - 0.35), rackY, rackZ);
    for (const cz of [rackZ - rackL / 2 + 0.2, rackZ, rackZ + rackL / 2 - 0.2]) {
      box(matTrim, W - 0.6, 0.06, 0.08, 0, rackY, cz);
    }
  }
  // Round-4: the taxi gets a checker band along both sides and a TAXI
  // roof sign; the bus gets window dividers along its long glass band
  // and an amber destination display on the windshield.
  const glow = glowTextures();
  if (model === 'taxi') {
    const checkerMat = new THREE.MeshStandardMaterial({ map: glow.checkerTex, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.62, 0.3), checkerMat);
      band.position.set(sx * (W / 2 + 0.015), bodyY, 0);
      band.rotation.y = sx * Math.PI / 2;
      group.add(band);
    }
    const signMat = new THREE.MeshStandardMaterial({ map: glow.taxiSignTex, roughness: 0.6 });
    // Round-8 fix: the sign seats on the curved roof crown, not the flat
    // roof — raised by crownLift (0.15) so its base sits exactly on the
    // crown top (cabin top + 0.11) instead of clipping into the dome.
    box(signMat, 0.75, 0.24, 0.32, 0, bodyY + shape.bodyH / 2 + shape.cabinH + 0.08 + crownLift, shape.cabinZ);
  }
  if (model === 'bus') {
    const cabY = bodyY + shape.bodyH / 2 + shape.cabinH / 2 - 0.04;
    for (let z = -3.4; z <= 3.4; z += 1.35) {
      box(matTrim, 0.04, shape.cabinH * 0.85, 0.1, -W / 2 - 0.005, cabY, z);
      box(matTrim, 0.04, shape.cabinH * 0.85, 0.1, W / 2 + 0.005, cabY, z);
    }
    const matDest = new THREE.MeshStandardMaterial({
      color: 0xffc861, emissive: 0xffb020, emissiveIntensity: 1.4,
    });
    // Round-6: destination display sits proud of the new sloped
    // windshield below (its front face is ~0.14 ahead of the glass
    // band), so it stays readable instead of hiding behind the glass.
    box(matDest, 1.3, 0.32, 0.06, 0, cabY + 0.15, shape.cabinZ + shape.cabinL / 2 + 0.14);
    // Round-6: sloped front windshield over the glass band — the bus
    // front is no longer a flat vertical slab.
    angledBox(matGlass, W - 0.4, 0.72, 0.08, 0, cabY + 0.12,
      shape.cabinZ + shape.cabinL / 2 + 0.02, SCULPT.busWindshieldSlope);
    sculptWindshield = true;
    // Round-5: roof AC pod — the bus roof was a bare glass slab.
    // Round-9: raised by the new integrated crown lift (0.06) so its
    // base sits on the crown top instead of clipping into it.
    box(matTrim, 1.6, 0.22, 3.2, 0, bodyY + shape.bodyH / 2 + shape.cabinH - 0.04 + 0.11 + crownLift, 0);
    // Round-8: the bus stays the boxiest model, but its front is now
    // shaped — a sloped nose panel under the windshield, nose-down, so
    // the front reads as a face instead of a vertical wall — and the
    // long glass band tapers inward toward the roof on both sides.
    angledBox(matBody, W - 0.3, 0.5, 0.1, 0, bodyY + 0.1,
      shape.cabinZ + shape.cabinL / 2 + 0.02, 0.22);
    for (const sx of [-1, 1]) {
      tiltedBox(matGlass, 0.05, shape.cabinH * 0.62, 6.5,
        sx * (W / 2 - 0.06), cabY, 0, 0, sx * 0.08);
      sculptGlasshouse += 1;
    }
    // Round-9: the bus finally gets a roof too — a shallow integrated
    // crown (only 0.06 high, sunk 0.04 into a full-length body deck
    // with fillets and fore/aft bridges), so the long roof arcs
    // gently instead of slabbing flat above the glass band. The AC pod
    // above is re-seated on the new crown top.
    const busTopY = bodyY + shape.bodyH / 2 + shape.cabinH - 0.04;
    integratedRoof({
      deckW: W - 0.2, deckL: 7.6, deckY: busTopY - 0.035, deckZ: 0,
      lift: crownLift, sink: 0.04, crownSX: (W - 0.3) / 2, crownSZ: 3.2, crownZ: 0,
      frontY: busTopY - 0.02, frontZ: 3.48,
      rearY: busTopY - 0.02, rearZ: -3.48,
    });
  }
  // Round-5: distinct cab/hood for the low cars — a body-coloured hood
  // panel ahead of the cabin (slightly below the cabin base), a wider
  // grille (widened in the detail pass below) and a low front valance.
  if (model === 'sedan' || model === 'coupe' || model === 'sports' || model === 'taxi') {
    const cabFront = shape.cabinZ + shape.cabinL / 2;
    const hoodL = Math.max(0.6, L / 2 - cabFront + 0.1);
    const hoodZ = (cabFront + L / 2) / 2;
    // Round-6: the hood is now a sloped panel, nose-down (replaces the
    // round-5 flat hood — same footprint, angled so the nose reads).
    angledBox(matBody, W - 0.24, 0.1, hoodL, 0, bodyY + shape.bodyH / 2 - 0.02, hoodZ, SCULPT.hoodSlope);
    sculptHood = true;
    box(matTrim, W - 0.1, 0.12, 0.14, 0, bodyY - shape.bodyH / 2 + 0.08, L / 2 + 0.02);
    // Round-6 glasshouse: a sloped windshield leaning back over the
    // cabin front, plus a body-coloured roof on top of the cabin
    // glass so the cabin reads as glasshouse + roof, not a solid
    // glass box. The roof leaves glass visible at the front
    // (under the windshield) and at the rear.
    angledBox(matGlass, W - 0.34, shape.cabinH * 0.88, 0.07, 0,
      bodyY + shape.bodyH / 2 + shape.cabinH * 0.38, cabFront + 0.02, SCULPT.windshieldSlope);
    sculptWindshield = true;
    // Round-9: the flat roof panel is now an INTEGRATED curved roof —
    // the crown is sunk into a body-coloured deck with side fillets and
    // fore/aft roofline bridges (integratedRoof), so the roof arcs
    // hood -> crown -> trunk as one shaped body instead of a dome
    // sitting on the glasshouse. Visible crown height unchanged (0.15),
    // so the police light bar still seats on sculpt.crownH.
    const cabinTopY = bodyY + shape.bodyH / 2 + shape.cabinH - 0.04;
    const crownSZ = shape.cabinL * (model === 'coupe' || model === 'sports' ? 0.40 : 0.44);
    integratedRoof({
      deckW: W - 0.22, deckL: shape.cabinL * 0.92, deckY: cabinTopY - 0.035, deckZ: shape.cabinZ,
      lift: crownLift, sink: 0.08, crownSX: (W - 0.3) / 2, crownSZ, crownZ: shape.cabinZ + 0.05,
      frontY: cabinTopY - 0.02, frontZ: shape.cabinZ + crownSZ + 0.28,
      rearY: cabinTopY - 0.02, rearZ: shape.cabinZ - crownSZ - 0.28,
    });
    // Round-8: tapered side glass — a thin glass panel on each cabin
    // side, leaning inward toward the roof, so the glasshouse narrows
    // toward the crown instead of standing as a vertical glass slab.
    // The panels sit just proud of the cabin glass box sides.
    const cabinGlassY = bodyY + shape.bodyH / 2 + shape.cabinH / 2 - 0.04;
    for (const sx of [-1, 1]) {
      tiltedBox(matGlass, 0.05, shape.cabinH * 0.62, shape.cabinL * 0.72,
        sx * (W / 2 - 0.13), cabinGlassY, shape.cabinZ, 0, sx * 0.14);
      sculptGlasshouse += 1;
    }
    if (model === 'sedan' || model === 'taxi') {
      // Short trunk deck behind the cabin, sloping gently down to the rear.
      const cabRear = shape.cabinZ - shape.cabinL / 2;
      const trunkL = Math.max(0.5, cabRear + L / 2 - 0.05);
      angledBox(matBody, W - 0.26, 0.08, trunkL, 0, bodyY + shape.bodyH / 2 - 0.02,
        (cabRear - L / 2) / 2, SCULPT.trunkSlope);
      // Round-8: sloped rear glass on the sedan/taxi too (the coupe and
      // sports already had a fastback), so the glasshouse closes with
      // glass at the back, not a flat glass-box rear face.
      angledBox(matGlass, W - 0.4, 0.5, 0.07, 0,
        bodyY + shape.bodyH / 2 + shape.cabinH * 0.32, cabRear - 0.02, SCULPT.rearGlassSlope);
      sculptGlasshouse += 1;
    }
    if (model === 'coupe' || model === 'sports') {
      // Fastback rear glass: slopes down from the roof toward the tail,
      // so the coupe/sports read low and sleek from the side.
      const cabRear = shape.cabinZ - shape.cabinL / 2;
      angledBox(matGlass, W - 0.4, 0.55, 0.07, 0,
        bodyY + shape.bodyH / 2 + shape.cabinH * 0.32, cabRear - 0.02, SCULPT.rearGlassSlope);
      sculptGlasshouse += 1;
    }
    if (model === 'coupe') {
      // Round-11: a thin lip spoiler on the coupe's rear deck (the
      // sports car already has a full wing) — one more cue that the
      // low sleek body is a coupe, not a sedan, at a glance. Flat
      // unrotated boxes only, so the sculpt `angled` count is
      // unchanged and the stance probe's children[0] body box is
      // untouched.
      box(matTrim, W - 0.3, 0.07, 0.35, 0, bodyY + shape.bodyH / 2 + 0.02, -L / 2 + 0.32);
      box(matTrim, 0.08, 0.12, 0.08, -W / 2 + 0.35, bodyY + shape.bodyH / 2 - 0.02, -L / 2 + 0.32);
      box(matTrim, 0.08, 0.12, 0.08, W / 2 - 0.35, bodyY + shape.bodyH / 2 - 0.02, -L / 2 + 0.32);
      // Round-11 (retry): low side skirts along both sills — the coupe
      // reads lower and sleeker from the side than the sedan, which has
      // a plain body side. Flat unrotated boxes, same as the spoiler
      // above, so the sculpt `angled` count and children[0] body box
      // are untouched.
      box(matTrim, 0.08, 0.1, L - 1.2, -W / 2 - 0.01, bodyY - shape.bodyH / 2 + 0.05, 0);
      box(matTrim, 0.08, 0.1, L - 1.2, W / 2 + 0.01, bodyY - shape.bodyH / 2 + 0.05, 0);
    }
  }
  // Round-5: the van gets a real nose instead of a single tall box — a
  // sloped windshield leaning back over the cab front, a short hood bulge
  // low at the front, and a small roof vent behind the roof rack.
  if (model === 'van') {
    const shield = box(matGlass, W - 0.34, 0.72, 0.08, 0, bodyY + shape.bodyH / 2 + 0.12, L / 2 - 0.55);
    shield.rotation.x = -0.3;
    sculptWindshield = true; // round-5 sloped windshield, kept
    // Round-6: a sloped hood panel, nose-down, ahead of the windshield
    // so the van nose reads as a slope instead of a vertical wall.
    angledBox(matBody, W - 0.2, 0.1, 0.9, 0, bodyY + shape.bodyH / 2 - 0.18, L / 2 - 0.45, SCULPT.vanHoodSlope);
    sculptHood = true;
    box(matBody, W - 0.2, 0.24, 0.8, 0, bodyY - shape.bodyH / 2 + 0.18, L / 2 - 0.35);
    // Round-8 fix: the roof vent sat buried in the van's roof crown
    // (dome top +0.12 over the roof) — raised by crownLift so its base
    // sits on the crown top instead of clipping into the dome.
    box(matTrim, 0.55, 0.12, 0.5, 0, bodyY + shape.bodyH / 2 + 0.06 + crownLift, -1.15);
    // Round-9: tapered side glass along the van's flanks (leaning
    // inward toward the roof) and a shallow INTEGRATED curved crown
    // over the cargo roof behind the front glass — sunk into a
    // body-coloured deck with fillets and fore/aft bridges, so the van
    // reads as a shaped van instead of one tall box with a dome on it.
    // Visible crown height unchanged (0.12), so the roof rack rails
    // still sit on top of it.
    for (const sx of [-1, 1]) {
      tiltedBox(matGlass, 0.05, 0.5, 2.2, sx * (W / 2 - 0.04),
        bodyY + shape.bodyH / 2 + 0.22, -0.3, 0, sx * 0.07);
      sculptGlasshouse += 1;
    }
    integratedRoof({
      deckW: W - 0.16, deckL: 3.0, deckY: bodyY + shape.bodyH / 2 - 0.035, deckZ: -0.4,
      lift: crownLift, sink: 0.06, crownSX: (W - 0.2) / 2, crownSZ: 1.5, crownZ: -0.6,
      frontY: bodyY + shape.bodyH / 2 - 0.02, frontZ: 1.15,
      rearY: bodyY + shape.bodyH / 2 - 0.02, rearZ: -2.35,
    });
  }
  // Round-6: pickup cab glasshouse — sloped hood ahead of the cab, a
  // sloped windshield at the cab front, and a body-coloured roof panel
  // on the cab so the red pickup reads cab + bed, not box + black box.
  if (model === 'pickup') {
    const cabFront = shape.cabinZ + shape.cabinL / 2;
    const hoodL = Math.max(0.6, L / 2 - cabFront + 0.1);
    angledBox(matBody, W - 0.24, 0.09, hoodL, 0, bodyY + shape.bodyH / 2 - 0.03,
      (cabFront + L / 2) / 2, SCULPT.hoodSlope);
    sculptHood = true;
    angledBox(matGlass, W - 0.34, shape.cabinH * 0.88, 0.07, 0,
      bodyY + shape.bodyH / 2 + shape.cabinH * 0.38, cabFront + 0.02, SCULPT.windshieldSlope);
    sculptWindshield = true;
    // Round-9: integrated curved cab roof crown (replaces the flat cab
    // roof panel) — sunk into a body deck with fillets and fore/aft
    // bridges, so the cab reads as one shaped cab, not a dome on a
    // glass box — plus tapered side glass on the cab, so the red
    // pickup still reads cab + open bed but the cab itself is shaped.
    const pickupTopY = bodyY + shape.bodyH / 2 + shape.cabinH - 0.04;
    const pickupCrownSZ = shape.cabinL * 0.44;
    integratedRoof({
      deckW: W - 0.24, deckL: shape.cabinL * 0.9, deckY: pickupTopY - 0.035, deckZ: shape.cabinZ,
      lift: crownLift, sink: 0.08, crownSX: (W - 0.32) / 2, crownSZ: pickupCrownSZ, crownZ: shape.cabinZ,
      frontY: pickupTopY - 0.02, frontZ: shape.cabinZ + pickupCrownSZ + 0.28,
      rearY: pickupTopY - 0.02, rearZ: shape.cabinZ - pickupCrownSZ - 0.28,
    });
    for (const sx of [-1, 1]) {
      tiltedBox(matGlass, 0.05, shape.cabinH * 0.62, shape.cabinL * 0.72,
        sx * (W / 2 - 0.13), bodyY + shape.bodyH / 2 + shape.cabinH / 2,
        shape.cabinZ, 0, sx * 0.14);
      sculptGlasshouse += 1;
    }
  }
  // Round-5: side skirts on every model (the sports car already had them
  // in round 4) — thin dark boxes along the lower body sides between the
  // wheels, so the car reads lower and the wheels tuck under the body.
  if (model !== 'sports') {
    const skirtL = Math.max(1.2, L * 0.5);
    const skirtY = bodyY - shape.bodyH / 2 + 0.07;
    box(matTrim, 0.1, 0.14, skirtL, -W / 2 + 0.02, skirtY, 0);
    box(matTrim, 0.1, 0.14, skirtL, W / 2 - 0.02, skirtY, 0);
  }
  // Headlights (front = +z) and taillights (rear = -z).
  box(matHead, 0.42, 0.16, 0.08, -W / 2 + 0.35, bodyY, L / 2 + 0.01);
  box(matHead, 0.42, 0.16, 0.08, W / 2 - 0.35, bodyY, L / 2 + 0.01);
  box(matTail, 0.42, 0.16, 0.08, -W / 2 + 0.35, bodyY, -L / 2 - 0.01);
  box(matTail, 0.42, 0.16, 0.08, W / 2 - 0.35, bodyY, -L / 2 - 0.01);
  // Round-4: soft glow sprites at the lights so cars read at dusk and in
  // the menu orbit shot. The tail glows flare with the brake lights
  // (car.update sets their opacity from `braking`).
  const glowCfg = CONFIG.round4?.vehicle || {};
  function glowSprite(tex, x, y, z, scale, opacity) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(scale);
    group.add(sprite);
    return sprite;
  }
  // Round-5: keep the headlight glow sprites + headlight material so
  // traffic.js can run the headlights brighter at dusk.
  const headSpriteL = glowSprite(glow.headGlowTex, -W / 2 + 0.35, bodyY, L / 2 + 0.15,
    glowCfg.headlightGlowScale ?? 1.5, glowCfg.headlightGlowOpacity ?? 0.75);
  const headSpriteR = glowSprite(glow.headGlowTex, W / 2 - 0.35, bodyY, L / 2 + 0.15,
    glowCfg.headlightGlowScale ?? 1.5, glowCfg.headlightGlowOpacity ?? 0.75);
  const headGlows = [headSpriteL.material, headSpriteR.material];
  const headGlowSprites = [headSpriteL, headSpriteR];
  const tailGlowL = glowSprite(glow.tailGlowTex, -W / 2 + 0.35, bodyY, -L / 2 - 0.15,
    glowCfg.tailGlowScale ?? 1.3, glowCfg.tailGlowIdle ?? 0.45).material;
  const tailGlowR = glowSprite(glow.tailGlowTex, W / 2 - 0.35, bodyY, -L / 2 - 0.15,
    glowCfg.tailGlowScale ?? 1.3, glowCfg.tailGlowIdle ?? 0.45).material;

  // Detail pass: bumpers, grille, mirrors, door seams, license plate.
  const matPlate = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
  // Front + rear bumpers (thin dark boxes at both ends).
  box(matTrim, W, 0.14, 0.18, 0, bodyY - 0.1, L / 2 + 0.02);
  box(matTrim, W, 0.14, 0.18, 0, bodyY - 0.1, -L / 2 - 0.02);
  // Front grille (dark box at front centre, between the headlights).
  // Round-5: the low cars get a wider grille to go with the hood panel.
  const grilleW = (model === 'sedan' || model === 'coupe' || model === 'sports' || model === 'taxi')
    ? W * 0.62 : W * 0.35;
  box(matTrim, grilleW, 0.16, 0.06, 0, bodyY, L / 2 + 0.03);
  // Side mirrors (small boxes on both sides, near the cabin front).
  const mirrorZ = shape.cabinZ + shape.cabinL / 2 - 0.15;
  const mirrorY = bodyY + shape.bodyH / 2 + 0.18;
  box(matTrim, 0.12, 0.08, 0.2, -W / 2 - 0.05, mirrorY, mirrorZ);
  box(matTrim, 0.12, 0.08, 0.2, W / 2 + 0.05, mirrorY, mirrorZ);
  // Door seam strips (thin dark vertical boxes on both sides).
  const seamZF = shape.cabinZ + shape.cabinL * 0.15;
  const seamZR = shape.cabinZ - shape.cabinL * 0.25;
  for (const sz of [seamZF, seamZR]) {
    box(matTrim, 0.03, shape.bodyH * 0.7, 0.06, -W / 2 - 0.005, bodyY, sz);
    box(matTrim, 0.03, shape.bodyH * 0.7, 0.06, W / 2 + 0.005, bodyY, sz);
  }
  // Rear license plate (small light box, just proud of the rear bumper).
  box(matPlate, 0.5, 0.14, 0.04, 0, bodyY - 0.02, -L / 2 - 0.14);

  // Wheels. The bus gets a middle axle as well (6 wheels).
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(shape.wheels, shape.wheels, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(shape.wheels * 0.55, shape.wheels * 0.55, 0.3, 10);
  hubGeo.rotateZ(Math.PI / 2);
  // Round-6: one dark centre cap per wheel — a short cylinder slightly
  // proud of the hub on both faces, so the wheel reads tyre + rim + cap.
  const capGeo = new THREE.CylinderGeometry(shape.wheels * 0.28, shape.wheels * 0.28, 0.34, 8);
  capGeo.rotateZ(Math.PI / 2);
  const wy = shape.wheels;
  const wzF = L / 2 - 0.85;
  const wzR = -L / 2 + 0.85;
  const wheelSpots = [[-W / 2, wzF], [W / 2, wzF], [-W / 2, wzR], [W / 2, wzR]];
  if (model === 'bus') wheelSpots.push([-W / 2, 0], [W / 2, 0]);
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, matWheel);
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(hubGeo, matHub);
    hub.position.set(wx, wy, wz);
    group.add(hub);
    const cap = new THREE.Mesh(capGeo, matTrim);
    cap.position.set(wx, wy, wz);
    group.add(cap);
    sculptHubCaps += 1;
    wheels.push(wheel);
  }
  // Round-8: wheel arches — the round-5 flat fender boxes are replaced
  // by ROUNDED fender flares (flattened half-domes in body colour, one
  // shared geometry per car, arched over each wheel top) plus dark arch
  // liners: thin dark discs set just inside each wheel, slightly larger
  // than the tyre, so the wheel sits IN a recessed well instead of
  // beside a flat body-colour wall. The round-5 planted stance is
  // untouched — the wheel tops still overlap the body bottom by `stance`.
  // Net mesh delta vs round 6: +4 liners per 4-wheel car (+6 for the
  // 6-wheel bus); the domes replace the old arch boxes 1-for-1.
  const fenderGeo = new THREE.SphereGeometry(shape.wheels * 1.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const linerGeo = new THREE.CylinderGeometry(shape.wheels * 1.18, shape.wheels * 1.18, 0.06, 14);
  linerGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of wheelSpots) {
    const side = wx < 0 ? -1 : 1;
    dome(fenderGeo, matBody, 0.42, 0.72, 1.0, side * (W / 2 - 0.08), wy, wz);
    sculptFenders += 1;
    const liner = new THREE.Mesh(linerGeo, matTrim);
    liner.position.set(side * (W / 2 - 0.17), wy, wz);
    group.add(liner);
    sculptArchLiners += 1;
  }

  // Round-6 sculpt summary, counted honestly from the built group:
  // `angled` counts every mesh with a non-zero X/Z rotation (sloped
  // hood, windshield, fastback/trunk, van shield). The stance probe's
  // children[0] body box is untouched — it is still the first mesh.
  // Round-8 adds the fender / arch-liner / glasshouse counts, the roof
  // crown flag + height, and the roofline Y the police light bar seats
  // on — all counted from the meshes built above, never guessed.
  const sculpt = {
    angled: group.children.filter((m) => m.rotation.x !== 0 || m.rotation.z !== 0).length,
    hood: sculptHood,
    windshield: sculptWindshield,
    hubCaps: sculptHubCaps,
    silhouette: model,
    // Round-11: numeric silhouette (length / width / total height /
    // wheels / kind) from getVehicleSilhouette above, attached to the
    // live car — traffic.js getFleetComposition() counts by type from
    // these numbers without importing vehicle.js. The bus (9.5 m,
    // 3.24 m tall, 6 wheels, 'long') and the coupe (4.4 m, 1.78 m,
    // 'low') are the two extremes.
    silhouetteSize: getVehicleSilhouette(model),
    fenders: sculptFenders,
    archLiners: sculptArchLiners,
    glasshouse: sculptGlasshouse,
    roofCrown: sculptRoofCrown,
    crownH: sculptCrownH,
    roofY: roofTopY,
    // Round-9: the crown is now integrated — sunk into a body-coloured
    // deck (roofDeck) with side fillets (roofFillets) and fore/aft
    // roofline bridges, so the rim is buried inside the body and the
    // roof reads as one shaped car. roofSink is how far the crown base
    // sits below the deck top; the visible crown height (crownH) is
    // unchanged from round 8.
    roofIntegrated: sculptRoofIntegrated,
    roofDeck: sculptRoofDeck,
    roofFillets: sculptRoofFillets,
    roofSink: sculptRoofIntegrated ? (model === 'bus' ? 0.04 : model === 'van' ? 0.06 : 0.08) : 0,
    // Round-8: front-bumper contact point, in car-local space — combat.js
    // ramming sparks use this (half the length + the bumper lip, at
    // bumper height) instead of the car centre.
    bumperFrontZ: L / 2 + 0.12,
    bumperY: bodyY - 0.1,
  };
  return { group, wheels, shape, sculpt, tailMat: matTail, tailGlows: [tailGlowL, tailGlowR], headMat: matHead, headGlows, headGlowSprites };
}

// Create one car in `scene`.
// createCar(scene, model, color, x, z, heading)
// `model` is one of VEHICLE_MODELS; `color` is a hex number or CSS string.
export function createCar(scene, model, color, x, z, heading) {
  const name = VEHICLE_MODELS.includes(model) ? model : 'sedan';
  const tune = CONFIG.vehicleModels[name] || CONFIG.vehicleModels.sedan;
  const { group, wheels, shape, sculpt, tailMat, tailGlows, headMat, headGlows, headGlowSprites } = buildCarMesh(name, color === undefined ? 0xc23a2a : color);
  group.position.set(x || 0, 0, z || 0);
  scene.add(group);

  const car = {
    group,
    mesh: group,
    model: name,
    color,
    position: group.position, // THREE.Vector3 — Lane B reads car.position
    heading: heading || 0,
    speed: 0, // signed m/s, forward positive
    driver: null,
    wheels,
    tailMat, // round 3: brake lights flare by setting its emissiveIntensity
    tailGlows, // round 4: tail glow sprite materials, flared with braking
    headMat, // round 5: headlight material, brightened at dusk by traffic.js
    headGlows, // round 5: headlight glow sprite materials (dusk headlights)
    headGlowSprites, // round 5: headlight glow sprites (dusk scale-up)
    sculpt, // round 6: { angled, hood, windshield, hubCaps, silhouette }
    braking: false, // round 3: true while the brakes are on
    skidding: false, // round 3: true on a hard handbrake turn at speed
    length: shape.length,
    width: shape.width,
    topSpeed: CONFIG.vehicle.maxSpeed * tune.topSpeed,
    accel: CONFIG.vehicle.accel * tune.accel,

    setDriver(driver) {
      this.driver = driver || null;
    },

    // One frame of arcade driving.
    // `controls` (optional): { throttle (0..1 or -1..1), steer (-1..1),
    //   brake (bool), handbrake (bool) }. When omitted the car coasts.
    // `inputState` (optional, alternative): the input singleton — W/S drive,
    //   A/D steer, Space handbrake. `world` is the world description object.
    update(dt, world, controls, inputState) {
      const safeDt = Math.min(dt || 0.016, 0.05);
      let throttle = 0;
      let steer = 0;
      let brake = false;
      let handbrake = false;
      if (controls) {
        throttle = controls.throttle || 0;
        if (controls.forward) throttle = 1;
        if (controls.reverse) throttle = -1;
        steer = controls.steer || 0;
        brake = !!controls.brake;
        handbrake = !!controls.handbrake;
      } else if (inputState && typeof inputState.isDown === 'function') {
        if (inputState.isDown('KeyW') || inputState.isDown('ArrowUp')) throttle = 1;
        if (inputState.isDown('KeyS') || inputState.isDown('ArrowDown')) throttle = -1;
        if (inputState.isDown('KeyA') || inputState.isDown('ArrowLeft')) steer = -1;
        if (inputState.isDown('KeyD') || inputState.isDown('ArrowRight')) steer = 1;
        brake = inputState.isDown('KeyS') && this.speed > 0.5;
        handbrake = inputState.isDown('Space');
      }

      // Longitudinal forces.
      if (throttle > 0) this.speed += this.accel * throttle * safeDt;
      else if (throttle < 0) {
        if (this.speed > 0.5) this.speed -= CONFIG.vehicle.brake * safeDt; // braking first
        else this.speed += CONFIG.vehicle.reverseAccel * throttle * safeDt; // then reverse
      }
      if (brake && this.speed > 0) this.speed -= CONFIG.vehicle.brake * safeDt;
      // Drag + rolling resistance.
      this.speed -= this.speed * CONFIG.vehicle.drag * safeDt;
      if (throttle === 0) this.speed -= Math.sign(this.speed) * CONFIG.vehicle.rollingDrag * safeDt;
      if (Math.abs(this.speed) < 0.08 && throttle === 0) this.speed = 0;
      this.speed = Math.max(-CONFIG.vehicle.maxReverseSpeed, Math.min(this.topSpeed, this.speed));

      // Steering authority falls with speed; handbrake loosens the rear.
      const speedRatio = Math.min(1, Math.abs(this.speed) / this.topSpeed);
      const steerAuthority = CONFIG.vehicle.steerAngle
        * (1 - speedRatio * (1 - CONFIG.vehicle.steerSpeedScale));
      const grip = handbrake ? CONFIG.vehicle.handbrakeGripLoss : 1;
      this.heading += steer * steerAuthority * Math.sign(this.speed) * grip * safeDt * (2.2 - speedRatio);
      if (handbrake) this.speed *= (1 - 0.9 * safeDt);

      // Round-3 polish: brake lights flare while braking, and a hard
      // handbrake turn at speed counts as a skid (main.js plays the
      // screech from the `skidding` flag).
      this.braking = brake || (throttle < 0 && this.speed > 0.5);
      if (this.tailMat) this.tailMat.emissiveIntensity = this.braking ? 2.6 : 0.7;
      // Round-4: the tail glow sprites flare with the brake lights.
      if (this.tailGlows) {
        const glowCfg = CONFIG.round4?.vehicle || {};
        const glow = this.braking ? (glowCfg.tailGlowBrake ?? 0.95) : (glowCfg.tailGlowIdle ?? 0.45);
        for (const g of this.tailGlows) g.opacity = glow;
      }
      this.skidding = Boolean(handbrake && steer !== 0
        && Math.abs(this.speed) > (CONFIG.drivingFeel?.skidSpeed ?? 18));

      const nx = this.position.x + Math.sin(this.heading) * this.speed * safeDt;
      const nz = this.position.z + Math.cos(this.heading) * this.speed * safeDt;

      // Building collision: stop dead on impact (simple arcade response).
      if (world && typeof world.collidesCircle === 'function') {
        if (!world.collidesCircle(nx, nz, CONFIG.vehicle.radius)) {
          this.position.x = nx;
          this.position.z = nz;
        } else {
          this.speed *= -0.15;
        }
        if (world.clampToCity) {
          const c = world.clampToCity(this.position.x, this.position.z, 3);
          this.position.x = c.x;
          this.position.z = c.z;
        }
      } else {
        this.position.x = nx;
        this.position.z = nz;
      }

      group.rotation.y = this.heading;
      // Spin the wheels with travel.
      const spin = (this.speed * safeDt) / Math.max(shape.wheels, 0.01);
      for (const wheel of wheels) wheel.rotation.x += spin;
      // Front wheels visually steer.
      wheels[0].rotation.y = steer * 0.3;
      wheels[1].rotation.y = steer * 0.3;
    },

    // Speed in km/h, for the HUD.
    get speedKmh() {
      return Math.abs(this.speed) * 3.6;
    },
  };

  group.rotation.y = car.heading;
  return car;
}

// Police light bar: a red + blue emissive bar on the roof plus white side
// stripes. Attached by the caller (main.js / police wiring) via
// attachPoliceLightBar, NOT by createCar, so ordinary traffic cars stay
// unmarked. Idempotent: calling it twice on the same car returns the
// existing bar. Returns the lightBar record, or null for a car with no
// 3D group (e.g. a stand-in police car).
export function attachPoliceLightBar(car) {
  if (!car || !car.group) return null;
  if (car.lightBar) return car.lightBar;
  // The mesh was built from the Lane A model shape; the display name on
  // car.model (e.g. 'Solmar Police Interceptor') is not a shape key, so
  // fall back to the sedan shape, which is what the interceptor uses.
  const shape = MODEL_SHAPES[car.model] || MODEL_SHAPES.sedan;
  const L = shape.length;
  const W = shape.width;
  // Round-5: same planted-stance bodyY as buildCarMesh, so the bar sits
  // on the actual roof (0.05–0.10 lower than the old formula would put it).
  const bodyY = shape.wheels * 2 + shape.bodyH / 2 - (shape.stance || 0);
  const roofY = bodyY + shape.bodyH / 2 + shape.cabinH - 0.04;
  // Round-8: the bar seats on the sculpted roofline — on top of the
  // curved roof crown when the car has one (sedan interceptor: crownH
  // 0.15), not on the flat roof the round-5 formula assumed. The crown
  // lift comes from car.sculpt so the bar can never float above or sink
  // into the crown; police.js seatPoliceLightBar() re-asserts the same
  // seats every frame until the bar exists.
  const crownLift = (car.sculpt && car.sculpt.roofCrown) ? (car.sculpt.crownH || 0.15) : 0;
  const barY = roofY + crownLift;
  const matBase = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
  const matStripe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  // Round-5 dusk: the bar lamps run brighter so they read against the
  // sunset (on 3.6 / off 0.4, up from 2.2 / 0.15), with a red/blue glow
  // sprite over each lamp that flashes with the phase.
  const matRed = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff2222, emissiveIntensity: 3.6 });
  const matBlue = new THREE.MeshStandardMaterial({ color: 0x0033cc, emissive: 0x2244ff, emissiveIntensity: 0.4 });

  function add(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    car.group.add(mesh);
    return mesh;
  }

  // Bar base + one red (driver side) and one blue (passenger side) lamp.
  // Round-8: every piece sits on barY (roof + crown lift) instead of
  // the flat roofY, and the meshes are kept on the lightBar record so
  // police.js can re-seat them on the roofline.
  const barBase = add(matBase, 0.95, 0.08, 0.42, 0, barY + 0.02, shape.cabinZ);
  const redLamp = add(matRed, 0.42, 0.13, 0.32, -0.25, barY + 0.1, shape.cabinZ);
  const blueLamp = add(matBlue, 0.42, 0.13, 0.32, 0.25, barY + 0.1, shape.cabinZ);
  // Round-5: glow sprites over the lamps (phase 0: red on, blue dim).
  const glow = glowTextures();
  function barGlow(tex, x, opacity) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, barY + 0.14, shape.cabinZ);
    sprite.scale.setScalar(1.1);
    car.group.add(sprite);
    return sprite;
  }
  const redGlowSprite = barGlow(glow.tailGlowTex, -0.25, 0.9);
  const blueGlowSprite = barGlow(glow.blueGlowTex, 0.25, 0.12);
  // White side stripes along the body.
  add(matStripe, 0.03, 0.14, L * 0.55, -W / 2 - 0.01, bodyY + 0.02, 0);
  add(matStripe, 0.03, 0.14, L * 0.55, W / 2 + 0.01, bodyY + 0.02, 0);

  car.lightBar = {
    red: matRed, blue: matBlue,
    redGlow: redGlowSprite.material, blueGlow: blueGlowSprite.material,
    redGlowSprite, blueGlowSprite,
    // Round-8: the bar meshes + the roofline they seat on, so police.js
    // seatPoliceLightBar() can re-seat the bar on the crowned roof.
    base: barBase, redLamp, blueLamp,
    roofY, crownLift, barY, cabinZ: shape.cabinZ,
  };
  return car.lightBar;
}

// Set the police light-bar flash phase. Phase 0: red bright / blue dim;
// phase 1: red dim / blue bright. Safe no-op on a car with no light bar.
// Round-5 dusk levels: bright 3.6 / dim 0.4 (was 2.2 / 0.15), and the
// bar glow sprites flash with the lamps when the car has them.
export function setPoliceLightPhase(car, phase) {
  if (!car || !car.lightBar) return;
  const blueOn = phase === 1;
  car.lightBar.red.emissiveIntensity = blueOn ? 0.4 : 3.6;
  car.lightBar.blue.emissiveIntensity = blueOn ? 3.6 : 0.4;
  if (car.lightBar.redGlow) car.lightBar.redGlow.opacity = blueOn ? 0.12 : 0.9;
  if (car.lightBar.blueGlow) car.lightBar.blueGlow.opacity = blueOn ? 0.9 : 0.12;
}

// Nearest car to `point` ({x, z} or THREE.Vector3) within `maxDistance`.
// Returns the car, or null. `cars` is an array of car objects.
export function findNearestCar(cars, point, maxDistance) {
  const max = maxDistance === undefined ? CONFIG.player.enterCarDistance : maxDistance;
  let best = null;
  let bestD = max;
  for (const car of cars || []) {
    if (!car || !car.position) continue;
    const dx = car.position.x - point.x;
    const dz = car.position.z - point.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export default createCar;
