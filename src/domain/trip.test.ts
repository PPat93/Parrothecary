import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDER_LEAD_DAYS,
  daysUntilOrderBy,
  defaultOrderByDate,
  tripUrgency,
} from './trip';

const TODAY = '2026-07-26';

describe('defaultOrderByDate', () => {
  it('falls halfway between the previous collection and this one', () => {
    // Oct 15 to Mar 5 is 141 days; the midpoint is the audit date too.
    expect(defaultOrderByDate('2026-03-05', '2025-10-15')).toBe('2025-12-24');
  });

  it('uses a fixed lead time when there is no previous trip', () => {
    expect(defaultOrderByDate('2026-10-15', null)).toBe('2026-09-03');
    expect(daysUntilOrderBy(defaultOrderByDate('2026-10-15', null), '2026-10-15')).toBe(
      -DEFAULT_ORDER_LEAD_DAYS,
    );
  });

  it('falls back to the lead time when the dates are out of order', () => {
    // A previous collection after this one cannot be halved into anything
    // meaningful, and must not silently produce a date beyond collection.
    const result = defaultOrderByDate('2026-03-05', '2026-06-01');
    expect(result).toBe('2026-01-22');
    expect(result < '2026-03-05').toBe(true);
  });

  it('never lands after the collection date', () => {
    for (const previous of [null, '2020-01-01', '2026-03-04', '2030-01-01']) {
      expect(defaultOrderByDate('2026-03-05', previous) <= '2026-03-05').toBe(true);
    }
  });
});

describe('daysUntilOrderBy', () => {
  it('counts forward to the deadline', () => {
    expect(daysUntilOrderBy('2026-08-05', TODAY)).toBe(10);
  });

  it('goes negative once the deadline has passed, so lateness is sayable', () => {
    expect(daysUntilOrderBy('2026-07-23', TODAY)).toBe(-3);
  });

  it('is zero on the deadline itself', () => {
    expect(daysUntilOrderBy(TODAY, TODAY)).toBe(0);
  });
});

describe('tripUrgency', () => {
  it('reports a passed deadline separately from an urgent one', () => {
    expect(tripUrgency('2026-07-25', TODAY)).toBe('passed');
  });

  it('treats the deadline day itself as critical, not passed', () => {
    expect(tripUrgency(TODAY, TODAY)).toBe('critical');
  });

  it('is critical inside two weeks — the shipping window', () => {
    expect(tripUrgency('2026-08-09', TODAY)).toBe('critical'); // exactly 14
  });

  it('warns for the six weeks before that', () => {
    expect(tripUrgency('2026-08-10', TODAY)).toBe('warning'); // 15
    expect(tripUrgency('2026-09-09', TODAY)).toBe('warning'); // exactly 45
  });

  it('is quiet further out', () => {
    expect(tripUrgency('2026-09-10', TODAY)).toBe('ok'); // 46
    expect(tripUrgency('2027-03-01', TODAY)).toBe('ok');
  });

  it('is quiet when no deadline has been set rather than pretending one passed', () => {
    expect(tripUrgency(null, TODAY)).toBe('ok');
  });

  it('is tighter than the expiry thresholds it deliberately does not reuse', () => {
    // 60 days out is "critical" for expiry but nowhere near urgent for ordering.
    expect(tripUrgency('2026-09-24', TODAY)).toBe('ok');
  });
});
