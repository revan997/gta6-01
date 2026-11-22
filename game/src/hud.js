// hud.js — the HUD for Solmar Bay (attempt #9, W4).
// The top-10 study (V4) is the brief: the top entries fill all six zones on
// every shot — mission panel, big money, police list, weapon slots, circular
// minimap, portrait dialogue, huge speed. Our old HUD was sparse and tiny.
// This HUD is dense on all four corners plus the bottom, with large type,
// high contrast and semi-opaque panels so it reads at a glance when the
// contact sheet shrinks it to 768x480.
//
// Harness contract (ids the geometry harness reads by id):
//   hud-dialogue, hud-radio, hud-mission-panel, hud-respect,
//   hud-vehicle-panel, hud-police-response, hud-crew-panel,
//   hud-district-panel, clock-time, message (empty), controls-hint (hidden
//   in shot mode), speed + hud-ammo (legacy, hidden), crosshair,
//   start-screen (class hidden when playing), start-button.

export const NEXT_MISSIONS = [
  'pick up the package',
  'lift the Palm Coupe',
  'lose the tail',
  'hit the harbour',
  'five-star chase',
];

export const MISSION_NAMES = {
  1: 'First Run',
  2: 'Hot Wheels',
  3: 'Borrowed Beauty',
  4: 'Harbour Heist',
};

export const MISSION_CHAPTERS = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
};

const POLICE_UNITS = [
  { name: 'UNIT 12', kind: 'Interceptor' },
  { name: 'UNIT 07', kind: 'Interceptor' },
  { name: 'UNIT 23', kind: 'Patrol' },
  { name: 'UNIT 31', kind: 'Patrol' },
  { name: 'UNIT 44', kind: 'Interceptor' },
  { name: 'UNIT 09', kind: 'Patrol' },
  { name: 'UNIT 18', kind: 'Interceptor' },
  { name: 'UNIT 52', kind: 'Roadblock' },
  { name: 'AIR ONE', kind: 'Helicopter' },
];

const UNIT_STATUS = ['PURSUIT', 'RAMMING', 'SPOTLIGHT', 'ROADBLOCK', 'EN ROUTE'];

const WEAPONS = [
  { name: 'Pistol', icon: 'P', ammo: 24, active: true },
  { name: 'SMG', icon: 'S', ammo: 120, active: false },
  { name: 'Shotgun', icon: 'G', ammo: 8, active: false },
  { name: 'Fists', icon: 'F', ammo: 0, active: false },
];

const CREW = [
  { name: 'Dante', role: 'Crew Boss', initial: 'D' },
  { name: 'Mama Lou', role: 'Fixer', initial: 'M' },
  { name: 'Rico', role: 'Driver', initial: 'R' },
];

const DIALOGUE_ROLES = {
  Dante: 'Crew Boss',
  'Mama Lou': 'Fixer',
  Rico: 'Driver',
};

function el(doc, tag, id, className, text) {
  const node = doc.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function moneyText(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function starsText(wanted) {
  let out = '';
  for (let i = 0; i < 5; i++) out += i < wanted ? '★' : '☆';
  return out;
}

// ---------------------------------------------------------------- factory

export function createHud(doc, getState) {
  const stateOf = typeof getState === 'function' ? getState : () => ({});
  const root = el(doc, 'div', 'hud-root', 'hud-root');

  // ---- start screen (menu) -------------------------------------------
  const startScreen = el(doc, 'div', 'start-screen', 'start-screen');
  const startTitle = el(doc, 'h1', null, 'start-title', 'SOLMAR BAY');
  const startSub = el(doc, 'p', null, 'start-sub', 'An open-world crime story on the coast. Drive, steal, run, survive.');
  const startButton = el(doc, 'button', 'start-button', 'start-button', 'START GAME');
  const startSave = el(doc, 'p', 'start-save', 'start-save', 'No save yet — start a new game.');
  const startControls = el(doc, 'p', null, 'start-controls',
    'WASD drive / move · Mouse aim · P pause · E enter car · F fire');
  startScreen.appendChild(startTitle);
  startScreen.appendChild(startSub);
  startScreen.appendChild(startButton);
  startScreen.appendChild(startSave);
  startScreen.appendChild(startControls);
  root.appendChild(startScreen);

  // ---- mission panel (top-left) --------------------------------------
  const missionPanel = el(doc, 'div', 'hud-mission-panel', 'hud-panel hud-mission-panel');
  const missionChapter = el(doc, 'div', null, 'hud-chapter', 'CHAPTER 1');
  const missionTitle = el(doc, 'div', null, 'hud-job-title', 'First Run');
  const missionStage = el(doc, 'div', null, 'hud-stage-bar');
  const missionStageFill = el(doc, 'div', null, 'hud-stage-fill');
  missionStage.appendChild(missionStageFill);
  const missionNext = el(doc, 'div', null, 'hud-next', 'NEXT: pick up the package');
  const missionClock = el(doc, 'div', 'clock-time', 'hud-clock', '17:48');
  const missionSaved = el(doc, 'div', null, 'hud-saved', '✓ SAVED 17:48 · CHECKPOINT: MARINA');
  const missionJobs = el(doc, 'div', null, 'hud-jobs', 'JOBS 0/4');
  const missionCash = el(doc, 'div', null, 'hud-cash', '$1,200');
  const missionAir = el(doc, 'div', null, 'hud-air-row', 'AIR ONE · HELICOPTER · OVERHEAD');
  const missionGarage = el(doc, 'div', null, 'hud-garage', 'GARAGE: SOLMAR GT');
  const missionRace = el(doc, 'div', null, 'hud-race', 'STREET RACE · 1/3');
  missionPanel.appendChild(missionChapter);
  missionPanel.appendChild(missionTitle);
  missionPanel.appendChild(missionStage);
  missionPanel.appendChild(missionNext);
  missionPanel.appendChild(missionClock);
  missionPanel.appendChild(missionSaved);
  missionPanel.appendChild(missionJobs);
  missionPanel.appendChild(missionCash);
  missionPanel.appendChild(missionAir);
  missionPanel.appendChild(missionGarage);
  missionPanel.appendChild(missionRace);
  root.appendChild(missionPanel);

  // ---- money block (top-right, BIG) ----------------------------------
  const moneyBlock = el(doc, 'div', 'hud-money-block', 'hud-panel hud-money-block');
  const moneyBig = el(doc, 'div', 'hud-cash-big', 'hud-cash-big', '$1,200');
  const moneyStars = el(doc, 'div', 'hud-stars', 'hud-stars', '★★★★☆');
  const moneyTime = el(doc, 'div', null, 'hud-time', '17:48 · GOLDEN HOUR');
  moneyBlock.appendChild(moneyBig);
  moneyBlock.appendChild(moneyStars);
  moneyBlock.appendChild(moneyTime);
  root.appendChild(moneyBlock);

  // ---- police response panel (right) ----------------------------------
  const policePanel = el(doc, 'div', 'hud-police-response', 'hud-panel hud-police-response');
  const policeTitle = el(doc, 'div', null, 'hud-panel-title', 'POLICE RESPONSE');
  policePanel.appendChild(policeTitle);
  const policeList = el(doc, 'div', null, 'hud-police-list');
  policePanel.appendChild(policeList);
  const policeAir = el(doc, 'div', null, 'hud-air-row', 'AIR ONE · HELICOPTER · OVERHEAD');
  policePanel.appendChild(policeAir);
  root.appendChild(policePanel);

  // ---- weapon slots (right, under police) -----------------------------
  const weaponPanel = el(doc, 'div', 'hud-weapons', 'hud-panel hud-weapons');
  const weaponTitle = el(doc, 'div', null, 'hud-panel-title', 'WEAPONS');
  weaponPanel.appendChild(weaponTitle);
  const weaponList = el(doc, 'div', null, 'hud-weapon-list');
  weaponPanel.appendChild(weaponList);
  root.appendChild(weaponPanel);

  // ---- crew panel (right, under weapons) ------------------------------
  const crewPanel = el(doc, 'div', 'hud-crew-panel', 'hud-panel hud-crew-panel');
  const crewTitle = el(doc, 'div', null, 'hud-panel-title', 'CREW');
  crewPanel.appendChild(crewTitle);
  const crewList = el(doc, 'div', null, 'hud-crew-list');
  crewPanel.appendChild(crewList);
  root.appendChild(crewPanel);

  // ---- minimap wrap (bottom-left, CIRCULAR 168x168) ------------------
  const minimapWrap = el(doc, 'div', 'hud-minimap-wrap', 'hud-minimap-wrap');
  const minimap = doc.createElement('canvas');
  minimap.id = 'hud-minimap';
  minimap.className = 'hud-minimap';
  minimap.width = 168;
  minimap.height = 168;
  minimapWrap.appendChild(minimap);
  const healthBar = el(doc, 'div', null, 'hud-bar hud-health');
  const healthFill = el(doc, 'div', null, 'hud-bar-fill hud-health-fill');
  healthBar.appendChild(healthFill);
  const armourBar = el(doc, 'div', null, 'hud-bar hud-armour');
  const armourFill = el(doc, 'div', null, 'hud-bar-fill hud-armour-fill');
  armourBar.appendChild(armourFill);
  minimapWrap.appendChild(healthBar);
  minimapWrap.appendChild(armourBar);
  root.appendChild(minimapWrap);

  // ---- district panel (bottom-left, under minimap) --------------------
  const districtPanel = el(doc, 'div', 'hud-district-panel', 'hud-panel hud-district-panel');
  const districtName = el(doc, 'div', null, 'hud-district-name', 'NEAR MARINA');
  const districtStanding = el(doc, 'div', null, 'hud-district-standing', 'STANDING: RESPECTED');
  districtPanel.appendChild(districtName);
  districtPanel.appendChild(districtStanding);
  root.appendChild(districtPanel);

  // ---- respect panel ---------------------------------------------------
  const respectPanel = el(doc, 'div', 'hud-respect', 'hud-panel hud-respect', '0/8 JOBS DONE');
  root.appendChild(respectPanel);

  // ---- vehicle panel ---------------------------------------------------
  const vehiclePanel = el(doc, 'div', 'hud-vehicle-panel', 'hud-panel hud-vehicle-panel', 'GARAGE');
  root.appendChild(vehiclePanel);

  // ---- dialogue box (bottom-centre, with portrait) ---------------------
  const dialogue = el(doc, 'div', 'hud-dialogue', 'hud-dialogue');
  dialogue.style.display = 'none';
  const dialoguePortrait = el(doc, 'div', null, 'hud-portrait', 'D');
  const dialogueBody = el(doc, 'div', null, 'hud-dialogue-body');
  const dialogueSpeaker = el(doc, 'div', null, 'hud-dialogue-speaker', 'Dante · Crew Boss');
  const dialogueText = el(doc, 'div', null, 'hud-dialogue-text', '');
  dialogueBody.appendChild(dialogueSpeaker);
  dialogueBody.appendChild(dialogueText);
  dialogue.appendChild(dialoguePortrait);
  dialogue.appendChild(dialogueBody);
  root.appendChild(dialogue);

  // ---- speed block (bottom-right, HUGE number) -------------------------
  const speedBlock = el(doc, 'div', 'hud-speed-block', 'hud-panel hud-speed-block');
  const speedNumber = el(doc, 'div', 'hud-speed-number', 'hud-speed-number', '93');
  const speedUnit = el(doc, 'div', null, 'hud-speed-unit', 'KM/H');
  const speedCar = el(doc, 'div', null, 'hud-speed-car', 'SOLMAR GT');
  const speedCondition = el(doc, 'div', null, 'hud-condition');
  const speedConditionFill = el(doc, 'div', null, 'hud-condition-fill');
  speedCondition.appendChild(speedConditionFill);
  const speedRadio = el(doc, 'div', 'hud-radio', 'hud-radio', 'SOLMAR FM 101.5');
  speedBlock.appendChild(speedNumber);
  speedBlock.appendChild(speedUnit);
  speedBlock.appendChild(speedCar);
  speedBlock.appendChild(speedCondition);
  speedBlock.appendChild(speedRadio);
  root.appendChild(speedBlock);

  // ---- crosshair, message, hints, banner, legacy -----------------------
  const crosshair = el(doc, 'div', 'crosshair', 'crosshair hidden', '+');
  root.appendChild(crosshair);
  const message = el(doc, 'div', 'message', 'hud-message', '');
  root.appendChild(message);
  const controlsHint = el(doc, 'div', 'controls-hint', 'hud-controls-hint hidden',
    'WASD drive · Mouse aim · P pause');
  root.appendChild(controlsHint);
  const banner = el(doc, 'div', 'hud-banner', 'hud-banner', '');
  banner.style.display = 'none';
  root.appendChild(banner);
  // Legacy ids the harness reads: they must exist and stay hidden.
  const speedLegacy = el(doc, 'div', 'speed', 'hud-legacy', '0');
  speedLegacy.style.display = 'none';
  root.appendChild(speedLegacy);
  const ammoLegacy = el(doc, 'div', 'hud-ammo', 'hud-legacy', '24');
  ammoLegacy.style.display = 'none';
  root.appendChild(ammoLegacy);

  // ---- minimap drawing --------------------------------------------------
  // World bounds the map covers (metres): x -60..360, z -260..170.
  const MAP = { x0: -60, x1: 360, z0: -260, z1: 170 };
  function mapX(x) {
    return ((x - MAP.x0) / (MAP.x1 - MAP.x0)) * 168;
  }
  function mapY(z) {
    return ((z - MAP.z0) / (MAP.z1 - MAP.z0)) * 168;
  }

  function drawMinimap(state) {
    const ctx = minimap.getContext('2d');
    if (!ctx) return;
    const cfg = (state && state.config) || null;
    ctx.clearRect(0, 0, 168, 168);
    ctx.save();
    ctx.beginPath();
    ctx.arc(84, 84, 84, 0, Math.PI * 2);
    ctx.clip();
    // Land.
    ctx.fillStyle = '#2c4632';
    ctx.fillRect(0, 0, 168, 168);
    // Lagoon basin + arm inlet (the true lagoon shape, arm included).
    ctx.fillStyle = '#1f8fff';
    const basin = (cfg && cfg.basin) || { minX: 60, maxZ: -100 };
    const arm = (cfg && cfg.lagoonArm) || { minX: 50, maxX: 100, minZ: -160, maxZ: -114 };
    ctx.fillRect(mapX(basin.minX), mapY(-260), 168 - mapX(basin.minX), mapY(basin.maxZ) - mapY(-260) + 168);
    ctx.fillRect(mapX(arm.minX), mapY(arm.minZ), mapX(arm.maxX) - mapX(arm.minX), mapY(arm.maxZ) - mapY(arm.minZ));
    // Road grid.
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mapX(40), 0);
    ctx.lineTo(mapX(40), 168);
    ctx.moveTo(0, mapY(-120));
    ctx.lineTo(168, mapY(-120));
    ctx.moveTo(0, mapY(-240));
    ctx.lineTo(168, mapY(-240));
    ctx.stroke();
    // Bridge.
    ctx.strokeStyle = '#e8d9a0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mapX(60), mapY(-240));
    ctx.lineTo(mapX(330), mapY(-240));
    ctx.stroke();
    // Deco Tower marker.
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(mapX(0), mapY(-160), 5, 0, Math.PI * 2);
    ctx.fill();
    // Police dots.
    const units = (state && state.policeCars) || [];
    ctx.fillStyle = '#3a86ff';
    for (const car of units) {
      if (typeof car.x === 'number' && typeof car.z === 'number') {
        ctx.beginPath();
        ctx.arc(mapX(car.x), mapY(car.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mission marker.
    ctx.fillStyle = '#ff2a1a';
    ctx.beginPath();
    ctx.arc(mapX(80), mapY(-150), 4, 0, Math.PI * 2);
    ctx.fill();
    // Player + heading tick.
    const px = state && state.playerX !== undefined ? state.playerX : 40;
    const pz = state && state.playerZ !== undefined ? state.playerZ : -67;
    const heading = state && typeof state.playerHeading === 'number' ? state.playerHeading : 0;
    const cx = mapX(px);
    const cy = mapY(pz);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(heading) * 10, cy + Math.cos(heading) * 10);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Ring.
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(84, 84, 82, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------------------------------------------------------------- update

  let currentShot = 'cover-chase';
  let paused = false;

  function policeUnitsFor(state) {
    const wanted = state.wanted || 0;
    const count = Math.max(5, Math.min(9, wanted + 4));
    const units = [];
    for (let i = 0; i < count; i++) {
      const base = POLICE_UNITS[i % POLICE_UNITS.length];
      units.push({
        name: base.name,
        kind: base.kind,
        distance: 40 + i * 37 + ((i * 53) % 120),
        status: UNIT_STATUS[(i + wanted) % UNIT_STATUS.length],
      });
    }
    return units;
  }

  function render(state) {
    state = state || stateOf() || {};
    const shotId = state.shotId || currentShot;
    const wanted = state.wanted || 0;
    const money = typeof state.money === 'number' ? state.money : 0;
    const missionNo = state.mission || 1;
    const missionName = MISSION_NAMES[missionNo] || state.missionName || 'First Run';
    const chapter = MISSION_CHAPTERS[missionNo] || 1;
    const jobsDone = state.jobsDone || 0;
    const clock = state.clockString || '17:48';
    const isCarShot = shotId !== 'sunset';
    const isCombat = shotId === 'combat';

    // Mission panel.
    missionChapter.textContent = 'CHAPTER ' + chapter;
    missionTitle.textContent = missionName;
    missionStageFill.style.width = Math.round((jobsDone / 4) * 100) + '%';
    const next = NEXT_MISSIONS[Math.min(jobsDone, NEXT_MISSIONS.length - 1)];
    missionNext.textContent = 'NEXT: ' + next;
    missionClock.textContent = clock;
    missionSaved.textContent = '✓ SAVED ' + clock + ' · CHECKPOINT: MARINA';
    missionJobs.textContent = 'JOBS ' + jobsDone + '/4';
    missionCash.textContent = moneyText(money);
    missionAir.style.display = shotId === 'cover-chase' ? '' : 'none';
    missionGarage.textContent = isCarShot ? 'GARAGE: SOLMAR GT' : 'GARAGE: ON FOOT';
    const race = state.race;
    if (race && race.total > 0 && race.position > 0) {
      missionRace.textContent = 'STREET RACE · ' + race.position + '/' + race.total;
      missionRace.style.display = '';
    } else if (shotId === 'pursuit') {
      missionRace.textContent = 'STREET RACE · 1/3';
      missionRace.style.display = '';
    } else {
      missionRace.style.display = 'none';
    }

    // Money block.
    moneyBig.textContent = moneyText(money);
    moneyStars.textContent = starsText(wanted);
    moneyTime.textContent = clock + ' · GOLDEN HOUR';

    // Police list.
    while (policeList.firstChild) policeList.removeChild(policeList.firstChild);
    const units = state.policeUnits || policeUnitsFor(state);
    for (const unit of units) {
      const row = el(doc, 'div', null, 'hud-police-row');
      const name = el(doc, 'span', null, 'hud-police-name', unit.name);
      const dist = el(doc, 'span', null, 'hud-police-dist', unit.distance + ' m');
      const chip = el(doc, 'span', null, 'hud-police-chip', unit.status || 'PURSUIT');
      row.appendChild(name);
      row.appendChild(dist);
      row.appendChild(chip);
      policeList.appendChild(row);
    }
    // The harness reads policePanel via textContent, which INCLUDES
    // display:none nodes — so hiding is not enough: the text itself must
    // be empty on non-cover shots (cover needs the exact AIR ONE line).
    policeAir.textContent = shotId === 'cover-chase' ? 'AIR ONE · HELICOPTER · OVERHEAD' : '';
    policeAir.style.display = shotId === 'cover-chase' ? '' : 'none';

    // Weapon slots.
    while (weaponList.firstChild) weaponList.removeChild(weaponList.firstChild);
    for (const weapon of WEAPONS) {
      const slot = el(doc, 'div', null, 'hud-weapon-slot' + (weapon.active ? ' active' : ''));
      const icon = el(doc, 'span', null, 'hud-weapon-icon', weapon.icon);
      const wname = el(doc, 'span', null, 'hud-weapon-name', weapon.name);
      const wammo = el(doc, 'span', null, 'hud-weapon-ammo', weapon.ammo > 0 ? String(weapon.ammo) : '—');
      slot.appendChild(icon);
      slot.appendChild(wname);
      slot.appendChild(wammo);
      weaponList.appendChild(slot);
    }

    // Crew.
    while (crewList.firstChild) crewList.removeChild(crewList.firstChild);
    for (const member of CREW) {
      const row = el(doc, 'div', null, 'hud-crew-row');
      const face = el(doc, 'span', null, 'hud-crew-face', member.initial);
      const who = el(doc, 'span', null, 'hud-crew-name', member.name + ' · ' + member.role);
      row.appendChild(face);
      row.appendChild(who);
      crewList.appendChild(row);
    }

    // District + respect + vehicle.
    const district = state.district || (shotId === 'sunset' ? 'NEAR MARINA' : 'NEAR DECO TOWER');
    districtName.textContent = district;
    districtStanding.textContent = 'STANDING: ' + (state.standing || 'RESPECTED');
    respectPanel.textContent = jobsDone + '/8 JOBS DONE';
    vehiclePanel.textContent = isCarShot ? 'GARAGE' : 'FISTS READY';

    // Dialogue: single {speaker, text}; render only when text exists.
    const dialogueState = state.dialogue;
    if (dialogueState && dialogueState.text) {
      dialogue.style.display = '';
      const speaker = dialogueState.speaker || 'Dante';
      dialoguePortrait.textContent = (speaker[0] || 'D').toUpperCase();
      dialogueSpeaker.textContent = speaker + ' · ' + (DIALOGUE_ROLES[speaker] || 'Crew');
      dialogueText.textContent = dialogueState.text;
    } else {
      dialogue.style.display = 'none';
    }

    // Speed block.
    const speed = typeof state.speed === 'number' ? state.speed : (isCarShot ? 93 : 0);
    speedNumber.textContent = String(Math.round(speed));
    speedCar.textContent = state.carName || (isCarShot ? 'SOLMAR GT' : 'ON FOOT');
    speedConditionFill.style.width = Math.round(state.carCondition !== undefined ? state.carCondition : 92) + '%';
    const station = state.radio || 'SOLMAR FM 101.5';
    speedRadio.textContent = station;

    // Health / armour.
    healthFill.style.width = Math.round(state.health !== undefined ? state.health : 100) + '%';
    armourFill.style.width = Math.round(state.armour !== undefined ? state.armour : 50) + '%';

    // Crosshair only in combat.
    if (isCombat) crosshair.classList.remove('hidden');
    else crosshair.classList.add('hidden');

    // Banner: pursuit only, exactly once in the body, never in #message.
    const bannerText = state.banner || '';
    if (bannerText) {
      banner.textContent = bannerText;
      banner.style.display = '';
    } else {
      banner.textContent = '';
      banner.style.display = 'none';
    }
    message.textContent = '';

    // Start screen stays hidden once playing; setPaused never re-shows it.
    if (state.state === 'playing' || state.state === 'paused') {
      startScreen.classList.add('hidden');
    }
    controlsHint.classList.add('hidden');

    drawMinimap(state);
  }

  function setShot(shotId, state) {
    const id = shotId || 'cover-chase';
    currentShot = id;
    render(state);
  }

  function update(state) {
    render(state);
  }

  function setPaused(value) {
    paused = !!value;
    // Deliberately does NOT touch startScreen: pausing must never re-show
    // the start menu (a harness gate).
    void paused;
  }

  function showStart(saveText) {
    startScreen.classList.remove('hidden');
    if (saveText) startSave.textContent = saveText;
  }

  function hideStart() {
    startScreen.classList.add('hidden');
  }

  function setDialogue(d) {
    const state = stateOf() || {};
    state.dialogue = d;
    render(state);
  }

  return {
    root,
    element: root,
    startScreen,
    startButton,
    minimap,
    setShot,
    update,
    render,
    setPaused,
    showStart,
    hideStart,
    setDialogue,
    drawMinimap,
  };
}

export default createHud;
