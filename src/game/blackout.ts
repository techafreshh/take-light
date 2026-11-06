// Wave-to-blackout curve: the dusk arena dims toward near-dark by wave 10
// while tracer materials (MeshBasicMaterial, additive) are never touched.
// applyBlackout scales recorded base intensities idempotently, so repeat
// calls never compound. Pure math only — DOM mirroring lives in main.ts.

/** Fraction of base light kept at the darkest wave (wave 10 -> 0.28). */
export const BLACKOUT_MIN_LIGHT = 0.28;
/** Fraction of base emissive kept at the darkest wave (wave 10 -> 0.35). */
export const BLACKOUT_MIN_EMISSIVE = 0.35;

/** Live light handles applyBlackout may scale; tracer materials excluded. */
export interface BlackoutLights {
  hemi?: { intensity: number } | null;
  sun?: { intensity: number } | null;
  ambient?: { intensity: number } | null;
  pylonEmissive?: { emissiveIntensity: number } | null;
  hemiBase?: number;
  sunBase?: number;
  ambientBase?: number;
  pylonBase?: number;
}

/** JSON-serializable light state for a wave. */
export interface BlackoutState {
  wave: number;
  lightIntensity: number;
  emissiveScale: number;
}

/** Clamp a wave number to an integer >= 1 (non-finite reads as wave 1). */
export function normalizeBlackoutWave(wave: number): number {
  if (!Number.isFinite(wave)) {
    return 1;
  }
  return Math.max(1, Math.floor(wave));
}

/** Blackout progress 0..1 across waves 1..10, clamped past wave 10. */
export function blackoutT(wave: number): number {
  const normalized = normalizeBlackoutWave(wave);
  const t = (normalized - 1) / 9;
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t;
}

/** Light multiplier: 1.0 at wave 1 down to 0.28 at wave 10. */
export function lightIntensityForWave(wave: number): number {
  return 1 - (1 - BLACKOUT_MIN_LIGHT) * blackoutT(wave);
}

/** Emissive multiplier: 1.0 at wave 1 down to 0.35 at wave 10. */
export function emissiveScaleForWave(wave: number): number {
  return 1 - (1 - BLACKOUT_MIN_EMISSIVE) * blackoutT(wave);
}

/** Full light state for a wave (wave number clamped to >= 1). */
export function blackoutForWave(wave: number): BlackoutState {
  const normalized = normalizeBlackoutWave(wave);
  return {
    wave: normalized,
    lightIntensity: lightIntensityForWave(normalized),
    emissiveScale: emissiveScaleForWave(normalized),
  };
}

// First-seen base intensities, so handles without explicit bases still
// scale idempotently instead of compounding across calls.
const baseIntensityByHandle = new WeakMap<object, number>();
const baseEmissiveByHandle = new WeakMap<object, number>();

function resolveIntensityBase(
  handle: { intensity: number },
  explicitBase: number | undefined,
): number {
  if (explicitBase !== undefined && Number.isFinite(explicitBase)) {
    return explicitBase;
  }
  const known = baseIntensityByHandle.get(handle);
  if (known !== undefined) {
    return known;
  }
  baseIntensityByHandle.set(handle, handle.intensity);
  return handle.intensity;
}

function resolveEmissiveBase(
  handle: { emissiveIntensity: number },
  explicitBase: number | undefined,
): number {
  if (explicitBase !== undefined && Number.isFinite(explicitBase)) {
    return explicitBase;
  }
  const known = baseEmissiveByHandle.get(handle);
  if (known !== undefined) {
    return known;
  }
  baseEmissiveByHandle.set(handle, handle.emissiveIntensity);
  return handle.emissiveIntensity;
}

/**
 * Scale live light intensities to base * curve(wave). Idempotent: applying
 * twice yields the same intensities. Null handles are skipped; tracer
 * materials are never passed in, so they stay readable late-run.
 */
export function applyBlackout(
  lights: BlackoutLights,
  wave: number,
): BlackoutState {
  const state = blackoutForWave(wave);
  if (lights.hemi !== undefined && lights.hemi !== null) {
    const base = resolveIntensityBase(lights.hemi, lights.hemiBase);
    lights.hemi.intensity = base * state.lightIntensity;
  }
  if (lights.sun !== undefined && lights.sun !== null) {
    const base = resolveIntensityBase(lights.sun, lights.sunBase);
    lights.sun.intensity = base * state.lightIntensity;
  }
  if (lights.ambient !== undefined && lights.ambient !== null) {
    const base = resolveIntensityBase(lights.ambient, lights.ambientBase);
    lights.ambient.intensity = base * state.lightIntensity;
  }
  if (lights.pylonEmissive !== undefined && lights.pylonEmissive !== null) {
    const base = resolveEmissiveBase(lights.pylonEmissive, lights.pylonBase);
    lights.pylonEmissive.emissiveIntensity = base * state.emissiveScale;
  }
  return state;
}
