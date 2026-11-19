// Solmar Bay — Audio (Lane B)
// Round-13B: no audio change — the staged shots reuse the shot-mode
// silence (no pre-gesture audio) and the radio panel stays HUD-only.
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
    this.ambientOn = false;
    this.ambientHum = null; // { osc, gain } — low city hum, always on
    this.ambientWaves = null; // { src, gain, lfo } — surf swell near the beach
    this.ambientPad = null; // round 5: warm golden-hour chord pad, always on
    // Round-8: road/wind noise — a looping band-passed noise node whose
    // gain and filter frequency scale with speed, mixed low under the
    // engine hum. Built lazily by startRoadNoise(); setRoadNoise() is
    // called from setEngineSpeed() so it follows the car every frame.
    this.roadNoise = null; // { src, gain, filter }
    this.roadNoiseOn = false;
    this._roadNoiseLevel = 0; // round-8: last normalised road-noise level (0..1), for getRoadNoiseLevel()
    this._engineGear = 1;
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
    // Round-9: browsers suspend the AudioContext when the tab is hidden
    // and do NOT always resume it on return — after a tab switch the
    // game could go silent until the next user gesture. Resume on
    // visibilitychange so the engine, sirens and ambience come back by
    // themselves. Registered once, here, so it cannot double up.
    if (typeof document !== 'undefined' && !this._visibilityResumeBound) {
      this._visibilityResumeBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume();
        }
      });
    }
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

  // Round-10: the music bus had no runtime volume setter (musicVolume
  // was construction-only) — mirrors setMasterVolume so the menu /
  // pause screens can duck the radio without rebuilding the engine.
  setMusicVolume(v) {
    this.musicVolume = clamp(v, 0, 1);
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
    return this.musicVolume;
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

  // ---- road / wind noise (round 8) ----
  // A looping band-passed noise bed, mixed LOW under the engine (max
  // gain 0.05, vs engine ~0.20): at idle it is silent, at speed it
  // breathes up and its filter opens (400 -> 1400 Hz) so fast driving
  // sounds like wind over the sculpted body, not just a louder engine.
  // startRoadNoise() builds the loop once; setRoadNoise(n) scales it
  // (n = normalised speed 0..1, or m/s with isMs); stopRoadNoise()
  // fades it out. Safe no-ops before any AudioContext exists.

  startRoadNoise() {
    if (this.roadNoiseOn) return;
    if (!this.ensureContext()) return;
    this.roadNoiseOn = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this._loopNoiseBuffer(2);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.roadNoise = { src, gain, filter };
  }

  // n: normalised speed 0..1, or a speed in m/s when `isMs` is set.
  // Call every frame while driving; also called from setEngineSpeed()
  // so the road noise follows the engine without a second call site.
  setRoadNoise(n, isMs = false) {
    if (!this.roadNoiseOn || !this.ctx || !this.roadNoise) return;
    const speed = isMs ? clamp(n / 40, 0, 1) : clamp(n, 0, 1);
    // Round-8: remember the live level so getRoadNoiseLevel() reports
    // the actual wind bed (0 at a crawl, ~1 flat out), not just on/off.
    this._roadNoiseLevel = speed;
    const t = this.ctx.currentTime;
    // Silent below a crawl (0.04), up to 0.05 flat out — always under
    // the engine hum, never a hiss on its own.
    this.roadNoise.gain.gain.setTargetAtTime(speed < 0.04 ? 0 : 0.012 + speed * 0.038, t, 0.25);
    this.roadNoise.filter.frequency.setTargetAtTime(400 + speed * 1000, t, 0.25);
  }

  // Round-8: the live road-noise level (0..1) from the last
  // setRoadNoise() call — 0 when the bed is off or the car is crawling.
  getRoadNoiseLevel() {
    return this.roadNoiseOn ? (this._roadNoiseLevel ?? 0) : 0;
  }

  stopRoadNoise() {
    if (!this.roadNoiseOn) return;
    this.roadNoiseOn = false;
    try {
      const node = this.roadNoise;
      if (this.ctx) node?.gain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => { try { node?.src?.stop(); } catch (_) { /* already stopped */ } }, 400);
    } catch (_) { /* context already closed */ }
    this.roadNoise = null;
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
    // Round-8: the road/wind bed starts with the engine (silent at
    // idle until setEngineSpeed() scales it with speed).
    this.startRoadNoise();
  }

  // speed: normalised 0..1, or a speed in m/s when `isMs` is set.
  // Call every frame while driving. Round 4: the pitch follows speed
  // AND a 5-speed gearbox — each gear change gets a soft shift click
  // (the pitch itself stays continuous, so no jump is ever audible).
  setEngineSpeed(speed, isMs = false) {
    if (!this.engineOn || !this.ctx) return;
    const n = isMs ? clamp(speed / 40, 0, 1) : clamp(speed, 0, 1);
    const t = this.ctx.currentTime;
    const gear = Math.min(5, Math.max(1, Math.floor(n * 5) + 1));
    if (gear !== this._engineGear) {
      this._engineGear = gear;
      this._blip(220 + gear * 40, 0.04, 'square', 0.08);
    }
    const freq = 55 + n * 165; // 55 Hz idle -> 220 Hz flat out
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(420 + n * 1600, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.10 + n * 0.10, t, 0.1);
    // Round-8: the road/wind bed follows the same normalised speed,
    // mixed low under the engine (see startRoadNoise/setRoadNoise).
    this.setRoadNoise(n);
  }

  // Current gearbox step (1–5), derived from the last setEngineSpeed call.
  getEngineGear() { return this._engineGear; }

  stopEngine() {
    if (!this.engineOn) return;
    this.engineOn = false;
    this.stopRoadNoise(); // round-8: the wind bed stops with the engine
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

  // Round-4b: the combo sting — a short blip whose pitch climbs with the
  // combo count (capped at x8), so a long streak sounds like it is rising.
  playCombo(combo) {
    const n = Math.max(2, Math.min(combo || 2, 8));
    this._blip(660 + n * 60, 0.07, 'triangle', 0.3);
    this._blip(990 + n * 60, 0.1, 'sine', 0.2, 0.05);
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

  // Round 4: mission-start sting (a rising fourth, then a bright chime),
  // wanted-up sting (a dissonant low-high alarm), cash-register cha-ching
  // on earn, and a short radio-static blip under dispatch chatter.
  playMissionStart() {
    this._blip(392, 0.16, 'triangle', 0.4, 0, 523.25);
    this._blip(523.25, 0.22, 'triangle', 0.4, 0.14);
    this._blip(1046.5, 0.4, 'sine', 0.18, 0.3);
  }

  // Round-5: a warm golden-hour swell when the game starts — C major,
  // slow and quiet, the sound of the sun going down over the Bay.
  playSunsetSting() {
    this._blip(261.63, 0.9, 'sine', 0.22, 0);
    this._blip(329.63, 0.9, 'sine', 0.2, 0.08);
    this._blip(392.0, 1.1, 'sine', 0.2, 0.16);
    this._blip(523.25, 1.2, 'sine', 0.14, 0.3);
  }

  // Round-6: the landmark discovery chime — a bright major triad that
  // rises and resolves, played once when Rico first reaches a landmark
  // (the Spire or the Marina Bridge). Warm and unhurried, like the
  // sunset sting, so it reads as a reward, not an alarm.
  // Round-7: the Solmar Pyramid gets a brighter top note (a high fifth
  // above the triad) so its discovery sounds distinct from the Spire.
  // Round-9: the Spire is luminous glass now, so its chime gets a
  // shimmer — two high, quiet, long notes a fifth apart that ring
  // above the triad, like light on glass. The Pyramid keeps its
  // single bright top note; the Bridge keeps the plain triad.
  playLandmark(name) {
    this._blip(523.25, 0.35, 'triangle', 0.32, 0);
    this._blip(659.25, 0.35, 'triangle', 0.3, 0.12);
    this._blip(783.99, 0.6, 'sine', 0.28, 0.24);
    this._blip(1046.5, 0.7, 'sine', 0.16, 0.4);
    if (name === 'Solmar Pyramid') this._blip(1318.5, 0.8, 'sine', 0.18, 0.55);
    if (name === 'Solmar Spire') {
      this._blip(1567.98, 1.1, 'sine', 0.12, 0.55);
      this._blip(2093.0, 1.3, 'sine', 0.09, 0.7);
    }
  }

  // Round-11 final: the focus-camera sting — a short soft two-note
  // rise when L opens a clear framed view of a landmark (game-feel:
  // the camera move gets an audio echo on the same frame, so the look
  // reads as an action, not a cut). Quieter than the discovery chime
  // — L is pressed often, and a full chime every press would get old.
  playFocusSting() {
    // Round-11 final (re-touch): fires on the same frame as the look (main.js L handler) — game-feel demands the sound land with the visual, not after the camera settles.
    this._blip(659.25, 0.25, 'sine', 0.16, 0);
    this._blip(987.77, 0.45, 'sine', 0.14, 0.12);
  }

  playWantedUp() {
    this._blip(233.08, 0.18, 'square', 0.3, 0, 220);
    this._blip(311.13, 0.24, 'square', 0.3, 0.16, 294);
  }

  playCash() {
    // Register drawer + cha-ching: metallic ticks, then two high pings.
    this._noise(0.05, 0.25, 2400, 0, 'bandpass');
    this._blip(1567.98, 0.12, 'sine', 0.35, 0.05);
    this._blip(2093, 0.3, 'sine', 0.3, 0.14);
  }

  playRadioBlip() {
    this._noise(0.09, 0.2, 1800, 0, 'bandpass');
    this._blip(1200, 0.05, 'square', 0.12, 0.02);
  }

  // ---- ambient bed: soft city hum + surf near the beach (round 4) ----
  // Two looping nodes built once: a low hum (55 Hz sine + filtered noise)
  // and a surf swell (band-passed noise whose gain breathes on a slow
  // LFO). setAmbient() scales the surf by how close Rico is to the sand.

  _loopNoiseBuffer(seconds = 2) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let s = (0xabcdef01 + (this._noiseSeed = (this._noiseSeed || 0) + 104729)) >>> 0;
    for (let i = 0; i < len; i++) {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17; s ^= s << 5; s >>>= 0;
      data[i] = (s / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  startAmbient() {
    if (this.ambientOn) return;
    if (!this.ensureContext()) return;
    this.ambientOn = true;
    // City hum: a quiet 55 Hz sine under a low-passed noise loop.
    const humOsc = this.ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 55;
    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.03;
    humOsc.connect(humGain);
    humGain.connect(this.master);
    humOsc.start();
    const humNoise = this.ctx.createBufferSource();
    humNoise.buffer = this._loopNoiseBuffer(2);
    humNoise.loop = true;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 220;
    const humNoiseGain = this.ctx.createGain();
    humNoiseGain.gain.value = 0.02;
    humNoise.connect(humFilter);
    humFilter.connect(humNoiseGain);
    humNoiseGain.connect(this.master);
    humNoise.start();
    this.ambientHum = { osc: humOsc, noise: humNoise, gain: humGain };
    // Surf: band-passed noise loop, gain breathing on a 0.12 Hz LFO so
    // the waves swell and fade like real surf.
    const waveSrc = this.ctx.createBufferSource();
    waveSrc.buffer = this._loopNoiseBuffer(3);
    waveSrc.loop = true;
    const waveFilter = this.ctx.createBiquadFilter();
    waveFilter.type = 'bandpass';
    waveFilter.frequency.value = 480;
    waveFilter.Q.value = 0.6;
    const waveGain = this.ctx.createGain();
    waveGain.gain.value = 0.0;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);
    waveSrc.connect(waveFilter);
    waveFilter.connect(waveGain);
    waveGain.connect(this.master);
    waveSrc.start();
    lfo.start();
    this.ambientWaves = { src: waveSrc, gain: waveGain, lfo, base: 0 };
    // Round-5: golden-hour pad — a quiet warm C-major chord (C4/E4/G4)
    // that breathes on a slow LFO, so the dusk has a sound, not just a look.
    const padFreqs = [261.63, 329.63, 392.0];
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.012;
    const padLfo = this.ctx.createOscillator();
    padLfo.type = 'sine';
    padLfo.frequency.value = 0.05;
    const padLfoGain = this.ctx.createGain();
    padLfoGain.gain.value = 0.006;
    padLfo.connect(padLfoGain);
    padLfoGain.connect(padGain.gain);
    const padOscs = padFreqs.map((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(padGain);
      osc.start();
      return osc;
    });
    padGain.connect(this.master);
    padLfo.start();
    this.ambientPad = { oscs: padOscs, gain: padGain, lfo: padLfo };
  }

  // position: { x, z } (or null); district: the HUD district string.
  // Surf is loudest on the beach (z > ~240 / district "Beach") and fades
  // to a whisper downtown. Call once per frame; cheap (two gain ramps).
  setAmbient(position, district) {
    if (!this.ambientOn || !this.ctx || !this.ambientWaves) return;
    const z = position?.z ?? 0;
    const name = String(district || '');
    const nearBeach = /beach|marina|shore/i.test(name) || z > 240;
    const midBeach = z > 180;
    const target = nearBeach ? 0.09 : midBeach ? 0.04 : 0.012;
    this.ambientWaves.base = target;
    this.ambientWaves.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
  }

  stopAmbient() {
    if (!this.ambientOn) return;
    this.ambientOn = false;
    try {
      const h = this.ambientHum;
      const w = this.ambientWaves;
      const p = this.ambientPad;
      setTimeout(() => {
        try { h?.osc?.stop(); h?.noise?.stop(); w?.src?.stop(); w?.lfo?.stop(); p?.oscs?.forEach((o) => o.stop()); p?.lfo?.stop(); } catch (_) { /* already stopped */ }
      }, 300);
    } catch (_) { /* context already closed */ }
    this.ambientHum = null;
    this.ambientWaves = null;
    this.ambientPad = null;
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
    this.stopRoadNoise(); // round-8: belt and braces — engine stop covers it
    this.stopSiren();
    this.stopMusic();
    this.stopAmbient();
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

// Round-13 final: re-touch — the staged shots run in SHOT_MODE (no
// pre-gesture audio), and the radio panel reads the staged station;
// audio intact.

export default AudioEngine;
