import { describe, expect, it } from 'vitest';
import { MAX_SHIELDS } from './player';
import {
  PICKUP_CAPACITY,
  PICKUP_COLLECT_RADIUS,
  clearPickups,
  createPickupField,
  spawnPickup,
  toPickupProbe,
  updatePickups,
} from './pickups';

describe('pickup spawn', () => {
  it('spawns an active shield pickup at the given position', () => {
    const field = createPickupField();
    const pickup = spawnPickup(field, 3, -2, 'shield');
    expect(pickup.active).toBe(true);
    expect(pickup.kind).toBe('shield');
    expect(pickup.x).toBe(3);
    expect(pickup.z).toBe(-2);
    expect(toPickupProbe(field).active).toBe(1);
  });

  it('caps the pool at 8 and never grows', () => {
    const field = createPickupField();
    expect(field.pool.size).toBe(8);
    expect(PICKUP_CAPACITY).toBe(8);
    for (let i = 0; i < 10; i += 1) {
      spawnPickup(field, i, 0, 'shield');
    }
    expect(field.pool.size).toBe(8);
    expect(field.live.length).toBeLessThanOrEqual(8);
    expect(toPickupProbe(field).active).toBeLessThanOrEqual(8);
  });
});

describe('pickup collect', () => {
  it('collects inside radius 1.4 and restores one shield', () => {
    const field = createPickupField();
    spawnPickup(field, 0.5, 0, 'shield');
    const player = { shields: 1 };
    const collected = updatePickups(field, { x: 0, z: 0 }, player, 16);
    expect(collected).toBe(1);
    expect(player.shields).toBe(2);
    expect(field.live.length).toBe(0);
    expect(PICKUP_COLLECT_RADIUS).toBe(1.4);
  });

  it('ignores pickups far from the player', () => {
    const field = createPickupField();
    spawnPickup(field, 10, 0, 'shield');
    const player = { shields: 1 };
    const collected = updatePickups(field, { x: 0, z: 0 }, player, 16);
    expect(collected).toBe(0);
    expect(player.shields).toBe(1);
    expect(field.live.length).toBe(1);
  });

  it('caps shields at MAX_SHIELDS', () => {
    const field = createPickupField();
    spawnPickup(field, 0, 0, 'shield');
    const player = { shields: MAX_SHIELDS };
    const collected = updatePickups(field, { x: 0, z: 0 }, player, 16);
    expect(collected).toBe(1);
    expect(player.shields).toBe(MAX_SHIELDS);
    expect(field.live.length).toBe(0);
  });
});

describe('pickup reset', () => {
  it('clearPickups empties the probe mirror', () => {
    const field = createPickupField();
    spawnPickup(field, 1, 1, 'shield');
    spawnPickup(field, -1, -1, 'shield');
    expect(toPickupProbe(field).active).toBe(2);
    clearPickups(field);
    expect(toPickupProbe(field).active).toBe(0);
    expect(toPickupProbe(field).list).toEqual([]);
    expect(field.pool.activeCount).toBe(0);
  });
});
