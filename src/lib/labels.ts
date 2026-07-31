import type { BATCH_STATUSES, SHOPPING_STATUSES } from '@/db/schema';

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
 * The row types carry `status` as a plain string, so both of these fall back to
 * whatever they were given rather than rendering "undefined" if a new status is
 * added to the schema and not to the map.
 */
export function shoppingStatusLabel(status: string): string {
  return SHOPPING_STATUS_LABELS[status as keyof typeof SHOPPING_STATUS_LABELS] ?? status;
}

export function batchStatusLabel(status: string): string {
  return BATCH_STATUS_LABELS[status as keyof typeof BATCH_STATUS_LABELS] ?? status;
}
