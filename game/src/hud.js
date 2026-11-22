// Solmar Bay — HUD: health/cash/weapons/radio/respect/location/crew/police
// panels, dialogue, mission panels, real minimap, crosshair, menus.
// Fresh build for the round-16 rebuild (attempt #8). Written from the
// interface contract + rebuild spec; no old source read or copied.
import { CONFIG } from './config.js';

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text == null ? '' : String(text); };
const setShown = (id, shown) => {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !shown);
};

function drawMinimap(state) {
  const cv = $('hud-minimap');
  if (!cv || typeof cv.getContext !== 'function') return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = 168;
  const H = 168;
  const X0 = -60;
  const Z0 = -260;
  const S = 0.38;
  const mx = (x) => (x - X0) * S;
  const my = (z) => (z - Z0) * S;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1d2b1a';
  ctx.fillRect(0, 0, W, H);
  // Water: basin + lagoon arm (true lagoon shape incl. arm inlet).
  const arm = (CONFIG.lagoonArm) || { minX: 50, maxX: 100, minZ: -160, maxZ: -114 };
  const basin = (CONFIG.basin) || { minX: 60, maxZ: -100 };
  ctx.fillStyle = '#1f8fff';
  ctx.fillRect(mx(basin.minX), my(-260), (340 - basin.minX) * S, (basin.maxZ - -260) * S);
  ctx.fillRect(mx(arm.minX), my(arm.minZ), (arm.maxX - arm.minX) * S, (arm.maxZ - arm.minZ) * S);
  // Bridge deck across the north side.
  ctx.fillStyle = '#c8b28a';
  ctx.fillRect(mx(60), my(-242), (330 - 60) * S, 3);
  // Roads: downtown x=40 + cross road z=-120 + grid hints.
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(mx(34), my(-180), 12 * S, 130 * S);
  ctx.fillRect(mx(-40), my(-123), 200 * S, 6 * S);
  ctx.fillRect(mx(100), my(-180), 8 * S, 130 * S);
  // Median park strip.
  ctx.fillStyle = '#2f7a2f';
  ctx.fillRect(mx(37), my(-180), 6 * S, 80 * S);
  // Deco Tower marker (gold).
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(mx(0), my(-160), 4, 0, Math.PI * 2);
  ctx.fill();
  // MARINA sign marker.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 7px sans-serif';
  ctx.fillText('MARINA', mx(168), my(-138));
  // Police dots (from the live game when available).
  try {
    const sol = typeof window !== 'undefined' ? window.__solmar : null;
    if (sol && sol.police && typeof sol.police.getPoliceCars === 'function') {
      ctx.fillStyle = '#ff2a1a';
      for (const c of sol.police.getPoliceCars()) {
        if (c && c.position) { ctx.beginPath(); ctx.arc(mx(c.position.x), my(c.position.z), 2.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  } catch (err) { /* ignore */ }
  // Player dot + heading tick.
  try {
    const sol = typeof window !== 'undefined' ? window.__solmar : null;
    const p = sol && sol.player && sol.player.position ? sol.player.position : null;
    if (p) {
      const h = (sol.player.heading || 0);
      const px = mx(p.x);
      const py = my(p.z);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.sin(h) * 9, py + Math.cos(h) * 9);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } catch (err) { /* ignore */ }
}

export function createHud() {
  let currentShot = null;

  function update(s) {
    if (!s || typeof s !== 'object') return;
    // Dialogue: single {speaker, text} object only; hidden when no text.
    const dlgEl = $('hud-dialogue');
    if (dlgEl) {
      if (s.dialogue && s.dialogue.text) {
        dlgEl.textContent = s.dialogue.speaker + ': ' + s.dialogue.text;
        dlgEl.style.display = '';
      } else {
        dlgEl.textContent = '';
        dlgEl.style.display = 'none';
      }
    }
    setText('hud-radio', s.radioText || 'SOLMAR FM 101.5');
    setText('clock-time', s.clockText || '');
    // Mission panel: save line, chapter, mission, jobs, cash, clock, race, NEXT.
    const mp = $('hud-mission-panel');
    if (mp) {
      const lines = [];
      if (s.saveLine) lines.push(s.saveLine);
      lines.push((s.chapterLabel || 'CHAPTER 1') + ' · ' + (s.missionName || ''));
      if (s.objective) lines.push(s.objective);
      if (s.raceLine) lines.push(s.raceLine);
      if (s.nextLine) lines.push(s.nextLine);
      lines.push('CASH ' + (s.cashText || '$0'));
      mp.textContent = lines.join('  ·  ');
    }
    setText('hud-respect', 'RESPECT · ' + (s.jobsText || '0/8 JOBS DONE'));
    setText('hud-vehicle-panel', s.vehicleText || 'GARAGE · SOLMAR GT');
    setText('hud-police-response', s.policeText || '');
    setText('hud-crew-panel', s.crewText || 'CREW · DANTE · MAMA LOU · RICO');
    setText('hud-district-panel', s.districtText || 'NEAR DECO TOWER · STANDING: RESPECTED');
    // Legacy elements stay hidden (no duplicate speed/ammo readouts).
    const sp = $('speed');
    if (sp) sp.style.display = 'none';
    const am = $('hud-ammo');
    if (am) am.style.display = 'none';
    // Controls hint: hidden in shot mode, shown in free play.
    const hint = $('controls-hint');
    if (hint) hint.style.display = s.shotId ? 'none' : '';
    // Banner: pursuit only.
    const banner = $('shot-banner');
    if (banner) {
      if (s.showBanner) { banner.textContent = s.bannerText || 'STOLEN VEHICLE'; banner.style.display = ''; }
      else { banner.textContent = ''; banner.style.display = 'none'; }
    }
    // Crosshair: visible only in combat; pinned to the aim officer when possible.
    const ch = $('crosshair');
    if (ch) {
      ch.classList.toggle('hidden', !s.showCrosshair);
      if (s.showCrosshair) {
        let placed = false;
        try {
          const sol = typeof window !== 'undefined' ? window.__solmar : null;
          if (sol && typeof sol.project === 'function' && sol.police && typeof sol.police.getOfficers === 'function') {
            const officers = sol.police.getOfficers();
            if (officers && officers.length > 0 && officers[0].position) {
              const p = sol.project(officers[0].position.x, 1.4, officers[0].position.z);
              if (p) { ch.style.left = (p.x * 100).toFixed(2) + '%'; ch.style.top = (p.y * 100).toFixed(2) + '%'; placed = true; }
            }
          }
        } catch (err) { /* ignore */ }
        if (!placed) { ch.style.left = '50%'; ch.style.top = '50%'; }
      }
    }
    drawMinimap(s);
  }

  function setPaused(paused) {
    // Pause menu only. NEVER touches #start-screen (that was a real bug:
    // setPaused unhiding the start screen over the game).
    const pm = $('pause-menu');
    if (pm) pm.classList.toggle('hidden', !paused);
  }

  function setShot(shotId, state) {
    currentShot = shotId;
    if (state) update(state);
  }

  function showStart() {
    setShown('start-screen', true);
  }

  function hideStart() {
    setShown('start-screen', false);
  }

  return { update, setPaused, setShot, showStart, hideStart, get shot() { return currentShot; } };
}
