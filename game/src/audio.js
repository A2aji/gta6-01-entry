// Solmar Bay — all sound is synthesized live with WebAudio. There are no
// audio files: the gunshots, the pickup chime, the mission sting, the engine
// hum, the police siren, and both radio stations are oscillators and noise
// scheduled on the fly. The AudioContext is only created after a user
// gesture (pressing Enter on the title screen), because browsers require
// that; the radio is a lookahead step sequencer, not a recording.

const STATIONS = [
  {
    name: 'Solmar FM',
    bpm: 104,
    // A-minor synthwave: a driving bass line under a bright arpeggio.
    bass: [55, 55, 65.41, 49],
    bassPat: [0, 0, 1, 0, 2, 0, 1, 3],
    arp: [220, 261.63, 329.63, 440, 329.63, 261.63],
    arpPat: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
  },
  {
    name: 'Bay Talk',
    bpm: 88,
    // A laid-back groove: an F-major walk with soft chords.
    bass: [43.65, 58.27, 65.41, 49],
    bassPat: [0, 0, 0, 1, 2, 2, 3, 2],
    arp: [174.61, 220, 261.63, 349.23, 261.63, 220],
    arpPat: [0, 1, 2, 3, 2, 1, 0, 1],
  },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let music = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let seqTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let stationIndex = 0;
  let muted = false;
  let radioOn = true;

  // Build the graph once: master out, a quiet music bus, a low-passed
  // sawtooth for the engine, and a sine for the police siren.
  function buildGraph() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = 0.14;
    music.connect(master);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenTimer = setInterval(() => {
      if (!ctx || sirenGain.gain.value === 0) return;
      sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 700 : 950;
    }, 420);
  }

  function ensure() {
    if (ctx) return true;
    try {
      buildGraph();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  // One pitched blip with a fast attack and an exponential tail.
  function note(freq, when, dur, type, gain, dest) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(dest || music);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  // A burst of white noise that decays linearly — gunshots, hats, impacts.
  function noiseBurst(when, dur, gain) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start(when);
  }

  // Schedule the radio a quarter of a second ahead: bass on every eighth
  // note, the arpeggio on every other step, a hat on the off-beats.
  function scheduleStep() {
    if (!ctx || !radioOn || muted) return;
    const st = STATIONS[stationIndex];
    const stepDur = 60 / st.bpm / 2;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const s = step % 16;
      note(st.bass[st.bassPat[s % st.bassPat.length]], nextNoteTime, stepDur * 1.8, 'sawtooth', 0.5);
      if (s % 2 === 0) {
        note(st.arp[st.arpPat[(s / 2) % st.arpPat.length]], nextNoteTime, stepDur * 0.9, 'square', 0.12);
      }
      if (s % 4 === 2) noiseBurst(nextNoteTime, 0.03, 0.08);
      nextNoteTime += stepDur;
      step += 1;
    }
  }

  function startRadio() {
    if (!ctx || seqTimer) return;
    nextNoteTime = ctx.currentTime + 0.05;
    step = 0;
    seqTimer = setInterval(scheduleStep, 90);
  }

  return {
    /** Call from a user gesture. Starts the radio and the engine hum. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      startRadio();
    },
    setEngine(speed01) {
      if (!ctx) return;
      engineGain.gain.value = 0.05 + speed01 * 0.06;
      engineOsc.frequency.value = 48 + speed01 * 90;
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.value = on ? 0.045 : 0;
    },
    shot() {
      if (!ctx) return;
      noiseBurst(ctx.currentTime, 0.12, 0.5);
      note(140, ctx.currentTime, 0.1, 'square', 0.25, master);
    },
    pickup() {
      if (!ctx) return;
      note(660, ctx.currentTime, 0.09, 'sine', 0.3, master);
      note(880, ctx.currentTime + 0.09, 0.14, 'sine', 0.3, master);
    },
    sting() {
      if (!ctx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        note(f, ctx.currentTime + i * 0.09, 0.3, 'triangle', 0.22, master);
      });
    },
    nextStation() {
      stationIndex = (stationIndex + 1) % STATIONS.length;
      return STATIONS[stationIndex].name;
    },
    get station() { return STATIONS[stationIndex].name; },
    get on() { return radioOn && !muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
    get muted() { return muted; },
  };
}
