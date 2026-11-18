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
      ...(options.ids || {}),
    };
    this.elements = options.elements || {};
    this.minimapSize = options.minimapSize ?? 180;
    this.mapRange = options.mapRange ?? 220; // world metres shown across the map
    this._lastMessage = '';
    this._messageTimer = 0;
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
    }

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
    this._setText('money', formatMoney(state.money));
    const kmh = Math.round(Math.abs(state.speed ?? 0) * 3.6);
    this._setText('speed', String(kmh) + ' km/h');
    if (state.mag !== undefined || state.ammo !== undefined) {
      this._setText('ammo', (state.mag ?? '–') + ' / ' + (state.ammo ?? '–'));
    }

    // --- Mission name + objective. ---
    this._setText('missionName', state.missionName || '');
    this._setText('objective', state.objective || '');

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

    // Mission marker: yellow diamond with a pulsing ring.
    const marker = state.marker || null;
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      const pulse = 6 + 2 * Math.sin((state.timeOfDay ?? 0) * 40 + Date.now() / 300);
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

    // Police blips: red/blue flashing dots.
    const flashingBlue = Math.floor(Date.now() / 400) % 2 === 0;
    ctx.fillStyle = flashingBlue ? '#3498db' : '#e74c3c';
    for (const unit of state.police || []) {
      if (!unit?.position) continue;
      const [mx, my] = toMap(unit.position.x, unit.position.z);
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
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
      ctx.fillStyle = '#ffffff';
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
  }
}

export function createHUD(options = {}) {
  return new HUD(options);
}

export { formatMoney, formatClock };
export default HUD;
