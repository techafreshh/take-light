import { describe, expect, it } from 'vitest';
import {
  DEAD_ZONE,
  EMPTY_INPUT,
  STICK_RADIUS_PX,
  applyDeadZone,
  mergeInput,
  sampleKeyboard,
  sampleMouseAim,
  stickVector,
  type InputFrame,
} from './input';

const IDLE_TOUCH: InputFrame = { ...EMPTY_INPUT };

describe('sampleKeyboard', () => {
  it('maps KeyW to screen-space forward (moveY -1)', () => {
    const frame = sampleKeyboard(new Set(['KeyW']));
    expect(frame.moveY).toBe(-1);
    expect(frame.moveX).toBe(0);
  });

  it('maps KeyS to moveY +1 and KeyA/KeyD to moveX -/+1', () => {
    expect(sampleKeyboard(new Set(['KeyS'])).moveY).toBe(1);
    expect(sampleKeyboard(new Set(['KeyA'])).moveX).toBe(-1);
    expect(sampleKeyboard(new Set(['KeyD'])).moveX).toBe(1);
  });

  it('reports firing false and dash false with no input', () => {
    const frame = sampleKeyboard(new Set());
    expect(frame.firing).toBe(false);
    expect(frame.dash).toBe(false);
    expect(frame).toEqual(EMPTY_INPUT);
  });

  it('maps Shift and Space codes to dash', () => {
    expect(sampleKeyboard(new Set(['ShiftLeft'])).dash).toBe(true);
    expect(sampleKeyboard(new Set(['ShiftRight'])).dash).toBe(true);
    expect(sampleKeyboard(new Set(['Space'])).dash).toBe(true);
  });

  it('normalizes diagonal input to unit length', () => {
    const frame = sampleKeyboard(new Set(['KeyW', 'KeyD']));
    expect(Math.hypot(frame.moveX, frame.moveY)).toBeLessThanOrEqual(1);
    expect(frame.moveX).toBeCloseTo(Math.SQRT1_2, 10);
    expect(frame.moveY).toBeCloseTo(-Math.SQRT1_2, 10);
  });
});

describe('applyDeadZone', () => {
  it('zeros sub-threshold readings and passes the rest', () => {
    expect(applyDeadZone(0.1)).toBe(0);
    expect(applyDeadZone(-0.1)).toBe(0);
    expect(applyDeadZone(0.5)).toBe(0.5);
    expect(applyDeadZone(DEAD_ZONE)).toBe(DEAD_ZONE);
  });
});

describe('stickVector', () => {
  it('maps a 40px drag on a 60px stick into (0.3, 1]', () => {
    const v = stickVector(40, 0, STICK_RADIUS_PX);
    const magnitude = Math.hypot(v.x, v.y);
    expect(magnitude).toBeGreaterThan(0.3);
    expect(magnitude).toBeLessThanOrEqual(1);
    expect(v.x).toBeCloseTo(40 / 60, 10);
  });

  it('clamps over-deflection to unit magnitude', () => {
    const v = stickVector(200, 0, STICK_RADIUS_PX);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10);
    expect(v.x).toBeCloseTo(1, 10);
  });

  it('zeros deflection inside the dead zone', () => {
    expect(stickVector(5, 0, STICK_RADIUS_PX)).toEqual({ x: 0, y: 0 });
  });
});

describe('sampleMouseAim', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };

  it('aims right of center with positive aimX', () => {
    const aim = sampleMouseAim(700, 300, rect);
    expect(aim.x).toBeGreaterThan(0);
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(1, 10);
  });

  it('returns zero inside the dead zone', () => {
    expect(sampleMouseAim(400, 300, rect)).toEqual({ x: 0, y: 0 });
  });
});

describe('mergeInput', () => {
  it('lets an active touch stick override keyboard move per axis', () => {
    // Keyboard holds KeyW (moveY -1, moveX 0); touch pushes left.
    const keyboard = sampleKeyboard(new Set(['KeyW']));
    const touch: InputFrame = {
      ...EMPTY_INPUT,
      moveX: -0.8,
    };
    const merged = mergeInput(keyboard, { x: 0, y: 0 }, false, touch);
    expect(merged.moveX).toBeCloseTo(-0.8, 10);
    expect(merged.moveY).toBe(-1);
  });

  it('lets a stronger touch deflection win its axis, ties keep keyboard', () => {
    // Diagonal KeyW+KeyD gives moveX ~0.707; a harder touch push wins.
    const keyboard = sampleKeyboard(new Set(['KeyW', 'KeyD']));
    const strong: InputFrame = { ...EMPTY_INPUT, moveX: -0.9 };
    expect(mergeInput(keyboard, { x: 0, y: 0 }, false, strong).moveX).toBeCloseTo(
      -0.9,
      10,
    );
    const tied: InputFrame = { ...EMPTY_INPUT, moveX: keyboard.moveX };
    expect(mergeInput(keyboard, { x: 0, y: 0 }, false, tied).moveX).toBe(
      keyboard.moveX,
    );
  });

  it('keeps keyboard move when touch is idle and ORs firing', () => {
    const keyboard = sampleKeyboard(new Set(['KeyW']));
    const mouseFiring = mergeInput(keyboard, { x: 0, y: 0 }, true, IDLE_TOUCH);
    expect(mouseFiring.moveY).toBe(-1);
    expect(mouseFiring.firing).toBe(true);

    const touchFiring = mergeInput(
      keyboard,
      { x: 0, y: 0 },
      false,
      { ...EMPTY_INPUT, firing: true },
    );
    expect(touchFiring.firing).toBe(true);

    const quiet = mergeInput(keyboard, { x: 0, y: 0 }, false, IDLE_TOUCH);
    expect(quiet.firing).toBe(false);
    expect(quiet.dash).toBe(false);
  });

  it('ORs dash from either regime', () => {
    const keyboard = sampleKeyboard(new Set(['ShiftLeft']));
    expect(mergeInput(keyboard, { x: 0, y: 0 }, false, IDLE_TOUCH).dash).toBe(true);
    expect(
      mergeInput(
        sampleKeyboard(new Set()),
        { x: 0, y: 0 },
        false,
        { ...EMPTY_INPUT, dash: true },
      ).dash,
    ).toBe(true);
  });
});
