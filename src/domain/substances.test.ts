import { describe, expect, it } from 'vitest';
import {
  overlapsForProduct,
  scheduleClashes,
  sharedSubstances,
  type ProductSubstance,
} from './substances';

/** Products 1 and 2 both contain substance 10; product 3 contains 20 alone. */
const CABINET: ProductSubstance[] = [
  { productId: 1, substanceId: 10 },
  { productId: 2, substanceId: 10 },
  { productId: 2, substanceId: 30 },
  { productId: 3, substanceId: 20 },
];

describe('sharedSubstances', () => {
  it('finds a substance that appears in two products', () => {
    expect(sharedSubstances(CABINET)).toEqual([{ substanceId: 10, productIds: [1, 2] }]);
  });

  it('ignores a substance that only appears once', () => {
    const shared = sharedSubstances(CABINET);
    expect(shared.some((o) => o.substanceId === 20)).toBe(false);
    expect(shared.some((o) => o.substanceId === 30)).toBe(false);
  });

  it('handles three products sharing one ingredient', () => {
    const links: ProductSubstance[] = [
      { productId: 1, substanceId: 10 },
      { productId: 2, substanceId: 10 },
      { productId: 3, substanceId: 10 },
    ];
    expect(sharedSubstances(links)).toEqual([{ substanceId: 10, productIds: [1, 2, 3] }]);
  });

  it('does not report a product against itself when a row repeats', () => {
    // The primary key prevents this in the database; the logic should not
    // depend on that being true.
    const links: ProductSubstance[] = [
      { productId: 1, substanceId: 10 },
      { productId: 1, substanceId: 10 },
    ];
    expect(sharedSubstances(links)).toEqual([]);
  });

  it('is empty for an empty cabinet', () => {
    expect(sharedSubstances([])).toEqual([]);
  });
});

describe('overlapsForProduct', () => {
  it('lists the other products sharing an ingredient', () => {
    expect(overlapsForProduct(1, CABINET)).toEqual([{ substanceId: 10, productIds: [2] }]);
  });

  it('never includes the product itself', () => {
    for (const overlap of overlapsForProduct(2, CABINET)) {
      expect(overlap.productIds).not.toContain(2);
    }
  });

  it('says nothing for a product that shares nothing', () => {
    expect(overlapsForProduct(3, CABINET)).toEqual([]);
  });
});

describe('scheduleClashes', () => {
  it('flags two scheduled products sharing an ingredient for one person', () => {
    const clashes = scheduleClashes(
      [
        { memberId: 1, productId: 1 },
        { memberId: 1, productId: 2 },
      ],
      CABINET,
    );

    expect(clashes).toEqual([{ memberId: 1, substanceId: 10, productIds: [1, 2] }]);
  });

  it('does not flag two people each taking their own', () => {
    // Two people on paracetamol is not a double dose. This is the difference
    // between a useful warning and one that gets switched off.
    const clashes = scheduleClashes(
      [
        { memberId: 1, productId: 1 },
        { memberId: 2, productId: 2 },
      ],
      CABINET,
    );

    expect(clashes).toEqual([]);
  });

  it('does not flag one product scheduled twice a day', () => {
    const clashes = scheduleClashes(
      [
        { memberId: 1, productId: 1 },
        { memberId: 1, productId: 1 },
      ],
      CABINET,
    );

    expect(clashes).toEqual([]);
  });

  it('ignores overlaps between things that are not scheduled', () => {
    // Products 1 and 2 overlap, but only 1 is on a schedule.
    const clashes = scheduleClashes([{ memberId: 1, productId: 1 }], CABINET);
    expect(clashes).toEqual([]);
  });

  it('reports each affected person separately', () => {
    const clashes = scheduleClashes(
      [
        { memberId: 2, productId: 1 },
        { memberId: 2, productId: 2 },
        { memberId: 1, productId: 1 },
        { memberId: 1, productId: 2 },
      ],
      CABINET,
    );

    expect(clashes).toEqual([
      { memberId: 1, substanceId: 10, productIds: [1, 2] },
      { memberId: 2, substanceId: 10, productIds: [1, 2] },
    ]);
  });

  it('is empty when nothing is scheduled', () => {
    expect(scheduleClashes([], CABINET)).toEqual([]);
  });
});
