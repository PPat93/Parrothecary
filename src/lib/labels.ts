import type { ALTERNATIVE_RELATIONS, BATCH_STATUSES, SHOPPING_STATUSES } from '@/db/schema';
import type { MOVEMENT_REASONS } from '@/domain/ledger';

/**
 * Human wording for the status enums.
 *
 * `to_buy` and `not_received` are database values, and they had started leaking
 * onto screens verbatim. Kept in one place so the trip page and the product
 * page cannot describe the same state differently.
 *
 * Lowercase because these are read inline, mid-sentence — "2 × 50 tabletek ·
 * to buy". The shopping board keeps its own section headings, which are
 * capitalised and carry an explanatory line; that is editorial copy for a
 * heading rather than a name for a state, so it deliberately lives there.
 *
 * Type-only import of the schema: this is plain data with no query in it, and
 * nothing here should drag the database layer into a client bundle.
 */
export const SHOPPING_STATUS_LABELS: Record<(typeof SHOPPING_STATUSES)[number], string> = {
  to_buy: 'to buy',
  ordered: 'ordered',
  arrived: 'arrived',
  in_stock: 'in the cupboard',
  not_received: 'didn’t arrive',
};

export const BATCH_STATUS_LABELS: Record<(typeof BATCH_STATUSES)[number], string> = {
  in_stock: 'in stock',
  consumed: 'used up',
  expired: 'binned, expired',
  discarded: 'discarded',
};

/**
 * How one product stands in for another.
 *
 * Worded to read after the product's name — "Ibuprom Max — same active
 * substance" — because that is the sentence being answered: we are out of this
 * one, what else would do.
 */
export const ALTERNATIVE_RELATION_LABELS: Record<
  (typeof ALTERNATIVE_RELATIONS)[number],
  string
> = {
  same_substance: 'same active substance',
  local_equivalent: 'local equivalent',
  substitute: 'works instead',
};

export function alternativeRelationLabel(relation: string): string {
  return (
    ALTERNATIVE_RELATION_LABELS[relation as keyof typeof ALTERNATIVE_RELATION_LABELS] ?? relation
  );
}

/**
 * The row types carry `status` as a plain string, so both of these fall back to
 * whatever they were given rather than rendering "undefined" if a new status is
 * added to the schema and not to the map.
 */
export function shoppingStatusLabel(status: string): string {
  return SHOPPING_STATUS_LABELS[status as keyof typeof SHOPPING_STATUS_LABELS] ?? status;
}

/**
 * "100 of 200 tablets arrived", or null when the whole order turned up.
 *
 * A line that came in short still reads as settled everywhere — it is in the
 * cupboard, just not all of it — so the shortfall is said beside it rather than
 * changing what the line means. Shared by the shopping list and the trip page
 * so both phrase it identically.
 */
export function shortDeliveryNote(
  quantityPacks: number,
  packSize: number,
  receivedUnits: number | null,
  unitName: string,
): string | null {
  if (receivedUnits === null) return null;

  const expected = quantityPacks * packSize;
  if (expected <= 0 || receivedUnits >= expected) return null;

  return `${receivedUnits} of ${expected} ${unitName}${expected === 1 ? '' : 's'} arrived`;
}

/**
 * A movement reason, said the way you would say it out loud.
 *
 * The stored words are the vocabulary the statistics are built on — "taken" and
 * "adjust" mean two different things there — but a history nobody can read is
 * just the database showing through, so each one gets a sentence fragment
 * rather than its column value.
 */
export const MOVEMENT_REASON_LABELS: Record<(typeof MOVEMENT_REASONS)[number], string> = {
  opening: 'already in the cupboard when this started',
  received: 'arrived',
  dose: 'taken as a scheduled dose',
  taken: 'taken from the stock list',
  adjust: 'quantity corrected',
  binned: 'left the cupboard',
  audit: 'counted on the shelf',
};

export function movementReasonLabel(reason: string): string {
  return (
    MOVEMENT_REASON_LABELS[reason as keyof typeof MOVEMENT_REASON_LABELS] ?? reason
  );
}

export function batchStatusLabel(status: string): string {
  return BATCH_STATUS_LABELS[status as keyof typeof BATCH_STATUS_LABELS] ?? status;
}
