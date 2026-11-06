import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AMBIENT_NAME,
  RATE_MAX,
  RATE_MIN,
  SFX_NAMES,
  audioAvailable,
  clampPan,
  createAudioBank,
  jitterRate,
  playSfx,
  synthSfxDataUri,
  toAudioProbe,
  unlockAudio,
} from './audio';

describe('audio bank', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers at least five SFX names', () => {
    expect(SFX_NAMES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length);
  });

  it('probe counts names even before any play call', () => {
    const bank = createAudioBank();
    const probe = toAudioProbe(bank);
    expect(probe.sfxCount).toBe(SFX_NAMES.length);
    expect(probe.sfxCount).toBeGreaterThanOrEqual(5);
    expect(probe.unlocked).toBe(false);
  });

  it('unlock flips once and stays flipped', () => {
    const bank = createAudioBank();
    unlockAudio(bank);
    expect(toAudioProbe(bank).unlocked).toBe(true);
    unlockAudio(bank);
    expect(toAudioProbe(bank).unlocked).toBe(true);
  });

  it('jitter stays inside the pitch band', () => {
    for (let i = 0; i < 200; i += 1) {
      const rate = jitterRate();
      expect(rate).toBeGreaterThanOrEqual(RATE_MIN);
      expect(rate).toBeLessThanOrEqual(RATE_MAX);
    }
    expect(jitterRate(() => 0)).toBe(RATE_MIN);
    expect(jitterRate(() => 1)).toBe(RATE_MAX);
  });

  it('pan clamps to [-1, 1]', () => {
    expect(clampPan(-2)).toBe(-1);
    expect(clampPan(2)).toBe(1);
    expect(clampPan(0.5)).toBeCloseTo(0.5);
    expect(clampPan(Number.NaN)).toBe(0);
  });

  it('synth output is a WAV data-URI with a RIFF header', () => {
    for (const name of [...SFX_NAMES, AMBIENT_NAME] as const) {
      const uri = synthSfxDataUri(name);
      expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
      const base64 = uri.slice('data:audio/wav;base64,'.length);
      const binary = atob(base64);
      expect(binary.slice(0, 4)).toBe('RIFF');
      expect(binary.slice(8, 12)).toBe('WAVE');
    }
  });

  it('stub mode never throws without an AudioContext', () => {
    expect(audioAvailable()).toBe(false);
    const bank = createAudioBank();
    expect(bank.available).toBe(false);
    expect(() => {
      for (const name of SFX_NAMES) {
        playSfx(bank, name, 3);
      }
      unlockAudio(bank);
    }).not.toThrow();
    expect(bank.lastPlayed).toBe(SFX_NAMES[SFX_NAMES.length - 1]);
    expect(bank.lastPan).toBe(1);
  });
});
