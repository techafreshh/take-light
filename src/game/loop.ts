// Fixed-timestep simulation driver: deterministic 60 Hz accumulator with
// free-running variable-rate rendering. Gameplay math always consumes the
// fixed STEP_MS quantum — never frame delta. Zero allocation in the hot
// path: the frame callback creates no objects and no closures.

export const STEP_MS = 1000 / 60;

export const MAX_STEPS_PER_FRAME = 5;

export const MAX_FRAME_DELTA_MS = 100;

/** Kill hitstop: sim freeze consumed in STEP_MS quanta on kill. */
export const HITSTOP_MS = 60;

export interface HitstopState {
  msLeft: number;
}

/** Fresh hitstop state with no freeze pending. */
export function createHitstop(): HitstopState {
  return { msLeft: 0 };
}

/** Arm a full kill hitstop freeze. */
export function triggerHitstop(state: HitstopState): void {
  state.msLeft = HITSTOP_MS;
}

/**
 * Consume one sim step of freeze. Returns true when this sim step must
 * be skipped (hitstop active). Pure: mutates only state.msLeft.
 */
export function consumeHitstop(state: HitstopState, stepMs: number): boolean {
  if (state.msLeft <= 0) {
    state.msLeft = 0;
    return false;
  }
  state.msLeft = Math.max(0, state.msLeft - stepMs);
  return true;
}

export type SimUpdate = (stepMs: number) => void;

export type FrameRender = (alpha: number) => void;

export interface FixedLoop {
  start(): void;
  stop(): void;
  /** Advance one frame with the given timestamp (ms). Also used as the rAF / setAnimationLoop callback. */
  frame(nowMs: number): void;
  getTick(): number;
  resetTick(): void;
  getFps(): number;
}

/** Pure step count for an elapsed budget: floor division, no allocation. */
export function computeStepCount(elapsedMs: number, stepMs: number): number {
  if (elapsedMs <= 0 || stepMs <= 0) {
    return 0;
  }
  // Epsilon guards float error: 2000 / (1000/60) is 119.99999999999999.
  return Math.floor(elapsedMs / stepMs + 1e-9);
}

export function createFixedLoop(
  update: SimUpdate,
  render: FrameRender,
  isRunning: () => boolean = () => true,
  isFrozen: () => boolean = () => false,
): FixedLoop {
  let tick = 0;
  let accumulator = 0;
  let lastMs = -1;
  let rafId = 0;
  let running = false;

  // FPS measured over a rolling 500 ms window.
  let fpsFrames = 0;
  let fpsWindowStart = -1;
  let fps = 0;

  function frame(nowMs: number): void {
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    if (lastMs < 0) {
      lastMs = now;
      fpsWindowStart = now;
      render(1);
      return;
    }
    let delta = now - lastMs;
    lastMs = now;
    if (delta < 0) {
      delta = 0;
    } else if (delta > MAX_FRAME_DELTA_MS) {
      delta = MAX_FRAME_DELTA_MS;
    }

    if (isRunning()) {
      if (!isFrozen()) {
        accumulator += delta;
        let steps = 0;
        while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
          accumulator -= STEP_MS;
          steps += 1;
          tick += 1;
          update(STEP_MS);
        }
        if (steps >= MAX_STEPS_PER_FRAME) {
          // Shed backlog instead of spiralling after a hitch.
          accumulator = 0;
        }
      }
      // Frozen (hitstop): hold the accumulator — no banking, no
      // stepping, no tick — while render and probes keep running.
    } else {
      // Paused states must not bank sim time.
      accumulator = 0;
    }

    fpsFrames += 1;
    const windowElapsed = now - fpsWindowStart;
    if (windowElapsed >= 500) {
      fps = Math.round((fpsFrames * 1000) / windowElapsed);
      fpsFrames = 0;
      fpsWindowStart = now;
    }

    const alpha = accumulator <= 0 ? 0 : Math.min(accumulator / STEP_MS, 1);
    render(alpha);
  }

  function onFrame(nowMs: number): void {
    frame(nowMs);
    if (running) {
      rafId = requestAnimationFrame(onFrame);
    }
  }

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      rafId = requestAnimationFrame(onFrame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(rafId);
    },
    frame,
    getTick(): number {
      return tick;
    },
    resetTick(): void {
      tick = 0;
      accumulator = 0;
    },
    getFps(): number {
      return fps;
    },
  };
}
