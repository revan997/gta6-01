// Solmar Bay — audio (procedural WebAudio, no assets).
//
// All sound is synthesised with the Web Audio API: the engine (an
// oscillator whose pitch follows the speed), the gunshot (a noise
// burst), the siren (a two-tone oscillator), the radio (a simple
// chiptune loop), and the UI clicks. There are no audio files — the
// game is fully self-contained, and the dossier's references check
// forbids network fetches anyway.
//
// Audio is created lazily on the first user gesture (browsers block
// autoplay), and every node is stopped when the game pauses, so the
// harness's silent capture has no audio errors.

import { CONFIG } from './config.js';

// A small noise buffer (for the gunshot and the skid).
function makeNoiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// The radio: a simple chiptune loop (a bass line + a lead) that plays
// "SOLMAR FM 101.5". The notes are a minor-key groove.
const RADIO_BASS = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
const RADIO_LEAD = [220, 261.63, 329.63, 261.63, 220, 196, 164.81, 196];

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engine: null,
    engineOsc: null,
    engineGain: null,
    siren: null,
    sirenOsc: null,
    sirenGain: null,
    radioTimer: null,
    radioStep: 0,
    muted: false,
    enabled: CONFIG.audio.enabled,

    // Create the AudioContext (on the first user gesture).
    ensure() {
      if (audio.ctx || !audio.enabled) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = CONFIG.audio.masterVolume;
        audio.master.connect(audio.ctx.destination);
      } catch (e) {
        audio.enabled = false;
      }
    },

    resume() {
      audio.ensure();
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    },

    // The engine: a sawtooth whose pitch follows the speed (60 Hz
    // idle, up to 220 Hz at full speed), with a lowpass filter.
    startEngine() {
      audio.ensure();
      if (!audio.ctx || audio.engineOsc) return;
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 60;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0.06;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.engine = { filter };
    },

    setEngineSpeed(speed01) {
      if (!audio.engineOsc) return;
      const freq = 60 + speed01 * 160;
      audio.engineOsc.frequency.setTargetAtTime(freq, audio.ctx.currentTime, 0.05);
      audio.engineGain.gain.setTargetAtTime(0.04 + speed01 * 0.08, audio.ctx.currentTime, 0.1);
    },

    stopEngine() {
      if (!audio.engineOsc) return;
      try { audio.engineOsc.stop(); } catch (e) { /* already stopped */ }
      audio.engineOsc = null;
      audio.engineGain = null;
      audio.engine = null;
    },

    // The gunshot: a short noise burst through a bandpass filter.
    gunshot() {
      audio.ensure();
      if (!audio.ctx) return;
      const src = audio.ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(audio.ctx, 0.18);
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 0.8;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(0.5, audio.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.18);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.master);
      src.start();
      src.stop(audio.ctx.currentTime + 0.18);
    },

    // The siren: a two-tone oscillator (660 Hz / 880 Hz) that
    // alternates every 0.4 s. It starts when the wanted level rises
    // and stops when it falls.
    startSiren() {
      audio.ensure();
      if (!audio.ctx || audio.sirenOsc) return;
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 660;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0.05;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      let high = false;
      audio.siren = setInterval(() => {
        if (!audio.sirenOsc) return;
        high = !high;
        audio.sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, audio.ctx.currentTime, 0.02);
      }, 400);
    },

    stopSiren() {
      if (audio.siren) { clearInterval(audio.siren); audio.siren = null; }
      if (audio.sirenOsc) {
        try { audio.sirenOsc.stop(); } catch (e) { /* already stopped */ }
        audio.sirenOsc = null;
        audio.sirenGain = null;
      }
    },

    // A skid: a filtered noise burst (for hard cornering).
    skid() {
      audio.ensure();
      if (!audio.ctx) return;
      const src = audio.ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(audio.ctx, 0.4);
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(0.12, audio.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.4);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.master);
      src.start();
      src.stop(audio.ctx.currentTime + 0.4);
    },

    // A UI click (for the menus).
    click() {
      audio.ensure();
      if (!audio.ctx) return;
      const osc = audio.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 880;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(0.08, audio.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start();
      osc.stop(audio.ctx.currentTime + 0.08);
    },

    // The radio: a chiptune loop (bass + lead) that steps through
    // the note arrays. It is the "SOLMAR FM 101.5" station.
    startRadio() {
      audio.ensure();
      if (!audio.ctx || audio.radioTimer) return;
      audio.radioTimer = setInterval(() => {
        if (!audio.ctx) return;
        const step = audio.radioStep % RADIO_BASS.length;
        audio.radioStep += 1;
        const t = audio.ctx.currentTime;
        const bass = audio.ctx.createOscillator();
        bass.type = 'triangle';
        bass.frequency.value = RADIO_BASS[step];
        const bassGain = audio.ctx.createGain();
        bassGain.gain.setValueAtTime(0.12, t);
        bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        bass.connect(bassGain);
        bassGain.connect(audio.master);
        bass.start(t);
        bass.stop(t + 0.45);
        const lead = audio.ctx.createOscillator();
        lead.type = 'square';
        lead.frequency.value = RADIO_LEAD[step];
        const leadGain = audio.ctx.createGain();
        leadGain.gain.setValueAtTime(0.04, t);
        leadGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        lead.connect(leadGain);
        leadGain.connect(audio.master);
        lead.start(t);
        lead.stop(t + 0.4);
      }, 500);
    },

    stopRadio() {
      if (audio.radioTimer) { clearInterval(audio.radioTimer); audio.radioTimer = null; }
    },

    // Mute / unmute everything.
    setMuted(muted) {
      audio.muted = muted;
      if (audio.master) audio.master.gain.value = muted ? 0 : CONFIG.audio.masterVolume;
    },

    // Stop everything (for the pause menu and for shutdown).
    stopAll() {
      audio.stopEngine();
      audio.stopSiren();
      audio.stopRadio();
    },
  };
  return audio;
}
