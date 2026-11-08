// Touch twin-stick + dash button DOM adapter. Builds the stick zones
// and dash button, then mutates the shared InputFrame in place so the
// main.ts merge reads fresh values every sim step. Pure stick math is
// imported from game/input.ts; no three.js here.

import {
  EMPTY_INPUT,
  STICK_RADIUS_PX,
  stickVector,
  type AimRect,
  type InputFrame,
} from '../game/input';
import { createElementRectCache } from './rectCache';

const KNOB_PX = 54;

interface StickSlot {
  /** Touch identifier or pointerId currently driving this stick. */
  activeId: number | null;
  /** Floating origin in client coords where the contact started. */
  originX: number;
  originY: number;
  /** True when the slot was claimed by a TouchEvent (id matching). */
  fromTouch: boolean;
}

/** Mutable frame owned by main.ts; starts (and unmounts back) at rest. */
export function createTouchStickState(): InputFrame {
  return { ...EMPTY_INPUT };
}

/** Hint overrides for tests/probes; defaults read the live device. */
export interface TouchHints {
  coarse?: boolean;
  touchPoints?: number;
  hasTouch?: boolean;
}

/**
 * Pure touch-capability check: coarse pointer OR touch points OR legacy
 * ontouchstart. Explicit hints bypass the DOM reads so tests can drive
 * the matrix without a device.
 */
export function shouldMountTouchControls(hints: TouchHints = {}): boolean {
  let coarse: boolean;
  if (hints.coarse !== undefined) {
    coarse = hints.coarse;
  } else if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    coarse = false;
  } else {
    try {
      coarse = window.matchMedia('(pointer: coarse)').matches;
    } catch {
      coarse = false;
    }
  }
  let touchPoints: number;
  if (hints.touchPoints !== undefined) {
    touchPoints = hints.touchPoints;
  } else {
    try {
      const nav = (
        globalThis as unknown as { navigator?: { maxTouchPoints?: unknown } }
      ).navigator;
      const raw = nav?.maxTouchPoints;
      touchPoints = typeof raw === 'number' ? raw : 0;
    } catch {
      touchPoints = 0;
    }
  }
  let hasTouch: boolean;
  if (hints.hasTouch !== undefined) {
    hasTouch = hints.hasTouch;
  } else if (typeof window === 'undefined') {
    hasTouch = false;
  } else {
    try {
      hasTouch = 'ontouchstart' in window;
    } catch {
      hasTouch = false;
    }
  }
  return coarse || touchPoints > 0 || hasTouch;
}

function createZone(id: string): { zone: HTMLElement; knob: HTMLElement } {
  const zone = document.createElement('div');
  zone.id = id;
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  zone.appendChild(knob);
  return { zone, knob };
}

function readTouch(
  event: TouchEvent,
  matchId: number | null,
): { x: number; y: number; id: number } | null {
  const changed = event.changedTouches;
  if (changed !== undefined && changed.length > 0) {
    for (let i = 0; i < changed.length; i += 1) {
      const touch = changed[i];
      if (matchId === null || touch.identifier === matchId) {
        return { x: touch.clientX, y: touch.clientY, id: touch.identifier };
      }
    }
  }
  const touches = event.touches;
  if (touches !== undefined && touches.length > 0) {
    for (let i = 0; i < touches.length; i += 1) {
      const touch = touches[i];
      if (matchId === null || touch.identifier === matchId) {
        return { x: touch.clientX, y: touch.clientY, id: touch.identifier };
      }
    }
  }
  return null;
}

// Knob math takes a cached rect snapshot: it must never read layout in
// the touchmove/pointermove hot path. Snapshots come from the per-zone
// rect caches owned by mountSticks (refreshed on viewport events and once
// per gesture claim), so the formula stays bit-identical to a live read.
function zoneCenter(rect: AimRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function placeKnob(
  knob: HTMLElement,
  rect: { width: number; height: number },
  dxPx: number,
  dyPx: number,
): void {
  const cx = (rect.width - KNOB_PX) / 2 + dxPx;
  const cy = (rect.height - KNOB_PX) / 2 + dyPx;
  knob.style.left = `${cx.toString()}px`;
  knob.style.top = `${cy.toString()}px`;
  knob.style.transform = 'none';
}

function resetKnob(
  knob: HTMLElement,
  rect: { width: number; height: number },
): void {
  placeKnob(knob, rect, 0, 0);
}

/**
 * Mount #stick-left / #stick-right / #dash-btn into #root. Listens to
 * both TouchEvents (identifier tracking, non-passive + preventDefault)
 * and PointerEvents so synthetic probe touches, real phone sequences,
 * and mouse-driven emulation all drive the same frame. Returns unmount.
 */
export function mountSticks(state: InputFrame): () => void {
  const root = document.getElementById('root') ?? document.body;

  const left = createZone('stick-left');
  const right = createZone('stick-right');
  const dashBtn = document.createElement('button');
  dashBtn.id = 'dash-btn';
  dashBtn.type = 'button';
  dashBtn.textContent = 'DASH';

  root.appendChild(left.zone);
  root.appendChild(right.zone);
  root.appendChild(dashBtn);
  // One rect cache per stick zone: the zones are position:fixed, so each
  // snapshot stays valid until a viewport event or the next gesture claim.
  const leftCache = createElementRectCache(left.zone);
  const rightCache = createElementRectCache(right.zone);
  resetKnob(left.knob, leftCache.get());
  resetKnob(right.knob, rightCache.get());

  const leftSlot: StickSlot = { activeId: null, originX: 0, originY: 0, fromTouch: false };
  const rightSlot: StickSlot = { activeId: null, originX: 0, originY: 0, fromTouch: false };
  let dashTouchId: number | null = null;
  let dashPointerId: number | null = null;

  function driveLeft(dxPx: number, dyPx: number): void {
    const v = stickVector(dxPx, dyPx, STICK_RADIUS_PX);
    state.moveX = v.x;
    state.moveY = v.y;
    placeKnob(left.knob, leftCache.get(), v.x * STICK_RADIUS_PX, v.y * STICK_RADIUS_PX);
  }

  function driveRight(dxPx: number, dyPx: number): void {
    const v = stickVector(dxPx, dyPx, STICK_RADIUS_PX);
    state.aimX = v.x;
    state.aimY = v.y;
    state.firing = v.x !== 0 || v.y !== 0;
    placeKnob(right.knob, rightCache.get(), v.x * STICK_RADIUS_PX, v.y * STICK_RADIUS_PX);
  }

  function releaseLeft(): void {
    leftSlot.activeId = null;
    state.moveX = 0;
    state.moveY = 0;
    resetKnob(left.knob, leftCache.get());
  }

  function releaseRight(): void {
    rightSlot.activeId = null;
    state.aimX = 0;
    state.aimY = 0;
    state.firing = false;
    resetKnob(right.knob, rightCache.get());
  }

  function claim(
    slot: StickSlot,
    rect: AimRect,
    clientX: number | null,
    clientY: number | null,
    id: number,
    fromTouch: boolean,
  ): void {
    if (slot.activeId !== null) {
      return;
    }
    // Synthetic events without coordinates fall back to the zone center
    // so a later drag still produces a deflection from a known origin.
    const center = zoneCenter(rect);
    slot.originX = clientX ?? center.x;
    slot.originY = clientY ?? center.y;
    slot.activeId = id;
    slot.fromTouch = fromTouch;
  }

  function onLeftTouchStart(event: TouchEvent): void {
    if (leftSlot.activeId !== null) {
      return;
    }
    event.preventDefault();
    const touch = readTouch(event, null);
    // Exactly one layout read per gesture: pick up shifts since the
    // previous claim; the rest of the gesture serves from the cache.
    leftCache.refresh();
    claim(
      leftSlot,
      leftCache.get(),
      touch === null ? null : touch.x,
      touch === null ? null : touch.y,
      touch === null ? -1 : touch.id,
      true,
    );
    driveLeft(0, 0);
  }

  function onRightTouchStart(event: TouchEvent): void {
    if (rightSlot.activeId !== null) {
      return;
    }
    event.preventDefault();
    const touch = readTouch(event, null);
    rightCache.refresh();
    claim(
      rightSlot,
      rightCache.get(),
      touch === null ? null : touch.x,
      touch === null ? null : touch.y,
      touch === null ? -1 : touch.id,
      true,
    );
    driveRight(0, 0);
  }

  function onDashTouchStart(event: TouchEvent): void {
    if (dashTouchId !== null) {
      return;
    }
    event.preventDefault();
    const touch = readTouch(event, null);
    dashTouchId = touch === null ? -1 : touch.id;
    state.dash = true;
    dashBtn.classList.add('active');
  }

  // Mouse hover must never drive the sticks: only a pressed primary
  // button (touch contact always counts as held) claims or drives.
  function pointerHeld(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || (event.buttons & 1) === 1;
  }

  function capture(zone: HTMLElement, pointerId: number): void {
    try {
      zone.setPointerCapture(pointerId);
    } catch {
      // Synthetic probe events have no capturable pointer; ignore.
    }
  }

  function onLeftPointerDown(event: PointerEvent): void {
    if (leftSlot.activeId !== null) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    leftCache.refresh();
    claim(leftSlot, leftCache.get(), event.clientX, event.clientY, event.pointerId, false);
    capture(left.zone, event.pointerId);
    driveLeft(0, 0);
  }

  function onRightPointerDown(event: PointerEvent): void {
    if (rightSlot.activeId !== null) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    rightCache.refresh();
    claim(rightSlot, rightCache.get(), event.clientX, event.clientY, event.pointerId, false);
    capture(right.zone, event.pointerId);
    driveRight(0, 0);
  }

  function onDashPointerDown(event: PointerEvent): void {
    if (dashPointerId !== null || dashTouchId !== null) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    dashPointerId = event.pointerId;
    capture(dashBtn, event.pointerId);
    state.dash = true;
    dashBtn.classList.add('active');
  }

  function onTouchMove(event: TouchEvent): void {
    let handled = false;
    if (leftSlot.activeId !== null && leftSlot.fromTouch) {
      const touch = readTouch(event, leftSlot.activeId === -1 ? null : leftSlot.activeId);
      const point = touch ?? readTouch(event, null);
      if (point !== null) {
        if (leftSlot.activeId === -1) {
          leftSlot.activeId = point.id;
        }
        driveLeft(point.x - leftSlot.originX, point.y - leftSlot.originY);
        handled = true;
      }
    }
    if (rightSlot.activeId !== null && rightSlot.fromTouch) {
      const touch = readTouch(event, rightSlot.activeId === -1 ? null : rightSlot.activeId);
      const point = touch ?? readTouch(event, null);
      if (point !== null) {
        if (rightSlot.activeId === -1) {
          rightSlot.activeId = point.id;
        }
        driveRight(point.x - rightSlot.originX, point.y - rightSlot.originY);
        handled = true;
      }
    }
    if (handled) {
      event.preventDefault();
    }
  }

  function touchEnded(event: TouchEvent, id: number | null, fromTouch: boolean): boolean {
    if (id === null || !fromTouch) {
      return false;
    }
    if (id === -1) {
      return true;
    }
    const changed = event.changedTouches;
    if (changed !== undefined) {
      for (let i = 0; i < changed.length; i += 1) {
        if (changed[i].identifier === id) {
          return true;
        }
      }
      return false;
    }
    return true;
  }

  function onTouchEnd(event: TouchEvent): void {
    if (touchEnded(event, leftSlot.activeId, leftSlot.fromTouch)) {
      releaseLeft();
    }
    if (touchEnded(event, rightSlot.activeId, rightSlot.fromTouch)) {
      releaseRight();
    }
    if (dashTouchId !== null) {
      let done = dashTouchId === -1;
      const changed = event.changedTouches;
      if (!done && changed !== undefined) {
        for (let i = 0; i < changed.length; i += 1) {
          if (changed[i].identifier === dashTouchId) {
            done = true;
            break;
          }
        }
      }
      if (done) {
        dashTouchId = null;
        if (dashPointerId === null) {
          state.dash = false;
          dashBtn.classList.remove('active');
        }
      }
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerHeld(event)) {
      return;
    }
    if (leftSlot.activeId !== null && !leftSlot.fromTouch && event.pointerId === leftSlot.activeId) {
      driveLeft(event.clientX - leftSlot.originX, event.clientY - leftSlot.originY);
    }
    if (rightSlot.activeId !== null && !rightSlot.fromTouch && event.pointerId === rightSlot.activeId) {
      driveRight(event.clientX - rightSlot.originX, event.clientY - rightSlot.originY);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (leftSlot.activeId !== null && !leftSlot.fromTouch && event.pointerId === leftSlot.activeId) {
      releaseLeft();
    }
    if (rightSlot.activeId !== null && !rightSlot.fromTouch && event.pointerId === rightSlot.activeId) {
      releaseRight();
    }
    if (dashPointerId !== null && event.pointerId === dashPointerId) {
      dashPointerId = null;
      if (dashTouchId === null) {
        state.dash = false;
        dashBtn.classList.remove('active');
      }
    }
  }

  left.zone.addEventListener('touchstart', onLeftTouchStart, { passive: false });
  right.zone.addEventListener('touchstart', onRightTouchStart, { passive: false });
  dashBtn.addEventListener('touchstart', onDashTouchStart, { passive: false });
  left.zone.addEventListener('pointerdown', onLeftPointerDown);
  right.zone.addEventListener('pointerdown', onRightPointerDown);
  dashBtn.addEventListener('pointerdown', onDashPointerDown);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  // Viewport refresh for both zone caches (alongside each cache's own
  // subscription): one shared handler keeps snapshots current when
  // layout shifts between gestures.
  function refreshZones(): void {
    leftCache.refresh();
    rightCache.refresh();
  }
  window.addEventListener('resize', refreshZones);
  window.addEventListener('scroll', refreshZones, { capture: true, passive: true });
  window.addEventListener('orientationchange', refreshZones);

  return () => {
    left.zone.removeEventListener('touchstart', onLeftTouchStart);
    right.zone.removeEventListener('touchstart', onRightTouchStart);
    dashBtn.removeEventListener('touchstart', onDashTouchStart);
    left.zone.removeEventListener('pointerdown', onLeftPointerDown);
    right.zone.removeEventListener('pointerdown', onRightPointerDown);
    dashBtn.removeEventListener('pointerdown', onDashPointerDown);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', refreshZones);
    window.removeEventListener('scroll', refreshZones, { capture: true });
    window.removeEventListener('orientationchange', refreshZones);
    leftCache.dispose();
    rightCache.dispose();
    releaseLeft();
    releaseRight();
    dashTouchId = null;
    dashPointerId = null;
    state.dash = false;
    left.zone.remove();
    right.zone.remove();
    dashBtn.remove();
  };
}
