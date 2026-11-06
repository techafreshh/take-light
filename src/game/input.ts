// Keyboard input sampling: pure struct + sampler, no DOM listeners here
// (listeners live in main.ts). moveX is strafe right (+x), moveY is
// forward (+1 = world -Z, away from the follow camera at +Z).

export interface InputFrame {
  /** Strafe: -1 (left) .. +1 (right), world +x. */
  moveX: number;
  /** Throttle: +1 forward (world -Z) .. -1 back (world +Z). */
  moveY: number;
  /** Dash button currently held (edge detection happens in main.ts). */
  dashPressed: boolean;
}

export const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  moveY: 0,
  dashPressed: false,
};

function hasKey(keys: ReadonlySet<string>, ...names: string[]): boolean {
  for (const name of names) {
    if (keys.has(name)) {
      return true;
    }
  }
  return false;
}

/** Sample a held-key set (KeyboardEvent.code values) into a normalized frame. */
export function sampleKeyboard(keys: ReadonlySet<string>): InputFrame {
  let moveX = 0;
  let moveY = 0;
  if (hasKey(keys, 'KeyA', 'ArrowLeft', 'a', 'A')) {
    moveX -= 1;
  }
  if (hasKey(keys, 'KeyD', 'ArrowRight', 'd', 'D')) {
    moveX += 1;
  }
  if (hasKey(keys, 'KeyW', 'ArrowUp', 'w', 'W')) {
    moveY += 1;
  }
  if (hasKey(keys, 'KeyS', 'ArrowDown', 's', 'S')) {
    moveY -= 1;
  }
  // Normalize diagonals so full tilt never exceeds unit length.
  const length = Math.hypot(moveX, moveY);
  if (length > 1) {
    moveX /= length;
    moveY /= length;
  }
  const dashPressed = hasKey(
    keys,
    'ShiftLeft',
    'ShiftRight',
    'Shift',
    'Space',
    ' ',
    'Spacebar',
  );
  return { moveX, moveY, dashPressed };
}
