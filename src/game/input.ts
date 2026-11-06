// Dual-regime input: one InputFrame struct fed by both the desktop
// (WASD + mouse) and touch (twin sticks + dash button) adapters, so
// gameplay tuning is balanced once. Screen space is canonical here:
// moveX is right-positive, moveY is DOWN-positive (holding KeyW yields
// moveY -1). Pure math only — DOM listeners live in main.ts (desktop)
// and ui/sticks.ts (touch).

export interface InputFrame {
  /** Strafe: -1 (left) .. +1 (right), screen +x. */
  moveX: number;
  /** Throttle: -1 (up/forward) .. +1 (down/back), screen +y. */
  moveY: number;
  /** Aim direction x, unit-ish (touch stick deflection or mouse bearing). */
  aimX: number;
  /** Aim direction y, unit-ish (touch stick deflection or mouse bearing). */
  aimY: number;
  /** Hold-fire held (mouse button or right-stick deflection). */
  firing: boolean;
  /** Dash held (Shift/Space or dash button; edge detection in main.ts). */
  dash: boolean;
}

export const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  firing: false,
  dash: false,
};

/** Inputs below this magnitude are treated as rest (sticks + mouse aim). */
export const DEAD_ZONE = 0.15;

/** Stick deflection in px that maps to full unit output. */
export const STICK_RADIUS_PX = 60;

export interface StickVector {
  x: number;
  y: number;
}

export interface AimRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function hasKey(keys: ReadonlySet<string>, ...names: string[]): boolean {
  for (const name of names) {
    if (keys.has(name)) {
      return true;
    }
  }
  return false;
}

/** Zero an axis reading inside the dead zone, pass larger values through. */
export function applyDeadZone(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) < DEAD_ZONE) {
    return 0;
  }
  return value;
}

/**
 * Convert a raw stick offset in px to a unit-clamped vector: divide by
 * the radius, clamp magnitude to 1, zero anything below the dead zone.
 */
export function stickVector(
  dxPx: number,
  dyPx: number,
  radiusPx: number = STICK_RADIUS_PX,
): StickVector {
  if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) {
    return { x: 0, y: 0 };
  }
  const radius = radiusPx > 0 ? radiusPx : STICK_RADIUS_PX;
  let x = dxPx / radius;
  let y = dyPx / radius;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0 };
  }
  const magnitude = Math.hypot(x, y);
  if (magnitude < DEAD_ZONE) {
    return { x: 0, y: 0 };
  }
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
  }
  return { x, y };
}

/** Sample a held-key set (KeyboardEvent.code values) into a frame. */
export function sampleKeyboard(keys: ReadonlySet<string>): InputFrame {
  let moveX = 0;
  let moveY = 0;
  if (hasKey(keys, 'KeyA', 'ArrowLeft', 'a', 'A')) {
    moveX -= 1;
  }
  if (hasKey(keys, 'KeyD', 'ArrowRight', 'd', 'D')) {
    moveX += 1;
  }
  // Screen space: up on screen is -1.
  if (hasKey(keys, 'KeyW', 'ArrowUp', 'w', 'W')) {
    moveY -= 1;
  }
  if (hasKey(keys, 'KeyS', 'ArrowDown', 's', 'S')) {
    moveY += 1;
  }
  // Normalize diagonals so full tilt never exceeds unit length.
  const length = Math.hypot(moveX, moveY);
  if (length > 1) {
    moveX /= length;
    moveY /= length;
  }
  const dash = hasKey(
    keys,
    'ShiftLeft',
    'ShiftRight',
    'Shift',
    'Space',
    ' ',
    'Spacebar',
  );
  return { moveX, moveY, aimX: 0, aimY: 0, firing: false, dash };
}

/**
 * Desktop aim: unit direction from the rect center to the cursor.
 * Inside the dead zone (or on a degenerate rect) this is (0, 0).
 */
export function sampleMouseAim(
  clientX: number,
  clientY: number,
  rect: AimRect,
): StickVector {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return { x: 0, y: 0 };
  }
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = (clientX - centerX) / (rect.width / 2);
  const dy = (clientY - centerY) / (rect.height / 2);
  const magnitude = Math.hypot(dx, dy);
  if (!Number.isFinite(magnitude) || magnitude < DEAD_ZONE) {
    return { x: 0, y: 0 };
  }
  return { x: dx / magnitude, y: dy / magnitude };
}

/**
 * Merge the desktop and touch regimes into one frame. Per axis the
 * regime with the larger magnitude wins; touch wins only when strictly
 * greater, so ties keep the desktop reading. Fire and dash OR together.
 */
export function mergeInput(
  keyboard: InputFrame,
  mouseAim: StickVector,
  mouseDown: boolean,
  touch: InputFrame,
): InputFrame {
  const moveX =
    Math.abs(touch.moveX) > Math.abs(keyboard.moveX)
      ? touch.moveX
      : keyboard.moveX;
  const moveY =
    Math.abs(touch.moveY) > Math.abs(keyboard.moveY)
      ? touch.moveY
      : keyboard.moveY;
  const aimX =
    Math.abs(touch.aimX) > Math.abs(mouseAim.x) ? touch.aimX : mouseAim.x;
  const aimY =
    Math.abs(touch.aimY) > Math.abs(mouseAim.y) ? touch.aimY : mouseAim.y;
  return {
    moveX,
    moveY,
    aimX,
    aimY,
    firing: mouseDown || touch.firing,
    dash: keyboard.dash || touch.dash,
  };
}
