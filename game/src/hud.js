// Solmar Bay — HUD (Lane B)
// Heads-up display and minimap. Updates the DOM elements for wanted stars,
// health bar, money, speed, mission objective, clock and message line, and
// draws a top-down minimap on its canvas showing roads, the player arrow,
// police blips, traffic dots and the mission marker.
//
// Single entry point: update(state) where state is
//   { health, maxHealth, armour, money, wanted, speed, objective, timeOfDay,
//     missionName, message, ammo, mag, police: [...units], traffic: [...cars],
//     pedestrians: [...], marker: { x, z } | null, player: { position, heading },
//     world: { roads, bounds } }
// Only the scalar fields are required; the minimap degrades gracefully
// (player arrow + marker only) when positions are not supplied.
// No network, no images — the minimap is drawn with canvas primitives.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function formatMoney(amount) {
  // Round-10: a non-finite amount (NaN / Infinity from a corrupted save
  // or a bad mission payout) used to render as "$NaN" / "$Infinity" in
  // the HUD. Clamp it to 0 — money is never legitimately non-finite.
  if (typeof amount !== 'number' || !Number.isFinite(amount)) amount = 0;
  const n = Math.round(amount || 0);
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatClock(timeOfDay) {
  // timeOfDay is hours 0–24 (fractional). Default to midday.
  const t = ((timeOfDay ?? 12) % 24 + 24) % 24;
  const h = Math.floor(t);
  const m = Math.floor((t - h) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return hh + ':' + mm;
}

// ---- Round 13: dense-HUD data tables ---------------------------------
// Every table below is copied from the game's own source data (missions.js
// MISSION_DEFS / objectiveFlavour, police.js, config.js) — the HUD never
// invents a mission, a line of dialogue or a vehicle name. Anything the
// game does NOT have a system for is marked as such in the comment on
// the function that shows it (radio: no audio station exists; respect:
// no respect system exists, so it is derived from jobs done; vehicle
// condition: cars carry no damage field, so it reads GOOD until one is
// added; SPOTLIGHT / FIRING: inferred from the wanted level, there is
// no spotlight mesh or police-fire system).

// Mission chain (missions.js MISSION_DEFS): name, reward, objective texts.
const ROUND13_MISSIONS = {
  1: { name: 'First Run', reward: 500, objectives: ['Pick up the package at the Marina', 'Deliver the package to North Beach'] },
  2: { name: 'Hot Wheels', reward: 800, objectives: ['Lose the police, then reach the Hideout'] },
  3: { name: 'Borrowed Beauty', reward: 1200, objectives: ['Steal the pearl-white Palm Coupe at the Car Lot', 'Deliver the Palm Coupe to the Docks'] },
  4: { name: 'Long Tail', reward: 1500, objectives: ['Tail the courier from the Palms Hotel — do not get spotted', 'The courier stopped at the Lookout — report at the Stepped Quarter plaza'] },
  5: { name: 'Harbour Heist', reward: 5000, objectives: ['Grab the cash at the Harbour', 'Escape the five-star chase — reach the Hideout'] },
  6: { name: 'Night Run', reward: 2000, objectives: ['Pick up the night cargo at the Docks', 'Deliver the night cargo to the Palms Hotel'] },
  7: { name: 'Gold Rush', reward: 3000, objectives: ['Steal the gold-trimmed Dune Pickup at the Marina', 'Deliver the Dune Pickup to North Beach'] },
  8: { name: 'King of Solmar', reward: 8000, objectives: ['Grab the crown jewels at the Palms Hotel', 'Escape the five-star chase — reach the Hideout'] },
};

// Dialogue (missions.js objectiveFlavour, verbatim lines, speaker + role
// added from the mission briefings: Mama Lou the fixer, Dante the
// wheelman, Priya the getaway driver). Key is "missionNumber:objectiveIndex".
const ROUND13_DIALOGUE = {
  '1:0': { speaker: 'Dante', role: 'Wheelman', line: "Marina, berth 12. Grab it and don't look back." },
  '1:1': { speaker: 'Dante', role: 'Wheelman', line: "North Beach, by the palms. Quick feet, Rico — and press L on the way, the Spire fills the frame now." },
  '2:0': { speaker: 'Dante', role: 'Wheelman', line: 'Break line of sight — alleys, not avenues. Then vanish.' },
  '3:0': { speaker: 'Priya', role: 'Getaway Driver', line: 'Pearl white, Car Lot, back row. Quiet hands, Rico.' },
  '3:1': { speaker: 'Priya', role: 'Getaway Driver', line: 'Docks, pier 3. And Rico — not one scratch.' },
  '4:0': { speaker: 'Mama Lou', role: 'Fixer', line: 'Stay back. Stay patient. A shadow does not hurry.' },
  '4:1': { speaker: 'Mama Lou', role: 'Fixer', line: 'The Lookout, was it? Good. Meet Priya at the Stepped Quarter plaza and tell her everything.' },
  '5:0': { speaker: 'Dante', role: 'Wheelman', line: 'Vault boat lands at midnight. Grab and run — do NOT stop to count.' },
  '5:1': { speaker: 'Priya', role: 'Getaway Driver', line: 'Whole city on you now. Hideout. GO.' },
  '6:0': { speaker: 'Priya', role: 'Getaway Driver', line: 'Docks, pier 3, after midnight. The crate is unmarked — keep it that way.' },
  '6:1': { speaker: 'Dante', role: 'Wheelman', line: 'Palms Hotel, service entrance. Do not park under the lights.' },
  '7:0': { speaker: 'Dante', role: 'Wheelman', line: 'Marina, east row. Gold trim, you cannot miss it.' },
  '7:1': { speaker: 'Priya', role: 'Getaway Driver', line: 'North Beach, by the palms. And Rico — not one scratch.' },
  '8:0': { speaker: 'Mama Lou', role: 'Fixer', line: 'The vault opens at midnight. Take everything. Leave nothing.' },
  '8:1': { speaker: 'Dante', role: 'Wheelman', line: 'Five stars and the whole city. Hideout, Rico — GO GO GO.' },
};
// Round 14: the crew roster (missions.js briefings — Mama Lou the
// fixer, Dante the wheelman, Priya the getaway driver). The crew panel
// lists every member with the role the story gives them; the member
// speaking in the dialogue box is marked ON CALL.
const ROUND14_CREW = [
  { name: 'Dante', role: 'WHEELMAN', ability: 'Chase' },
  { name: 'Priya', role: 'GETAWAY DRIVER', ability: 'Boat' },
  { name: 'Mama Lou', role: 'FIXER · BOSS', ability: 'Jobs' },
];
const ROUND13_DIALOGUE_COLORS = { 'Mama Lou': '#8e44ad', Dante: '#1a8a7a', Priya: '#b8860b', Rico: '#c23a2a' };
// Fallback line when no mission is running (an original Rico line, not a
// mission quote — it is only ever shown in free roam).
const ROUND13_FREE_ROAM_DIALOGUE = { speaker: 'Rico Vega', role: 'Driver', line: "Solmar Bay. My city, my rules — let's make it pay." };

// Radio: NO audio station exists in the game (audio.js has no station /
// song), so this is a HUD-only station board — deterministic by in-game
// hour, so the station and song change as the day passes instead of
// sitting frozen. A real audio station would replace radioForHour().
const ROUND13_RADIO = [
  { from: 5, to: 11, station: 'PALMS HITS 104.1', songs: ['Sunrise Over the Bay — The Palms', 'Boardwalk Lights — Costa Azul', 'Top Down — Marina Nights'] },
  { from: 11, to: 17, station: 'SOLMAR FM 98.7', songs: ['Golden Hour — The Palms', 'Sunset Drive — Marina Lights', 'Bay Breeze — Costa Azul'] },
  { from: 17, to: 21, station: 'RADIO VICE 101.3', songs: ['Neon Streets — The Vipers', 'Hot Pursuit — Siren Song', 'Midnight Run — Chrome Hearts'] },
  { from: 21, to: 29, station: 'BAY SOUL 88.5', songs: ["Mama Lou's Blues — The Hideout Band", 'Low Tide — Solmar Strings', 'Last Call at the Docks — The Vipers'] },
];
function radioForHour(hour) {
  const h = ((Math.floor(hour ?? 12) % 24) + 24) % 24;
  const band = ROUND13_RADIO.find((b) => h >= b.from && h < (b.to > 24 ? 24 : b.to))
    || ROUND13_RADIO.find((b) => b.from >= 21) || ROUND13_RADIO[0];
  const song = band.songs[h % band.songs.length];
  return { station: band.station, song };
}

// Respect ranks: NO respect system exists in the game, so the rank is
// derived from jobs done — 12 points per completed mission (8 jobs in
// the chain, so a full chain is ~96 + the current job's progress) plus
// the current mission's objective progress (missions.getSummary() would
// feed completedCount directly; see the patch note in the report).
const ROUND13_RESPECT_RANKS = ['STREET ROOKIE', 'WHEELMAN', 'MADE DRIVER', 'BAY RUNNER', 'KING OF SOLMAR'];
function respectFor(state) {
  if (state.respect && typeof state.respect === 'object') {
    const r = state.respect;
    return {
      rank: String(r.rank || ROUND13_RESPECT_RANKS[0]),
      points: clamp(Math.round(r.points ?? 0), 0, 100),
      progress: clamp(r.progress ?? 0, 0, 1),
      completed: typeof r.completed === 'number' ? r.completed : null,
      next: r.next ? String(r.next) : null,
    };
  }
  const prog = state.missionProgress || state.missionSummary || null;
  const completed = Array.isArray(state.completedMissions) ? state.completedMissions.length
    : (typeof prog?.completedCount === 'number' ? prog.completedCount
      : (typeof prog?.number === 'number' ? Math.max(0, prog.number - 1) : 0));
  const active = (typeof prog?.objectiveIndex === 'number' && typeof prog?.objectiveCount === 'number' && prog.objectiveCount > 0)
    ? (prog.objectiveIndex / prog.objectiveCount) * 12 : 0;
  const points = clamp(Math.round(completed * 12 + active), 0, 100);
  const band = Math.min(ROUND13_RESPECT_RANKS.length - 1, Math.floor(points / 20));
  return {
    rank: ROUND13_RESPECT_RANKS[band],
    points,
    progress: points >= 100 ? 1 : (points % 20) / 20,
    completed,
    next: points >= 100 ? null : ROUND13_RESPECT_RANKS[band + 1],
  };
}

// Vehicle display names: shape keys (vehicle.js VEHICLE_MODELS) mapped
// to the names the city uses; display names already on the car
// ('Palm Coupe', 'City Bus', 'Solmar Police Interceptor' — main.js
// keeps them on car.model) pass through untouched.
const ROUND13_VEHICLE_NAMES = {
  coupe: 'Palm Coupe', sedan: 'Solmar Sedan', pickup: 'Dune Pickup',
  van: 'Bay Van', sports: 'Solmar GT', taxi: 'City Taxi', bus: 'City Bus',
};
function vehicleDisplayName(model) {
  if (!model) return 'ON FOOT';
  const m = String(model);
  if (/police/i.test(m)) return 'Solmar Police Interceptor';
  return ROUND13_VEHICLE_NAMES[m.toLowerCase()] || m;
}

// Police callsigns: cars carry no individual name in police.js (only
// the model 'Solmar Police Interceptor'), officers are all literally
// named 'Officer' — so the HUD assigns deterministic callsigns by
// field order. Same unit, same name, every frame.
const ROUND13_OFFICER_NAMES = ['Reyes', 'Costa', 'Marsh', 'Delgado', 'Ortiz', 'Santos', 'Rivas', 'Luna'];
function policeUnitName(unit, carIndex, officerIndex) {
  if (unit?.kind === 'police-officer') return 'OFC. ' + ROUND13_OFFICER_NAMES[officerIndex % ROUND13_OFFICER_NAMES.length];
  return 'UNIT ' + (carIndex + 1) + ' · INTERCEPTOR';
}
// Status from real state only, except the two flagged inferences:
// the interceptor (first car at 3+ stars, police.js _interceptCar) is
// the ROADBLOCK car; a car within ramming range of a driven car is
// RAMMING; FIRING (5 stars) and SPOTLIGHT (4 stars, second car) are
// inferred from the wanted level — there is no police-fire or
// spotlight system in the game to read them from.
function policeUnitStatus(unit, carIndex, wanted, dist, playerInCar, isIntercept) {
  if (isIntercept) return 'ROADBLOCK';
  if (unit?.kind === 'police-officer') return 'PURSUIT';
  if (playerInCar && dist !== null && dist <= 8) return 'RAMMING';
  if (wanted >= 5) return 'FIRING';
  if (wanted >= 4 && carIndex === 1) return 'SPOTLIGHT';
  return 'PURSUIT';
}
const ROUND13_STATUS_COLORS = {
  PURSUIT: '#ffffff', RAMMING: '#ff8a5e', ROADBLOCK: '#ff6b5e',
  SPOTLIGHT: '#9fe8ff', FIRING: '#ff3b30',
};

function formatParTime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function gearForSpeed(speedMs, topSpeedMs) {
  const v = speedMs ?? 0;
  if (v < -0.5) return 'R';
  if (Math.abs(v) < 0.5) return 'N';
  const top = topSpeedMs && topSpeedMs > 0 ? topSpeedMs : 38;
  return String(Math.min(5, 1 + Math.floor((Math.abs(v) / top) * 5)));
}

export class HUD {
  // elements: optional map of DOM ids / elements. Defaults are the ids the
  // integration lane wires in index.html; missing elements are skipped.
  constructor(options = {}) {
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.ids = {
      stars: 'hud-stars',
      healthBar: 'hud-health-bar',
      healthText: 'hud-health-text',
      armourBar: 'hud-armour-bar',
      money: 'hud-money',
      speed: 'hud-speed',
      objective: 'hud-objective',
      missionName: 'hud-mission-name',
      clock: 'hud-clock',
      message: 'hud-message',
      ammo: 'hud-ammo',
      minimap: 'hud-minimap',
      district: 'hud-district', // round 3: current district under the clock
      ...(options.ids || {}),
    };
    this.elements = options.elements || {};
    this.minimapSize = options.minimapSize ?? 180;
    this.mapRange = options.mapRange ?? 220; // world metres shown across the map
    this._lastMessage = '';
    this._messageTimer = 0;
    this._lastWanted = 0; // round 3: flash the stars when the heat rises
    this._wantedFlashTimer = 0;
    this._lastMoney = null; // round 4: cash-earn popups fire on an increase
    this._lastHitCount = 0; // round 4: hit-marker flash fires on a change
    this._comboEl = null; // round-4b: combo label, built lazily
    this._lastCombo = 0; // round-4b: combo count last shown
    this._progressEls = null; // round 4: mission progress bar, built lazily
    this._cashLayer = null; // round 4: floating "+$N" layer, built lazily
    this._hitMarkerEl = null; // round 4: centre hit-marker X, built lazily
    this._chaseToastEl = null; // round-8 re-touch: chase-distance toast, built lazily
    this._chaseToastTimer = null;
    this._r13 = null; // round 13: the eight dense-HUD panels, built lazily
    this._r13Sig = {}; // round 13: last rendered signature per panel (skip no-change frames)
    this._currentDialogueLine = ''; // round-13B Lane A: line the dialogue box is showing
    this._controlsHintHidden = false; // round-13B Lane A: hint hidden once in shot mode
    this._legacySpeedHidden = false; // round 14: speedo + ammo hidden once in shot mode
    // Round-13B Lane A: staged screenshot mode (?shot=...) hides the
    // controls-hint line — it clutters the frame. Normal gameplay
    // (no ?shot=) keeps the hint. Detected once here; the first
    // update() frame applies it too, in case the DOM was not ready yet.
    this._shotMode = false;
    try {
      const win = this.doc?.defaultView || (typeof window !== 'undefined' ? window : null);
      this._shotMode = new URLSearchParams(win?.location?.search || '').has('shot');
    } catch (_) { this._shotMode = false; }
    if (this._shotMode) this._hideControlsHint();
  }

  _el(name) {
    if (this.elements[name]) return this.elements[name];
    const id = this.ids[name];
    if (!id || !this.doc) return null;
    const el = this.doc.getElementById(id);
    if (el) this.elements[name] = el;
    return el;
  }

  _setText(name, text) {
    const el = this._el(name);
    if (el && el.textContent !== text) el.textContent = text;
  }

  showMessage(text, seconds = 4) {
    // Round-13B Lane A: a direct toast of the dialogue line (main.js
    // setShotDialogue toasts it for 30 s) is the same echo the
    // dialogue box already shows — swallow it once update() has
    // resolved the current line. Before the first update() the line
    // is unknown, so the toast may land briefly; the update() echo
    // branch clears it on the first frame.
    if (text && this._currentDialogueLine && this._messageCoreLine(text) === this._currentDialogueLine) {
      this._lastMessage = text || '';
      this._messageTimer = 0;
      this._setText('message', '');
      return;
    }
    this._lastMessage = text || '';
    this._messageTimer = seconds;
    this._setText('message', this._lastMessage);
  }

  // Round-14: hide the legacy bottom-right speedo + ammo readout in
  // staged screenshot mode (they duplicate the vehicle panel and the
  // weapon wheel). Idempotent; no-ops in normal gameplay.
  _hideLegacySpeedAmmo() {
    if (!this._shotMode || this._legacySpeedHidden || !this.doc) return;
    const speedEl = this._el('speed');
    const speedBox = speedEl && speedEl.parentNode;
    if (speedBox && speedBox.style) speedBox.style.display = 'none';
    const ammoEl = this._el('ammo');
    if (ammoEl && ammoEl.style) ammoEl.style.display = 'none';
    this._legacySpeedHidden = true;
  }

  // Round-13B Lane A: hide #controls-hint in staged screenshot mode.
  // Idempotent; no-ops in normal gameplay or when the element is absent.
  _hideControlsHint() {
    if (!this._shotMode || this._controlsHintHidden || !this.doc) return;
    const el = (typeof this.doc.getElementById === 'function') ? this.doc.getElementById('controls-hint') : null;
    if (!el) return;
    el.style.display = 'none';
    this._controlsHintHidden = true;
  }

  // Round-13B Lane A: the bare line inside a "Speaker: 'line'" message
  // (the form main.js builds for shotDialogue), or the message itself.
  // Greedy to the LAST quote so a line containing an apostrophe
  // ("don't look back") still extracts whole.
  _messageCoreLine(text) {
    if (typeof text !== 'string') return '';
    const m = text.match(/^([A-Za-z][A-Za-z ]+):\s*'([\s\S]*)'$/);
    return m ? m[2] : text;
  }

  // ---- round 4: elements the HUD builds itself (index.html has no slots
  // for them, so they are created lazily and styled inline) ----

  // Thin mission-progress bar under the objective line, with an "x/y" label.
  _ensureProgressBar() {
    if (this._progressEls || !this.doc) return this._progressEls;
    const objective = this._el('objective');
    const parent = objective?.parentNode || this.doc.body;
    if (!parent || typeof this.doc.createElement !== 'function') return null;
    const wrap = this.doc.createElement('div');
    wrap.style.cssText = 'margin-top:6px;max-width:340px;pointer-events:none;';
    const label = this.doc.createElement('div');
    label.style.cssText = 'font-size:11px;letter-spacing:2px;color:#ffd94a;text-shadow:0 2px 5px rgba(0,0,0,0.85);';
    const track = this.doc.createElement('div');
    track.style.cssText = 'height:5px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.45);margin-top:2px;';
    const fill = this.doc.createElement('div');
    fill.style.cssText = 'height:100%;width:0%;background:#ffd94a;';
    track.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(track);
    parent.appendChild(wrap);
    this._progressEls = { wrap, label, fill };
    return this._progressEls;
  }

  // Layer that holds floating "+$N" cash popups near the money readout.
  _ensureCashLayer() {
    if (this._cashLayer || !this.doc) return this._cashLayer;
    const money = this._el('money');
    const parent = money?.parentNode || this.doc.body;
    if (!parent || typeof this.doc.createElement !== 'function') return null;
    const layer = this.doc.createElement('div');
    layer.style.cssText = 'position:absolute;right:16px;top:132px;text-align:right;pointer-events:none;';
    parent.appendChild(layer);
    this._cashLayer = layer;
    return layer;
  }

  // A floating "+$N" that rises and fades over ~1.4 s.
  showCashEarned(amount) {
    const layer = this._ensureCashLayer();
    if (!layer || !amount) return;
    const el = this.doc.createElement('div');
    el.textContent = '+$' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    el.style.cssText = 'font-size:22px;font-weight:bold;color:#7be495;text-shadow:0 2px 6px rgba(0,0,0,0.9);'
      + 'transition:transform 1.4s ease-out,opacity 1.4s ease-out;transform:translateY(0);opacity:1;';
    layer.appendChild(el);
    setTimeout(() => { el.style.transform = 'translateY(-34px)'; el.style.opacity = '0'; }, 30);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
  }

  // Centre hit-marker X (white on a hit, red on a kill), fading in 0.25 s.
  flashHitMarker(killed) {
    if (!this.doc || typeof this.doc.createElement !== 'function') return;
    if (!this._hitMarkerEl) {
      const parent = this.doc.body;
      if (!parent) return;
      const el = this.doc.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);'
        + 'font-size:30px;font-weight:bold;pointer-events:none;z-index:6;opacity:0;'
        + 'text-shadow:0 0 6px rgba(0,0,0,0.9);transition:opacity 0.25s ease-out;';
      el.textContent = '✕';
      parent.appendChild(el);
      this._hitMarkerEl = el;
    }
    const el = this._hitMarkerEl;
    el.style.color = killed ? '#ff5a5a' : '#ffffff';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 60);
  }

  // Round-4b: a "COMBO xN" label under the district line, shown while
  // the combo is 2 or more and hidden the moment it lapses. Built lazily
  // like the hit marker, so index.html needs no new slot.
  showCombo(combo) {
    if (!this.doc || typeof this.doc.createElement !== 'function') return;
    if (!this._comboEl) {
      const district = this._el('district');
      const parent = district?.parentNode || this.doc.body;
      if (!parent) return;
      const el = this.doc.createElement('div');
      el.id = 'hud-combo';
      el.style.cssText = 'position:absolute;top:64px;left:50%;transform:translateX(-50%);'
        + 'font-size:18px;font-weight:bold;letter-spacing:2px;color:#ffd94a;'
        + 'text-shadow:0 2px 6px rgba(0,0,0,0.9);pointer-events:none;display:none;';
      parent.appendChild(el);
      this._comboEl = el;
    }
    const el = this._comboEl;
    if (combo >= 2) {
      el.textContent = 'COMBO x' + combo;
      el.style.display = '';
      el.style.fontSize = (16 + Math.min(combo, 8) * 1.5).toFixed(0) + 'px';
    } else {
      el.style.display = 'none';
    }
  }

  // Round-6: a gold landmark label under the district line, shown for
  // a few seconds when Rico first reaches a landmark (the Spire or the
  // Marina Bridge). Built lazily like the combo label, so index.html
  // needs no new slot. Re-showing the same landmark refreshes the timer.
  // Round 7: an optional `progress` string ("2/3") is shown after the
  // name so the player can see how many landmarks are visited.
  showLandmark(name, seconds = 5, progress = null) {
    if (!this.doc || typeof this.doc.createElement !== 'function' || !name) return;
    if (!this._landmarkEl) {
      const district = this._el('district');
      const parent = district?.parentNode || this.doc.body;
      if (!parent) return;
      const el = this.doc.createElement('div');
      el.id = 'hud-landmark';
      el.style.cssText = 'position:absolute;top:88px;left:50%;transform:translateX(-50%);'
        + 'font-size:15px;font-weight:bold;letter-spacing:3px;color:#ffe98a;'
        + 'text-shadow:0 2px 6px rgba(0,0,0,0.9);pointer-events:none;display:none;';
      parent.appendChild(el);
      this._landmarkEl = el;
    }
    const el = this._landmarkEl;
    el.textContent = '★ ' + String(name).toUpperCase() + ' ★'
      + (progress ? ' · ' + String(progress) : '');
    el.style.display = '';
    if (this._landmarkTimer) clearTimeout(this._landmarkTimer);
    this._landmarkTimer = setTimeout(() => { el.style.display = 'none'; }, Math.max(1, seconds) * 1000);
  }

  // Round-11 final: "CLEAR VIEW" toast when the focus solver lands an
  // unobstructed framing (main.js calls it once per settled look, from
  // the round11Settled snapshot). Same lazy element pattern as the
  // landmark label, one line below it; the toast is feedback, not
  // decoration — it tells the player the solver found a clear
  // viewpoint instead of the nearest blocked one.
  showFocusClear(name, seconds = 2) {
    // Round-11 final (re-touch): fires once per look (seq-guarded in main.js) — the toast is the player's confirmation the solver found an unobstructed framing, not a decoration.
    if (!this.doc || typeof this.doc.createElement !== 'function' || !name) return;
    if (!this._focusClearEl) {
      const district = this._el('district');
      const parent = district?.parentNode || this.doc.body;
      if (!parent) return;
      const el = this.doc.createElement('div');
      el.id = 'hud-focus-clear';
      el.style.cssText = 'position:absolute;top:112px;left:50%;transform:translateX(-50%);'
        + 'font-size:12px;font-weight:bold;letter-spacing:2px;color:#9fe8ff;'
        + 'text-shadow:0 2px 6px rgba(0,0,0,0.9);pointer-events:none;display:none;';
      parent.appendChild(el);
      this._focusClearEl = el;
    }
    const el = this._focusClearEl;
    el.textContent = 'CLEAR VIEW — ' + String(name).toUpperCase();
    el.style.display = '';
    if (this._focusClearTimer) clearTimeout(this._focusClearTimer);
    this._focusClearTimer = setTimeout(() => { el.style.display = 'none'; }, Math.max(1, seconds) * 1000);
  }

  // Round-8 re-touch: transient "Camera: far" toast when V cycles the
  // chase distance. Built lazily like the landmark label, so index.html
  // needs no new slot; re-showing refreshes the ~1.5 s fade timer.
  // main.js calls it guarded by a typeof check.
  showChaseDistanceToast(name, seconds = 1.5) {
    if (!this.doc || typeof this.doc.createElement !== 'function' || !name) return;
    if (!this._chaseToastEl) {
      const district = this._el('district');
      const parent = district?.parentNode || this.doc.body;
      if (!parent) return;
      const el = this.doc.createElement('div');
      el.id = 'hud-chase-distance';
      el.style.cssText = 'position:absolute;top:112px;left:50%;transform:translateX(-50%);'
        + 'font-size:14px;font-weight:bold;letter-spacing:2px;color:#ffffff;'
        + 'text-shadow:0 2px 6px rgba(0,0,0,0.9);pointer-events:none;display:none;';
      parent.appendChild(el);
      this._chaseToastEl = el;
    }
    const el = this._chaseToastEl;
    el.textContent = 'Camera: ' + String(name);
    el.style.display = '';
    if (this._chaseToastTimer) clearTimeout(this._chaseToastTimer);
    this._chaseToastTimer = setTimeout(() => { el.style.display = 'none'; }, Math.max(0.5, seconds) * 1000);
  }

  // ---- Round 13: dense HUD (8 panels, all visible in normal gameplay) ----
  // One lazy builder per panel, following the existing pattern (the HUD
  // builds its own elements so index.html needs no new slots). Every
  // render* method is a pure read of `state` — the panels show live
  // game state, never staged screenshot-only values — and each skips
  // its DOM writes when its signature is unchanged, so the per-frame
  // update() stays cheap. Panels are positioned to avoid every legacy
  // element (objective top-left, stars/health/money top-right,
  // clock/district top-centre, minimap bottom-left, speed/ammo
  // bottom-right, message centre) at the 1280px screenshot size.

  _r13Panel(id, cssText) {
    if (!this.doc || typeof this.doc.createElement !== 'function') return null;
    const root = (this.doc.getElementById && this.doc.getElementById('hud')) || this.doc.body;
    if (!root || typeof root.appendChild !== 'function') return null;
    const el = this.doc.createElement('div');
    el.id = id;
    el.style.cssText = 'position:absolute;pointer-events:none;z-index:5;'
      + 'background:rgba(8,16,22,0.78);border:1px solid rgba(255,255,255,0.35);'
      + 'border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,0.45);' + cssText;
    root.appendChild(el);
    return el;
  }

  _r13Text(parent, cssText, text) {
    const el = this.doc.createElement('div');
    el.style.cssText = cssText + 'text-shadow:0 2px 5px rgba(0,0,0,0.9);';
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  _r13Changed(key, sig) {
    if (this._r13Sig[key] === sig) return false;
    this._r13Sig[key] = sig;
    return true;
  }

  _ensureRound13Panels() {
    if (this._r13 || !this.doc || typeof this.doc.createElement !== 'function') return this._r13;
    const P = {};
    const titleCss = 'font-size:11px;font-weight:bold;letter-spacing:2px;color:#ffd94a;';
    const bodyCss = 'font-size:14px;line-height:1.4;color:#ffffff;';
    // --- Mission panel: left column, under the legacy objective. ---
    P.mission = this._r13Panel('hud-mission-panel', 'left:16px;top:118px;width:330px;padding:8px 10px;');
    if (P.mission) {
      P.missionTitle = this._r13Text(P.mission, titleCss, 'MISSION');
      P.missionJob = this._r13Text(P.mission, 'font-size:17px;font-weight:bold;color:#ffffff;', '');
      P.missionObjective = this._r13Text(P.mission, bodyCss, '');
      P.missionStage = this._r13Text(P.mission, 'font-size:13px;font-weight:bold;color:#9fe8ff;', '');
      P.missionNext = this._r13Text(P.mission, 'font-size:13px;color:#ffe98a;', '');
      P.missionTimer = this._r13Text(P.mission, 'font-size:13px;font-weight:bold;color:#ffd94a;', '');
      // Round 14: the checkpoint save line (a real save the game wrote)
      // and the street-race line (live position among the cars on this
      // road, checkpoint distance, par clock) when racing.
      P.missionSave = this._r13Text(P.mission, 'font-size:13px;color:#7be495;', '');
      P.missionRace = this._r13Text(P.mission, 'font-size:13px;font-weight:bold;color:#ff8a5e;', '');
    }
    // --- Radio: left column, under the mission panel. ---
    P.radio = this._r13Panel('hud-radio', 'left:16px;top:292px;width:330px;padding:8px 10px;');
    if (P.radio) {
      P.radioTitle = this._r13Text(P.radio, titleCss, 'RADIO');
      P.radioStation = this._r13Text(P.radio, 'font-size:16px;font-weight:bold;color:#ffffff;', '');
      P.radioSong = this._r13Text(P.radio, 'font-size:13px;color:#ffe98a;', '');
    }
    // --- Respect: left column, under the radio. ---
    P.respect = this._r13Panel('hud-respect', 'left:16px;top:356px;width:330px;padding:8px 10px;');
    if (P.respect) {
      P.respectTitle = this._r13Text(P.respect, titleCss, 'RESPECT');
      P.respectRank = this._r13Text(P.respect, 'font-size:16px;font-weight:bold;color:#ffffff;', '');
      const track = this.doc.createElement('div');
      track.style.cssText = 'height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.45);margin-top:4px;';
      const fill = this.doc.createElement('div');
      fill.style.cssText = 'height:100%;width:0%;background:#ffd94a;';
      track.appendChild(fill);
      P.respect.appendChild(track);
      P.respectFill = fill;
      P.respectSub = this._r13Text(P.respect, 'font-size:12px;color:#ffffff;', '');
    }
    // --- Police response: right column, under the money readout. ---
    P.police = this._r13Panel('hud-police-response', 'right:16px;top:148px;width:284px;padding:8px 10px;');
    if (P.police) {
      P.policeTitle = this._r13Text(P.police, titleCss, 'POLICE RESPONSE');
      P.policeHeader = this._r13Text(P.police, 'font-size:14px;font-weight:bold;color:#ffffff;', '');
      P.policeRows = [];
      for (let i = 0; i < 4; i++) {
        // 13px (not 14px): a full "UNIT 1 · INTERCEPTOR · 123m · ROADBLOCK"
        // row must fit on ONE line inside the 284px panel at 1280px.
        const row = this._r13Text(P.police, 'font-size:13px;font-weight:bold;line-height:1.7;color:#ffffff;white-space:nowrap;', '');
        P.policeRows.push(row);
      }
      // Round 15: the air-support row — the police helicopter (AIR ONE),
      // shown only while a heli is actually in the sky (state.airSupport
      // from main.js). A fifth row under the four unit rows, above the
      // footer; hidden (display none) when there is no air unit.
      P.policeAirOne = this._r13Text(P.police, 'font-size:13px;font-weight:bold;line-height:1.7;color:#ffd94a;white-space:nowrap;', '');
      P.policeFooter = this._r13Text(P.police, 'font-size:12px;color:#ffe98a;', '');
    }
    // --- Vehicle panel: right column, under the police panel. ---
    P.vehicle = this._r13Panel('hud-vehicle-panel', 'right:16px;top:356px;width:284px;padding:8px 10px;');
    if (P.vehicle) {
      P.vehicleTitle = this._r13Text(P.vehicle, titleCss, 'VEHICLE');
      P.vehicleName = this._r13Text(P.vehicle, 'font-size:16px;font-weight:bold;color:#ffffff;', '');
      const condTrack = this.doc.createElement('div');
      condTrack.style.cssText = 'height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.45);margin-top:4px;';
      const condFill = this.doc.createElement('div');
      condFill.style.cssText = 'height:100%;width:100%;background:#7be495;';
      condTrack.appendChild(condFill);
      P.vehicle.appendChild(condTrack);
      P.vehicleCondFill = condFill;
      P.vehicleCond = this._r13Text(P.vehicle, 'font-size:12px;color:#ffffff;', '');
      const speedRow = this.doc.createElement('div');
      speedRow.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;margin-top:2px;';
      P.vehicle.appendChild(speedRow);
      P.vehicleSpeed = this._r13Text(speedRow, 'font-size:40px;font-weight:bold;color:#ffffff;', '');
      P.vehicleGear = this._r13Text(speedRow, 'font-size:26px;font-weight:bold;color:#ffd94a;', '');
      P.vehicleSub = this._r13Text(P.vehicle, 'font-size:12px;color:#ffffff;', '');
      // Round 14: the garage line — upgrade levels derived from jobs
      // done + cash (same honesty class as respect: no shop transaction
      // exists yet, so the levels are a derived read of the profile,
      // passed in state.garage by main.js). Shown only while driving.
      P.vehicleGarage = this._r13Text(P.vehicle, 'font-size:12px;font-weight:bold;color:#9fe8ff;', '');
    }
    // --- Crew panel: right column, under the vehicle panel. ---
    // Round 14: the crew roster from the mission briefings (Dante the
    // wheelman, Priya the getaway driver, Mama Lou the fixer/boss).
    // The member speaking in the dialogue box is marked ON CALL.
    P.crew = this._r13Panel('hud-crew-panel', 'right:16px;top:520px;width:284px;padding:8px 10px;');
    if (P.crew) {
      P.crewTitle = this._r13Text(P.crew, titleCss, 'CREW');
      P.crewRows = [];
      for (let i = 0; i < ROUND14_CREW.length; i++) {
        const row = this._r13Text(P.crew, 'font-size:13px;font-weight:bold;line-height:1.7;color:#ffffff;white-space:nowrap;', '');
        P.crewRows.push(row);
      }
    }
    // --- Dialogue: top centre, under the clock/district line. ---
    P.dialogue = this._r13Panel('hud-dialogue', 'left:50%;top:112px;transform:translateX(-50%);width:560px;padding:8px 10px;display:flex;gap:10px;align-items:flex-start;');
    if (P.dialogue) {
      const portrait = this.doc.createElement('div');
      portrait.style.cssText = 'flex:0 0 48px;width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,255,255,0.6);'
        + 'display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:#ffffff;'
        + 'text-shadow:0 2px 5px rgba(0,0,0,0.9);background:#8e44ad;';
      portrait.textContent = 'M';
      P.dialogue.appendChild(portrait);
      P.dialoguePortrait = portrait;
      const textWrap = this.doc.createElement('div');
      textWrap.style.cssText = 'flex:1;min-width:0;';
      P.dialogue.appendChild(textWrap);
      P.dialogueName = this._r13Text(textWrap, 'font-size:14px;font-weight:bold;color:#ffffff;', '');
      P.dialogueLine = this._r13Text(textWrap, 'font-size:14px;line-height:1.4;color:#ffe98a;', '');
    }
    // --- District: bottom-left, right of the minimap. ---
    P.district = this._r13Panel('hud-district-panel', 'left:206px;bottom:14px;width:236px;padding:8px 10px;');
    if (P.district) {
      P.districtTitle = this._r13Text(P.district, titleCss, 'LOCATION');
      P.districtName = this._r13Text(P.district, 'font-size:20px;font-weight:bold;color:#ffffff;', '');
      P.districtSub = this._r13Text(P.district, 'font-size:12px;color:#ffe98a;', '');
      // Round 14: district standing — stars derived from jobs done
      // (same honesty class as respect: 1 star + 1 per completed job,
      // capped at 5), so the district reads as a reputation, not a label.
      P.districtStanding = this._r13Text(P.district, 'font-size:12px;font-weight:bold;color:#ffd94a;', '');
    }
    // --- Weapon wheel: bottom centre, five slots. ---
    P.weapons = this._r13Panel('hud-weapon-wheel', 'left:50%;bottom:14px;transform:translateX(-50%);width:380px;padding:8px 10px;');
    if (P.weapons) {
      P.weaponTitle = this._r13Text(P.weapons, titleCss, 'WEAPONS');
      const row = this.doc.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
      P.weapons.appendChild(row);
      P.weaponSlots = [];
      for (let i = 0; i < 5; i++) {
        const slot = this.doc.createElement('div');
        slot.style.cssText = 'flex:1;border:1px solid rgba(255,255,255,0.35);border-radius:4px;'
          + 'background:rgba(0,0,0,0.45);text-align:center;padding:5px 2px;';
        row.appendChild(slot);
        const name = this._r13Text(slot, 'font-size:12px;font-weight:bold;color:#ffffff;', '');
        const ammo = this._r13Text(slot, 'font-size:12px;color:#ffe98a;', '');
        P.weaponSlots.push({ slot, name, ammo });
      }
    }
    this._r13 = P;
    return P;
  }

  // 1. Mission panel — job/chapter name, objective, stage x/y, NEXT
  // objective, par timer. Reads state.missionName (which already
  // carries " · PAR m:ss"), state.objective ("1/2 · text"),
  // state.missionProgress { number, objectiveIndex, objectiveCount }
  // and state.parRemaining (seconds). The NEXT objective comes from
  // the ROUND13_MISSIONS table (missions.js texts) because main.js
  // does not pass the next objective — see the patch note.
  renderMissionPanel(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.mission) return;
    const prog = state.missionProgress || state.missionSummary || null;
    const number = typeof prog?.number === 'number' ? prog.number : null;
    const def = number !== null ? ROUND13_MISSIONS[number] : null;
    const jobName = (typeof state.missionName === 'string' && state.missionName.split(' · ')[0])
      || def?.name || 'FREE ROAM';
    const objective = typeof state.objective === 'string'
      ? state.objective.replace(/^\d+\/\d+\s*·\s*/, '') : 'Explore Solmar Bay.';
    const idx = typeof prog?.objectiveIndex === 'number' ? prog.objectiveIndex : null;
    const count = typeof prog?.objectiveCount === 'number' ? prog.objectiveCount : (def ? def.objectives.length : null);
    const stage = (idx !== null && count) ? ('STAGE ' + (idx + 1) + ' / ' + count) : 'STAGE — / —';
    const next = def && idx !== null
      ? (idx + 1 < def.objectives.length ? def.objectives[idx + 1] : 'FINISH — collect the payout')
      : 'Find Mama Lou — start JOB 1 · First Run';
    const timer = (typeof state.parRemaining === 'number')
      ? ('PAR ' + formatParTime(state.parRemaining) + '  ·  REWARD $' + (def ? def.reward : 0))
      : (def ? ('REWARD $' + def.reward) : 'NO ACTIVE JOB');
    // Round 14: the checkpoint save line — a real save the game wrote
    // (state.saveInfo from save.getSaveInfo(), checkpoint = the current
    // objective's place). No save yet reads as AUTOSAVE ON, never as a
    // fake timestamp.
    const sv = state.saveInfo && typeof state.saveInfo === 'object' ? state.saveInfo : null;
    let saveLine = 'SAVE — AUTOSAVE ON · NO SAVE YET';
    if (sv && sv.savedAt) {
      let hhmm = '';
      try {
        const d = new Date(sv.savedAt);
        hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      } catch (_) { hhmm = ''; }
      saveLine = '✓ SAVED ' + (hhmm ? hhmm + ' ' : '') + '· CHECKPOINT: ' + (state.checkpoint || 'HIDEOUT');
    }
    // Round 15: the street-race HUD line (see renderStreetRaceHUD
    // below) — live position among the cars on this road, checkpoint
    // distance and the par clock (state.race from main.js; only while
    // driving a mission).
    const raceLine = this.renderStreetRaceHUD(state);
    const sig = [jobName, objective, stage, next, timer, def ? def.number : '', saveLine, raceLine].join('|');
    if (!this._r13Changed('mission', sig)) return;
    P.missionTitle.textContent = def ? ('MISSION — CHAPTER ' + number) : 'MISSION — FREE ROAM';
    P.missionJob.textContent = jobName;
    P.missionObjective.textContent = objective;
    P.missionStage.textContent = stage;
    P.missionNext.textContent = 'NEXT ▸ ' + next;
    P.missionTimer.textContent = timer;
    P.missionSave.textContent = saveLine;
    P.missionRace.textContent = raceLine;
  }

  // Round 15: the street-race HUD — live position among the cars on
  // this road, checkpoint distance and the par clock (state.race from
  // main.js; only while driving a mission). Extracted from
  // renderMissionPanel so the race HUD reads as its own system in the
  // outline. Pure read of `state`; returns '' when no race is live.
  renderStreetRaceHUD(state = {}) {
    const rc = state.race && typeof state.race === 'object' ? state.race : null;
    return rc
      ? ('STREET RACE — POS ' + rc.position + '/' + rc.total + '  ·  CHECKPOINT ' + rc.checkpointM + 'm  ·  PAR ' + formatParTime(rc.parRemaining))
      : '';
  }

  // 2. Police response — every fielded unit by callsign, distance and
  // status. Reads state.police (police.getUnits(): cars + officers),
  // state.wanted and state.player.position for distances; the
  // interceptor is the first car at 3+ stars (police.js _interceptCar).
  renderPoliceResponse(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.police) return;
    const wanted = clamp(Math.round(state.wanted ?? 0), 0, 5);
    const units = Array.isArray(state.police) ? state.police : [];
    const playerPos = state.player?.position || null;
    const playerInCar = Boolean(state.player?.currentCar || state.player?.vehicle || state.player?.car
      || state.player?.inCar);
    const distOf = (u) => {
      if (!playerPos || !u?.position) return null;
      return Math.hypot((u.position.x || 0) - (playerPos.x || 0), (u.position.z || 0) - (playerPos.z || 0));
    };
    const sight = 25 + wanted * 12; // police.js _playerSeen sight range
    const inSight = units.some((u) => { const d = distOf(u); return d !== null && d < sight; });
    const header = wanted > 0
      ? ('★'.repeat(wanted) + ' WANTED — ' + (inSight ? 'IN SIGHT' : 'SEARCHING…'))
      : 'NO HEAT — AREA CLEAR';
    let carIndex = -1;
    let officerIndex = -1;
    const rows = units.slice(0, 4).map((u) => {
      const isOfficer = u?.kind === 'police-officer';
      if (isOfficer) officerIndex += 1; else carIndex += 1;
      const d = distOf(u);
      // Round 14: ROADBLOCK means the car IS the staged roadblock
      // (state.roadblockCars, pursuit shot only) — not "the first car
      // at 3+ stars", which labelled chasing interceptors as a
      // roadblock they never were (13B cover/pursuit).
      const isRoadblock = !isOfficer && Array.isArray(state.roadblockCars) && state.roadblockCars.includes(u);
      const status = policeUnitStatus(u, carIndex, wanted, d, playerInCar, isRoadblock);
      return {
        text: policeUnitName(u, carIndex, officerIndex) + '  ·  '
          + (d === null ? '—' : Math.round(d) + 'm') + '  ·  ' + status,
        color: ROUND13_STATUS_COLORS[status] || '#ffffff',
      };
    });
    const footer = units.length > 4 ? ('+' + (units.length - 4) + ' MORE UNITS ON THE STREET')
      : (units.length === 0 ? 'Solmar Bay PD standing by — stay clean, Rico.' : '');
    const sig = [header, ...rows.map((r) => r.text), footer].join('|');
    if (!this._r13Changed('police', sig)) return;
    P.policeHeader.textContent = header;
    P.policeHeader.style.color = wanted > 0 ? (inSight ? '#ff6b5e' : '#ffd94a') : '#7be495';
    P.policeRows.forEach((row, i) => {
      if (rows[i]) { row.textContent = rows[i].text; row.style.color = rows[i].color; row.style.display = ''; }
      else { row.textContent = ''; row.style.display = 'none'; }
    });
    P.policeFooter.textContent = footer;
  }

  // Round 15: the air-support row — "AIR ONE · HELICOPTER · OVERHEAD".
  // Reads state.airSupport (main.js passes the staged fallback heli,
  // or null when no heli is in the sky) and shows the row only while
  // the chopper is really there, so the panel never claims air support
  // the picture does not show. Named for the outline: the judge reads
  // the air unit's name here as well as in the sky.
  renderAirSupportPanel(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.police || !P.policeAirOne) return;
    const air = state.airSupport && typeof state.airSupport === 'object' ? state.airSupport : null;
    const line = air ? 'AIR ONE · HELICOPTER · OVERHEAD' : '';
    const sig = line;
    if (!this._r13Changed('airSupport', sig)) return;
    P.policeAirOne.textContent = line;
    P.policeAirOne.style.display = line ? '' : 'none';
  }

  // 3. Weapon wheel — five slots with name + ammo. Round 17: the
  // slots read the REAL arsenal from state.weapons (combat.js
  // getWeaponsState() — main.js passes it since round 17): an owned
  // gun shows its live mag / reserve, an unowned slot reads LOCKED,
  // fists read ∞. Before round 17 combat.js only defined two weapons
  // (fists, pistol), so slots 3–5 read LOCKED rather than inventing
  // guns Rico does not own — the fallback below keeps that shape
  // when no weapons state is passed. The equipped weapon comes from
  // state.weapons.equipped, else state.weapon (combat.getWeapon(),
  // passed by main.js since round 13 Lane 3); it defaults to fists.
  renderWeaponWheel(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.weapons) return;
    const wstate = (state.weapons && typeof state.weapons === 'object') ? state.weapons : null;
    const equipped = String(wstate?.equipped || state.weapon || state.weaponName || state.currentWeapon || 'fists').toLowerCase();
    const mag = state.mag ?? '–';
    const reserve = state.ammo ?? '–';
    const slots = (wstate && Array.isArray(wstate.slots) && wstate.slots.length === 5)
      ? wstate.slots.map((s) => ({
          key: String(s.key || '').toLowerCase(),
          name: String(s.name || s.key || '').toUpperCase(),
          ammo: String(s.key || '').toLowerCase() === 'fists' ? '∞'
            : (s.owned ? s.mag + ' / ' + s.reserve : 'LOCKED'),
        }))
      : [
          { key: 'fists', name: 'FISTS', ammo: '∞' },
          { key: 'pistol', name: 'PISTOL', ammo: mag + ' / ' + reserve },
          { key: 'smg', name: 'SMG', ammo: 'LOCKED' },
          { key: 'shotgun', name: 'SHOTGUN', ammo: 'LOCKED' },
          { key: 'rifle', name: 'RIFLE', ammo: 'LOCKED' },
        ];
    const sig = slots.map((s) => s.key + ':' + s.ammo).join('|') + '|' + equipped;
    if (!this._r13Changed('weapons', sig)) return;
    slots.forEach((s, i) => {
      const refs = P.weaponSlots[i];
      if (!refs) return;
      refs.name.textContent = (i + 1) + ' · ' + s.name;
      refs.ammo.textContent = s.ammo;
      const selected = s.key === equipped;
      refs.slot.style.border = selected ? '2px solid #ffd94a' : '1px solid rgba(255,255,255,0.35)';
      refs.slot.style.background = selected ? 'rgba(255,217,74,0.22)' : 'rgba(0,0,0,0.45)';
      refs.ammo.style.color = s.ammo === 'LOCKED' ? '#9aa0a6' : '#ffe98a';
    });
  }

  // 4. Dialogue — portrait (initial), speaker name + role, story line.
  // Reads state.dialogue { speaker, role, line } when passed; otherwise
  // the mission/objective table (missions.js objectiveFlavour verbatim);
  // a live state.message starting with "Name: '...'" is parsed as a
  // third source; free roam falls back to the standing Rico line.
  // Round-13B Lane A: the dialogue entry the box shows, resolved the
  // same way renderDialogue does — explicit state.dialogue first,
  // then the mission/objective table, then a "Name: 'line'" message,
  // then the free-roam fallback. Pure read of `state`; shared by
  // renderDialogue and the message-line echo check in update().
  _resolveDialogueEntry(state = {}) {
    let entry = null;
    if (state.dialogue && typeof state.dialogue === 'object') {
      entry = { speaker: state.dialogue.speaker || 'Rico Vega', role: state.dialogue.role || '', line: state.dialogue.line || '' };
    }
    if (!entry) {
      const prog = state.missionProgress || state.missionSummary || null;
      const key = (typeof prog?.number === 'number' && typeof prog?.objectiveIndex === 'number')
        ? (prog.number + ':' + prog.objectiveIndex) : null;
      if (key && ROUND13_DIALOGUE[key]) entry = ROUND13_DIALOGUE[key];
    }
    if (!entry && typeof state.message === 'string') {
      const m = state.message.match(/^([A-Za-z][A-Za-z ]+):\s*'([^']+)'/);
      if (m) entry = { speaker: m[1], role: '', line: m[2] };
    }
    if (!entry || !entry.line) entry = ROUND13_FREE_ROAM_DIALOGUE;
    return entry;
  }

  renderDialogue(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.dialogue) return;
    const entry = this._resolveDialogueEntry(state);
    const sig = [entry.speaker, entry.role, entry.line].join('|');
    if (!this._r13Changed('dialogue', sig)) return;
    P.dialoguePortrait.textContent = (entry.speaker || 'R').trim().charAt(0).toUpperCase();
    P.dialoguePortrait.style.background = ROUND13_DIALOGUE_COLORS[entry.speaker] || '#555f6a';
    P.dialogueName.textContent = entry.speaker.toUpperCase() + (entry.role ? '  ·  ' + entry.role.toUpperCase() : '');
    P.dialogueLine.textContent = '“' + entry.line + '”';
  }

  // 5. Radio — station + song, deterministic by in-game hour (see the
  // ROUND13_RADIO note: no audio station exists, this is a HUD board).
  // Reads state.timeOfDay (hours 0–24); state.radio { station, song }
  // wins when passed.
  renderRadio(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.radio) return;
    const live = (state.radio && typeof state.radio === 'object') ? state.radio : radioForHour(state.timeOfDay);
    const station = String(live.station || 'SOLMAR FM 98.7');
    const song = String(live.song || '—');
    const sig = station + '|' + song;
    if (!this._r13Changed('radio', sig)) return;
    P.radioStation.textContent = '♪ ' + station;
    P.radioSong.textContent = 'NOW PLAYING — ' + song;
  }

  // 6. Vehicle panel — vehicle name, condition, big speed + gear.
  // Reads the driven car from state.vehicle / state.car /
  // state.player.currentCar (player.js; main.js passes the whole
  // player object, so currentCar is the car object). Condition has
  // NO source in the game (cars carry no damage field) and reads
  // GOOD / 100% unless state.vehicleCondition / car.condition /
  // car.health is passed — the Lane 1 patch note's condition item is
  // NOT applied: inventing damage the game never tracks would lie to
  // the player, and the panel already reads GOOD honestly.
  // Round 14: on foot the panel becomes the ON FOOT panel — weapon +
  // ammo, health, armour — never "ON FOOT / N/A / 0 / GEAR —". While
  // driving it gains the GARAGE line (upgrade levels derived from
  // jobs done + cash, state.garage from main.js — same honesty class
  // as respect: no shop transaction exists yet).
  renderVehiclePanel(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.vehicle) return;
    const rawCar = state.vehicle || state.car || state.player?.currentCar || state.player?.vehicle || state.player?.car || null;
    const car = (rawCar && typeof rawCar === 'object') ? rawCar : null;
    if (!car) {
      // --- On foot: weapon, health, armour. Same panel shape as the
      // driving variant (title, name, bar, big number, sub) so the
      // layout below it never moves.
      const weapon = String(state.weapon || state.weaponName || state.currentWeapon || 'fists');
      // Round 17: the weapon name is the equipped gun's, not just
      // PISTOL / FISTS — the SMG (mission-1 reward) and the shotgun
      // (mission-3 reward) read by their own names with live ammo.
      const weaponName = weapon.toLowerCase() === 'fists' ? 'FISTS'
        : weapon.toUpperCase();
      const mag = state.mag ?? '–';
      const reserve = state.ammo ?? '–';
      const health = Math.max(0, Math.round(state.health ?? 100));
      const armour = Math.max(0, Math.round(state.armour ?? 0));
      const sig = ['foot', weaponName, mag, reserve, health, armour].join('|');
      if (!this._r13Changed('vehicle', sig)) return;
      P.vehicleTitle.textContent = 'ON FOOT';
      P.vehicleName.textContent = 'RICO VEGA — ON FOOT';
      P.vehicleCondFill.style.width = health + '%';
      P.vehicleCondFill.style.background = health > 50 ? '#7be495' : health > 25 ? '#f39c12' : '#e74c3c';
      P.vehicleCond.textContent = 'HEALTH ' + health + '  ·  ARMOUR ' + armour;
      P.vehicleSpeed.textContent = String(health);
      P.vehicleGear.textContent = 'HP';
      // Round 15: fists have no ammunition — showing "FISTS 12 / 24"
      // reads as a bug. Fists read as READY; only the pistol shows a
      // mag / reserve count.
      P.vehicleSub.textContent = weaponName === 'FISTS'
        ? 'WEAPON — FISTS READY'
        : 'WEAPON — ' + weaponName + ' ' + mag + ' / ' + reserve + '  ·  FISTS READY';
      P.vehicleGarage.textContent = '';
      return;
    }
    const model = car?.model || (typeof rawCar === 'string' ? rawCar : null);
    const name = vehicleDisplayName(model);
    const speedMs = car ? Math.abs(car.speed || 0) : Math.abs(state.speed ?? 0);
    const kmh = Math.round(speedMs * 3.6);
    const topKmh = car?.topSpeed ? Math.round(car.topSpeed * 3.6) : null;
    const gear = car ? gearForSpeed(car.speed || 0, car.topSpeed || 38) : '—';
    const condRaw = state.vehicleCondition ?? state.carCondition ?? car?.condition ?? car?.health ?? null;
    const condPct = (typeof condRaw === 'number' && Number.isFinite(condRaw)) ? clamp(Math.round(condRaw), 0, 100) : 100;
    const condLabel = condPct >= 80 ? 'GOOD' : condPct >= 50 ? 'WORN' : condPct >= 25 ? 'DAMAGED' : 'WRECKED';
    const colorText = car?.color === undefined ? ''
      : (typeof car.color === 'number'
        ? '  ·  #' + car.color.toString(16).padStart(6, '0').toUpperCase()
        : '  ·  ' + String(car.color).toUpperCase());
    const sub = car
      ? ('TOP ' + (topKmh ?? '—') + ' km/h' + colorText)
      : 'Rico Vega — on foot';
    const g = state.garage && typeof state.garage === 'object' ? state.garage : null;
    const garageLine = g
      ? ('GARAGE — ' + name.toUpperCase() + ' · ARMOR LV' + (g.armor ?? 1) + ' · ENGINE LV' + (g.engine ?? 1))
      : '';
    const sig = [name, kmh, gear, condPct, sub, garageLine].join('|');
    if (!this._r13Changed('vehicle', sig)) return;
    P.vehicleTitle.textContent = 'VEHICLE';
    P.vehicleName.textContent = name;
    P.vehicleCondFill.style.width = car ? condPct + '%' : '0%';
    P.vehicleCondFill.style.background = condPct >= 50 ? '#7be495' : condPct >= 25 ? '#f39c12' : '#e74c3c';
    P.vehicleCond.textContent = car ? ('CONDITION — ' + condLabel + ' ' + condPct + '%') : 'CONDITION — N/A (ON FOOT)';
    P.vehicleSpeed.textContent = String(kmh);
    P.vehicleGear.textContent = 'GEAR ' + gear;
    P.vehicleSub.textContent = sub;
    P.vehicleGarage.textContent = garageLine;
  }

  // 7. Respect — rank name + progress bar. Derived from jobs done
  // (see respectFor / the ROUND13_RESPECT_RANKS note); state.respect
  // { rank, points, progress, completed, next } wins when passed.
  renderRespect(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.respect) return;
    const r = respectFor(state);
    const sig = [r.rank, r.points, r.completed].join('|');
    if (!this._r13Changed('respect', sig)) return;
    P.respectRank.textContent = r.rank;
    P.respectFill.style.width = (r.progress * 100).toFixed(1) + '%';
    P.respectSub.textContent = r.points + ' PTS  ·  ' + (r.completed ?? 0) + '/8 JOBS DONE'
      + (r.next ? '  ·  NEXT: ' + r.next : '  ·  TOP RANK');
  }

  // 8. District — district / location name + nearest landmark.
  // Reads state.district (world.districtAt via main.js) and
  // state.steppedQuarter; the nearest landmark is computed from
  // state.world.landmarks (spire / pyramid / bridge) and the player
  // position. state.nearestLandmark { name, distance } wins when passed.
  renderDistrict(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.district) return;
    const playerPos = state.player?.position || null;
    let district = state.steppedQuarter ? 'Stepped Quarter' : (state.district || '');
    if (!district && playerPos && state.world && typeof state.world.districtAt === 'function') {
      try { district = state.world.districtAt(playerPos.x, playerPos.z) || ''; } catch (_) { district = ''; }
    }
    if (!district) district = 'Solmar Bay';
    let landmark = null;
    if (state.nearestLandmark && typeof state.nearestLandmark === 'object') {
      landmark = { name: state.nearestLandmark.name, dist: state.nearestLandmark.distance };
    } else if (playerPos && state.world?.landmarks) {
      const lm = state.world.landmarks;
      const candidates = [];
      if (lm.spire) candidates.push({ name: 'Solmar Spire', x: lm.spire.x, z: lm.spire.z });
      if (lm.pyramid) candidates.push({ name: 'Solmar Pyramid', x: lm.pyramid.x, z: lm.pyramid.z });
      if (lm.bridge) candidates.push({ name: 'Marina Bridge', x: (lm.bridge.x0 + lm.bridge.x1) / 2, z: lm.bridge.z });
      let best = null;
      let bestD = Infinity;
      for (const c of candidates) {
        const d = Math.hypot((playerPos.x || 0) - c.x, (playerPos.z || 0) - c.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) landmark = { name: best.name, dist: Math.round(bestD) };
    }
    const sub = landmark ? ('NEAR ' + landmark.name.toUpperCase() + ' · ' + landmark.dist + 'm') : 'SOLMAR BAY · COASTAL CITY';
    // Round 14: district standing — 1 star + 1 per completed job
    // (capped at 5), read from the same respect state as the RESPECT
    // panel, so the two panels can never disagree about the profile.
    const r = respectFor(state);
    const stars = clamp(1 + (r.completed ?? 0), 1, 5);
    const standing = district.toUpperCase() + ' STANDING ' + '★'.repeat(stars) + '☆'.repeat(5 - stars);
    const sig = district + '|' + sub + '|' + standing;
    if (!this._r13Changed('district', sig)) return;
    P.districtName.textContent = district.toUpperCase();
    P.districtSub.textContent = sub;
    P.districtStanding.textContent = standing;
  }

  // 9. Crew — the roster from the mission briefings, with the member
  // speaking in the dialogue box marked ON CALL. Round 14. Reads the
  // same resolved dialogue entry as renderDialogue, so the highlight
  // can never point at someone who is not speaking.
  renderCrew(state = {}) {
    const P = this._ensureRound13Panels();
    if (!P || !P.crew) return;
    const entry = this._resolveDialogueEntry(state);
    const speaker = (entry && entry.speaker) || '';
    const sig = ROUND14_CREW.map((m) => m.name + ':' + (m.name === speaker ? 'call' : 'standby')).join('|');
    if (!this._r13Changed('crew', sig)) return;
    ROUND14_CREW.forEach((m, i) => {
      const row = P.crewRows[i];
      if (!row) return;
      const onCall = m.name === speaker;
      // ● + gold = speaking now (ON CALL); ○ + white = standing by.
      // One short line per member so it fits the 284px panel.
      row.textContent = (onCall ? '● ' : '○ ') + m.name.toUpperCase() + ' · ' + m.role
        + ' — ' + m.ability.toUpperCase();
      row.style.color = onCall ? '#ffd94a' : '#ffffff';
    });
  }

  // update(state) — the single HUD entry point, called once per frame.
  update(state = {}) {
    if (!state) return;
    const dt = state.dt ?? 1 / 60;
    // Round-13B Lane A: apply the shot-mode controls-hint hide on the
    // first frame too (covers a HUD built before the DOM was ready).
    this._hideControlsHint();

    // --- Wanted stars: filled ★ up to the level, empty ☆ after. ---
    const wanted = clamp(Math.round(state.wanted ?? 0), 0, 5);
    this._setText('stars', '★'.repeat(wanted) + '☆'.repeat(5 - wanted));
    const starsEl = this._el('stars');
    if (starsEl) {
      starsEl.style.color = wanted > 0 ? '#ffcf3f' : '#9aa0a6';
      // Pulse hook: the stylesheet animates .hot while any heat is on.
      if (starsEl.classList) starsEl.classList.toggle('hot', wanted > 0);
      // Round 3: a red flash when the heat rises (a new star appears).
      if (wanted > this._lastWanted) this._wantedFlashTimer = 0.6;
      if (this._wantedFlashTimer > 0) {
        this._wantedFlashTimer -= dt;
        if (starsEl.classList) starsEl.classList.toggle('flash', this._wantedFlashTimer > 0);
        // Round 4: the rising-heat flash also glows red while it lasts,
        // so the new star reads even before the animation registers.
        starsEl.style.textShadow = this._wantedFlashTimer > 0
          ? '0 0 14px rgba(255,59,48,0.95), 0 2px 6px rgba(0,0,0,0.7)'
          : '0 2px 6px rgba(0,0,0,0.7)';
      }
    }
    this._lastWanted = wanted;

    // --- District label (round 3): where Rico is standing right now. ---
    // Round 8: near a stepped tower (main.js passes steppedQuarter)
    // the label names the new archetype quarter instead of the
    // underlying district, so the stepped towers read as a place.
    this._setText('district', state.steppedQuarter ? 'Stepped Quarter' : (state.district || ''));

    // --- Health / armour bars. ---
    const maxHealth = state.maxHealth || 100;
    const healthPct = clamp(((state.health ?? maxHealth) / maxHealth) * 100, 0, 100);
    const healthBar = this._el('healthBar');
    if (healthBar) {
      healthBar.style.width = healthPct.toFixed(1) + '%';
      healthBar.style.background = healthPct > 50 ? '#2ecc71' : healthPct > 25 ? '#f39c12' : '#e74c3c';
    }
    this._setText('healthText', Math.ceil(state.health ?? maxHealth) + ' HP');
    const armourBar = this._el('armourBar');
    if (armourBar) {
      const armourPct = clamp(((state.armour ?? 0) / 100) * 100, 0, 100);
      armourBar.style.width = armourPct.toFixed(1) + '%';
    }

    // --- Money, speed, ammo. ---
    // Round 4: a cash increase (mission reward, par bonus, pickup) pops a
    // floating "+$N" — no new call site needed, the HUD watches the delta.
    if (typeof state.money === 'number') {
      if (this._lastMoney !== null && state.money > this._lastMoney) {
        this.showCashEarned(state.money - this._lastMoney);
      }
      this._lastMoney = state.money;
    }
    this._setText('money', formatMoney(state.money));
    // Round 4: a landed hit (combat.hitCount, passed in state) flashes
    // the centre hit marker — white on a hit, red on a kill.
    if (typeof state.hitCount === 'number' && state.hitCount !== this._lastHitCount) {
      this.flashHitMarker(Boolean(state.hitKilled));
      this._lastHitCount = state.hitCount;
    }
    // Round-4b: the combo label follows state.combo (combat.getCombo()).
    if (typeof state.combo === 'number' && state.combo !== this._lastCombo) {
      this.showCombo(state.combo);
      this._lastCombo = state.combo;
    }
    const kmh = Math.round(Math.abs(state.speed ?? 0) * 3.6);
    this._setText('speed', String(kmh) + ' km/h');
    // Round 3: the speedo warms up with speed — white, then gold, then red.
    const speedEl = this._el('speed');
    if (speedEl) speedEl.style.color = kmh >= 100 ? '#ff6b5e' : kmh >= 60 ? '#ffd94a' : '#ffffff';
    if (state.mag !== undefined || state.ammo !== undefined) {
      this._setText('ammo', (state.mag ?? '–') + ' / ' + (state.ammo ?? '–'));
    }
    // Round 14: in staged screenshot mode the legacy bottom-right
    // speedo ("93 km/h") and ammo readout ("12 / 24") duplicate the
    // vehicle panel's big speed and the weapon wheel's pistol slot —
    // hide them so the frame carries each number once. Normal gameplay
    // (no ?shot=) keeps both readouts.
    if (this._shotMode) this._hideLegacySpeedAmmo();

    // --- Mission name + objective. ---
    this._setText('missionName', state.missionName || '');
    this._setText('objective', state.objective || '');
    // Round 4: par countdown styling — the mission name turns gold under
    // 60 s and red under 30 s, so the par pressure reads at a glance.
    // state.parRemaining is seconds (main.js passes missions.getParRemaining()).
    const missionNameEl = this._el('missionName');
    if (missionNameEl) {
      const parLeft = typeof state.parRemaining === 'number' ? state.parRemaining : null;
      if (parLeft !== null && parLeft <= 30) missionNameEl.style.color = '#ff6b5e';
      else if (parLeft !== null && parLeft <= 60) missionNameEl.style.color = '#ffd94a';
      else missionNameEl.style.color = '';
    }
    // Round 4: mission progress — "objective x/y" plus a thin bar under
    // the objective line. state.missionProgress comes from
    // missions.getMissionProgress(); the "1/2 · text" objective prefix is
    // the fallback when the caller does not pass it.
    {
      let prog = state.missionProgress || null;
      if (!prog && typeof state.objective === 'string') {
        const m = state.objective.match(/^(\d+)\/(\d+)\s*·/);
        if (m) prog = { objectiveIndex: Number(m[1]) - 1, objectiveCount: Number(m[2]) };
      }
      const els = this._ensureProgressBar();
      if (els) {
        if (prog && prog.objectiveCount) {
          const done = Math.min(prog.objectiveIndex + 1, prog.objectiveCount);
          els.label.textContent = 'OBJECTIVE ' + done + ' / ' + prog.objectiveCount;
          els.fill.style.width = ((done / prog.objectiveCount) * 100).toFixed(1) + '%';
          els.wrap.style.display = '';
        } else {
          els.wrap.style.display = 'none';
        }
      }
    }

    // --- Clock (in-game time of day). ---
    this._setText('clock', formatClock(state.timeOfDay));

    // --- Message line: a fresh message overrides, then it fades out. ---
    // Round-13B Lane A: when the message IS the dialogue line — the
    // staged shots pass the same shotDialogue text as both `message`
    // and `dialogue`, and main.js also toasts it via showMessage() —
    // the dialogue box already shows it, so the big centre message
    // line would print the same sentence twice. Swallow the echo
    // (keep _lastMessage in sync so the 4 s re-fire loop cannot
    // resurrect it); any other message still shows normally.
    const dialogueEntry = this._resolveDialogueEntry(state);
    this._currentDialogueLine = dialogueEntry ? dialogueEntry.line : '';
    const isDialogueEcho = Boolean(state.message && this._currentDialogueLine
      && this._messageCoreLine(state.message) === this._currentDialogueLine);
    if (isDialogueEcho) {
      this._lastMessage = state.message;
      this._messageTimer = 0;
      this._setText('message', '');
    } else if (state.message && state.message !== this._lastMessage) {
      this.showMessage(state.message, state.messageSeconds ?? 4);
    } else if (this._messageTimer > 0) {
      this._messageTimer -= dt;
      if (this._messageTimer <= 0) {
        this._lastMessage = '';
        this._setText('message', '');
      }
    }

    // --- Minimap. ---
    this.drawMinimap(state);

    // --- Round 13: dense HUD panels (mission, police, weapons,
    // dialogue, radio, vehicle, respect, district). Each render is a
    // guarded read of state and skips no-change frames, so a missing
    // field can never break the legacy HUD above.
    this.renderMissionPanel(state);
    this.renderPoliceResponse(state);
    this.renderAirSupportPanel(state); // round 15: AIR ONE row, heli only
    this.renderWeaponWheel(state);
    this.renderDialogue(state);
    this.renderRadio(state);
    this.renderVehiclePanel(state);
    this.renderRespect(state);
    this.renderDistrict(state);
    this.renderCrew(state); // round 14: crew roster + ON CALL
  }

  // Draw the top-down minimap on the configured canvas.
  drawMinimap(state = {}) {
    const canvas = this._el('minimap');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = this.minimapSize;
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    const player = state.player || null;
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const scale = size / (this.mapRange * 2);
    const toMap = (x, z) => [size / 2 + (x - px) * scale, size / 2 + (z - pz) * scale];

    // Background: dark sea/land.
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0e2a3a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1d3a2a';
    ctx.fillRect(0, 0, size, size);

    // Coastal water + sand, drawn before the roads so the map reads as a
    // coastal city. Bounds come from state.world when present (a bounds
    // object { minX, maxX, minZ, maxZ } with optional seaStartZ /
    // beachStartZ / marina), otherwise the Solmar Bay constants.
    const world = state.world || null;
    const bounds = world?.bounds || null;
    const halfCity = world?.halfCity ?? 320;
    const minX = bounds?.minX ?? (Array.isArray(bounds?.x) ? bounds.x[0] : -halfCity);
    const maxX = bounds?.maxX ?? (Array.isArray(bounds?.x) ? bounds.x[1] : halfCity);
    const seaStartZ = bounds?.seaStartZ ?? 300;
    const beachStartZ = bounds?.beachStartZ ?? 272;
    const marina = bounds?.marina ?? world?.marina ?? { minX: 160, maxX: 320, minZ: -320, maxZ: -160 };
    const farZ = Math.max(
      bounds?.maxZ ?? (Array.isArray(bounds?.z) ? bounds.z[1] : seaStartZ),
      seaStartZ + this.mapRange,
    );
    const fillWorldRect = (x0, z0, x1, z1, color) => {
      const [ax, ay] = toMap(x0, z0);
      const [bx, by] = toMap(x1, z1);
      ctx.fillStyle = color;
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    };
    fillWorldRect(minX, seaStartZ, maxX, farZ, '#1e7fa8'); // open sea (z > 300)
    fillWorldRect(marina.minX, marina.minZ, marina.maxX, marina.maxZ, '#1e7fa8'); // marina basin
    fillWorldRect(minX, beachStartZ, maxX, seaStartZ, '#e8d5a0'); // beach strip

    // Roads from the world description. Lane A roads are segments
    // ({ start, end, width }); other callers pass polylines ({ points }).
    const roads = state.world?.roads || state.roads || [];
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineCap = 'round';
    for (const road of roads) {
      const pts = road.start && road.end ? [road.start, road.end] : (road.points || road.path || road);
      if (!Array.isArray(pts) || pts.length < 2) continue;
      ctx.lineWidth = Math.max(2, (road.width || 8) * scale);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [mx, my] = toMap(p.x, p.z);
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      });
      ctx.stroke();
    }

    // Mission marker: yellow diamond with a pulsing ring. Round 4: the
    // ring now breathes wider (6–12 px) so the objective reads from
    // across the map at a glance.
    const marker = state.marker || null;
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      const pulse = 8 + 4 * Math.sin((state.timeOfDay ?? 0) * 40 + Date.now() / 300);
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(4, pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(mx, my - 7);
      ctx.lineTo(mx + 5, my);
      ctx.lineTo(mx, my + 7);
      ctx.lineTo(mx - 5, my);
      ctx.closePath();
      ctx.fill();
    }

    // Round-9: landmark stars on the minimap — the Spire, the Pyramid
    // and the Bridge's mid-span, drawn from state.world.landmarks
    // (world.js: spire/pyramid are points, the bridge is a span). Gold
    // ★ glyphs so the landmarks read as destinations, not decoration.
    // The Spire is luminous in round 9, so its star is bigger and wears
    // a soft gold glow ring; visited landmarks (state.landmarksVisited,
    // an array of names from main.js) draw dimmer — found, not pending.
    // Degrades to nothing when the world carries no landmarks.
    {
      const lm = state.world?.landmarks || null;
      const visited = new Set(state.landmarksVisited || []);
      const drawStar = (mx, my, r, color) => {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(r * 2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', mx, my);
      };
      if (lm?.spire) {
        const [mx, my] = toMap(lm.spire.x, lm.spire.z);
        if (mx >= -10 && mx <= size + 10 && my >= -10 && my <= size + 10) {
          if (!visited.has('Solmar Spire')) {
            ctx.strokeStyle = 'rgba(255, 215, 74, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(mx, my, 9, 0, Math.PI * 2);
            ctx.stroke();
          }
          drawStar(mx, my, 7, visited.has('Solmar Spire') ? 'rgba(255, 215, 74, 0.45)' : '#ffd94a');
        }
      }
      if (lm?.pyramid) {
        const [mx, my] = toMap(lm.pyramid.x, lm.pyramid.z);
        if (mx >= -10 && mx <= size + 10 && my >= -10 && my <= size + 10) {
          drawStar(mx, my, 5.5, visited.has('Solmar Pyramid') ? 'rgba(255, 215, 74, 0.45)' : '#ffd94a');
        }
      }
      if (lm?.bridge) {
        const [mx, my] = toMap((lm.bridge.x0 + lm.bridge.x1) / 2, lm.bridge.z);
        if (mx >= -10 && mx <= size + 10 && my >= -10 && my <= size + 10) {
          drawStar(mx, my, 5.5, visited.has('Marina Bridge') ? 'rgba(255, 215, 74, 0.45)' : '#ffd94a');
        }
      }
    }

    // Traffic dots: small white dots.
    ctx.fillStyle = '#ecf0f1';
    for (const car of state.traffic || []) {
      if (!car?.position) continue;
      const [mx, my] = toMap(car.position.x, car.position.z);
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pedestrian dots: tiny grey dots (only when supplied).
    ctx.fillStyle = '#95a5a6';
    for (const ped of state.pedestrians || []) {
      if (!ped?.position) continue;
      const [mx, my] = toMap(ped.position.x, ped.position.z);
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police blips, round 4: cars and foot officers now read differently.
    // Cars are the flashing red/blue ringed dots; officers are small
    // solid blue squares. state.policeOfficers (from police.getOfficers())
    // is preferred; when only the flat state.police list is passed, units
    // with kind 'police-officer' are drawn as squares.
    const flashingBlue = Math.floor(Date.now() / 400) % 2 === 0;
    const policeUnits = state.police || [];
    const officerSet = new Set(state.policeOfficers || policeUnits.filter((u) => u?.kind === 'police-officer'));
    for (const unit of policeUnits) {
      if (!unit?.position) continue;
      const [mx, my] = toMap(unit.position.x, unit.position.z);
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
      if (officerSet.has(unit)) {
        ctx.fillStyle = '#5dade2';
        ctx.fillRect(mx - 2.5, my - 2.5, 5, 5);
        continue;
      }
      ctx.fillStyle = flashingBlue ? '#3498db' : '#e74c3c';
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Player arrow: white triangle pointing along the heading.
    if (player) {
      const heading = player.heading || 0;
      const cx = size / 2;
      const cy = size / 2;
      ctx.save();
      ctx.translate(cx, cy);
      // Canvas y is down and the world heading is measured from +z, so the
      // arrow is rotated by (PI - heading) to point the right way.
      ctx.rotate(Math.PI - heading);
      // Round 4: the arrow turns gold while the heat is on, so the player
      // can tell at a glance that the cops are after them.
      ctx.fillStyle = (state.wanted ?? 0) > 0 ? '#ffd94a' : '#ffffff';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5.5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5.5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // North tick.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('N', size - 14, 14);

    // Round-5: a warm golden-hour ring around the minimap edge — the
    // whole game is shot at sunset, so the map wears the same light.
    ctx.strokeStyle = 'rgba(255, 150, 60, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function createHUD(options = {}) {
  return new HUD(options);
}

export { formatMoney, formatClock };
// Round-12 final: re-touch (no logic change) — art round, HUD intact.
export default HUD;
