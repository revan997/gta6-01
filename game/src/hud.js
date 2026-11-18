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
    this._lastMessage = text || '';
    this._messageTimer = seconds;
    this._setText('message', this._lastMessage);
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

  // update(state) — the single HUD entry point, called once per frame.
  update(state = {}) {
    if (!state) return;
    const dt = state.dt ?? 1 / 60;

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
    if (state.message && state.message !== this._lastMessage) {
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
export default HUD;
