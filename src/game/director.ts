// Seeded wave director: pure budget-point wave plans from a mulberry32
// stream, so the same seed always yields the same run. Every wave spends
// a growing point budget across the unlocked enemy kinds, and every 4th
// wave fires a cost-free Rush Hour Okada swarm. Pure math only — DOM and
// window mirroring live in main.ts.

/** Budget cost of one Okada rusher in wave points. */
export const OKADA_COST = 1;
/** Budget cost of one AreaBoy shooter in wave points. */
export const AREABOY_COST = 2;
/** Budget cost of one Danfo Carrier heavy in wave points. */
export const CARRIER_COST = 4;

/** Cost-free extra Okadas stapled onto a Rush Hour wave. */
export const RUSH_BONUS_OKADA = 6;
/** Rush Hour swarm window in ms. */
export const RUSH_HOUR_MS = 10000;
/** Standard wave window in ms (tuning constant only; no auto-spawning). */
export const WAVE_DURATION_MS = 25000;
/** A Rush Hour swarm fires every this many waves. */
export const RUSH_EVERY_WAVES = 4;

/** JSON-serializable plan for a single wave. */
export interface WavePlan {
  wave: number;
  seed: number;
  budget: number;
  okada: number;
  areaboy: number;
  carrier: number;
  rushHour: boolean;
  rushBonusOkada: number;
  durationMs: number;
}

/**
 * Seeded 32-bit PRNG stream. Coerces the seed to uint32; the same seed
 * always yields the same sequence.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clamp a wave number to an integer >= 1 (non-finite reads as wave 1). */
export function normalizeWave(wave: number): number {
  if (!Number.isFinite(wave)) {
    return 1;
  }
  return Math.max(1, Math.floor(wave));
}

/** Point budget for a wave: 4 + wave * 2 (wave 1 -> 6, wave 10 -> 24). */
export function budgetForWave(wave: number): number {
  return 4 + normalizeWave(wave) * 2;
}

/** True exactly on every 4th wave (4, 8, 12, ...). */
export function isRushHour(wave: number): boolean {
  return normalizeWave(wave) % RUSH_EVERY_WAVES === 0;
}

function costOf(kind: 'okada' | 'areaboy' | 'carrier'): number {
  if (kind === 'areaboy') {
    return AREABOY_COST;
  }
  if (kind === 'carrier') {
    return CARRIER_COST;
  }
  return OKADA_COST;
}

/** Fill weight per kind once the guaranteed one-of-each is placed. */
function weightOf(kind: 'okada' | 'areaboy' | 'carrier'): number {
  if (kind === 'areaboy') {
    return 3;
  }
  if (kind === 'carrier') {
    return 2;
  }
  return 5;
}

/** Max AreaBoy shooters fielded on wave 2 (early-orb-density cap). */
export const MAX_AREABOY_WAVE_2 = 1;
/** Max Danfo Carrier heavies fielded on wave 2 (none unlocked yet). */
export const MAX_CARRIER_WAVE_2 = 0;
/** Max AreaBoy shooters fielded on wave 3 (early-orb-density cap). */
export const MAX_AREABOY_WAVE_3 = 1;
/** Max Danfo Carrier heavies fielded on wave 3 (early-orb-density cap). */
export const MAX_CARRIER_WAVE_3 = 1;

/**
 * Max copies of a kind allowed on a wave. Okadas stay uncapped so spend
 * remains maximal; waves 4+ stay uncapped. Guaranteed placements already
 * comply (wave 2: 1 areaboy / 0 carriers; wave 3: 1 of each), so only the
 * weighted-fill loop needs the filter.
 */
function capForWave(
  wave: number,
  kind: 'okada' | 'areaboy' | 'carrier',
): number {
  if (kind === 'okada') {
    return Number.POSITIVE_INFINITY;
  }
  if (wave === 2) {
    return kind === 'areaboy' ? MAX_AREABOY_WAVE_2 : MAX_CARRIER_WAVE_2;
  }
  if (wave === 3) {
    return kind === 'areaboy' ? MAX_AREABOY_WAVE_3 : MAX_CARRIER_WAVE_3;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Deterministic plan for one wave. The per-wave stream is seeded from
 * (seed ^ wave * 0x9E3779B9), so plans are independent across waves and
 * stable across calls. Each unlocked kind (wave 1: Okada; wave 2+:
 * AreaBoy; wave 3+: Carrier) is guaranteed one slot when affordable,
 * then the remainder is weighted-filled without exceeding the budget.
 * Waves 2-3 cap simultaneous shooters (wave 2: at most 1 AreaBoy and no
 * Carriers; wave 3: at most 1 of each) so early orb density stays
 * survivable; Okadas fill the leftover budget and waves 4+ are uncapped.
 * Rush Hour bonus Okadas ride on top, cost-free.
 */
export function planWave(seed: number, wave: number): WavePlan {
  const normalizedSeed = seed >>> 0;
  const normalizedWave = normalizeWave(wave);
  const budget = 4 + normalizedWave * 2;
  const rng = mulberry32(
    (normalizedSeed ^ Math.imul(normalizedWave, 0x9e3779b9)) >>> 0,
  );

  const unlocked: Array<'okada' | 'areaboy' | 'carrier'> = ['okada'];
  if (normalizedWave >= 2) {
    unlocked.push('areaboy');
  }
  if (normalizedWave >= 3) {
    unlocked.push('carrier');
  }

  let okada = 0;
  let areaboy = 0;
  let carrier = 0;
  let spent = 0;
  const place = (kind: 'okada' | 'areaboy' | 'carrier'): void => {
    if (kind === 'areaboy') {
      areaboy += 1;
    } else if (kind === 'carrier') {
      carrier += 1;
    } else {
      okada += 1;
    }
    spent += costOf(kind);
  };

  for (const kind of unlocked) {
    if (budget - spent >= costOf(kind)) {
      place(kind);
    }
  }

  let guard = 1024;
  while (guard > 0) {
    guard -= 1;
    const remaining = budget - spent;
    const countOf = (kind: 'okada' | 'areaboy' | 'carrier'): number => {
      if (kind === 'areaboy') {
        return areaboy;
      }
      if (kind === 'carrier') {
        return carrier;
      }
      return okada;
    };
    const affordable = unlocked.filter(
      (kind) =>
        costOf(kind) <= remaining &&
        countOf(kind) < capForWave(normalizedWave, kind),
    );
    if (affordable.length === 0) {
      break;
    }
    let total = 0;
    for (const kind of affordable) {
      total += weightOf(kind);
    }
    let roll = rng() * total;
    let picked = affordable[0] as 'okada' | 'areaboy' | 'carrier';
    for (const kind of affordable) {
      roll -= weightOf(kind);
      if (roll <= 0) {
        picked = kind;
        break;
      }
    }
    place(picked);
  }

  const rushHour = normalizedWave % RUSH_EVERY_WAVES === 0;
  return {
    wave: normalizedWave,
    seed: normalizedSeed,
    budget,
    okada,
    areaboy,
    carrier,
    rushHour,
    rushBonusOkada: rushHour ? RUSH_BONUS_OKADA : 0,
    durationMs: rushHour ? RUSH_HOUR_MS : WAVE_DURATION_MS,
  };
}

/** Deterministic plans for waves 1..count (empty for count <= 0). */
export function planRun(seed: number, count: number): WavePlan[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const plans: WavePlan[] = [];
  for (let wave = 1; wave <= total; wave += 1) {
    plans.push(planWave(seed, wave));
  }
  return plans;
}
