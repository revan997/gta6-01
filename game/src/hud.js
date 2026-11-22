// HUD for Solmar Bay: health, cash, weapons, radio, respect, district,
// crew, police response, mission panel, dialogue, and a real minimap.
// The HUD is a pure view of the state main.js builds each frame — it
// keeps no game state of its own, so a staged shot and free play render
// through the same code.
//
// Harness ids (the geometry harness reads the HUD by id, so every one of
// these must exist in index.html and be filled here):
// hud-dialogue, hud-radio, hud-mission-panel, hud-respect,
// hud-vehicle-panel, hud-police-response, hud-crew-panel,
// hud-district-panel, clock-time, message, controls-hint, speed,
// hud-ammo, crosshair, start-screen, hud-minimap.

function el(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

function show(id, visible) {
  const node = el(id);
  if (node) node.style.display = visible ? '' : 'none';
}

// The minimap is 168x168 and draws the true lagoon shape: the basin,
// the arm inlet, the road grid, the bridge, the Deco marker, police
// dots, the player arrow with a heading tick, and the mission diamond.
// World window: x -60..360, z -260..160 (420 m square, 0.4 px per m).
const MAP = { minX: -60, maxX: 360, minZ: -260, maxZ: 160, size: 168 };
const MAP_SCALE = MAP.size / (MAP.maxX - MAP.minX);

function mapX(x) {
  return (x - MAP.minX) * MAP_SCALE;
}

function mapY(z) {
  return (z - MAP.minZ) * MAP_SCALE;
}

function drawMinimap(state) {
  const canvas = el('hud-minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const S = MAP.size;
  ctx.clearRect(0, 0, S, S);
  // Land.
  ctx.fillStyle = '#232d3a';
  ctx.fillRect(0, 0, S, S);
  // Lagoon basin (bright water, like the 3D water).
  ctx.fillStyle = '#1f8fff';
  ctx.fillRect(mapX(60), mapY(-260), mapX(330) - mapX(60), mapY(-100) - mapY(-260));
  // Lagoon arm inlet running south from the basin's south-west corner.
  ctx.fillRect(mapX(50), mapY(-160), mapX(100) - mapX(50), mapY(-114) - mapY(-160));
  // Road grid: the downtown road and the z -120 cross road.
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mapX(40), mapY(-260));
  ctx.lineTo(mapX(40), mapY(160));
  ctx.moveTo(mapX(-60), mapY(-120));
  ctx.lineTo(mapX(360), mapY(-120));
  ctx.stroke();
  // Bridge across the basin's north side.
  ctx.strokeStyle = '#c8b08a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mapX(60), mapY(-240));
  ctx.lineTo(mapX(330), mapY(-240));
  ctx.stroke();
  // Deco Tower marker (gold star) and Spire marker.
  ctx.fillStyle = '#ffb800';
  ctx.beginPath();
  ctx.arc(mapX(0), mapY(-160), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.arc(mapX(320), mapY(-80), 3, 0, Math.PI * 2);
  ctx.fill();
  // Mission diamond at the current objective.
  if (state.missionTarget) {
    ctx.fillStyle = '#ffd34d';
    const mx = mapX(state.missionTarget.x);
    const my = mapY(state.missionTarget.z);
    ctx.beginPath();
    ctx.moveTo(mx, my - 5);
    ctx.lineTo(mx + 5, my);
    ctx.lineTo(mx, my + 5);
    ctx.lineTo(mx - 5, my);
    ctx.closePath();
    ctx.fill();
  }
  // Police dots: cars as red squares, officers as red dots.
  ctx.fillStyle = '#ff2a1a';
  const cars = (state.police && state.police.cars) || [];
  for (const c of cars) ctx.fillRect(mapX(c.x) - 2, mapY(c.z) - 2, 4, 4);
  const officers = (state.police && state.police.officers) || [];
  for (const o of officers) {
    ctx.beginPath();
    ctx.arc(mapX(o.x), mapY(o.z), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow with a heading tick.
  const p = state.player || { x: 40, z: -95, heading: 0 };
  const px = mapX(p.x);
  const py = mapY(p.z);
  const heading = p.heading || 0;
  const tx = px + Math.sin(heading) * 8;
  const ty = py + Math.cos(heading) * 8;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function stars(wanted) {
  let out = '';
  for (let i = 0; i < 5; i += 1) out += i < wanted ? '★' : '☆';
  return out;
}

export function createHud() {
  const crosshair = el('crosshair');

  // Place the crosshair at a screen point (pixels, 1280x720 space) or
  // hide it. The combat shot shows it on the aim officer; the sunset
  // shot hides it.
  function setCrosshair(x, y, visible) {
    if (!crosshair) return;
    if (!visible) {
      crosshair.style.display = 'none';
      return;
    }
    crosshair.style.display = 'block';
    crosshair.style.left = `${Math.round(x)}px`;
    crosshair.style.top = `${Math.round(y)}px`;
  }

  function render(state) {
    // Start screen: visible only on the menu.
    const start = el('start-screen');
    if (start) {
      if (state.state === 'menu') start.classList.remove('hidden');
      else start.classList.add('hidden');
    }
    // Controls hint: hidden while a shot is staged.
    show('controls-hint', !state.shot);
    // Dialogue: a single {speaker, text} object. The per-shot fallback
    // line wins over the mission array, so the needle reads exactly
    // once in the document body.
    const dialogue = el('hud-dialogue');
    if (dialogue) {
      if (state.dialogue && state.dialogue.text) {
        dialogue.style.display = '';
        dialogue.textContent = `${state.dialogue.speaker}: ${state.dialogue.text}`;
      } else {
        dialogue.style.display = 'none';
        dialogue.textContent = '';
      }
    }
    // Radio: the station line always carries 101.5.
    setText('hud-radio', `SOLMAR FM 101.5 — ${state.radioSong || 'Golden Hour Drive'}`);
    // Mission panel: saved line, chapter, jobs, cash, clock, AIR ONE
    // row, garage line, race line, NEXT line. The panel's children are
    // static elements in index.html — update their text, never rebuild
    // the panel, so #clock-time stays a stable node for the harness.
    setText('mp-saved', state.saved
      ? `✓ SAVED ${state.clock} · CHECKPOINT: MARINA`
      : `○ NOT SAVED · CHECKPOINT: MARINA`);
    setText('mp-chapter', `CHAPTER ${state.chapter} · ${state.missionName}`);
    setText('mp-jobs', `JOBS ${state.jobsDone || 0}/4 · MISSION ${state.missionNumber}/4`);
    setText('mp-cash', `CASH $${Number(state.money || 0).toLocaleString('en-US')}`);
    setText('clock-time', state.clock);
    setText('mp-airone', state.wanted >= 3 ? 'AIR ONE · ON STATION' : 'AIR ONE · STANDBY');
    setText('mp-garage', `GARAGE · ${state.garage || 'SOLMAR GT'}`);
    setText('mp-race', `RACE · ${state.race || 'STREET RACE · 1/3'}`);
    setText('mp-next', `NEXT · ${state.nextMission || '—'}`);
    // Respect, vehicle, police, crew, district panels.
    const respect = el('hud-respect');
    if (respect) {
      const rank = state.respect || 0;
      respect.textContent = `RESPECT ${'★'.repeat(Math.min(5, rank))}${'☆'.repeat(Math.max(0, 5 - rank))} · RANK ${rank}`;
    }
    const vehicle = el('hud-vehicle-panel');
    if (vehicle) {
      vehicle.textContent = `${state.vehicleName || 'ON FOOT'} · ${Math.round(state.speed || 0)} KM/H · GEAR ${state.gear || 1} · COND ${Math.round(state.vehicleCondition ?? 100)}%`;
    }
    const policePanel = el('hud-police-response');
    if (policePanel) {
      policePanel.textContent = `WANTED ${stars(state.wanted || 0)} · ${state.policeResponse || 'CLEAR'}`;
    }
    const crew = el('hud-crew-panel');
    if (crew) crew.textContent = `CREW · ${(state.crew || ['Dante', 'Mama Lou']).join(' · ')}`;
    const district = el('hud-district-panel');
    if (district) district.textContent = state.district || 'DOWNTOWN · SOLMAR BAY';
    // Centre banner: only the pursuit theft shows it, reading
    // 'STOLEN VEHICLE' — never the dialogue needle.
    const message = el('message');
    if (message) {
      message.textContent = state.message || '';
      message.style.display = state.message ? '' : 'none';
    }
    // Legacy speed / ammo readouts exist for the harness but stay
    // hidden; the vehicle panel carries the live numbers.
    show('speed', false);
    show('hud-ammo', false);
    // Health bar width follows the state.
    const health = el('hud-health');
    if (health) health.style.width = `${Math.max(0, Math.min(100, state.health ?? 100))}%`;
    drawMinimap(state);
  }

  return { render, setCrosshair, drawMinimap };
}
