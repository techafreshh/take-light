/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { hasDebugFlag, shouldShowDebugOverlay } from './debug';

describe('hasDebugFlag', () => {
  it('matches a bare ?debug key', () => {
    expect(hasDebugFlag('?debug')).toBe(true);
  });

  it('matches ?debug with a value', () => {
    expect(hasDebugFlag('?x=1&debug=0')).toBe(true);
  });

  it('rejects an empty search', () => {
    expect(hasDebugFlag('')).toBe(false);
  });

  it('rejects lookalike keys', () => {
    expect(hasDebugFlag('?nodebug=1')).toBe(false);
    expect(hasDebugFlag('?x=debug')).toBe(false);
  });
});

describe('shouldShowDebugOverlay', () => {
  it('shows on ?debug in production', () => {
    expect(shouldShowDebugOverlay('?debug', false)).toBe(true);
  });

  it('shows on the dev server without a flag', () => {
    expect(shouldShowDebugOverlay('', true)).toBe(true);
  });

  it('hides in production without a flag', () => {
    expect(shouldShowDebugOverlay('', false)).toBe(false);
  });

  it('hides in production on lookalike keys', () => {
    expect(shouldShowDebugOverlay('?nodebug=1', false)).toBe(false);
  });

  it('shows on a valued debug key in production', () => {
    expect(shouldShowDebugOverlay('?x=1&debug=0', false)).toBe(true);
  });
});
