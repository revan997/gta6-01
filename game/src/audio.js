// Solmar Bay — Audio (Lane B)
// All sound is synthesised with the Web Audio API only. No audio files,
// no network, no external URLs. Engine hum whose pitch follows speed,
// police siren loop, gunshot, punch, pickup blip, mission-complete jingle
// and a simple ambient music loop. Master mute toggle included.
//
// The AudioContext is created lazily on the first user-gesture call
// (start / play), because browsers block audio before interaction.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class AudioEngine {
  constructor(options = {}) {
    this.muted = options.muted ?? false;
    this.masterVolume = options.masterVolume ?? 0.5;
    this.musicVolume = options.musicVolume ?? 0.18;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOn = false;
    this.sirenOn = false;
    this.musicOn = false;
    // Simple laid-back chord loop in A minor (frequencies, Hz).
    this.musicChords = [
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [196.0, 246.94, 293.66], // G
      [164.81, 220.0, 246.94], // Em
    ];
    this.musicBass = [110.0, 87.31, 98.0, 82.41];
  }

  // ---- context / master chain ----

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const AC = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.masterVolume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
    return this.ctx;
  }

  isMuted() { return this.muted; }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  setMasterVolume(v) {
    this.masterVolume = clamp(v, 0, 1);
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  // ---- one-shot helpers ----

  _blip(freq, duration, type = 'sine', volume = 0.5, when = 0, slideTo = null) {
    if (!this.ensureContext()) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  _noise(duration, volume = 0.5, filterFreq = 1200, when = 0, filterType = 'lowpass') {
    if (!this.ensureContext()) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic noise: a seeded xorshift, NOT Math.random — every
    // sound effect must reproduce from the same seed.
    let s = (0x12345678 + (this._noiseSeed = (this._noiseSeed || 0) + 7919)) >>> 0;
    for (let i = 0; i < len; i++) {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17; s ^= s << 5; s >>>= 0;
      data[i] = (s / 4294967296) * 2 - 1;
      data[i] *= 1 - i / len;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // ---- engine hum: pitch follows speed (0..1 normalised, or km/h) ----

  startEngine() {
    if (this.engineOn) return;
    if (!this.ensureContext()) return;
    this.engineOn = true;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 110;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.2);
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(osc2Gain);
    osc2Gain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // speed: normalised 0..1, or a speed in m/s when `isMs` is set.
  // Call every frame while driving.
  setEngineSpeed(speed, isMs = false) {
    if (!this.engineOn || !this.ctx) return;
    const n = isMs ? clamp(speed / 40, 0, 1) : clamp(speed, 0, 1);
    const t = this.ctx.currentTime;
    const freq = 55 + n * 165; // 55 Hz idle -> 220 Hz flat out
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(420 + n * 1600, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.10 + n * 0.10, t, 0.1);
  }

  stopEngine() {
    if (!this.engineOn) return;
    this.engineOn = false;
    const t = this.ctx ? this.ctx.currentTime : 0;
    try {
      this.engineGain?.gain.setTargetAtTime(0, t, 0.1);
      const osc = this.engineOsc;
      const osc2 = this.engineOsc2;
      setTimeout(() => { try { osc?.stop(); osc2?.stop(); } catch (_) { /* already stopped */ } }, 400);
    } catch (_) { /* context already closed */ }
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  // ---- police siren loop (two-tone wail) ----

  startSiren() {
    if (this.sirenOn) return;
    if (!this.ensureContext()) return;
    this.sirenOn = true;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55; // ~0.9 s per wail half-cycle
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenGain.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.3);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  stopSiren() {
    if (!this.sirenOn) return;
    this.sirenOn = false;
    try {
      this.sirenGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      const osc = this.sirenOsc;
      const lfo = this.sirenLfo;
      setTimeout(() => { try { osc?.stop(); lfo?.stop(); } catch (_) { /* already stopped */ } }, 500);
    } catch (_) { /* context already closed */ }
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
  }

  // Round-3 polish: the siren gets louder as the nearest police unit
  // closes in. `v` is 0..1 (1 = right on top of the player); the game
  // loop derives it from police.nearestUnitDistance().
  setSirenVolume(v) {
    if (!this.sirenOn || !this.sirenGain || !this.ctx) return;
    const level = 0.02 + 0.09 * clamp(v, 0, 1);
    this.sirenGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.2);
  }

  // ---- one-shots ----

  playGunshot() {
    this._noise(0.16, 0.7, 900);
    this._blip(160, 0.10, 'square', 0.35, 0, 45);
  }

  playPunch() {
    this._noise(0.09, 0.45, 500);
    this._blip(90, 0.08, 'sine', 0.4, 0, 55);
  }

  playPickup() {
    this._blip(880, 0.09, 'sine', 0.4);
    this._blip(1318.5, 0.14, 'sine', 0.4, 0.09);
  }

  playMissionComplete() {
    // Rising jingle: C5 – E5 – G5 – C6.
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => this._blip(freq, 0.28, 'triangle', 0.45, i * 0.13));
    this._blip(2093, 0.5, 'sine', 0.2, notes.length * 0.13);
  }

  playMissionFail() {
    this._blip(392, 0.3, 'triangle', 0.4, 0, 370);
    this._blip(311.13, 0.45, 'triangle', 0.4, 0.28, 294);
  }

  playClick() {
    this._blip(660, 0.05, 'square', 0.2);
  }

  // Two-tone car horn: two short square-wave blips, ~370 Hz then ~440 Hz.
  playHorn() {
    this._blip(370, 0.16, 'square', 0.35);
    this._blip(440, 0.16, 'square', 0.35, 0.16);
  }

  // Door slam: a short lowpass noise burst plus a low sine blip sliding down.
  playDoorSlam() {
    this._noise(0.12, 0.6, 300);
    this._blip(90, 0.14, 'sine', 0.5, 0, 45);
  }

  // Round-3 polish: reload clicks (two metallic taps), tyre screech for
  // a handbrake skid, and a soft footstep thud for Rico's walk cycle.
  playReload() {
    this._blip(1250, 0.05, 'square', 0.25);
    this._blip(820, 0.06, 'square', 0.25, 0.08);
  }

  playSkid() {
    this._noise(0.28, 0.3, 900, 0, 'bandpass');
  }

  playStep() {
    this._noise(0.05, 0.14, 250);
    this._blip(70, 0.06, 'sine', 0.22, 0, 50);
  }

  // ---- ambient music loop: soft plucked chords, one bar every 1.6 s ----

  startMusic() {
    if (this.musicOn) return;
    if (!this.ensureContext()) return;
    this.musicOn = true;
    this.musicStep = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const chord = this.musicChords[this.musicStep % this.musicChords.length];
      const bass = this.musicBass[this.musicStep % this.musicBass.length];
      for (const freq of chord) {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.5, t0 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.5);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(t0);
        osc.stop(t0 + 1.6);
      }
      if (this.ctx) {
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = bass;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.6, t0 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.5);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(t0);
        osc.stop(t0 + 1.6);
      }
      this.musicStep += 1;
      this.musicTimer = setTimeout(tick, 1600);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  stopAll() {
    this.stopEngine();
    this.stopSiren();
    this.stopMusic();
  }

  dispose() {
    this.stopAll();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
    }
  }
}

export function createAudioEngine(options = {}) {
  return new AudioEngine(options);
}

export default AudioEngine;
