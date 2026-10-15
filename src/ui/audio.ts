// Optional synthesized sound (Web Audio, no audio files). Off by default; the toggle lives in Display settings.
export type SoundName = 'deal' | 'flip' | 'chip' | 'check' | 'win' | 'fold' | 'turn';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(c.sampleRate * 0.25);
  noise = c.createBuffer(1, len, c.sampleRate);
  const d = noise.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0; // deterministic LCG: no Math.random needed
    d[i] = (seed / 4294967296) * 2 - 1;
  }
  return noise;
}

function burst(c: AudioContext, t: number, freq: number, q: number, dur: number, gain: number): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(c: AudioContext, t: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Play a short, quiet sound. No-op when sound is disabled or unsupported. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.005;
  switch (name) {
    case 'deal':
    case 'flip':
      burst(c, t, 2600, 1.4, 0.07, 0.06);
      burst(c, t + 0.035, 1400, 1.1, 0.05, 0.03);
      break;
    case 'chip':
      tone(c, t, 2400, 0.06, 0.03, 'triangle');
      tone(c, t + 0.045, 1800, 0.08, 0.03, 'triangle');
      burst(c, t, 4200, 2, 0.04, 0.03);
      break;
    case 'check':
      burst(c, t, 900, 2, 0.05, 0.05);
      break;
    case 'fold':
      burst(c, t, 700, 0.8, 0.12, 0.04);
      break;
    case 'turn':
      tone(c, t, 660, 0.12, 0.025);
      break;
    case 'win':
      tone(c, t, 523.25, 0.3, 0.04);
      tone(c, t + 0.1, 659.25, 0.3, 0.04);
      tone(c, t + 0.2, 783.99, 0.45, 0.04);
      break;
  }
}
