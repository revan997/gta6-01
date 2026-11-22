// Solmar Bay — audio (W1, attempt #7, fresh build).
// All sounds are synthesised in code with the Web Audio API: engine hum
// that follows speed, skid, sirens, gunshots, radio music, UI blips.
// No external audio files, no network. Inert in Node (no AudioContext
// at import time; every method no-ops until the context exists).

export const RADIO_STATIONS = [
  { id: 'solmar-fm', name: 'SOLMAR FM 101.5', freq: '101.5', genre: 'sunset pop' },
  { id: 'bay-talk', name: 'Bay Talk 88.4', freq: '88.4', genre: 'talk' },
];

const SOUND_DEFS = {
  engine: { type: 'sawtooth', base: 55 },
  skid: { type: 'noise', base: 900 },
  siren: { type: 'sine', base: 700 },
  gunshot: { type: 'noise', base: 180 },
  ui: { type: 'sine', base: 880 },
  pickup: { type: 'triangle', base: 660 },
  crash: { type: 'noise', base: 120 },
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let stationIndex = 0;
  let radioOn = true;

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AC = typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof webkitAudioContext !== 'undefined'
          ? webkitAudioContext
          : null;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function tone({ type, freq, dur, gain, slideTo }) {
    if (!ensureContext()) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(gain || 0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {
      // Audio must never break the game.
    }
  }

  function noiseBurst({ dur, gain, freq }) {
    if (!ensureContext()) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 800;
      const g = ctx.createGain();
      g.gain.value = gain || 0.2;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    } catch (e) {
      // Audio must never break the game.
    }
  }

  const api = {
    get available() {
      return ensureContext() !== null;
    },
    get muted() {
      return muted;
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    resume() {
      if (ensureContext() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    // Engine hum follows speed (0..1). Call every frame; cheap.
    setEngine(speedNorm) {
      if (!ensureContext()) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = SOUND_DEFS.engine.type;
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          engineOsc.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        const s = Math.max(0, Math.min(1, speedNorm));
        engineOsc.frequency.setValueAtTime(55 + s * 140, ctx.currentTime);
        engineGain.gain.setValueAtTime(0.03 + s * 0.08, ctx.currentTime);
      } catch (e) {
        // ignore
      }
    },
    skid() {
      noiseBurst({ dur: 0.25, gain: 0.12, freq: 900 });
    },
    gunshot() {
      noiseBurst({ dur: 0.12, gain: 0.35, freq: 180 });
    },
    siren(on) {
      if (!ensureContext()) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = SOUND_DEFS.siren.type;
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.04;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenOsc.frequency.setValueAtTime(700, ctx.currentTime);
        } else if (!on && sirenOsc) {
          sirenOsc.stop();
          sirenOsc = null;
          sirenGain = null;
        }
      } catch (e) {
        // ignore
      }
    },
    // Two-tone siren wail step (call on a timer while wanted >= 3).
    sirenStep(high) {
      if (sirenOsc && ctx) {
        sirenOsc.frequency.setValueAtTime(high ? 950 : 700, ctx.currentTime);
      }
    },
    ui() {
      tone({ type: 'sine', freq: 880, dur: 0.07, gain: 0.1 });
    },
    pickup() {
      tone({ type: 'triangle', freq: 660, dur: 0.12, gain: 0.15, slideTo: 990 });
    },
    crash() {
      noiseBurst({ dur: 0.3, gain: 0.3, freq: 120 });
    },
    play(name) {
      if (name === 'gunshot') this.gunshot();
      else if (name === 'skid') this.skid();
      else if (name === 'ui') this.ui();
      else if (name === 'pickup') this.pickup();
      else if (name === 'crash') this.crash();
    },
    // Radio: station metadata only (music is synthesised tones on a
    // timer by main.js; the station itself is just state here).
    getStation() {
      return RADIO_STATIONS[stationIndex];
    },
    setStation(i) {
      stationIndex = ((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
      return RADIO_STATIONS[stationIndex];
    },
    setRadioOn(on) {
      radioOn = !!on;
    },
    get radioOn() {
      return radioOn;
    },
    dispose() {
      try {
        if (engineOsc) engineOsc.stop();
        if (sirenOsc) sirenOsc.stop();
        if (ctx) ctx.close();
      } catch (e) {
        // ignore
      }
      ctx = null;
      engineOsc = null;
      sirenOsc = null;
    },
  };
  return api;
}

let shared = null;
export function getSharedAudio() {
  if (!shared) shared = createAudio();
  return shared;
}
