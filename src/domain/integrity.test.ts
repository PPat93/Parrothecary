import { describe, expect, it } from 'vitest';
import { checkBox, expectedLedger } from './integrity';

describe('expectedLedger', () => {
  it('is what a box in the cupboard holds', () => {
    expect(expectedLedger({ status: 'in_stock', quantity: 22 })).toBe(22);
  });

  it('is zero once a box has left, whatever it still holds', () => {
    // The quantity survives so the waste figures can cost it; the ledger must
    // not go on claiming those units are on a shelf.
    expect(expectedLedger({ status: 'expired', quantity: 62 })).toBe(0);
    expect(expectedLedger({ status: 'discarded', quantity: 3 })).toBe(0);
    expect(expectedLedger({ status: 'consumed', quantity: 0 })).toBe(0);
  });
});

describe('checkBox', () => {
  it('passes a box whose movements account for what it holds', () => {
    expect(checkBox({ status: 'in_stock', quantity: 22, ledger: 22 })).toBeNull();
  });

  it('passes a binned box that closes at zero while still holding stock', () => {
    // The case a page got wrong by applying the in-stock rule to every box.
    expect(checkBox({ status: 'expired', quantity: 62, ledger: 0 })).toBeNull();
  });

  it('catches a quantity that moved without a movement', () => {
    expect(checkBox({ status: 'in_stock', quantity: 99, ledger: 4 })).toEqual({
      kind: 'ledger',
      expected: 99,
      ledger: 4,
    });
  });

  it('catches a box out of the cupboard still claiming units', () => {
    expect(checkBox({ status: 'discarded', quantity: 10, ledger: 5 })).toEqual({
      kind: 'ledger',
      expected: 0,
      ledger: 5,
    });
  });

  it('catches a box holding more than ever came in', () => {
    // Both numbers agree with each other and are still wrong: a put-back was
    // allowed past the ceiling, so quantity and ledger rose together.
    expect(checkBox({ status: 'in_stock', quantity: 1.5, ledger: 1.5, capacity: 1 })).toEqual({
      kind: 'capacity',
      quantity: 1.5,
      capacity: 1,
    });
  });

  it('does not ask that of a box that has left the cupboard', () => {
    expect(checkBox({ status: 'expired', quantity: 90, ledger: 0, capacity: 60 })).toBeNull();
  });

  it('allows a box filled exactly to what came in', () => {
    expect(checkBox({ status: 'in_stock', quantity: 60, ledger: 60, capacity: 60 })).toBeNull();
  });

  it('does not trip over floating point', () => {
    expect(checkBox({ status: 'in_stock', quantity: 0.3, ledger: 0.1 + 0.2 })).toBeNull();
  });

  it('reports the ledger problem first when a box has both', () => {
    // The ledger disagreement is the more fundamental of the two.
    expect(checkBox({ status: 'in_stock', quantity: 80, ledger: 4, capacity: 60 })).toEqual({
      kind: 'ledger',
      expected: 80,
      ledger: 4,
    });
  });
});
