import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  isLowStock,
  isTrackableQuantity,
  packsNeeded,
  packsToUnits,
  parseUnits,
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

describe('parseUnits', () => {
  it('accepts a full stop', () => {
    expect(parseUnits('0.5')).toBe(0.5);
    expect(parseUnits('32.5')).toBe(32.5);
  });

  it('accepts a comma, which is what a Polish keyboard offers', () => {
    // The bug this exists for: Number('0,5') is NaN, so half a tablet typed on
    // a phone was rejected as "not a positive number".
    expect(parseUnits('0,5')).toBe(0.5);
    expect(parseUnits('32,5')).toBe(32.5);
  });

  it('accepts whole numbers and tolerates surrounding space', () => {
    expect(parseUnits('60')).toBe(60);
    expect(parseUnits('  14  ')).toBe(14);
  });

  it('accepts a leading decimal point', () => {
    expect(parseUnits('.25')).toBe(0.25);
    expect(parseUnits(',25')).toBe(0.25);
  });

  it('is null for anything that is not a plain number', () => {
    expect(parseUnits('')).toBeNull();
    expect(parseUnits('   ')).toBeNull();
    expect(parseUnits('half')).toBeNull();
    expect(parseUnits('1.2.3')).toBeNull();
    expect(parseUnits('1,2,3')).toBeNull();
    expect(parseUnits('5 tablets')).toBeNull();
    expect(parseUnits('-1')).toBeNull();
  });
});

describe('isTrackableQuantity', () => {
  it('accepts what the two-decimal store can hold exactly', () => {
    for (const value of [1, 0.5, 0.25, 0.75, 2.5, 0.1, 0.01, 32.5]) {
      expect(isTrackableQuantity(value)).toBe(true);
    }
  });

  it('rejects finer fractions that would drift', () => {
    // An eighth of a tablet leaves 0.04 behind after eight doses.
    expect(isTrackableQuantity(0.125)).toBe(false);
    expect(isTrackableQuantity(1 / 3)).toBe(false);
    expect(isTrackableQuantity(0.005)).toBe(false);
  });

  it('is not fooled by float representation of a valid value', () => {
    expect(isTrackableQuantity(0.1 + 0.2)).toBe(true); // 0.30000000000000004
  });
});

describe('isLowStock', () => {
  it('is true when there is nothing left', () => {
    expect(isLowStock(0, 60)).toBe(true);
  });

  it('is true below a quarter of a pack', () => {
    expect(isLowStock(14, 60)).toBe(true);
    expect(isLowStock(11, 90)).toBe(true); // Finaster: 11 of 90 really is low
  });

  it('is false for a barely-touched pack', () => {
    // The case that made the first rule wrong: one opened tub, 58 of 60 left,
    // was flagged as running low because no sealed box sat behind it.
    expect(isLowStock(58, 60)).toBe(false);
    expect(isLowStock(55, 60)).toBe(false);
  });

  it('treats exactly a quarter as still enough', () => {
    expect(isLowStock(15, 60)).toBe(false);
    expect(isLowStock(14.99, 60)).toBe(true);
  });

  it('handles single-item packs, where one is a full pack', () => {
    expect(isLowStock(1, 1)).toBe(false);
    expect(isLowStock(0, 1)).toBe(true);
  });

  it('does not divide by a missing pack size', () => {
    expect(isLowStock(5, 0)).toBe(false);
    expect(isLowStock(0, 0)).toBe(true);
  });
});
