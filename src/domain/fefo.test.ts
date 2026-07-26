import { describe, expect, it } from 'vitest';
import {
  allocateFefo,
  nextBatchToOpen,
  sortByFefo,
  totalAvailable,
  type FefoBatch,
} from './fefo';

const TODAY = '2026-07-26';

function batch(overrides: Partial<FefoBatch> & { id: number }): FefoBatch {
  return {
    quantityRemaining: 60,
    expiryDate: '2028-01-31',
    expiryPrecision: 'month',
    hasExpiry: true,
    openedAt: null,
    status: 'in_stock',
    ...overrides,
  };
}

describe('sortByFefo', () => {
  it('puts the earliest expiry first', () => {
    const batches = [
      batch({ id: 1, expiryDate: '2028-01-31' }),
      batch({ id: 2, expiryDate: '2026-11-30' }),
      batch({ id: 3, expiryDate: '2027-05-31' }),
    ];
    expect(sortByFefo(batches, TODAY).map((b) => b.id)).toEqual([2, 3, 1]);
  });

  it('sends a sealed box first when it expires before an opened one', () => {
    // The point of FEFO: finishing the opened box would waste the sealed one.
    const opened = batch({ id: 1, expiryDate: '2029-01-31', openedAt: '2026-06-01' });
    const sealedButExpiringSoon = batch({ id: 2, expiryDate: '2026-08-31' });
    expect(sortByFefo([opened, sealedButExpiringSoon], TODAY).map((b) => b.id)).toEqual([2, 1]);
  });

  it('prefers an already-opened box only as a tiebreak on equal expiry', () => {
    const sealed = batch({ id: 1, expiryDate: '2027-05-31' });
    const opened = batch({ id: 2, expiryDate: '2027-05-31', openedAt: '2026-06-01' });
    expect(sortByFefo([sealed, opened], TODAY).map((b) => b.id)).toEqual([2, 1]);
  });

  it('falls back to the oldest box when expiry and opened state match', () => {
    const newer = batch({ id: 9, expiryDate: '2027-05-31' });
    const older = batch({ id: 3, expiryDate: '2027-05-31' });
    expect(sortByFefo([newer, older], TODAY).map((b) => b.id)).toEqual([3, 9]);
  });

  it('uses perishable stock before stock that never expires', () => {
    const plasters = batch({ id: 1, expiryDate: null, expiryPrecision: null, hasExpiry: false });
    const perishable = batch({ id: 2, expiryDate: '2029-12-31' });
    expect(sortByFefo([plasters, perishable], TODAY).map((b) => b.id)).toEqual([2, 1]);
  });

  it('excludes expired, empty and non-stock batches', () => {
    const batches = [
      batch({ id: 1, expiryDate: '2026-07-25' }), // expired yesterday
      batch({ id: 2, quantityRemaining: 0 }), // empty
      batch({ id: 3, status: 'discarded' }),
      batch({ id: 4, status: 'consumed' }),
      batch({ id: 5, expiryDate: '2027-01-31' }), // the only usable one
    ];
    expect(sortByFefo(batches, TODAY).map((b) => b.id)).toEqual([5]);
  });

  it('treats a box expiring today as still usable', () => {
    expect(sortByFefo([batch({ id: 1, expiryDate: TODAY })], TODAY).map((b) => b.id)).toEqual([1]);
  });

  it('can include expired stock when explicitly asked', () => {
    const expired = batch({ id: 1, expiryDate: '2026-07-25' });
    expect(sortByFefo([expired], TODAY, { allowExpired: true }).map((b) => b.id)).toEqual([1]);
  });

  it('does not mutate the input array', () => {
    const batches = [batch({ id: 1, expiryDate: '2028-01-31' }), batch({ id: 2, expiryDate: '2026-11-30' })];
    const order = batches.map((b) => b.id);
    sortByFefo(batches, TODAY);
    expect(batches.map((b) => b.id)).toEqual(order);
  });
});

describe('allocateFefo', () => {
  it('draws everything from one box when it covers the need', () => {
    const batches = [batch({ id: 1, quantityRemaining: 60, expiryDate: '2027-01-31' })];
    expect(allocateFefo(batches, 14, TODAY)).toEqual({
      allocations: [{ batchId: 1, quantity: 14 }],
      shortfall: 0,
    });
  });

  it('spills over into the next box in FEFO order', () => {
    const batches = [
      batch({ id: 1, quantityRemaining: 10, expiryDate: '2026-11-30' }),
      batch({ id: 2, quantityRemaining: 60, expiryDate: '2027-05-31' }),
    ];
    expect(allocateFefo(batches, 25, TODAY)).toEqual({
      allocations: [
        { batchId: 1, quantity: 10 },
        { batchId: 2, quantity: 15 },
      ],
      shortfall: 0,
    });
  });

  it('reports a shortfall rather than throwing', () => {
    const batches = [batch({ id: 1, quantityRemaining: 10, expiryDate: '2026-11-30' })];
    expect(allocateFefo(batches, 25, TODAY)).toEqual({
      allocations: [{ batchId: 1, quantity: 10 }],
      shortfall: 15,
    });
  });

  it('reports the whole amount as shortfall when there is no usable stock', () => {
    expect(allocateFefo([], 25, TODAY)).toEqual({ allocations: [], shortfall: 25 });
  });

  it('allocates nothing for a zero request', () => {
    const batches = [batch({ id: 1 })];
    expect(allocateFefo(batches, 0, TODAY)).toEqual({ allocations: [], shortfall: 0 });
  });

  it('handles fractional doses without float drift', () => {
    const batches = [batch({ id: 1, quantityRemaining: 100, expiryDate: '2027-05-31' })];
    expect(allocateFefo(batches, 7.5, TODAY)).toEqual({
      allocations: [{ batchId: 1, quantity: 7.5 }],
      shortfall: 0,
    });
  });

  it('rejects a negative request', () => {
    expect(() => allocateFefo([], -1, TODAY)).toThrow();
  });
});

describe('nextBatchToOpen', () => {
  it('names the box to reach for', () => {
    const batches = [
      batch({ id: 1, expiryDate: '2028-01-31' }),
      batch({ id: 2, expiryDate: '2026-11-30' }),
    ];
    expect(nextBatchToOpen(batches, TODAY)?.id).toBe(2);
  });

  it('returns null when there is nothing usable', () => {
    expect(nextBatchToOpen([batch({ id: 1, expiryDate: '2026-07-25' })], TODAY)).toBeNull();
  });
});

describe('totalAvailable', () => {
  it('counts only usable stock', () => {
    const batches = [
      batch({ id: 1, quantityRemaining: 60, expiryDate: '2027-01-31' }),
      batch({ id: 2, quantityRemaining: 14, expiryDate: '2027-05-31' }),
      batch({ id: 3, quantityRemaining: 60, expiryDate: '2026-07-25' }), // expired
      batch({ id: 4, quantityRemaining: 60, status: 'discarded' }),
    ];
    expect(totalAvailable(batches, TODAY)).toBe(74);
  });

  it('is zero when the cupboard is empty', () => {
    expect(totalAvailable([], TODAY)).toBe(0);
  });
});
