// Procedural WebAudio soundscape: engine hum tied to throttle, wind rush, ring chime, touchdown, warnings, crash.

export function createFlightAudio() {
  let ctx = null;
  let muted = false;
  let started = false;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let warningCooldown = 0;

  function ensureStarted() {
    if (started || muted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      ctx = new AudioCtx();
      // Piston prop engine (dual detuned oscillators through warm lowpass filter)
      engineOsc1 = ctx.createOscillator();
      engineOsc2 = ctx.createOscillator();
      engineFilter = ctx.createBiquadFilter();
      engineGain = ctx.createGain();

      engineOsc1.type = 'sawtooth';
      engineOsc2.type = 'triangle';
      engineOsc1.frequency.value = 62;
      engineOsc2.frequency.value = 124;

      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 260;
      engineFilter.Q.value = 2.2;

      engineGain.gain.value = 0.001;

      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);

      engineOsc1.start();
      engineOsc2.start();

      // Wind rush (looping noise buffer through bandpass filter)
      const bufferLen = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 540;
      windFilter.Q.value = 0.8;

      windGain = ctx.createGain();
      windGain.gain.value = 0.001;

      noiseSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      noiseSrc.start();

      started = true;
    } catch {
      started = false;
    }
  }

  function updateEngineAudio(plane, activeFlight, dt) {
    if (!started || !ctx) return;
    if (ctx.state === 'suspended' && !muted) {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    if (muted || !activeFlight) {
      engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
      windGain.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }

    const fuelAlive = plane.fuel > 0 ? 1 : 0;
    const rpmFactor = (0.3 + plane.throttle * 0.7) * fuelAlive;
    const baseFreq = 46 + rpmFactor * 74 + (plane.airspeedKt / 160) * 14;
    engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    engineOsc2.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.06);
    engineFilter.frequency.setTargetAtTime(180 + rpmFactor * 420, now, 0.08);
    engineGain.gain.setTargetAtTime(fuelAlive ? 0.042 + plane.throttle * 0.036 : 0.002, now, 0.08);

    const airRatio = Math.min(1, plane.airspeedKt / 150);
    windFilter.frequency.setTargetAtTime(340 + airRatio * 680 + (plane.airbrake ? 220 : 0), now, 0.08);
    windGain.gain.setTargetAtTime(0.008 + airRatio * 0.028 + (plane.airbrake ? 0.014 : 0), now, 0.08);

    warningCooldown = Math.max(0, warningCooldown - dt);
    if (warningCooldown <= 0) {
      if (plane.stallFactor > 0.25) {
        playWarningBeep(860, 0.14);
        warningCooldown = 0.34;
      } else if (plane.fuel > 0 && plane.fuel < 22) {
        playWarningBeep(620, 0.11);
        warningCooldown = 1.6;
      }
    }
  }

  function playRingChime() {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.001, now + idx * 0.055);
      gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.055 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.055 + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.28);
    });
  }

  function playTouchdownSound(isHard = false) {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    // Low gear thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHard ? 135 : 92, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.2);
    gain.gain.setValueAtTime(isHard ? 0.24 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);

    // Brief tire chirp
    const chirp = ctx.createOscillator();
    const cGain = ctx.createGain();
    chirp.type = 'sawtooth';
    chirp.frequency.setValueAtTime(1420, now + 0.02);
    chirp.frequency.exponentialRampToValueAtTime(840, now + 0.12);
    cGain.gain.setValueAtTime(0.04, now + 0.02);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    chirp.connect(cGain);
    cGain.connect(ctx.destination);
    chirp.start(now + 0.02);
    chirp.stop(now + 0.14);
  }

  function playCrashSound() {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.65);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 620;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  function playWarningBeep(freq = 780, duration = 0.12) {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playUiClick() {
    ensureStarted();
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  function toggleMute() {
    muted = !muted;
    if (!muted) ensureStarted();
    return muted;
  }

  return {
    ensureStarted,
    updateEngineAudio,
    playRingChime,
    playTouchdownSound,
    playCrashSound,
    playWarningBeep,
    playUiClick,
    toggleMute,
    isMuted: () => muted,
  };
}
