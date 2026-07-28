import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  packsNeeded,
  packsToUnits,
  unitsToPacks,
  withBuffer,
} from './quantity';

describe('packsToUnits', () => {
  it('converts sealed packs to base units', () => {
    expect(packsToUnits(5, 60)).toBe(300);
  });

  it('rejects a nonsense pack size', () => {
    expect(() => packsToUnits(5, 0)).toThrow();
    expect(() => packsToUnits(5, -60)).toThrow();
  });
});

describe('unitsToPacks', () => {
  it('splits into full packs and a remainder', () => {
    expect(unitsToPacks(74, 60)).toEqual({ fullPacks: 1, remainderUnits: 14 });
  });

  it('reports an exact multiple with no remainder', () => {
    expect(unitsToPacks(120, 60)).toEqual({ fullPacks: 2, remainderUnits: 0 });
  });

  it('handles less than one pack', () => {
    expect(unitsToPacks(14, 60)).toEqual({ fullPacks: 0, remainderUnits: 14 });
  });

  it('does not accumulate float drift on fractional units', () => {
    // 100 ml bottle with 5 ml doses logged; naive subtraction drifts to 32.599999.
    expect(unitsToPacks(32.6, 100)).toEqual({ fullPacks: 0, remainderUnits: 32.6 });
    expect(unitsToPacks(232.6, 100)).toEqual({ fullPacks: 2, remainderUnits: 32.6 });
  });
});

describe('packsNeeded', () => {
  it('always rounds up — a partial pack is not purchasable', () => {
    // 340 tablets needed to cover until the next trip, sold in 60s.
    expect(packsNeeded(340, 60)).toBe(6);
  });

  it('does not round up an exact fit', () => {
    expect(packsNeeded(360, 60)).toBe(6);
  });

  it('buys one pack for any positive need below a full pack', () => {
    expect(packsNeeded(1, 60)).toBe(1);
  });

  it('buys nothing when nothing is needed', () => {
    expect(packsNeeded(0, 60)).toBe(0);
    expect(packsNeeded(-5, 60)).toBe(0);
  });

  it('is not tripped up by float division', () => {
    // 0.3/0.1 is 2.9999999999999996 in IEEE 754, which would round up to 3.
    expect(packsNeeded(0.3, 0.1)).toBe(3);
  });
});

describe('withBuffer', () => {
  it('leans towards over-buying by default', () => {
    expect(withBuffer(340)).toBe(425);
  });

  it('accepts a custom margin', () => {
    expect(withBuffer(340, 0.5)).toBe(510);
    expect(withBuffer(340, 0)).toBe(340);
  });

  it('rejects a negative margin', () => {
    expect(() => withBuffer(340, -0.1)).toThrow();
  });
});

describe('formatQuantity', () => {
  it('shows packs plus loose units when a pack size is known', () => {
    expect(formatQuantity(74, 'tablet', 60)).toBe('1 pack + 14 tablets');
    expect(formatQuantity(134, 'tablet', 60)).toBe('2 packs + 14 tablets');
  });

  it('omits the remainder on an exact multiple', () => {
    expect(formatQuantity(120, 'tablet', 60)).toBe('2 packs');
  });

  it('falls back to plain units below one pack', () => {
    expect(formatQuantity(45, 'tablet', 60)).toBe('45 tablets');
  });

  it('does not pluralise a single unit', () => {
    expect(formatQuantity(1, 'tablet')).toBe('1 tablet');
    expect(formatQuantity(1, 'capsule')).toBe('1 capsule');
  });

  it('leaves mass and volume units alone', () => {
    expect(formatQuantity(100, 'ml')).toBe('100 ml');
    expect(formatQuantity(1, 'ml')).toBe('1 ml');
    expect(formatQuantity(250, 'g')).toBe('250 g');
  });

  it('pluralises "piece" correctly rather than as "pieces"+s', () => {
    expect(formatQuantity(3, 'piece')).toBe('3 pieces');
  });

  it('shows half tablets', () => {
    expect(formatQuantity(13.5, 'tablet')).toBe('13.5 tablets');
  });
});
