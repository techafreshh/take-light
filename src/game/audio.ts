// Howler SFX bank with runtime-synthesized WAV data-URIs (no binary
// assets, offline/CI-safe), pitch jitter, positional pan, first-input
// unlock, and a soft ambient loop. Runs as a silent stub when no
// AudioContext exists so headless probes never throw.

import { Howl, Howler } from 'howler';

/** Registered SFX names; sfxCount in the probe equals this length. */
export const SFX_NAMES = [
  'shot',
  'kill',
  'hit',
  'telegraph',
  'pickup',
  'dash',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

export const AMBIENT_NAME = 'ambient';

const SAMPLE_RATE = 22050;

/** Pitch jitter band applied to every play call. */
export const RATE_MIN = 0.92;
export const RATE_MAX = 1.08;

/** Quiet bed for the looping ambient pad. */
export const AMBIENT_VOLUME = 0.25;

/** True when the platform can actually produce sound. */
export function audioAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as unknown as Record<string, unknown>;
  return (
    typeof w['AudioContext'] === 'function' ||
    typeof w['webkitAudioContext'] === 'function'
  );
}

/** Clamp a stereo pan to [-1, 1]; non-finite pans center. */
export function clampPan(pan: number): number {
  if (!Number.isFinite(pan)) {
    return 0;
  }
  return Math.min(1, Math.max(-1, pan));
}

/** Pitch jitter in [RATE_MIN, RATE_MAX]. */
export function jitterRate(random: () => number = Math.random): number {
  return RATE_MIN + random() * (RATE_MAX - RATE_MIN);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function encodeWavDataUri(samples: Float32Array, sampleRate: number): string {
  const count = samples.length;
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i += 1) {
    const sample = Math.min(1, Math.max(-1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Deterministic noise generator (LCG) so builds are stable. */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296 - 0.5;
  };
}

function render(
  seconds: number,
  voice: (t: number, noise: () => number) => number,
  seed: number,
): Float32Array {
  const count = Math.max(1, Math.floor(seconds * SAMPLE_RATE));
  const out = new Float32Array(count);
  const noise = makeNoise(seed);
  for (let i = 0; i < count; i += 1) {
    out[i] = voice(i / SAMPLE_RATE, noise);
  }
  return out;
}

/** One distinct tone/noise recipe per name, plus a soft looping pad. */
export function synthSfxDataUri(name: SfxName | typeof AMBIENT_NAME): string {
  switch (name) {
    case 'shot':
      return encodeWavDataUri(
        render(
          0.12,
          (t, noise) => {
            const env = Math.exp(-t * 38);
            return (noise() * 1.6 + Math.sin(2 * Math.PI * 160 * t) * 0.8) * env * 0.7;
          },
          11,
        ),
        SAMPLE_RATE,
      );
    case 'kill':
      return encodeWavDataUri(
        render(0.28, (t) => {
          const freq = 660 - (550 * t) / 0.28;
          const env = Math.exp(-t * 9);
          const wave = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.5;
          return (wave + Math.sin(2 * Math.PI * freq * t) * 0.5) * env * 0.6;
        }, 12),
        SAMPLE_RATE,
      );
    case 'hit':
      return encodeWavDataUri(
        render(0.09, (t) => {
          const env = Math.exp(-t * 45);
          return Math.sin(2 * Math.PI * 880 * t) * env * 0.7;
        }, 13),
        SAMPLE_RATE,
      );
    case 'telegraph':
      return encodeWavDataUri(
        render(0.45, (t) => {
          const freq = 220 + (660 * t) / 0.45;
          const env = Math.min(1, t / 0.05) * Math.min(1, (0.45 - t) / 0.08);
          return Math.sin(2 * Math.PI * freq * t) * env * 0.55;
        }, 14),
        SAMPLE_RATE,
      );
    case 'pickup':
      return encodeWavDataUri(
        render(0.22, (t) => {
          const freq = t < 0.11 ? 523.25 : 783.99;
          const local = t < 0.11 ? t : t - 0.11;
          const env = Math.exp(-local * 14);
          return Math.sin(2 * Math.PI * freq * t) * env * 0.6;
        }, 15),
        SAMPLE_RATE,
      );
    case 'dash':
      return encodeWavDataUri(
        render(
          0.2,
          (t, noise) => {
            const env = Math.sin((Math.PI * t) / 0.2);
            return noise() * env * (0.5 + 0.5 * Math.sin(2 * Math.PI * 30 * t)) * 0.8;
          },
          16,
        ),
        SAMPLE_RATE,
      );
    case AMBIENT_NAME:
      return encodeWavDataUri(
        render(4, (t) => {
          const lfo = 0.6 + 0.4 * Math.sin((2 * Math.PI * t) / 4);
          const chord =
            Math.sin(2 * Math.PI * 110 * t) * 0.3 +
            Math.sin(2 * Math.PI * 165 * t) * 0.2 +
            Math.sin(2 * Math.PI * 220 * t) * 0.15;
          return chord * lfo * 0.5;
        }, 17),
        SAMPLE_RATE,
      );
  }
}

export interface AudioBank {
  unlocked: boolean;
  available: boolean;
  howls: Map<SfxName, Howl | null>;
  ambient: Howl | null;
  /** Last pitch/pan applied; observable in stub mode for tests. */
  lastRate: number;
  lastPan: number;
  lastPlayed: string | null;
}

/**
 * Build the bank. Howls are constructed lazily only when an
 * AudioContext exists; otherwise every slot stays null and the bank
 * runs as a silent stub that never throws.
 */
export function createAudioBank(): AudioBank {
  const available = audioAvailable();
  const howls = new Map<SfxName, Howl | null>();
  let ambient: Howl | null = null;
  if (available) {
    try {
      for (const name of SFX_NAMES) {
        howls.set(
          name,
          new Howl({ src: [synthSfxDataUri(name)], format: ['wav'] }),
        );
      }
      ambient = new Howl({
        src: [synthSfxDataUri(AMBIENT_NAME)],
        format: ['wav'],
        loop: true,
        volume: AMBIENT_VOLUME,
      });
    } catch {
      howls.clear();
      ambient = null;
    }
  } else {
    for (const name of SFX_NAMES) {
      howls.set(name, null);
    }
  }
  return {
    unlocked: false,
    available,
    howls,
    ambient,
    lastRate: 1,
    lastPan: 0,
    lastPlayed: null,
  };
}

/** Play one SFX with pitch jitter and clamped positional pan. */
export function playSfx(bank: AudioBank, name: SfxName, pan = 0): void {
  const rate = jitterRate();
  const clamped = clampPan(pan);
  bank.lastRate = rate;
  bank.lastPan = clamped;
  bank.lastPlayed = name;
  const howl = bank.howls.get(name) ?? null;
  if (howl === null) {
    return;
  }
  try {
    const id = howl.play();
    howl.rate(rate, id);
    howl.stereo(clamped, id);
  } catch {
    // Headless/shutdown races must never break the sim.
  }
}

/** First-input unlock: flip the flag and start the ambient loop. */
export function unlockAudio(bank: AudioBank): void {
  if (bank.unlocked) {
    return;
  }
  bank.unlocked = true;
  try {
    const ctx = (
      Howler as unknown as { ctx?: { resume?: () => void } }
    ).ctx;
    if (typeof ctx?.resume === 'function') {
      ctx.resume();
    }
    if (bank.ambient !== null && !bank.ambient.playing()) {
      bank.ambient.play();
    }
  } catch {
    // Stub mode: the flag flip above is the whole contract.
  }
}

export interface AudioProbe {
  unlocked: boolean;
  sfxCount: number;
}

/** Probe mirror: counts registered SFX names even before any play call. */
export function toAudioProbe(bank: AudioBank): AudioProbe {
  return { unlocked: bank.unlocked, sfxCount: SFX_NAMES.length };
}
