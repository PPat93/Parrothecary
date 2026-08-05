import { describe, expect, it } from 'vitest';
import { BATCH_STATUSES } from '@/db/schema';
import {
  MOVEMENT_REASONS,
  applyAdjustment,
  isOutOfStock,
  movementForCount,
  movementForStatusChange,
  netUnits,
  summariseMovements,
  type LedgerBatchStatus,
  type Movement,
} from './ledger';

const move = (delta: number, reason: Movement['reason']): Movement => ({ delta, reason });

describe('the ledger and the schema agree on batch statuses', () => {
  /*
   * ledger.ts declares its own status union to stay import-free. That is only
   * safe if the two lists cannot drift apart unnoticed, which is this test.
   */
  it('covers exactly the statuses the database allows', () => {
    const fromLedger: LedgerBatchStatus[] = ['in_stock', 'consumed', 'expired', 'discarded'];
    expect([...fromLedger].sort()).toEqual([...BATCH_STATUSES].sort());
  });
});

describe('netUnits', () => {
  it('adds movements up to what is in the box', () => {
    expect(netUnits([move(60, 'received'), move(-1, 'dose'), move(-1, 'dose')])).toBe(58);
  });

  it('closes at zero once the box leaves stock', () => {
    expect(netUnits([move(30, 'received'), move(-5, 'dose'), move(-25, 'binned')])).toBe(0);
  });

  it('rounds, because halves and tenths of a tablet are real', () => {
    // 0.1 + 0.2 is 0.30000000000000004 before rounding.
    expect(netUnits([move(0.1, 'received'), move(0.2, 'received')])).toBe(0.3);
    expect(netUnits([move(3, 'received'), move(-0.5, 'dose'), move(-0.25, 'dose')])).toBe(2.25);
  });

  it('is zero for a box that never moved', () => {
    expect(netUnits([])).toBe(0);
  });
});

describe('movementForStatusChange', () => {
  it('takes what is left out of the cupboard when a box is binned', () => {
    expect(movementForStatusChange('in_stock', 'expired', 25)).toEqual({
      delta: -25,
      reason: 'binned',
    });
    expect(movementForStatusChange('in_stock', 'discarded', 12.5)).toEqual({
      delta: -12.5,
      reason: 'binned',
    });
  });

  it('puts them back when a box is restored', () => {
    expect(movementForStatusChange('discarded', 'in_stock', 25)).toEqual({
      delta: 25,
      reason: 'binned',
    });
  });

  it('does nothing when the box stays on the same side of in-stock', () => {
    expect(movementForStatusChange('expired', 'discarded', 25)).toBeNull();
    expect(movementForStatusChange('in_stock', 'in_stock', 25)).toBeNull();
  });

  it('does nothing for an empty box', () => {
    // Running out already moved the units; retiring it must not move them twice.
    expect(movementForStatusChange('in_stock', 'consumed', 0)).toBeNull();
    expect(movementForStatusChange('in_stock', 'consumed', -3)).toBeNull();
  });
});

describe('isOutOfStock', () => {
  it('treats every terminal status the same way', () => {
    expect(isOutOfStock('in_stock')).toBe(false);
    expect(isOutOfStock('consumed')).toBe(true);
    expect(isOutOfStock('expired')).toBe(true);
    expect(isOutOfStock('discarded')).toBe(true);
  });
});

describe('applyAdjustment', () => {
  it('applies an ordinary press in full', () => {
    expect(applyAdjustment(30, -1)).toEqual({ next: 29, applied: -1 });
    expect(applyAdjustment(30, 1)).toEqual({ next: 31, applied: 1 });
  });

  it('gives only what is left when the box cannot cover the press', () => {
    // The button says -1; there is half a tablet. Half is what moves.
    expect(applyAdjustment(0.5, -1)).toEqual({ next: 0, applied: -0.5 });
    expect(applyAdjustment(0, -1)).toEqual({ next: 0, applied: 0 });
  });

  it('handles fractional doses without drifting', () => {
    expect(applyAdjustment(3, -0.25)).toEqual({ next: 2.75, applied: -0.25 });
    // 2.75 - 0.1 - 0.2 in floating point is where this would go wrong.
    expect(applyAdjustment(0.3, -0.1)).toEqual({ next: 0.2, applied: -0.1 });
  });

  it('never reports a move that did not happen', () => {
    const { next, applied } = applyAdjustment(12, 0);
    expect(next).toBe(12);
    expect(applied).toBe(0);
  });

  it('keeps next and applied consistent for any press', () => {
    // The property the ledger depends on: current + applied === next, always.
    for (const current of [0, 0.25, 0.5, 1, 7.5, 30, 62]) {
      for (const requested of [-60, -1.5, -1, -0.25, 0, 0.5, 1, 40]) {
        const { next, applied } = applyAdjustment(current, requested);
        expect(Math.round((current + applied) * 100) / 100).toBe(next);
        expect(next).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('movementForCount', () => {
  it('records what the shelf actually holds, as a difference', () => {
    // App believed 30, the shelf has 28. Two went somewhere unrecorded.
    expect(movementForCount(30, 28)).toEqual({ delta: -2, reason: 'audit' });
  });

  it('handles finding more than expected', () => {
    expect(movementForCount(10, 14)).toEqual({ delta: 4, reason: 'audit' });
  });

  it('says nothing when the count agrees', () => {
    // Most rows, most counts. Agreement is not an event.
    expect(movementForCount(30, 30)).toBeNull();
    expect(movementForCount(0, 0)).toBeNull();
  });

  it('handles an empty box found on the shelf', () => {
    expect(movementForCount(3, 0)).toEqual({ delta: -3, reason: 'audit' });
  });

  it('copes with fractional counts', () => {
    expect(movementForCount(3, 2.5)).toEqual({ delta: -0.5, reason: 'audit' });
    // Would be -0.09999999999999998 unrounded.
    expect(movementForCount(0.3, 0.2)).toEqual({ delta: -0.1, reason: 'audit' });
  });
});

describe('summariseMovements', () => {
  it('keeps bought, used and binned apart', () => {
    /*
     * The point of four figures instead of one: this cupboard bought 90,
     * took 20 and binned 30. A single net number would say "+40" and hide
     * the thirty that went in the bin.
     */
    const summary = summariseMovements([
      move(60, 'received'),
      move(30, 'received'),
      move(-20, 'dose'),
      move(-30, 'binned'),
    ]);

    expect(summary).toEqual({ received: 90, used: 20, binned: 30, adjusted: 0, net: 40 });
  });

  it('counts an opening balance as stock that came in', () => {
    expect(summariseMovements([move(14, 'opening')]).received).toBe(14);
  });

  it('nets an undone dose back out of what was used', () => {
    const summary = summariseMovements([move(-1, 'dose'), move(-1, 'dose'), move(1, 'dose')]);
    expect(summary.used).toBe(1);
    expect(summary.net).toBe(-1);
  });

  it('nets a box taken back out of the bin', () => {
    const summary = summariseMovements([move(-25, 'binned'), move(25, 'binned')]);
    expect(summary.binned).toBe(0);
    expect(summary.net).toBe(0);
  });

  it('keeps corrections signed, because they go both ways', () => {
    const summary = summariseMovements([move(-3, 'adjust'), move(1, 'audit')]);
    expect(summary.adjusted).toBe(-2);
    expect(summary.used).toBe(0);
  });

  it('is all zeroes for no movements', () => {
    expect(summariseMovements([])).toEqual({
      received: 0,
      used: 0,
      binned: 0,
      adjusted: 0,
      net: 0,
    });
  });

  it('rounds each figure, not just the total', () => {
    const summary = summariseMovements([move(0.1, 'received'), move(0.2, 'received')]);
    expect(summary.received).toBe(0.3);
  });
});

describe('MOVEMENT_REASONS', () => {
  it('has no duplicates', () => {
    expect(new Set(MOVEMENT_REASONS).size).toBe(MOVEMENT_REASONS.length);
  });
});
