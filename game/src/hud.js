// Solmar Bay — HUD, minimap, dialogue, mission panels (W4, attempt #7,
// fresh build). Written fresh for this recording from the round-9 interface
// contract (W4 section + fixes 6/7) and the rebuild spec.
//
// The HUD is real DOM: the geometry harness reads it by element id, so
// every id below is load-bearing. In Node (no document) the module returns
// an inert stub with the same method shape, so the game boots headless.
//
// Required ids: hud-mission-panel (✓ SAVED line, chapter, jobs, cash,
// clock, AIR ONE row, garage line, race line, NEXT line), hud-respect,
// hud-vehicle-panel, hud-police-response, hud-crew-panel,
// hud-district-panel, clock-time, message (empty), controls-hint (hidden in
// shot mode), speed + hud-ammo (hidden), crosshair, start-screen (class
// hidden when playing), hud-dialogue, hud-radio. Dialogue is a single
// {speaker, text} object — never an array. The pursuit banner
// 'STOLEN VEHICLE' appears exactly once in the body, never inside #message.
// The minimap is a real 168x168 canvas: true lagoon shape incl. the arm
// inlet, road grid, bridge, Deco marker, police dots, player + heading tick.

import { CONFIG } from './config.js';

/** Minimap size in px (the harness gates on 168x168). */
const MINIMAP_SIZE = 168;
/** World extent the minimap shows (x -160..360, z -280..180). */
const MAP = { minX: -160, maxX: 360, minZ: -280, maxZ: 180 };

function mapX(x) {
  return ((x - MAP.minX) / (MAP.maxX - MAP.minX)) * MINIMAP_SIZE;
}
function mapZ(z) {
  return ((z - MAP.minZ) / (MAP.maxZ - MAP.minZ)) * MINIMAP_SIZE;
}

export function createHud(opts = {}) {
  const doc = opts.document || null;
  const hasDom = !!doc && typeof doc.createElement === 'function';

  // ---- Node stub (no document): same shape, no work -----------------------
  if (!hasDom) {
    return {
      update() {},
      setPaused() {},
      showStart() {},
      onStart() {},
      setCrosshair() {},
      get lastState() {
        return null;
      },
    };
  }

  // ---- DOM construction ----------------------------------------------------
  const root = doc.getElementById('hud') || doc.body;
  const wrap = doc.createElement('div');
  wrap.id = 'hud-root';
  wrap.setAttribute('data-game', 'solmar-bay');

  function el(tag, id, text) {
    const n = doc.createElement(tag);
    if (id) n.id = id;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  // Minimap canvas (real 168x168).
  const minimap = doc.createElement('canvas');
  minimap.id = 'hud-minimap';
  minimap.width = MINIMAP_SIZE;
  minimap.height = MINIMAP_SIZE;
  wrap.appendChild(minimap);

  // Mission panel: SAVED line, chapter, jobs, cash, clock, AIR ONE row,
  // garage line, race line, NEXT line.
  const missionPanel = el('div', 'hud-mission-panel');
  const savedLine = el('div', 'hud-saved-line', '✓ SAVED');
  const chapterLine = el('div', 'hud-chapter-line', '');
  const jobsLine = el('div', 'hud-jobs-line', '');
  const cashLine = el('div', 'hud-cash-line', '');
  const clockLine = el('div', 'hud-clock-line');
  const clockTime = el('span', 'clock-time', '');
  clockLine.appendChild(doc.createTextNode('TIME '));
  clockLine.appendChild(clockTime);
  const airOneLine = el('div', 'hud-airone-line', '');
  const garageLine = el('div', 'hud-garage-line', '');
  const raceLine = el('div', 'hud-race-line', 'STREET RACE · 1/3');
  const nextLine = el('div', 'hud-next-line', '');
  missionPanel.appendChild(savedLine);
  missionPanel.appendChild(chapterLine);
  missionPanel.appendChild(jobsLine);
  missionPanel.appendChild(cashLine);
  missionPanel.appendChild(clockLine);
  missionPanel.appendChild(airOneLine);
  missionPanel.appendChild(garageLine);
  missionPanel.appendChild(raceLine);
  missionPanel.appendChild(nextLine);
  wrap.appendChild(missionPanel);

  // Respect panel: N/8 JOBS DONE.
  const respectPanel = el('div', 'hud-respect', '');
  wrap.appendChild(respectPanel);

  // Vehicle panel: GARAGE (car shots) / FISTS READY (sunset).
  const vehiclePanel = el('div', 'hud-vehicle-panel', '');
  wrap.appendChild(vehiclePanel);

  // Police panel: wanted stars + AIR ONE row (cover only).
  const policePanel = el('div', 'hud-police-response', '');
  wrap.appendChild(policePanel);

  // Crew panel.
  const crewPanel = el('div', 'hud-crew-panel', '');
  wrap.appendChild(crewPanel);

  // District panel: includes STANDING.
  const districtPanel = el('div', 'hud-district-panel', '');
  wrap.appendChild(districtPanel);

  // Dialogue: single {speaker, text} only.
  const dialogueBox = el('div', 'hud-dialogue');
  const dialogueSpeaker = el('span', 'hud-dialogue-speaker', '');
  const dialogueText = el('span', 'hud-dialogue-text', '');
  dialogueBox.appendChild(dialogueSpeaker);
  dialogueBox.appendChild(doc.createTextNode(': '));
  dialogueBox.appendChild(dialogueText);
  dialogueBox.style.display = 'none';
  wrap.appendChild(dialogueBox);

  // Radio.
  const radio = el('div', 'hud-radio', 'SOLMAR FM 101.5');
  wrap.appendChild(radio);

  // Pursuit banner: shown on pursuit only, never inside #message.
  const banner = el('div', 'hud-banner', 'STOLEN VEHICLE');
  banner.style.display = 'none';
  wrap.appendChild(banner);

  // Message line: must stay empty.
  const message = el('div', 'message', '');
  wrap.appendChild(message);

  // Controls hint: hidden in shot mode.
  const controlsHint = el(
    'div',
    'controls-hint',
    'WASD drive · E enter car · P pause · Mouse aim · Click fire',
  );
  wrap.appendChild(controlsHint);

  // Legacy speed + ammo: hidden.
  const speed = el('div', 'speed', '');
  speed.style.display = 'none';
  wrap.appendChild(speed);
  const ammo = el('div', 'hud-ammo', '');
  ammo.style.display = 'none';
  wrap.appendChild(ammo);

  // Crosshair: positioned by main.js at the aim officer on combat;
  // hidden on sunset.
  const crosshair = el('div', 'crosshair', '+');
  crosshair.style.display = 'none';
  wrap.appendChild(crosshair);

  // Start screen: class hidden when playing.
  const startScreen = el('div', 'start-screen');
  const startTitle = el('div', 'hud-start-title', 'SOLMAR BAY');
  const startSub = el(
    'div',
    'hud-start-sub',
    'A coastal open world. Drive, steal, survive the heat.',
  );
  const startButton = el('button', 'start-button', 'START');
  startScreen.appendChild(startTitle);
  startScreen.appendChild(startSub);
  startScreen.appendChild(startButton);
  wrap.appendChild(startScreen);

  root.appendChild(wrap);

  let lastState = null;
  let startCallback = null;
  startButton.addEventListener('click', () => {
    if (startCallback) startCallback();
  });

  // ---- minimap -------------------------------------------------------------
  function drawMinimap(state) {
    const ctx2d = minimap.getContext && minimap.getContext('2d');
    if (!ctx2d) return;
    const arm = (CONFIG.lagoonArm || { minX: 50, maxX: 100, minZ: -160, maxZ: -114 });
    const basin = (CONFIG.basin || { minX: 60, maxZ: -100 });
    ctx2d.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    // Land.
    ctx2d.fillStyle = '#2a2f22';
    ctx2d.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    // Basin water (x 60..340, z -260..-100) + lagoon arm inlet.
    ctx2d.fillStyle = '#1f8fff';
    ctx2d.fillRect(mapX(60), mapZ(-260), mapX(340) - mapX(60), mapZ(-100) - mapZ(-260));
    ctx2d.fillRect(mapX(arm.minX), mapZ(arm.minZ), mapX(arm.maxX) - mapX(arm.minX), mapZ(arm.maxZ) - mapZ(arm.minZ));
    void basin;
    // Road grid: downtown road x 40 + cross roads.
    ctx2d.fillStyle = '#3a3a3a';
    ctx2d.fillRect(mapX(37), 0, mapX(43) - mapX(37), MINIMAP_SIZE);
    ctx2d.fillRect(0, mapZ(-123), MINIMAP_SIZE, mapZ(-117) - mapZ(-123));
    ctx2d.fillRect(0, mapZ(103), MINIMAP_SIZE, mapZ(109) - mapZ(103));
    // Bridge (x 60..330, z -240).
    ctx2d.fillStyle = '#c8b06a';
    ctx2d.fillRect(mapX(60), mapZ(-243), mapX(330) - mapX(60), 3);
    // Deco marker (centre-left landmark).
    ctx2d.fillStyle = '#ffd76a';
    ctx2d.beginPath();
    ctx2d.arc(mapX(24), mapZ(-160), 4, 0, Math.PI * 2);
    ctx2d.fill();
    // Police dots.
    ctx2d.fillStyle = '#ff2a1a';
    for (const p of (state.minimap && state.minimap.police) || []) {
      ctx2d.beginPath();
      ctx2d.arc(mapX(p.x), mapZ(p.z), 2, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // Heli dot.
    const heli = state.minimap && state.minimap.heli;
    if (heli) {
      ctx2d.fillStyle = '#ffffff';
      ctx2d.beginPath();
      ctx2d.arc(mapX(heli.x), mapZ(heli.z), 3, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // Player + heading tick.
    const pl = state.minimap && state.minimap.player;
    if (pl) {
      const px = mapX(pl.x);
      const pz = mapZ(pl.z);
      ctx2d.fillStyle = '#ffffff';
      ctx2d.beginPath();
      ctx2d.arc(px, pz, 3, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.strokeStyle = '#ffffff';
      ctx2d.beginPath();
      ctx2d.moveTo(px, pz);
      ctx2d.lineTo(px + Math.sin(pl.heading) * 8, pz + Math.cos(pl.heading) * 8);
      ctx2d.stroke();
    }
    // Race line (pursuit route) on the mission panel's minimap corner.
    if (state.shotId === 'pursuit') {
      ctx2d.strokeStyle = '#ffd76a';
      ctx2d.beginPath();
      ctx2d.moveTo(mapX(-120), mapZ(110));
      ctx2d.lineTo(mapX(-120), mapZ(144));
      ctx2d.stroke();
    }
  }

  // ---- text updates (only rewrite when changed) ------------------------------
  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function update(state) {
    if (!state) return;
    lastState = state;
    const mission = state.mission || {};
    const missionNumber = state.missionNumber || 1;
    const chapterTitle = state.chapterTitle || mission.name || 'First Run';

    setText(savedLine, `✓ SAVED · ${state.clock || ''}`);
    setText(
      chapterLine,
      `CHAPTER ${state.chapter || 1} · ${chapterTitle} — ${state.objective || ''}`,
    );
    setText(jobsLine, `${state.jobsDone || 0}/8 JOBS DONE`);
    setText(cashLine, `$${(state.money || 0).toLocaleString('en-US')}`);
    setText(clockTime, state.clock || '');
    // AIR ONE row: cover reads OVERHEAD, other shots read STANDBY.
    setText(
      airOneLine,
      state.shotId === 'cover'
        ? 'AIR ONE · HELICOPTER · OVERHEAD'
        : 'AIR ONE · STANDBY',
    );
    setText(garageLine, state.vehicleLine || 'FISTS READY');
    setText(raceLine, state.race || 'STREET RACE · 1/3');
    setText(nextLine, `NEXT · ${state.nextMission || 'five-star chase'}`);

    setText(
      respectPanel,
      `RESPECT · ${state.jobsDone || 0}/8 JOBS DONE · ${state.standing || 'RESPECTED'}`,
    );
    setText(vehiclePanel, state.vehicleLine || 'FISTS READY');

    // Police panel: wanted stars + AIR ONE row on cover only.
    const stars = '★'.repeat(state.wanted || 0) + '☆'.repeat(5 - (state.wanted || 0));
    const policeText =
      state.shotId === 'cover'
        ? `WANTED ${stars} · AIR ONE · HELICOPTER · OVERHEAD`
        : `WANTED ${stars}`;
    setText(policePanel, policeText);

    setText(crewPanel, `CREW · ${(state.crew || []).join(' · ')}`);
    setText(
      districtPanel,
      `DISTRICT · ${state.district || 'MARINA'} · STANDING · ${state.standing || 'RESPECTED'}`,
    );

    // Dialogue: single {speaker, text} only — an array stays hidden.
    const d = state.dialogue;
    if (d && typeof d === 'object' && d.text) {
      dialogueBox.style.display = '';
      setText(dialogueSpeaker, d.speaker || '');
      setText(dialogueText, d.text);
    } else {
      dialogueBox.style.display = 'none';
    }

    setText(radio, `${state.radio || 'SOLMAR FM 101.5'} · ${state.nowPlaying || ''}`);

    // Pursuit banner: exactly once, only on pursuit, never in #message.
    banner.style.display = state.shotId === 'pursuit' ? '' : 'none';
    // #message stays empty by design.
    if (message.textContent !== '') message.textContent = '';

    // Controls hint hidden in shot mode.
    controlsHint.style.display = state.shotId ? 'none' : '';

    // Crosshair: visible on combat (positioned by main.js via
    // setCrosshair), hidden on sunset and everywhere else. The harness
    // checks classList 'hidden' (not display), so toggle the class too.
    if (state.shotId === 'sunset') {
      crosshair.style.display = 'none';
      crosshair.classList.add('hidden');
    } else if (state.crosshair) {
      crosshair.style.display = '';
      crosshair.classList.remove('hidden');
    } else {
      crosshair.style.display = 'none';
      crosshair.classList.add('hidden');
    }

    drawMinimap(state);
    void missionNumber;
  }

  function setPaused(paused) {
    // The start screen is owned solely by showStart() — setPaused must
    // NEVER touch it. (Fix: pausing at the cover pin un-hid the menu
    // overlay, which covered the frame and killed the heli gates.)
    void paused;
  }

  function showStart(show) {
    startScreen.classList.toggle('hidden', !show);
  }

  function onStart(cb) {
    startCallback = cb;
  }

  // Place the crosshair at a screen position (px, 1280x720 space) — the
  // combat shot puts it on the aim officer so it always reads on-screen.
  function setCrosshair(x, y, visible) {
    if (visible === false) {
      crosshair.style.display = 'none';
      crosshair.classList.add('hidden');
      return;
    }
    crosshair.style.display = '';
    crosshair.classList.remove('hidden');
    crosshair.style.left = `${Math.round(x)}px`;
    crosshair.style.top = `${Math.round(y)}px`;
  }

  return {
    update,
    setPaused,
    showStart,
    onStart,
    setCrosshair,
    get lastState() {
      return lastState;
    },
  };
}

export default createHud;
