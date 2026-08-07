import { describe, expect, it } from 'vitest';
import { daysAway, expiresDuringTrip, suggestKit } from './travel';

describe('daysAway', () => {
  it('counts both the day you leave and the day you come back', () => {
    // Friday to Sunday is three days of tablets, not two.
    expect(daysAway('2026-08-07', '2026-08-09')).toBe(3);
  });

  it('is one day for a same-day trip', () => {
    expect(daysAway('2026-08-07', '2026-08-07')).toBe(1);
  });

  it('handles a fortnight across a month boundary', () => {
    expect(daysAway('2026-08-25', '2026-09-07')).toBe(14);
  });

  it('is zero when the dates are the wrong way round', () => {
    expect(daysAway('2026-08-09', '2026-08-07')).toBe(0);
  });
});

describe('suggestKit', () => {
  it('offers a scheduled product with its computed units', () => {
    expect(suggestKit([{ productId: 1, units: 14 }], [], [])).toEqual([
      { productId: 1, units: 14, reason: 'scheduled' },
    ]);
  });

  it('sums two people taking the same thing', () => {
    // The bag needs both courses, not the larger of them.
    const kit = suggestKit(
      [
        { productId: 1, units: 14 },
        { productId: 1, units: 28 },
      ],
      [],
      [],
    );
    expect(kit).toEqual([{ productId: 1, units: 42, reason: 'scheduled' }]);
  });

  it('offers a standing item with no quantity, because only a person knows', () => {
    expect(suggestKit([], [7], [])).toEqual([{ productId: 7, units: 0, reason: 'standing' }]);
  });

  it('shows a product that is both scheduled and standing exactly once', () => {
    const kit = suggestKit([{ productId: 3, units: 6 }], [3], []);
    expect(kit).toEqual([{ productId: 3, units: 6, reason: 'scheduled' }]);
  });

  it('still offers a standing item when its course does not run during the trip', () => {
    /*
     * "Always take the antihistamines" does not stop being true in a week when
     * none happen to be due.
     */
    const kit = suggestKit([{ productId: 3, units: 0 }], [3], []);
    expect(kit).toEqual([{ productId: 3, units: 0, reason: 'standing' }]);
  });

  it('drops a scheduled product with nothing due and no standing mark', () => {
    expect(suggestKit([{ productId: 3, units: 0 }], [], [])).toEqual([]);
  });

  it('never re-offers something already on the list', () => {
    expect(suggestKit([{ productId: 1, units: 14 }], [7], [1, 7])).toEqual([]);
  });

  it('puts worked-out quantities before standing items', () => {
    // A missed course matters more than a forgotten plaster.
    const kit = suggestKit([{ productId: 9, units: 3 }], [2], []);
    expect(kit.map((k) => k.reason)).toEqual(['scheduled', 'standing']);
  });

  it('deduplicates a standing product listed twice', () => {
    expect(suggestKit([], [5, 5], [])).toHaveLength(1);
  });

  it('rounds summed units rather than trailing floating point', () => {
    const kit = suggestKit(
      [
        { productId: 1, units: 0.1 },
        { productId: 1, units: 0.2 },
      ],
      [],
      [],
    );
    expect(kit[0]!.units).toBe(0.3);
  });

  it('is empty when there is nothing to suggest', () => {
    expect(suggestKit([], [], [])).toEqual([]);
  });
});

describe('expiresDuringTrip', () => {
  it('flags a box that goes off while you are away', () => {
    expect(expiresDuringTrip('2026-08-20', '2026-08-25')).toBe(true);
  });

  it('is fine for a box that outlasts the trip', () => {
    expect(expiresDuringTrip('2027-01-31', '2026-08-25')).toBe(false);
  });

  it('says nothing about things that do not expire', () => {
    expect(expiresDuringTrip(null, '2026-08-25')).toBe(false);
  });
});
