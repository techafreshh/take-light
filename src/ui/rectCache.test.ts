/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElementRectCache } from './rectCache';

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

describe('createElementRectCache', () => {
  it('snapshots once at construction and get() performs no DOM reads', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const spy = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue(domRect({ left: 10, top: 20, width: 100, height: 200 }));
    const cache = createElementRectCache(element);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.get()).toEqual({ left: 10, top: 20, width: 100, height: 200 });

    spy.mockClear();
    for (let i = 0; i < 50; i += 1) {
      expect(cache.get()).toEqual({
        left: 10,
        top: 20,
        width: 100,
        height: 200,
      });
    }
    expect(spy).not.toHaveBeenCalled();

    // get() hands out copies: mutating one must not corrupt the snapshot.
    const copy = cache.get();
    copy.width = 9999;
    expect(cache.get().width).toBe(100);
    expect(spy).not.toHaveBeenCalled();
    cache.dispose();
  });

  it('refresh() takes exactly one new snapshot', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const spy = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue(domRect({ left: 0, top: 0, width: 100, height: 100 }));
    const cache = createElementRectCache(element);
    spy.mockReturnValue(domRect({ left: 5, top: 6, width: 300, height: 150 }));
    spy.mockClear();

    expect(cache.refresh()).toEqual({
      left: 5,
      top: 6,
      width: 300,
      height: 150,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.get()).toEqual({ left: 5, top: 6, width: 300, height: 150 });
    expect(spy).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('resize, scroll, and orientationchange each refresh exactly once', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const spy = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue(domRect({ left: 0, top: 0, width: 100, height: 100 }));
    const cache = createElementRectCache(element);
    spy.mockClear();

    spy.mockReturnValue(domRect({ left: 0, top: 0, width: 200, height: 200 }));
    window.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.get()).toEqual({ left: 0, top: 0, width: 200, height: 200 });

    spy.mockClear();
    spy.mockReturnValue(domRect({ left: 1, top: 2, width: 220, height: 210 }));
    window.dispatchEvent(new Event('scroll'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.get()).toEqual({ left: 1, top: 2, width: 220, height: 210 });

    spy.mockClear();
    spy.mockReturnValue(domRect({ left: 3, top: 4, width: 240, height: 220 }));
    window.dispatchEvent(new Event('orientationchange'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.get()).toEqual({ left: 3, top: 4, width: 240, height: 220 });
    cache.dispose();
  });

  it('dispose() detaches all viewport listeners', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const spy = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue(domRect({ left: 0, top: 0, width: 100, height: 100 }));
    const cache = createElementRectCache(element);
    spy.mockClear();
    cache.dispose();

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('orientationchange'));
    expect(spy).not.toHaveBeenCalled();
    // The last snapshot stays readable after disposal.
    expect(cache.get()).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});
