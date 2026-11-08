/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTouchStickState, mountSticks, shouldMountTouchControls } from './sticks';

afterEach(() => {
  document.body.innerHTML = '';
});

function domRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeTouch(
  type: string,
  points: ReadonlyArray<{ id: number; x: number; y: number }>,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = points.map((p) => ({
    identifier: p.id,
    clientX: p.x,
    clientY: p.y,
  }));
  const record = event as unknown as Record<string, unknown>;
  record.changedTouches = list;
  record.touches = type === 'touchend' || type === 'touchcancel' ? [] : list;
  return event;
}

function makePointer(
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    pointerType?: string;
    buttons?: number;
    button?: number;
  },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerType: 'mouse',
    buttons: 1,
    button: 0,
    ...init,
  });
  return event;
}

describe('mountSticks rect caching', () => {
  it('touch gestures use the cached rect: no layout reads per move', () => {
    document.body.innerHTML = '<div id="root"></div>';
    // KNOB_PX is 54: centered knob on a 100px zone sits at (100-54)/2.
    const protoSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(domRect({ left: 10, top: 20, width: 100, height: 100 }));
    const state = createTouchStickState();
    const unmount = mountSticks(state);
    const leftZone = document.getElementById('stick-left');
    expect(leftZone).not.toBeNull();
    const knob = leftZone?.firstElementChild as HTMLElement;
    expect(knob.style.left).toBe('23px');
    expect(knob.style.top).toBe('23px');

    // One read per gesture claim (touchstart), zero per move.
    protoSpy.mockClear();
    leftZone?.dispatchEvent(makeTouch('touchstart', [{ id: 7, x: 60, y: 70 }]));
    expect(protoSpy).toHaveBeenCalledTimes(1);
    expect(state.moveX).toBe(0);
    for (let i = 0; i < 50; i += 1) {
      window.dispatchEvent(makeTouch('touchmove', [{ id: 7, x: 90, y: 70 }]));
    }
    expect(protoSpy).toHaveBeenCalledTimes(1);
    // dx=30px on a 60px radius stick: (0.5, 0), knob at 23+30.
    expect(state.moveX).toBeCloseTo(0.5);
    expect(state.moveY).toBe(0);
    expect(knob.style.left).toBe('53px');
    expect(knob.style.top).toBe('23px');

    // A layout shift mid-gesture stays cached until a viewport event.
    protoSpy.mockReturnValue(
      domRect({ left: 10, top: 20, width: 200, height: 200 }),
    );
    window.dispatchEvent(makeTouch('touchmove', [{ id: 7, x: 90, y: 70 }]));
    expect(knob.style.left).toBe('53px');

    // Resize refreshes the cache: the same deflection now uses 200px.
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(makeTouch('touchmove', [{ id: 7, x: 90, y: 70 }]));
    expect(knob.style.left).toBe('103px');
    expect(knob.style.top).toBe('73px');

    // Release recenters on the refreshed rect.
    window.dispatchEvent(makeTouch('touchend', [{ id: 7, x: 90, y: 70 }]));
    expect(state.moveX).toBe(0);
    expect(knob.style.left).toBe('73px');
    expect(knob.style.top).toBe('73px');

    unmount();
    expect(document.getElementById('stick-left')).toBeNull();
    expect(document.getElementById('stick-right')).toBeNull();
    protoSpy.mockRestore();
  });

  it('pointer gestures use the cached rect: no layout reads per move', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const protoSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(domRect({ left: 10, top: 20, width: 100, height: 100 }));
    const state = createTouchStickState();
    const unmount = mountSticks(state);
    const rightZone = document.getElementById('stick-right');
    expect(rightZone).not.toBeNull();
    const knob = rightZone?.firstElementChild as HTMLElement;
    expect(knob.style.left).toBe('23px');

    protoSpy.mockClear();
    rightZone?.dispatchEvent(
      makePointer('pointerdown', { pointerId: 9, clientX: 60, clientY: 70 }),
    );
    expect(protoSpy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 30; i += 1) {
      window.dispatchEvent(
        makePointer('pointermove', {
          pointerId: 9,
          clientX: 60,
          clientY: 130,
        }),
      );
    }
    expect(protoSpy).toHaveBeenCalledTimes(1);
    // dy=60px on a 60px radius stick: full (0, 1) deflection, firing set.
    expect(state.aimX).toBeCloseTo(0);
    expect(state.aimY).toBeCloseTo(1);
    expect(state.firing).toBe(true);
    expect(knob.style.left).toBe('23px');
    expect(knob.style.top).toBe('83px');

    window.dispatchEvent(
      makePointer('pointerup', { pointerId: 9, clientX: 60, clientY: 130 }),
    );
    expect(state.firing).toBe(false);
    expect(knob.style.left).toBe('23px');
    expect(knob.style.top).toBe('23px');

    unmount();
    expect(document.getElementById('stick-right')).toBeNull();
    protoSpy.mockRestore();
  });
});

describe('shouldMountTouchControls', () => {
  it('mounts on a coarse pointer hint', () => {
    expect(shouldMountTouchControls({ coarse: true })).toBe(true);
  });

  it('mounts on touch points', () => {
    expect(shouldMountTouchControls({ touchPoints: 1 })).toBe(true);
  });

  it('mounts on legacy ontouchstart', () => {
    expect(shouldMountTouchControls({ hasTouch: true })).toBe(true);
  });

  it('stays unmounted when every hint is negative', () => {
    expect(
      shouldMountTouchControls({
        coarse: false,
        touchPoints: 0,
        hasTouch: false,
      }),
    ).toBe(false);
  });

  it('stays unmounted by default on a fine-pointer desktop', () => {
    // jsdom models a touch-capable window (own ontouchstart === null),
    // so deleting it emulates the fine-pointer desktop live-read path.
    const w = window as unknown as Record<string, unknown>;
    const saved = w['ontouchstart'];
    delete w['ontouchstart'];
    try {
      expect(shouldMountTouchControls()).toBe(false);
    } finally {
      w['ontouchstart'] = saved;
    }
  });

  it('gating pattern leaves #stick-left absent when the predicate is false', () => {
    document.body.innerHTML = '<div id="root"></div>';
    // All-false hints emulate the fine-pointer desktop live reads.
    if (
      shouldMountTouchControls({
        coarse: false,
        touchPoints: 0,
        hasTouch: false,
      })
    ) {
      mountSticks(createTouchStickState());
    }
    expect(document.getElementById('stick-left')).toBeNull();
    expect(document.getElementById('stick-right')).toBeNull();
    expect(document.getElementById('dash-btn')).toBeNull();
  });
});
