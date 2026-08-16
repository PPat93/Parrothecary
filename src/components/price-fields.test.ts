import { describe, expect, it } from 'vitest';
import { fxRateField } from './price-fields';
import type { SuggestedFxRate } from '@/domain/money';

/**
 * Filling the exchange rate in for you is only ever right on an empty field
 * that nobody has decided about yet. Every case below is a way of getting that
 * wrong, and two of them were live in this feature the day it was written.
 */
const sameDay: SuggestedFxRate = { rate: 0.2312, fromDate: '2026-03-05', sameDay: true };
const earlier: SuggestedFxRate = { rate: 0.2295, fromDate: '2024-10-11', sameDay: false };

const fresh = { submitted: false, currency: 'PLN' };

describe('the rate offered in the form', () => {
  it('offers the same-day rate on a blank field', () => {
    expect(fxRateField('', sameDay, fresh)).toEqual({ value: '0,2312', offered: sameDay });
  });

  it('writes it with a comma, like every other number here', () => {
    expect(fxRateField('', earlier, fresh).value).toBe('0,2295');
  });

  it('leaves a rate the box already has alone', () => {
    expect(fxRateField('0.2185', sameDay, fresh)).toEqual({ value: '0.2185', offered: null });
  });

  it('offers nothing on a euro purchase, which has no rate to convert', () => {
    // All five euro boxes in the cabinet were being shown a złoty rate.
    expect(fxRateField('', sameDay, { ...fresh, currency: 'EUR' })).toEqual({
      value: '',
      offered: null,
    });
  });

  it('respects a field the person emptied, even when the form bounces', () => {
    // Clear the rate, mistype the expiry: the rejected form must not hand the
    // rate back as though the clearing never happened.
    expect(fxRateField('', sameDay, { ...fresh, submitted: true })).toEqual({
      value: '',
      offered: null,
    });
  });

  it('still repeats back a rate that was typed and then rejected', () => {
    expect(fxRateField('0,24', sameDay, { ...fresh, submitted: true })).toEqual({
      value: '0,24',
      offered: null,
    });
  });

  it('says nothing when there is no rate on record to go on', () => {
    expect(fxRateField('', null, fresh)).toEqual({ value: '', offered: null });
  });
});
