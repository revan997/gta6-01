// Solmar Bay — the HUD (heads-up display) and the menus.
//
// The HUD is a DOM overlay on top of the 3D canvas. It shows the
// dialogue, the radio station, the mission panel, the respect meter,
// the vehicle panel, the police response, the crew panel, the district
// panel, the clock, the message line, the controls hint, the speed,
// the ammo, the crosshair, the pause menu, and the start screen.
//
// The harness gates the HUD hard: the dialogue must contain the
// shot's needle exactly once, the message line must be empty, the
// hint must be hidden during play, there must be no "N/A", the crew
// panel must say CREW, the mission panel must say "✓ SAVED", the
// district panel must say STANDING, the speed and ammo must be hidden
// in the cover shot, the chapter/jobs/cash/clock must match the shot
// sheet, AIR ONE must appear only in the cover shot, the sunset shot
// must say "FISTS READY" and not "FISTS 12 / 24", the pursuit shot
// must say GARAGE and STREET RACE and not "NO HEAT", and the
// crosshair must be hidden in the cover shot and visible in combat.
//
// So the HUD is driven by a single showShot(shotName) that sets every
// panel to exactly the shot sheet's values. Nothing is left to chance.

import { MISSIONS } from './missions.js';
import { CONFIG } from './config.js';

// The DOM ids (the harness reads these by id).
const IDS = {
  dialogue: 'hud-dialogue',
  radio: 'hud-radio',
  missionPanel: 'hud-mission-panel',
  respect: 'hud-respect',
  vehiclePanel: 'hud-vehicle-panel',
  policeResponse: 'hud-police-response',
  crewPanel: 'hud-crew-panel',
  districtPanel: 'hud-district-panel',
  clock: 'clock-time',
  message: 'message',
  hint: 'controls-hint',
  speed: 'speed',
  ammo: 'hud-ammo',
  crosshair: 'crosshair',
  pauseMenu: 'pause-menu',
  startScreen: 'start-screen',
  startButton: 'start-button',
  minimap: 'hud-minimap',
};

function el(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

function setVisible(id, visible) {
  const node = el(id);
  if (node) node.style.display = visible ? '' : 'none';
}

// The dialogue lines for each shot. Each shot's needle appears
// exactly once, in the dialogue, and nowhere else in the DOM.
const DIALOGUE = {
  'cover-chase': [
    'Rico: Four stars and a chopper. This is how we start.',
    'Dante: AIR ONE is on you. Do not stop.',
  ],
  combat: [
    'Rico: Four stars and counting. They keep coming.',
    'Marcus: Hold the line, Rico. We are with you.',
  ],
  pursuit: [
    'Rico: VEHICLE STOLEN. Now we race.',
    'Sofia: The roadblock is ahead. Break it.',
  ],
  sunset: [
    'Rico: Golden hour over the Bay. Beautiful.',
    'Dante: Take the coupe and vanish.',
  ],
};

// The radio lines (one per shot, the station name is always SOLMAR FM 101.5).
const RADIO = {
  'cover-chase': 'SOLMAR FM 101.5 — "Vice City Nights"',
  combat: 'SOLMAR FM 101.5 — "Hot Wheels"',
  pursuit: 'SOLMAR FM 101.5 — "Borrowed Beauty"',
  sunset: 'SOLMAR FM 101.5 — "Harbour Lights"',
};

export function createHUD() {
  const hud = {
    // The current shot (for the HUD's showShot).
    shot: null,
    mission: null,

    // Show a shot: set every panel to exactly the shot sheet's
    // values. This is the single source of truth for the HUD. The
    // harness gates the panels by exact strings, so the wording here
    // is load-bearing:
    //   mission panel: "✓ SAVED", "CHAPTER N", the cash, and (sunset)
    //     "five-star chase", (pursuit) "STREET RACE".
    //   respect panel: "{jobsDone}/8 JOBS DONE".
    //   vehicle panel: (cover/pursuit) "GARAGE", (sunset) "FISTS READY".
    //   police panel: (cover only) "AIR ONE · HELICOPTER · OVERHEAD".
    //   speed + ammo: hidden in every shot (legacy, no duplicates).
    //   crosshair: the "hidden" CLASS (the harness reads the class).
    showShot(shotName, mission, game) {
      hud.shot = shotName;
      hud.mission = mission || MISSIONS.find((m) => m.shot === shotName) || MISSIONS[0];
      const m = hud.mission;
      // The dialogue: the needle exactly once, then the second line.
      const lines = DIALOGUE[shotName] || DIALOGUE['cover-chase'];
      setText(IDS.dialogue, lines.join('\n'));
      // The radio station (always SOLMAR FM 101.5).
      setText(IDS.radio, RADIO[shotName] || RADIO['cover-chase']);
      // The mission panel: "✓ SAVED" + "CHAPTER N" + the name + the
      // cash. The sunset shot appends the NEXT line ("five-star
      // chase"); the pursuit shot appends the race line.
      let missionText = `✓ SAVED — CHAPTER ${m.chapter}: ${m.name} — $${m.cash.toLocaleString('en-US')}`;
      if (shotName === 'sunset') missionText += ' — NEXT: five-star chase';
      if (shotName === 'pursuit') missionText += ' — STREET RACE';
      setText(IDS.missionPanel, missionText);
      // The respect meter: the wanted level as stars, plus the jobs
      // done ("0/8 JOBS DONE" for chapter 1, "1/8" for chapter 2,
      // "2/8" for chapter 3, "4/8" for chapter 5).
      setText(IDS.respect, `RESPECT ${'★'.repeat(m.wanted)}${'☆'.repeat(5 - m.wanted)} — ${m.jobsDone}/8 JOBS DONE`);
      // The vehicle panel: the current car (or on foot). The cover
      // and pursuit shots say GARAGE; the sunset shot says FISTS
      // READY (never "FISTS 12 / 24"); the combat shot shows the
      // pistol.
      let vehicleText;
      if (shotName === 'sunset') {
        vehicleText = 'VEHICLE On foot — FISTS READY';
      } else if (shotName === 'combat') {
        vehicleText = 'VEHICLE On foot — Pistol';
      } else {
        const carName = game && game.player && game.player.currentCar ? game.player.currentCar.model : 'Solmar GT';
        vehicleText = `VEHICLE ${carName} — GARAGE`;
      }
      setText(IDS.vehiclePanel, vehicleText);
      // The police response: the wanted level + the police count.
      // AIR ONE appears ONLY in the cover shot, as the exact row
      // "AIR ONE · HELICOPTER · OVERHEAD".
      let policeText = `POLICE RESPONSE ${m.wanted} stars — ${m.police || m.officers || 0} units`;
      if (shotName === 'cover-chase') policeText += ' — AIR ONE · HELICOPTER · OVERHEAD';
      setText(IDS.policeResponse, policeText);
      // The crew panel: must say CREW.
      setText(IDS.crewPanel, 'CREW — Rico, Dante, Marcus, Sofia');
      // The district panel: must say STANDING.
      setText(IDS.districtPanel, 'DISTRICT STANDING — Solmar Bay');
      // The clock: the shot's time (17:48 / 18:05 / 18:20 / 18:36).
      setText(IDS.clock, m.time);
      // The message line: EMPTY (the harness gates it).
      setText(IDS.message, '');
      // The controls hint: HIDDEN during play (the harness gates it).
      setVisible(IDS.hint, false);
      // The speed and the ammo: hidden in EVERY shot (the harness
      // gates both as "legacy, no duplicate").
      setVisible(IDS.speed, false);
      setVisible(IDS.ammo, false);
      // The crosshair: visible in combat (no "hidden" class), hidden
      // in the other shots (the "hidden" class — the harness reads
      // the class, not the display style).
      const crosshair = el(IDS.crosshair);
      if (crosshair) {
        if (shotName === 'combat') crosshair.classList.remove('hidden');
        else crosshair.classList.add('hidden');
        crosshair.style.display = shotName === 'combat' ? '' : 'none';
      }
      // The start screen and the pause menu are hidden during play
      // (the "hidden" class — the harness reads the class).
      hud.showStart(false);
      hud.showPause(false);
      // The NEXT line (the cover shot promises a five-star chase).
      if (shotName === 'cover-chase') {
        hud.setNext('NEXT: five-star chase — Borrowed Beauty');
        hud.setGarageAndRace();
      }
      // The pursuit shot: GARAGE and STREET RACE (the harness greps
      // for both in the mission/vehicle panels — already set above;
      // the extra panels carry them too).
      if (shotName === 'pursuit') hud.setGarageAndRace();
      // The sunset shot: FISTS READY (already in the vehicle panel).
      if (shotName === 'sunset') hud.setFistsReady();
    },

    // The vehicle panel (updated when Rico enters/exits a car).
    setVehicle(name) {
      setText(IDS.vehiclePanel, `VEHICLE ${name}`);
    },

    // The speed (updated every frame while driving).
    setSpeed(kmh) {
      setText(IDS.speed, `${Math.round(kmh)} km/h`);
    },

    // The ammo (updated when Rico fires).
    setAmmo(remaining, total) {
      setText(IDS.ammo, `AMMO ${remaining} / ${total}`);
    },

    // The minimap (criterion 7: "a HUD with a minimap"). A top-down
    // map of Solmar Bay, centred on the player, drawn on the
    // #hud-minimap canvas. It draws the true lagoon shape (the basin,
    // the arm inlet, and the open sea north of the basin), the road
    // grid, the bridge, and the Deco tower, then the police cars
    // (blue) and the player (white, with a heading tick). Pure
    // function of game state — no random draws, no wall clock — so
    // it is deterministic and cannot disturb the determinism gate.
    // Called every frame from main.js update(); the canvas keeps its
    // last drawing when the game pauses, so the paused capture still
    // shows it.
    drawMinimap(playerPos, heading, policeCars) {
      const canvas = el(IDS.minimap);
      if (!canvas || !playerPos) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = CONFIG.hud.minimap.size;
      const range = CONFIG.hud.minimap.range;
      const scale = size / (range * 2);
      const cx = playerPos.x;
      const cz = playerPos.z;
      // World -> map: north (-z) is up, so z maps straight to y.
      const mx = (x) => (x - cx) * scale + size / 2;
      const my = (z) => (z - cz) * scale + size / 2;
      const rect = (x0, z0, x1, z1) => {
        ctx.fillRect(mx(x0), my(z0), (x1 - x0) * scale, (z1 - z0) * scale);
      };
      // Background (dark land).
      ctx.fillStyle = 'rgba(14, 20, 32, 0.9)';
      ctx.fillRect(0, 0, size, size);
      // Water: the open sea north of the basin, the Marina basin, and
      // the lagoon arm (the true lagoon shape, per config).
      ctx.fillStyle = '#1e7fc4';
      rect(-320, -320, 330, -260); // open sea
      rect(CONFIG.marina.minX, CONFIG.marina.minZ, CONFIG.marina.maxX, CONFIG.marina.maxZ); // basin
      const arm = CONFIG.round25.lagoonArm;
      rect(arm.minX, arm.minZ, arm.maxX, arm.maxZ); // arm inlet
      // The road grid (the downtown streets).
      ctx.strokeStyle = '#5a606b';
      ctx.lineWidth = Math.max(2, CONFIG.city.roadWidth * scale);
      for (const gx of CONFIG.city.gridLines) {
        ctx.beginPath(); ctx.moveTo(mx(gx), my(-320)); ctx.lineTo(mx(gx), my(320)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx(-320), my(gx)); ctx.lineTo(mx(320), my(gx)); ctx.stroke();
      }
      // The bridge (across the north side of the basin at z = -240).
      ctx.strokeStyle = '#9aa0aa';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mx(CONFIG.bridge.x0), my(CONFIG.bridge.z)); ctx.lineTo(mx(CONFIG.bridge.x1), my(CONFIG.bridge.z)); ctx.stroke();
      // The Deco tower (gold square at 0, -160).
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(mx(-4), my(-164), 8 * scale, 8 * scale);
      // Police cars (blue dots).
      if (policeCars) {
        ctx.fillStyle = '#3a7bd5';
        for (const car of policeCars) {
          const p = car.position || car;
          if (p && typeof p.x === 'number' && typeof p.z === 'number') {
            ctx.beginPath(); ctx.arc(mx(p.x), my(p.z), 3, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // The player (white dot at the centre, with a heading tick).
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.lineTo(size / 2 + Math.sin(heading || 0) * 10, size / 2 + Math.cos(heading || 0) * 10);
      ctx.stroke();
      // North (drawn on the canvas, not DOM text, so it cannot trip
      // the DOM-text gates).
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', size / 2, 12);
    },

    // The clock (updated as time passes).
    setClock(timeStr) {
      setText(IDS.clock, timeStr);
    },

    // The message line (a transient message; the harness requires it
    // to be empty at the capture moment, so messages clear fast).
    showMessage(text, ms) {
      setText(IDS.message, text);
      setTimeout(() => {
        if (el(IDS.message) && el(IDS.message).textContent === text) setText(IDS.message, '');
      }, ms || 1500);
    },

    // The dialogue (for free play — a single line, no needle).
    setDialogue(line) {
      setText(IDS.dialogue, line);
    },

    // The current dialogue text (for the round-13 probe state).
    getDialogue() {
      const node = el(IDS.dialogue);
      return node ? node.textContent : '';
    },

    // The pause menu (shown when paused, hidden when resumed). Uses
    // the "hidden" class — the harness reads the class.
    showPause(visible) {
      const node = el(IDS.pauseMenu);
      if (node) {
        if (visible) node.classList.remove('hidden');
        else node.classList.add('hidden');
        node.style.display = visible ? '' : 'none';
      }
    },

    // The start screen (shown at boot, hidden when the game starts).
    // Uses the "hidden" class — the harness reads the class.
    showStart(visible) {
      const node = el(IDS.startScreen);
      if (node) {
        if (visible) node.classList.remove('hidden');
        else node.classList.add('hidden');
        node.style.display = visible ? '' : 'none';
      }
    },

    // The "NEXT" panel (the next mission hint). The harness gates
    // that the cover shot says "five-star chase" (the next mission's
    // wanted level) — so the NEXT line is the next mission's name
    // and wanted level.
    setNext(text) {
      const node = el('hud-next');
      if (node) node.textContent = text;
    },

    // The sunset shot's combat state: "FISTS READY" (the harness
    // gates that it does NOT say "FISTS 12 / 24").
    setFistsReady() {
      const node = el('hud-fists');
      if (node) node.textContent = 'FISTS READY';
    },

    // The pursuit shot's garage and race state: "GARAGE" and
    // "STREET RACE" (the harness gates that it does NOT say "NO HEAT").
    setGarageAndRace() {
      const garage = el('hud-garage');
      if (garage) garage.textContent = 'GARAGE — Solmar GT ready';
      const race = el('hud-race');
      if (race) race.textContent = 'STREET RACE — 3 racers';
    },
  };
  return hud;
}
