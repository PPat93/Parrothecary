/**
 * Two things in the cabinet containing the same active ingredient.
 *
 * The case that matters is the one nobody notices: reaching for a headache
 * tablet and a cold remedy an hour apart, both with paracetamol in them, and
 * quietly taking a double dose of something with a real ceiling.
 *
 * The case that does not matter is a saline nasal gel and saline ampoules both
 * containing sodium chloride, which is true, useless, and exactly the kind of
 * thing that teaches people to ignore warnings. So overlap is reported as a
 * plain fact wherever a product is being looked at, and only rises to a warning
 * where two things are actually on someone's dose schedule at once — a
 * situation that is rare by construction and deliberate when it happens.
 */

export interface ProductSubstance {
  productId: number;
  substanceId: number;
}

export interface Overlap {
  substanceId: number;
  productIds: number[];
}

/** Every substance that appears in more than one product, with those products. */
export function sharedSubstances(links: ProductSubstance[]): Overlap[] {
  const bySubstance = new Map<number, Set<number>>();

  for (const link of links) {
    const products = bySubstance.get(link.substanceId) ?? new Set<number>();
    products.add(link.productId);
    bySubstance.set(link.substanceId, products);
  }

  return [...bySubstance.entries()]
    .filter(([, products]) => products.size > 1)
    .map(([substanceId, products]) => ({
      substanceId,
      // Sorted so the output does not depend on the order rows came back in.
      productIds: [...products].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.substanceId - b.substanceId);
}

/**
 * What else in the cabinet shares an ingredient with this product.
 *
 * The product itself is never in its own list — a thing does not overlap with
 * itself, and saying so would be the sort of technically-correct noise that
 * makes a panel worth skipping.
 */
export function overlapsForProduct(
  productId: number,
  links: ProductSubstance[],
): Overlap[] {
  return sharedSubstances(links)
    .filter((overlap) => overlap.productIds.includes(productId))
    .map((overlap) => ({
      substanceId: overlap.substanceId,
      productIds: overlap.productIds.filter((id) => id !== productId),
    }))
    .filter((overlap) => overlap.productIds.length > 0);
}

export interface ScheduledProduct {
  memberId: number;
  productId: number;
}

export interface ScheduleClash {
  memberId: number;
  substanceId: number;
  productIds: number[];
}

/**
 * Two things on one person's schedule that share an ingredient.
 *
 * Per person, not per household: two people each taking their own paracetamol
 * is not a double dose, and flagging it would be wrong as well as annoying.
 *
 * A product scheduled twice for the same person — a morning and an evening
 * dose, say — is one product and not a clash, which is why the products are
 * deduplicated before anything is compared.
 */
export function scheduleClashes(
  scheduled: ScheduledProduct[],
  links: ProductSubstance[],
): ScheduleClash[] {
  const byMember = new Map<number, Set<number>>();

  for (const { memberId, productId } of scheduled) {
    const products = byMember.get(memberId) ?? new Set<number>();
    products.add(productId);
    byMember.set(memberId, products);
  }

  const clashes: ScheduleClash[] = [];

  for (const [memberId, products] of byMember) {
    const relevant = links.filter((link) => products.has(link.productId));

    for (const overlap of sharedSubstances(relevant)) {
      clashes.push({ memberId, substanceId: overlap.substanceId, productIds: overlap.productIds });
    }
  }

  return clashes.sort(
    (a, b) => a.memberId - b.memberId || a.substanceId - b.substanceId,
  );
}
