import { describe, expect, it } from 'vitest';
import { movementReasonLabel } from './labels';

/**
 * A box's history spells out one movement per line, and three of the reasons
 * run both ways: the stepper's + writes `taken` with a positive delta, undoing
 * a dose writes `dose` with one, and putting a binned box back writes `binned`
 * with one. Read flat, the history announced "taken from the stock list + 21.5".
 */
describe('how a movement reads', () => {
  it('reads a take as a take and a put-back as a put-back', () => {
    expect(movementReasonLabel('taken', -0.5)).toBe('taken from the stock list');
    expect(movementReasonLabel('taken', 21.5)).toBe('put back on the stock list');
  });

  it('distinguishes a dose from a dose undone', () => {
    expect(movementReasonLabel('dose', -2)).toBe('taken as a scheduled dose');
    expect(movementReasonLabel('dose', 2)).toBe('a dose undone');
  });

  it('distinguishes binning from putting back', () => {
    expect(movementReasonLabel('binned', -30)).toBe('left the cupboard');
    expect(movementReasonLabel('binned', 30)).toBe('returned to the cupboard');
  });

  it('leaves the one-way reasons alone', () => {
    // These only ever add, so a positive delta is the ordinary case.
    expect(movementReasonLabel('received', 60)).toBe('arrived');
    expect(movementReasonLabel('opening', 22)).toBe('already in the cupboard when this started');
  });

  it('leaves the reasons that read the same both ways', () => {
    // A quantity corrected downwards is still a quantity corrected.
    expect(movementReasonLabel('adjust', -90)).toBe('quantity corrected');
    expect(movementReasonLabel('adjust', 90)).toBe('quantity corrected');
    expect(movementReasonLabel('audit', -0.5)).toBe('counted on the shelf');
    expect(movementReasonLabel('audit', 0.5)).toBe('counted on the shelf');
  });

  it('falls back to the raw word for anything it does not know', () => {
    expect(movementReasonLabel('sublimated', 1)).toBe('sublimated');
  });
});
