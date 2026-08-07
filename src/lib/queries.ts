import 'server-only';

import { and, asc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  batches,
  doseEvents,
  doseSchedules,
  householdMembers,
  productAlternatives,
  productSubstances,
  productSymptoms,
  products,
  shoppingItems,
  stockMovements,
  TRIP_STATUSES,
  substances,
  symptoms,
  trips,
  variantBarcodes,
  variants,
} from '@/db/schema';
import type { IsoDate } from '@/domain/date';
import { todayIso } from '@/domain/date';
import { isDosable, type ExpiryInput } from '@/domain/expiry';
import { totalAvailable, type FefoBatch } from '@/domain/fefo';
import { money, toEurOrNull, unusedValue } from '@/domain/money';
import { summariseMovements, type Movement, type MovementSummary } from '@/domain/ledger';

/**
 * SQLite compares TEXT byte-by-byte by default, so every lowercase name sorts
 * after every uppercase one — "elastoBAND" and "katarek" landed below
 * "Vigalex". NOCASE folds ASCII only, so Polish diacritics still sort after
 * plain letters; good enough for a cabinet of this size.
 */
const byName = sql`${products.name} collate nocase`;

/**
 * A stock row in the shape the expiry rules want. Small enough to inline, but
 * written once so no screen builds it slightly differently.
 */
export function toExpiryInput(row: {
  expiryDate: string | null;
  expiryPrecision: 'day' | 'month' | null;
  hasExpiry: boolean;
  expiryGraceDays: number;
}): ExpiryInput {
  return {
    expiryDate: row.expiryDate,
    precision: row.expiryPrecision,
    hasExpiry: row.hasExpiry,
    graceDays: row.expiryGraceDays,
  };
}

/** One physical box, with everything needed to render it. */
export interface StockRow {
  batchId: number;
  quantityRemaining: number;
  expiryDate: string | null;
  expiryPrecision: 'day' | 'month' | null;
  openedAt: string | null;
  location: string | null;
  status: string;
  variantId: number;
  packSize: number;
  packLabel: string | null;
  productId: number;
  name: string;
  nameAlt: string | null;
  strength: string | null;
  form: string;
  unitName: string;
  hasExpiry: boolean;
  expiryGraceDays: number;
}

const stockSelection = {
  batchId: batches.id,
  quantityRemaining: batches.quantityRemaining,
  expiryDate: batches.expiryDate,
  expiryPrecision: batches.expiryPrecision,
  openedAt: batches.openedAt,
  location: batches.location,
  status: batches.status,
  variantId: variants.id,
  packSize: variants.packSize,
  packLabel: variants.packLabel,
  productId: products.id,
  name: products.name,
  nameAlt: products.nameAlt,
  strength: products.strength,
  form: products.form,
  unitName: products.unitName,
  hasExpiry: products.hasExpiry,
  expiryGraceDays: products.expiryGraceDays,
};

/**
 * `search` matches either name, the manufacturer, or an active substance — at
 * a cupboard you might remember "the magnesium one" rather than "Magne B6".
 * SQLite's LIKE folds ASCII case already; Polish diacritics are not folded.
 */
export async function getStock(search?: string): Promise<StockRow[]> {
  const query = search?.trim();
  const pattern = query ? `%${query}%` : null;

  // Same predicate as the products list, rather than a second copy of it: the
  // two searches used to be written out separately and had already drifted —
  // this one could not find a barcode while the other could not either, and
  // fixing one would have left the other behind.
  const filter = pattern
    ? and(eq(batches.status, 'in_stock'), matchesSearch(pattern))
    : eq(batches.status, 'in_stock');

  return db
    .select(stockSelection)
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(filter)
    // Nulls last so non-expiring stock does not lead the list.
    .orderBy(byName, sql`${batches.expiryDate} is null`, asc(batches.expiryDate));
}

/** Everything in stock that actually has an expiry date, soonest first. */
export async function getExpiringStock(): Promise<StockRow[]> {
  const rows = await getStock();
  return rows
    .filter((r) => r.hasExpiry && r.expiryDate !== null)
    .sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : a.expiryDate! > b.expiryDate! ? 1 : 0));
}

/** Group boxes under their product, the way the stock list reads on screen. */
export interface ProductStock {
  productId: number;
  name: string;
  nameAlt: string | null;
  strength: string | null;
  form: string;
  unitName: string;
  hasExpiry: boolean;
  /**
   * Units we would actually be willing to take — the number that answers "do I
   * need to buy this on the next trip". Excludes anything past what its product
   * tolerates, because counting stock the dose board refuses to touch would
   * quietly under-order.
   */
  totalUnits: number;
  /** Physically here but past its window. Shown separately, never added in. */
  pastDateUnits: number;
  boxes: StockRow[];
}

export function groupByProduct(rows: StockRow[], today: IsoDate): ProductStock[] {
  const map = new Map<number, ProductStock>();

  for (const row of rows) {
    let entry = map.get(row.productId);
    if (!entry) {
      entry = {
        productId: row.productId,
        name: row.name,
        nameAlt: row.nameAlt,
        strength: row.strength,
        form: row.form,
        unitName: row.unitName,
        hasExpiry: row.hasExpiry,
        totalUnits: 0,
        pastDateUnits: 0,
        boxes: [],
      };
      map.set(row.productId, entry);
    }
    entry.boxes.push(row);

    const key = isDosable(toExpiryInput(row), today) ? 'totalUnits' : 'pastDateUnits';
    entry[key] = Math.round((entry[key] + row.quantityRemaining) * 100) / 100;
  }

  return [...map.values()];
}

/* ------------------------------------------------------------------ */

export interface ProductRow {
  id: number;
  name: string;
  nameAlt: string | null;
  strength: string | null;
  form: string;
  unitName: string;
  manufacturer: string | null;
  isPrescription: boolean;
  hasExpiry: boolean;
  notes: string | null;
  photoPath: string | null;
  variantCount: number;
  /** Units we would actually take. Excludes anything past its grace window. */
  inStockUnits: number;
  /** In stock but past its window — counted apart, never folded into the above. */
  pastDateUnits: number;
}

/**
 * The one definition of what searching means, shared by the stock list and the
 * products list so neither can understand something the other does not.
 *
 * Matches either name, the manufacturer, an active substance, a symptom tag, or
 * a barcode. The barcode case is for the times the scanner will not read a worn
 * label and the digits get typed in by hand — the app could already scan a code
 * but could not find one, which is a gap you only discover holding the box.
 */
function matchesSearch(pattern: string) {
  return or(
    like(products.name, pattern),
    like(products.nameAlt, pattern),
    like(products.manufacturer, pattern),
    sql`exists (
      select 1 from product_substances ps
      join substances s on s.id = ps.substance_id
      where ps.product_id = ${products.id}
        and (s.name like ${pattern} or s.name_pl like ${pattern})
    )`,
    // "what do we have for a sore throat" — the question you actually ask at
    // 2am, when you cannot remember what the box is called.
    sql`exists (
      select 1 from product_symptoms psy
      join symptoms sy on sy.id = psy.symptom_id
      where psy.product_id = ${products.id}
        and (sy.name_en like ${pattern} or sy.name_pl like ${pattern})
    )`,
    sql`exists (
      select 1 from variant_barcodes vb
      join variants vv on vv.id = vb.variant_id
      where vv.product_id = ${products.id} and vb.code like ${pattern}
    )`,
  );
}

export async function getProducts(includeArchived = false, search?: string): Promise<ProductRow[]> {
  const query = search?.trim();
  const pattern = query ? `%${query}%` : null;
  const archiveFilter = includeArchived
    ? isNotNull(products.archivedAt)
    : isNull(products.archivedAt);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      nameAlt: products.nameAlt,
      strength: products.strength,
      form: products.form,
      unitName: products.unitName,
      manufacturer: products.manufacturer,
      isPrescription: products.isPrescription,
      hasExpiry: products.hasExpiry,
      notes: products.notes,
      photoPath: products.photoPath,
      variantCount: sql<number>`count(distinct ${variants.id})`,
    })
    .from(products)
    .leftJoin(variants, eq(variants.productId, products.id))
    .leftJoin(batches, eq(batches.variantId, variants.id))
    .where(pattern ? and(archiveFilter, matchesSearch(pattern)) : archiveFilter)
    .groupBy(products.id)
    .orderBy(byName);

  /*
   * Summed in TypeScript rather than SQL on purpose. A `sum(case when status =
   * 'in_stock' ...)` cannot ask whether a box is still within its product's
   * grace window without restating that rule in SQL — and a second copy of the
   * rule is how this list came to disagree with the stock page in the first
   * place. Fifteen products; the extra query costs nothing.
   */
  const totals = await unitsByProduct(rows.map((r) => r.id));

  return rows.map((row) => ({
    ...row,
    inStockUnits: totals.get(row.id)?.usable ?? 0,
    pastDateUnits: totals.get(row.id)?.pastDate ?? 0,
  }));
}

/** Usable and past-date units per product, both decided by `isDosable`. */
async function unitsByProduct(
  productIds: number[],
): Promise<Map<number, { usable: number; pastDate: number }>> {
  const map = new Map<number, { usable: number; pastDate: number }>();
  if (productIds.length === 0) return map;

  const rows = await db
    .select({
      productId: variants.productId,
      quantityRemaining: batches.quantityRemaining,
      expiryDate: batches.expiryDate,
      expiryPrecision: batches.expiryPrecision,
      hasExpiry: products.hasExpiry,
      expiryGraceDays: products.expiryGraceDays,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(and(eq(batches.status, 'in_stock'), inArray(variants.productId, productIds)));

  const today = todayIso();
  for (const row of rows) {
    const entry = map.get(row.productId) ?? { usable: 0, pastDate: 0 };
    const key = isDosable(toExpiryInput(row), today) ? 'usable' : 'pastDate';
    entry[key] = Math.round((entry[key] + row.quantityRemaining) * 100) / 100;
    map.set(row.productId, entry);
  }
  return map;
}

export interface ProductDetail extends ProductRow {
  archivedAt: Date | null;
  /** Days past the printed date this product may still be dosed from. Zero for most. */
  expiryGraceDays: number;
  /** True when any batch exists, including used-up ones. Blocks permanent delete. */
  hasBatches: boolean;
  /**
   * True when a dose schedule (active or archived) references this product.
   * doseSchedules.productId is a restrict FK, so deleting the product would
   * otherwise crash — blocks permanent delete the same as hasBatches.
   */
  hasDoseSchedules: boolean;
  /**
   * Live schedules only, with whose they are. Empty for almost every product.
   * Archiving is refused while this is non-empty, because archiving would
   * otherwise stop someone's dose as a side effect of tidying up.
   */
  activeDoses: { memberName: string; doseUnits: number; timesPerDay: number; intervalDays: number }[];
  substances: {
    id: number;
    name: string;
    namePl: string | null;
    amountMg: number | null;
    amountText: string | null;
  }[];
  symptoms: { id: number; nameEn: string; namePl: string | null }[];
  packs: {
    id: number;
    packSize: number;
    packLabel: string | null;
    barcodes: { code: string; type: string }[];
    boxes: {
      id: number;
      quantityRemaining: number;
      expiryDate: string | null;
      expiryPrecision: 'day' | 'month' | null;
      status: string;
      lotNumber: string | null;
      location: string | null;
      openedAt: string | null;
      purchasePriceMinor: number | null;
      purchaseCurrency: 'PLN' | 'EUR' | null;
      purchaseDate: string | null;
    }[];
  }[];
}

export async function getProduct(id: number): Promise<ProductDetail | null> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const product = rows[0];
  if (!product) return null;

  const substanceRows = await db
    .select({
      id: substances.id,
      name: substances.name,
      namePl: substances.namePl,
      amountMg: productSubstances.amountMg,
      amountText: productSubstances.amountText,
    })
    .from(productSubstances)
    .innerJoin(substances, eq(productSubstances.substanceId, substances.id))
    .where(eq(productSubstances.productId, id))
    .orderBy(asc(substances.name));

  const symptomRows = await db
    .select({ id: symptoms.id, nameEn: symptoms.nameEn, namePl: symptoms.namePl })
    .from(productSymptoms)
    .innerJoin(symptoms, eq(productSymptoms.symptomId, symptoms.id))
    .where(eq(productSymptoms.productId, id))
    .orderBy(sql`${symptoms.nameEn} collate nocase`);

  const variantRows = await db
    .select()
    .from(variants)
    .where(eq(variants.productId, id))
    .orderBy(asc(variants.packSize));

  const variantIds = variantRows.map((v) => v.id);

  const barcodeRows = variantIds.length
    ? await db
        .select()
        .from(variantBarcodes)
        .where(inArray(variantBarcodes.variantId, variantIds))
    : [];

  const batchRows = variantIds.length
    ? await db
        .select()
        .from(batches)
        .where(inArray(batches.variantId, variantIds))
        .orderBy(sql`${batches.expiryDate} is null`, asc(batches.expiryDate))
    : [];

  // Split the same way the stock list splits it, so the two pages never
  // disagree about how much of this we effectively have.
  const today = todayIso();
  const inStock = batchRows.filter((b) => b.status === 'in_stock');
  const usable = (b: (typeof inStock)[number]) =>
    isDosable(
      {
        expiryDate: b.expiryDate,
        precision: b.expiryPrecision,
        hasExpiry: product.hasExpiry,
        graceDays: product.expiryGraceDays,
      },
      today,
    );

  const inStockUnits = inStock.filter(usable).reduce((sum, b) => sum + b.quantityRemaining, 0);
  const pastDateUnits = inStock
    .filter((b) => !usable(b))
    .reduce((sum, b) => sum + b.quantityRemaining, 0);

  const scheduleRows = await db
    .select({ id: doseSchedules.id })
    .from(doseSchedules)
    .where(eq(doseSchedules.productId, id))
    .limit(1);

  /*
   * Distinct from scheduleRows above: that one counts every schedule ever,
   * archived included, because the restrict FK blocks a permanent delete
   * regardless. This one is only the live ones, and it names who takes them —
   * archiving is refused while someone is still being dosed from this, and a
   * refusal has to say whose dose it would have stopped.
   */
  const activeDoseRows = await db
    .select({
      memberName: householdMembers.name,
      doseUnits: doseSchedules.doseUnits,
      timesPerDay: doseSchedules.timesPerDay,
      intervalDays: doseSchedules.intervalDays,
    })
    .from(doseSchedules)
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .where(
      and(
        eq(doseSchedules.productId, id),
        isNull(doseSchedules.archivedAt),
        isNull(householdMembers.archivedAt),
      ),
    )
    .orderBy(sql`${householdMembers.name} collate nocase`);

  return {
    id: product.id,
    name: product.name,
    nameAlt: product.nameAlt,
    strength: product.strength,
    form: product.form,
    unitName: product.unitName,
    manufacturer: product.manufacturer,
    isPrescription: product.isPrescription,
    hasExpiry: product.hasExpiry,
    expiryGraceDays: product.expiryGraceDays,
    notes: product.notes,
    photoPath: product.photoPath,
    archivedAt: product.archivedAt,
    hasBatches: batchRows.length > 0,
    hasDoseSchedules: scheduleRows.length > 0,
    activeDoses: activeDoseRows,
    variantCount: variantRows.length,
    inStockUnits: Math.round(inStockUnits * 100) / 100,
    pastDateUnits: Math.round(pastDateUnits * 100) / 100,
    substances: substanceRows,
    symptoms: symptomRows,
    packs: variantRows.map((variant) => ({
      id: variant.id,
      packSize: variant.packSize,
      packLabel: variant.packLabel,
      barcodes: barcodeRows
        .filter((b) => b.variantId === variant.id)
        .map((b) => ({ code: b.code, type: b.type })),
      boxes: batchRows
        .filter((b) => b.variantId === variant.id)
        .map((b) => ({
          id: b.id,
          quantityRemaining: b.quantityRemaining,
          expiryDate: b.expiryDate,
          expiryPrecision: b.expiryPrecision,
          status: b.status,
          lotNumber: b.lotNumber,
          location: b.location,
          openedAt: b.openedAt,
          purchasePriceMinor: b.purchasePriceMinor,
          purchaseCurrency: b.purchaseCurrency,
          purchaseDate: b.purchaseDate,
        })),
    })),
  };
}

export interface BatchDetail extends StockRow {
  lotNumber: string | null;
  purchaseDate: string | null;
  purchasePriceMinor: number | null;
  purchaseCurrency: 'PLN' | 'EUR' | null;
  fxRateToEur: number | null;
  packLabelOrSize: string;
  /** A dose was confirmed straight from this box — deleting it would violate the FK. */
  hasDoseEvents: boolean;
}

/** One box, with everything its edit form needs. */
export async function getBatch(id: number): Promise<BatchDetail | null> {
  const rows = await db
    .select({
      ...stockSelection,
      lotNumber: batches.lotNumber,
      purchaseDate: batches.purchaseDate,
      purchasePriceMinor: batches.purchasePriceMinor,
      purchaseCurrency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(eq(batches.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const eventRows = await db
    .select({ id: doseEvents.id })
    .from(doseEvents)
    .where(eq(doseEvents.batchId, id))
    .limit(1);

  return {
    ...row,
    packLabelOrSize: row.packLabel ?? `${row.packSize} ${row.unitName}`,
    hasDoseEvents: eventRows.length > 0,
  };
}

/**
 * Which pack does this barcode belong to?
 *
 * A retail stripe is only an identifier, so it is worthless until it is in this
 * table. Unknown codes are therefore an opportunity rather than an error: the
 * scanner offers to attach it, and the cabinet teaches itself.
 */
export async function findVariantByBarcode(code: string): Promise<VariantRow | null> {
  const rows = await db
    .select({ variantId: variantBarcodes.variantId })
    .from(variantBarcodes)
    .where(eq(variantBarcodes.code, code))
    .limit(1);

  const variantId = rows[0]?.variantId;
  if (variantId === undefined) return null;

  const options = await getVariantOptions();
  return options.find((option) => option.id === variantId) ?? null;
}

/** Distinct manufacturers already in use, for the product form's suggestions. */
export async function getManufacturers(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ manufacturer: products.manufacturer })
    .from(products)
    .where(isNull(products.archivedAt))
    .orderBy(sql`${products.manufacturer} collate nocase`);

  return rows.map((r) => r.manufacturer).filter((m): m is string => m !== null && m !== '');
}

/**
 * Symptom tags for every product at once, keyed by product id.
 *
 * One query rather than one per row — the stock and product lists both need
 * this for every item they render, and doing it per product would be a classic
 * N+1 on the busiest pages in the app.
 */
export async function getProductSymptoms(): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ productId: productSymptoms.productId, nameEn: symptoms.nameEn })
    .from(productSymptoms)
    .innerJoin(symptoms, eq(productSymptoms.symptomId, symptoms.id))
    .orderBy(sql`${symptoms.nameEn} collate nocase`);

  const byProduct = new Map<number, string[]>();
  for (const row of rows) {
    const existing = byProduct.get(row.productId);
    if (existing) existing.push(row.nameEn);
    else byProduct.set(row.productId, [row.nameEn]);
  }
  return byProduct;
}

/** Every symptom tag in use, so the picker suggests rather than demands typing. */
export async function getSymptomNames(): Promise<string[]> {
  const rows = await db
    .select({ nameEn: symptoms.nameEn })
    .from(symptoms)
    .orderBy(sql`${symptoms.nameEn} collate nocase`);
  return rows.map((r) => r.nameEn);
}

/** Substance names already in use, for the product form's suggestions. */
export async function getSubstanceNames(): Promise<string[]> {
  const rows = await db
    .select({ name: substances.name })
    .from(substances)
    .orderBy(sql`${substances.name} collate nocase`);
  return rows.map((r) => r.name);
}

export interface VariantRow {
  id: number;
  productId: number;
  packSize: number;
  packLabel: string | null;
  productLabel: string;
  unitName: string;
}

/** Every variant, labelled for a dropdown. */
export async function getVariantOptions(): Promise<VariantRow[]> {
  const rows = await db
    .select({
      id: variants.id,
      productId: variants.productId,
      packSize: variants.packSize,
      packLabel: variants.packLabel,
      name: products.name,
      strength: products.strength,
      unitName: products.unitName,
    })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    /*
     * Archived products must not be offered for new boxes or shopping lines —
     * that is the whole point of archiving. Their existing boxes still show in
     * Stock, because you physically still own them; archiving takes a product
     * out of circulation, it does not pretend the cupboard is empty.
     */
    .where(and(isNull(variants.archivedAt), isNull(products.archivedAt)))
    .orderBy(byName, asc(variants.packSize));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    packSize: r.packSize,
    packLabel: r.packLabel,
    unitName: r.unitName,
    productLabel: [r.name, r.strength, r.packLabel ?? `${r.packSize} ${r.unitName}`]
      .filter(Boolean)
      .join(' · '),
  }));
}

/* ------------------------------------------------------------------ */

export interface ShoppingRow {
  id: number;
  status: string;
  quantityPacks: number;
  notes: string | null;
  tripId: number | null;
  tripLabel: string | null;
  variantId: number;
  packSize: number;
  packLabel: string | null;
  productId: number;
  name: string;
  nameAlt: string | null;
  strength: string | null;
  unitName: string;
  hasExpiry: boolean;
  receivedBatchId: number | null;
}

const shoppingSelection = {
  id: shoppingItems.id,
  status: shoppingItems.status,
  quantityPacks: shoppingItems.quantityPacks,
  notes: shoppingItems.notes,
  tripId: shoppingItems.tripId,
  tripLabel: trips.label,
  variantId: variants.id,
  packSize: variants.packSize,
  packLabel: variants.packLabel,
  productId: products.id,
  name: products.name,
  nameAlt: products.nameAlt,
  strength: products.strength,
  unitName: products.unitName,
  hasExpiry: products.hasExpiry,
  receivedBatchId: shoppingItems.receivedBatchId,
};

export async function getShoppingList(): Promise<ShoppingRow[]> {
  return db
    .select(shoppingSelection)
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .leftJoin(trips, eq(shoppingItems.tripId, trips.id))
    .orderBy(byName);
}

export async function getShoppingItem(id: number): Promise<ShoppingRow | null> {
  const rows = await db
    .select(shoppingSelection)
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .leftJoin(trips, eq(shoppingItems.tripId, trips.id))
    .where(eq(shoppingItems.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Household members and dosing                                       */
/* ------------------------------------------------------------------ */

export interface HouseholdMemberRow {
  id: number;
  name: string;
  notes: string | null;
  archivedAt: Date | null;
  activeScheduleCount: number;
}

export async function getHouseholdMembers(includeArchived = false): Promise<HouseholdMemberRow[]> {
  return db
    .select({
      id: householdMembers.id,
      name: householdMembers.name,
      notes: householdMembers.notes,
      archivedAt: householdMembers.archivedAt,
      activeScheduleCount: sql<number>`count(distinct case when ${doseSchedules.archivedAt} is null then ${doseSchedules.id} end)`,
    })
    .from(householdMembers)
    .leftJoin(doseSchedules, eq(doseSchedules.memberId, householdMembers.id))
    .where(
      includeArchived ? isNotNull(householdMembers.archivedAt) : isNull(householdMembers.archivedAt),
    )
    .groupBy(householdMembers.id)
    .orderBy(sql`${householdMembers.name} collate nocase`);
}

export interface MemberScheduleRow {
  id: number;
  productId: number;
  productName: string;
  productStrength: string | null;
  unitName: string;
  doseUnits: number;
  timesPerDay: number;
  /** Days between dosing days; 1 for the everyday case. */
  intervalDays: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

export interface HouseholdMemberDetail extends HouseholdMemberRow {
  /**
   * True if ANY schedule this person ever had — including ones already
   * removed — logged a confirmed dose. Removing a schedule with history
   * archives rather than deletes it (see removeSchedule), so this has to look
   * past what is currently shown to guard the member-level delete correctly.
   */
  hasDoseEvents: boolean;
  /** Only schedules still in effect — a removed one simply does not show. */
  schedules: MemberScheduleRow[];
}

export async function getHouseholdMember(id: number): Promise<HouseholdMemberDetail | null> {
  const rows = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.id, id))
    .limit(1);
  const member = rows[0];
  if (!member) return null;

  const scheduleRows = await db
    .select({
      id: doseSchedules.id,
      productId: products.id,
      productName: products.name,
      productStrength: products.strength,
      unitName: products.unitName,
      doseUnits: doseSchedules.doseUnits,
      timesPerDay: doseSchedules.timesPerDay,
      intervalDays: doseSchedules.intervalDays,
      startDate: doseSchedules.startDate,
      endDate: doseSchedules.endDate,
      notes: doseSchedules.notes,
    })
    .from(doseSchedules)
    .innerJoin(products, eq(doseSchedules.productId, products.id))
    .where(and(eq(doseSchedules.memberId, id), isNull(doseSchedules.archivedAt)))
    .orderBy(sql`${products.name} collate nocase`);

  // Deliberately over ALL schedules, including already-removed ones — a
  // schedule that logged doses and was then removed still means this person
  // has real history, which is what blocks a permanent delete.
  const allScheduleIds = (
    await db.select({ id: doseSchedules.id }).from(doseSchedules).where(eq(doseSchedules.memberId, id))
  ).map((s) => s.id);

  const hasDoseEvents = allScheduleIds.length
    ? (
        await db
          .select({ id: doseEvents.id })
          .from(doseEvents)
          .where(inArray(doseEvents.scheduleId, allScheduleIds))
          .limit(1)
      ).length > 0
    : false;

  return {
    id: member.id,
    name: member.name,
    notes: member.notes,
    archivedAt: member.archivedAt,
    activeScheduleCount: scheduleRows.length,
    hasDoseEvents,
    schedules: scheduleRows,
  };
}

export interface DoseScheduleBoardRow {
  scheduleId: number;
  memberId: number;
  memberName: string;
  productId: number;
  productName: string;
  productStrength: string | null;
  unitName: string;
  doseUnits: number;
  timesPerDay: number;
  /** Days between dosing days; 1 for the everyday case. */
  intervalDays: number;
  startDate: string;
  endDate: string | null;
  /**
   * Set when the product behind this live schedule has been archived — a state
   * `archiveProduct` refuses to create, but that older data and direct database
   * edits can still be in. The board shows the schedule anyway and marks it:
   * hiding someone's dose because a row disagrees is the one outcome worse than
   * the disagreement.
   */
  productArchivedAt: Date | null;
}

/** Every active schedule, for every active member — the "today" board. */
export async function getActiveDoseSchedules(): Promise<DoseScheduleBoardRow[]> {
  return db
    .select({
      scheduleId: doseSchedules.id,
      memberId: householdMembers.id,
      memberName: householdMembers.name,
      productId: products.id,
      productName: products.name,
      productStrength: products.strength,
      unitName: products.unitName,
      doseUnits: doseSchedules.doseUnits,
      timesPerDay: doseSchedules.timesPerDay,
      intervalDays: doseSchedules.intervalDays,
      startDate: doseSchedules.startDate,
      endDate: doseSchedules.endDate,
      productArchivedAt: products.archivedAt,
    })
    .from(doseSchedules)
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .innerJoin(products, eq(doseSchedules.productId, products.id))
    // Deliberately not filtered on products.archivedAt — see productArchivedAt.
    .where(and(isNull(doseSchedules.archivedAt), isNull(householdMembers.archivedAt)))
    .orderBy(sql`${householdMembers.name} collate nocase`, sql`${products.name} collate nocase`);
}

/**
 * Batches for a set of products, in the shape domain/fefo already understands.
 * Lets the doses board answer "is there actually anything to confirm this
 * against" using the same rules FEFO itself uses, rather than a second,
 * possibly-diverging definition of "in stock".
 */
/**
 * Consumption rate per product, summed across every active schedule for it —
 * two people can share one medication, and the run-out date is a property of
 * the shared cupboard, not of either person alone.
 */
export async function getProductDailyRates(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      productId: doseSchedules.productId,
      /*
       * The 1.0 is load-bearing. SQLite does integer division, so a weekly
       * schedule would come out as 1/7 = 0 — rate zero, no projection, and the
       * run-out badge silently absent for exactly the schedules that most need
       * planning. Forcing real arithmetic keeps it a fraction.
       */
      rate: sql<number>`sum(${doseSchedules.doseUnits} * ${doseSchedules.timesPerDay} * 1.0 / max(1, ${doseSchedules.intervalDays}))`,
    })
    .from(doseSchedules)
    /*
     * Joined to the person, because the Doses board excludes an archived
     * member's schedules and this must agree with it. Without the join,
     * archiving someone hid their doses from the board while the stock list
     * carried on projecting the cupboard emptying at their rate.
     */
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    /*
     * Only courses actually running today. A finished course consumes nothing,
     * and counting it projected a run-out date from a rate nobody was taking —
     * a week-long paracetamol course that ended on Monday still had the stock
     * list insisting the cupboard would be empty by Thursday.
     *
     * One that has not started yet is excluded for the mirror reason.
     */
    .where(
      and(
        isNull(doseSchedules.archivedAt),
        isNull(householdMembers.archivedAt),
        sql`${doseSchedules.startDate} <= ${todayIso()}`,
        or(isNull(doseSchedules.endDate), sql`${doseSchedules.endDate} >= ${todayIso()}`),
      ),
    )
    .groupBy(doseSchedules.productId);

  return new Map(rows.map((r) => [r.productId, r.rate]));
}

export async function getBatchesForProducts(
  productIds: number[],
): Promise<Map<number, FefoBatch[]>> {
  const map = new Map<number, FefoBatch[]>();
  if (productIds.length === 0) return map;

  const rows = await db
    .select({
      id: batches.id,
      quantityRemaining: batches.quantityRemaining,
      expiryDate: batches.expiryDate,
      expiryPrecision: batches.expiryPrecision,
      openedAt: batches.openedAt,
      status: batches.status,
      hasExpiry: products.hasExpiry,
      expiryGraceDays: products.expiryGraceDays,
      productId: variants.productId,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(inArray(variants.productId, productIds));

  for (const { productId, ...batch } of rows) {
    const list = map.get(productId);
    if (list) list.push(batch);
    else map.set(productId, [batch]);
  }
  return map;
}

/**
 * Confirmed occurrences for a set of schedules, on or after `since`. Keyed
 * "scheduleId:date" so the board can look up a schedule+day pair in one hop.
 */
export async function getTakenOccurrences(
  scheduleIds: number[],
  since: string,
): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  if (scheduleIds.length === 0) return map;

  const rows = await db
    .selectDistinct({
      scheduleId: doseEvents.scheduleId,
      date: doseEvents.date,
      occurrence: doseEvents.occurrence,
    })
    .from(doseEvents)
    .where(and(inArray(doseEvents.scheduleId, scheduleIds), sql`${doseEvents.date} >= ${since}`));

  for (const row of rows) {
    const key = `${row.scheduleId}:${row.date}`;
    const set = map.get(key);
    if (set) set.add(row.occurrence);
    else map.set(key, new Set([row.occurrence]));
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Trips                                                              */
/* ------------------------------------------------------------------ */

export interface TripRow {
  id: number;
  label: string;
  collectionDate: string;
  orderByDate: string | null;
  status: (typeof TRIP_STATUSES)[number];
  notes: string | null;
  /** Shopping lines assigned to this trip, whatever their status. */
  itemCount: number;
  /** Euro actually spent: boxes received against this trip. */
  spentMinorEur: number;
  /** Boxes that figure had to leave out — złoty with no rate recorded. */
  uncostedBoxes: number;
}

export async function getTrips(): Promise<TripRow[]> {
  const rows = await db
    .select({
      id: trips.id,
      label: trips.label,
      collectionDate: trips.collectionDate,
      orderByDate: trips.orderByDate,
      status: trips.status,
      notes: trips.notes,
      itemCount: sql<number>`count(distinct ${shoppingItems.id})`,
      /*
       * Summed in SQL here rather than through the shared helper, because the
       * list needs one figure per trip and doing it per row would be a query
       * each. The conversion rule is the same: whatever rate was recorded on
       * the box, euro passed through untouched.
       */
      spentMinorEur: sql<number>`coalesce(sum(
        case
          when ${batches.purchasePriceMinor} is null then 0
          when ${batches.purchaseCurrency} = 'EUR' then ${batches.purchasePriceMinor}
          when ${batches.fxRateToEur} is null then 0
          else round(${batches.purchasePriceMinor} * ${batches.fxRateToEur})
        end
      ), 0)`,
      /*
       * The zeroes above are boxes this figure cannot account for. Counting
       * them lets the row admit it is a floor rather than a total.
       */
      uncostedBoxes: sql<number>`coalesce(sum(
        case
          when ${batches.purchasePriceMinor} is null then 0
          when ${batches.purchaseCurrency} = 'EUR' then 0
          when ${batches.fxRateToEur} is null then 1
          else 0
        end
      ), 0)`,
    })
    .from(trips)
    .leftJoin(shoppingItems, eq(shoppingItems.tripId, trips.id))
    .leftJoin(batches, eq(shoppingItems.receivedBatchId, batches.id))
    .groupBy(trips.id)
    // Soonest collection first: the next trip is the one you act on.
    .orderBy(asc(trips.collectionDate));

  return rows;
}

/**
 * The collection date of the trip before this one — what the order-by default
 * is halved from. Excludes the trip being edited, so re-saving a trip does not
 * measure it against itself.
 */
export async function getPreviousCollectionDate(
  collectionDate: string,
  excludeTripId?: number,
): Promise<string | null> {
  const rows = await db
    .select({ collectionDate: trips.collectionDate })
    .from(trips)
    .where(
      excludeTripId === undefined
        ? sql`${trips.collectionDate} < ${collectionDate}`
        : and(
            sql`${trips.collectionDate} < ${collectionDate}`,
            sql`${trips.id} <> ${excludeTripId}`,
          ),
    )
    .orderBy(sql`${trips.collectionDate} desc`)
    .limit(1);

  return rows[0]?.collectionDate ?? null;
}

/**
 * Omits the list's money: the detail page asks `getTripMoney` for a fuller
 * picture — spent, still-to-buy, and what neither could account for — and
 * carrying a second, cruder total here would be a spare copy of the same sum.
 */
export interface TripDetail extends Omit<TripRow, 'spentMinorEur' | 'uncostedBoxes'> {
  items: ShoppingRow[];
}

export async function getTrip(id: number): Promise<TripDetail | null> {
  const rows = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
  const trip = rows[0];
  if (!trip) return null;

  const items = await db
    .select(shoppingSelection)
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .leftJoin(trips, eq(shoppingItems.tripId, trips.id))
    .where(eq(shoppingItems.tripId, id))
    .orderBy(byName);

  return {
    id: trip.id,
    label: trip.label,
    collectionDate: trip.collectionDate,
    orderByDate: trip.orderByDate,
    status: trip.status,
    notes: trip.notes,
    itemCount: items.length,
    items,
  };
}

export interface ScheduledProduct {
  productId: number;
  name: string;
  strength: string | null;
  unitName: string;
  /**
   * Every live schedule for this product, kept individually rather than summed
   * into a rate. Planning has to know that one of them ends next week.
   */
  schedules: {
    doseUnits: number;
    timesPerDay: number;
    intervalDays: number;
    startDate: string;
    endDate: string | null;
  }[];
}

/**
 * Every product someone is actually on, with the schedules behind it.
 *
 * Deliberately not filtered by stock: a product with nothing left is the most
 * important row in a "what do we need to order" list, and a query built from
 * the stock table would silently drop it.
 */
export async function getScheduledProducts(): Promise<ScheduledProduct[]> {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      strength: products.strength,
      unitName: products.unitName,
      doseUnits: doseSchedules.doseUnits,
      timesPerDay: doseSchedules.timesPerDay,
      intervalDays: doseSchedules.intervalDays,
      startDate: doseSchedules.startDate,
      endDate: doseSchedules.endDate,
    })
    .from(doseSchedules)
    .innerJoin(products, eq(doseSchedules.productId, products.id))
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .where(and(isNull(doseSchedules.archivedAt), isNull(householdMembers.archivedAt)))
    .orderBy(byName);

  const map = new Map<number, ScheduledProduct>();
  for (const row of rows) {
    let entry = map.get(row.productId);
    if (!entry) {
      entry = {
        productId: row.productId,
        name: row.name,
        strength: row.strength,
        unitName: row.unitName,
        schedules: [],
      };
      map.set(row.productId, entry);
    }
    entry.schedules.push({
      doseUnits: row.doseUnits,
      timesPerDay: row.timesPerDay,
      intervalDays: row.intervalDays,
      startDate: row.startDate,
      endDate: row.endDate,
    });
  }
  return [...map.values()];
}

export interface TripOption {
  id: number;
  label: string;
  collectionDate: string;
}

/**
 * Trips a new purchase could belong to — planned ones only, soonest first.
 *
 * The first entry is the sensible default for anything added today: with two or
 * three restocks a year, almost everything you put on the list is for the next
 * one. Completed trips are excluded because assigning a purchase to a trip that
 * already happened is nearly always a mistake; the trip page can still be
 * edited if it genuinely was one.
 */
export async function getTripOptions(): Promise<TripOption[]> {
  return db
    .select({ id: trips.id, label: trips.label, collectionDate: trips.collectionDate })
    .from(trips)
    .where(eq(trips.status, 'planned'))
    .orderBy(asc(trips.collectionDate));
}

/**
 * Lines not yet attached to any trip, and still in play.
 *
 * Terminal lines are excluded: something already in the cupboard or recorded as
 * never-arrived has no business being reassigned to a future trip.
 */
export async function getUnassignedShoppingItems(): Promise<ShoppingRow[]> {
  return db
    .select(shoppingSelection)
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .leftJoin(trips, eq(shoppingItems.tripId, trips.id))
    .where(
      and(
        isNull(shoppingItems.tripId),
        inArray(shoppingItems.status, ['to_buy', 'ordered', 'arrived']),
      ),
    )
    .orderBy(byName);
}

/* ------------------------------------------------------------------ */
/* Trip audit worksheet                                               */
/* ------------------------------------------------------------------ */

export interface AuditRow {
  productId: number;
  name: string;
  strength: string | null;
  unitName: string;
  /** Every pack this comes in. More than one means the worksheet has to ask. */
  variants: { id: number; packSize: number; packLabel: string | null }[];
  /** Units we would actually take, past-date stock excluded. */
  usableUnits: number;
  /** Boxes in stock, and how many of those are already open. */
  boxCount: number;
  openedBoxCount: number;
  /** Live schedules, for working out what this trip has to cover. */
  schedules: {
    doseUnits: number;
    timesPerDay: number;
    intervalDays: number;
    startDate: string;
    endDate: string | null;
  }[];
  /** Packs already on this trip's list. Null when it is not on it. */
  onListPacks: number | null;
}

/**
 * Everything the twice-yearly audit needs, in one shape.
 *
 * Every active product appears — including the ones nobody is on a schedule
 * for, which is most of them. A worksheet built only from projections would
 * cover four items out of fifteen and stay quiet about the plasters, which is
 * exactly the silence the audit exists to break.
 */
export async function getAuditRows(tripId: number): Promise<AuditRow[]> {
  const today = todayIso();

  const productRows = await db
    .select({
      productId: products.id,
      name: products.name,
      strength: products.strength,
      unitName: products.unitName,
      hasExpiry: products.hasExpiry,
      expiryGraceDays: products.expiryGraceDays,
    })
    .from(products)
    .where(isNull(products.archivedAt))
    .orderBy(byName);

  const productIds = productRows.map((p) => p.productId);
  if (productIds.length === 0) return [];

  const variantRows = await db
    .select({
      id: variants.id,
      productId: variants.productId,
      packSize: variants.packSize,
      packLabel: variants.packLabel,
    })
    .from(variants)
    .where(inArray(variants.productId, productIds))
    .orderBy(asc(variants.packSize));

  const batchRows = await db
    .select({
      productId: variants.productId,
      quantityRemaining: batches.quantityRemaining,
      expiryDate: batches.expiryDate,
      expiryPrecision: batches.expiryPrecision,
      openedAt: batches.openedAt,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .where(and(eq(batches.status, 'in_stock'), inArray(variants.productId, productIds)));

  const scheduleRows = await db
    .select({
      productId: doseSchedules.productId,
      doseUnits: doseSchedules.doseUnits,
      timesPerDay: doseSchedules.timesPerDay,
      intervalDays: doseSchedules.intervalDays,
      startDate: doseSchedules.startDate,
      endDate: doseSchedules.endDate,
    })
    .from(doseSchedules)
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .where(and(isNull(doseSchedules.archivedAt), isNull(householdMembers.archivedAt)));

  // Only lines still in play: something already received for this trip should
  // not read as "still to buy" on the worksheet.
  const listRows = await db
    .select({ productId: variants.productId, quantityPacks: shoppingItems.quantityPacks })
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .where(
      and(
        eq(shoppingItems.tripId, tripId),
        inArray(shoppingItems.status, ['to_buy', 'ordered', 'arrived']),
      ),
    );

  const onList = new Map<number, number>();
  for (const row of listRows) {
    onList.set(row.productId, (onList.get(row.productId) ?? 0) + row.quantityPacks);
  }

  return productRows.map((product) => {
    const boxes = batchRows.filter((b) => b.productId === product.productId);
    const usable = boxes.filter((b) =>
      isDosable(
        {
          expiryDate: b.expiryDate,
          precision: b.expiryPrecision,
          hasExpiry: product.hasExpiry,
          graceDays: product.expiryGraceDays,
        },
        today,
      ),
    );

    return {
      productId: product.productId,
      name: product.name,
      strength: product.strength,
      unitName: product.unitName,
      variants: variantRows
        .filter((v) => v.productId === product.productId)
        .map((v) => ({ id: v.id, packSize: v.packSize, packLabel: v.packLabel })),
      usableUnits: Math.round(usable.reduce((sum, b) => sum + b.quantityRemaining, 0) * 100) / 100,
      boxCount: usable.length,
      openedBoxCount: usable.filter((b) => b.openedAt !== null).length,
      schedules: scheduleRows
        .filter((s) => s.productId === product.productId)
        .map(({ productId: _productId, ...schedule }) => schedule),
      onListPacks: onList.get(product.productId) ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Export — getting the data back out                                  */
/* ------------------------------------------------------------------ */

/**
 * Every box ever entered, including the ones that have left stock.
 *
 * Terminal boxes are not filtered out: this is the escape hatch, and a copy of
 * the cupboard that quietly omits everything thrown away or used up would be a
 * worse record than the database it came from.
 */
export async function getBoxExport() {
  return db
    .select({
      batchId: batches.id,
      product: products.name,
      productAlt: products.nameAlt,
      strength: products.strength,
      form: products.form,
      unit: products.unitName,
      pack: variants.packLabel,
      packSize: variants.packSize,
      quantityRemaining: batches.quantityRemaining,
      status: batches.status,
      expiryDate: batches.expiryDate,
      expiryPrecision: batches.expiryPrecision,
      lotNumber: batches.lotNumber,
      location: batches.location,
      openedAt: batches.openedAt,
      purchaseDate: batches.purchaseDate,
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
      notes: batches.notes,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .orderBy(byName, asc(batches.id));
}

/**
 * The whole ledger, oldest first.
 *
 * The one export that cannot be reconstructed from anything else: current
 * quantities can be recounted off the shelf, but how they got that way exists
 * nowhere but here.
 */
export async function getMovementExport() {
  return db
    .select({
      occurredAt: stockMovements.occurredAt,
      product: products.name,
      strength: products.strength,
      unit: products.unitName,
      batchId: stockMovements.batchId,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      note: stockMovements.note,
    })
    .from(stockMovements)
    .innerJoin(batches, eq(stockMovements.batchId, batches.id))
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .orderBy(asc(stockMovements.occurredAt), asc(stockMovements.id));
}

/**
 * The catalogue, with the things that took longest to type: which ingredients
 * are in what, what each is reached for, and the barcodes that were scanned in.
 * Rebuilding those by hand is an evening; the quantities are a walk to the
 * cupboard.
 */
export async function getProductExport() {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      nameAlt: products.nameAlt,
      form: products.form,
      strength: products.strength,
      unit: products.unitName,
      manufacturer: products.manufacturer,
      isPrescription: products.isPrescription,
      hasExpiry: products.hasExpiry,
      expiryGraceDays: products.expiryGraceDays,
      notes: products.notes,
      archivedAt: products.archivedAt,
    })
    .from(products)
    .orderBy(byName);

  const [links, symptomRows, barcodeRows, packRows] = await Promise.all([
    getSubstanceLinks(),
    db
      .select({ productId: productSymptoms.productId, name: symptoms.nameEn })
      .from(productSymptoms)
      .innerJoin(symptoms, eq(productSymptoms.symptomId, symptoms.id)),
    db
      .select({ productId: variants.productId, code: variantBarcodes.code })
      .from(variantBarcodes)
      .innerJoin(variants, eq(variantBarcodes.variantId, variants.id)),
    db
      .select({ productId: variants.productId, packSize: variants.packSize, label: variants.packLabel })
      .from(variants),
  ]);

  /** Several rows per product collapsed into one cell, which is what a sheet wants. */
  const gather = <T>(items: T[], key: (item: T) => number, value: (item: T) => string) => {
    const map = new Map<number, string[]>();
    for (const item of items) {
      map.set(key(item), [...(map.get(key(item)) ?? []), value(item)]);
    }
    return map;
  };

  const substancesByProduct = gather(
    links,
    (l) => l.productId,
    (l) => {
      // The separator belongs to the join, not to one of the two branches —
      // putting it inside the numeric one gave "Magnesium citrate100 mg".
      const amount = l.amountText ?? (l.amountMg !== null ? `${l.amountMg} mg` : null);
      return amount === null ? l.substanceName : `${l.substanceName} ${amount}`;
    },
  );
  const symptomsByProduct = gather(symptomRows, (s) => s.productId, (s) => s.name);
  const barcodesByProduct = gather(barcodeRows, (b) => b.productId, (b) => b.code);
  const packsByProduct = gather(
    packRows,
    (p) => p.productId,
    (p) => p.label ?? String(p.packSize),
  );

  return rows.map((row) => ({
    ...row,
    substances: (substancesByProduct.get(row.productId) ?? []).join('; '),
    symptoms: (symptomsByProduct.get(row.productId) ?? []).join('; '),
    barcodes: (barcodesByProduct.get(row.productId) ?? []).join('; '),
    packs: (packsByProduct.get(row.productId) ?? []).join('; '),
  }));
}

/* ------------------------------------------------------------------ */
/* Alternatives — what else would do                                   */
/* ------------------------------------------------------------------ */

export interface AlternativeRow {
  productId: number;
  name: string;
  strength: string | null;
  relation: string;
  note: string | null;
  archived: boolean;
  /** Usable units on the shelf right now — the first thing you want to know. */
  inStockUnits: number;
  unitName: string;
}

/**
 * What could stand in for this product.
 *
 * Read in both directions from a single stored row. Storing one row per pair
 * and looking both ways is the only version that cannot go half-linked: record
 * it on the paracetamol and it is missing from the ibuprofen, which is exactly
 * the moment you would be looking for it.
 */
export async function getAlternatives(productId: number): Promise<AlternativeRow[]> {
  const rows = await db
    .select({
      forward: productAlternatives.productId,
      backward: productAlternatives.alternativeProductId,
      relation: productAlternatives.relation,
      note: productAlternatives.note,
    })
    .from(productAlternatives)
    .where(
      or(
        eq(productAlternatives.productId, productId),
        eq(productAlternatives.alternativeProductId, productId),
      ),
    );

  if (rows.length === 0) return [];

  // Whichever end of the pair is not the product being looked at.
  const otherIds = rows.map((row) => (row.forward === productId ? row.backward : row.forward));

  const [others, stock] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        strength: products.strength,
        unitName: products.unitName,
        archivedAt: products.archivedAt,
      })
      .from(products)
      .where(inArray(products.id, otherIds))
      .orderBy(byName),
    /*
     * Through the same helpers the rest of the app counts stock with, rather
     * than a correlated subquery of its own. "In stock" has one definition —
     * it excludes anything past what its product tolerates — and a second
     * hand-written version here would have quietly offered you a box that no
     * screen would let you take a dose from.
     */
    getBatchesForProducts(otherIds),
  ]);

  const today = todayIso();
  const detail = new Map(others.map((row) => [row.id, row]));

  return rows
    .map((row) => {
      const otherId = row.forward === productId ? row.backward : row.forward;
      const other = detail.get(otherId);
      if (!other) return null;

      return {
        productId: otherId,
        name: other.name,
        strength: other.strength,
        relation: row.relation,
        note: row.note,
        archived: other.archivedAt !== null,
        inStockUnits: totalAvailable(stock.get(otherId) ?? [], today),
        unitName: other.unitName,
      };
    })
    .filter((row) => row !== null)
    // Something on the shelf beats something that is only theoretically similar.
    .sort((a, b) => b.inStockUnits - a.inStockUnits || a.name.localeCompare(b.name));
}

/** Products this one could be linked to: everything else still kept. */
export async function getAlternativeCandidates(
  productId: number,
): Promise<{ id: number; label: string }[]> {
  const rows = await db
    .select({ id: products.id, name: products.name, strength: products.strength })
    .from(products)
    .where(and(isNull(products.archivedAt), sql`${products.id} <> ${productId}`))
    .orderBy(byName);

  return rows.map((row) => ({
    id: row.id,
    label: [row.name, row.strength].filter(Boolean).join(' '),
  }));
}

/* ------------------------------------------------------------------ */
/* Shared ingredients                                                  */
/* ------------------------------------------------------------------ */

export interface SubstanceLink {
  productId: number;
  substanceId: number;
  substanceName: string;
  productName: string;
  productStrength: string | null;
  /** Per base unit, where it can be expressed as a number. */
  amountMg: number | null;
  amountText: string | null;
  /** Set when the product has been archived. */
  archivedAt: Date | null;
}

/**
 * Which products contain which active ingredients.
 *
 * Archived products are included, and filtering them is left to the caller,
 * because the two screens want opposite things. Listing an archived box as
 * "also in the cabinet" is noise about something no longer kept — but a
 * schedule can still be running against an archived product, and refusing to
 * check that one for a clash would put the hole in exactly the place a safety
 * warning cannot afford one.
 */
export async function getSubstanceLinks(): Promise<SubstanceLink[]> {
  return db
    .select({
      productId: productSubstances.productId,
      substanceId: productSubstances.substanceId,
      substanceName: substances.name,
      productName: products.name,
      productStrength: products.strength,
      amountMg: productSubstances.amountMg,
      amountText: productSubstances.amountText,
      archivedAt: products.archivedAt,
    })
    .from(productSubstances)
    .innerJoin(substances, eq(productSubstances.substanceId, substances.id))
    .innerJoin(products, eq(productSubstances.productId, products.id))
    .orderBy(byName);
}

/* ------------------------------------------------------------------ */
/* Statistics — money                                                  */
/* ------------------------------------------------------------------ */

export interface YearSpend {
  year: string;
  minorEur: number;
  boxes: number;
  /** Boxes that year whose price could not be converted, so are not in the total. */
  uncostedBoxes: number;
}

/**
 * What was spent each year.
 *
 * By purchase date rather than by trip: boxes bought locally belong to a year
 * but to no trip, and leaving them out would make the yearly figure quietly
 * smaller than the money that actually left the account.
 */
export async function getSpendByYear(): Promise<YearSpend[]> {
  const rows = await db
    .select({
      purchaseDate: batches.purchaseDate,
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
    })
    .from(batches)
    .where(and(isNotNull(batches.purchasePriceMinor), isNotNull(batches.purchaseDate)));

  const byYear = new Map<string, YearSpend>();

  for (const row of rows) {
    const year = (row.purchaseDate ?? '').slice(0, 4);
    if (year.length !== 4) continue;

    const entry = byYear.get(year) ?? { year, minorEur: 0, boxes: 0, uncostedBoxes: 0 };
    const eur = inEur(row.priceMinor!, row.currency, row.fxRateToEur);

    if (eur === null) entry.uncostedBoxes++;
    else {
      entry.minorEur += eur;
      entry.boxes++;
    }

    byYear.set(year, entry);
  }

  return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
}

export interface PriceTrend {
  productId: number;
  name: string;
  strength: string | null;
  unitName: string;
  /** Minor euro units per base unit, so pack sizes cannot flatter each other. */
  firstPerUnit: number;
  latestPerUnit: number;
  firstDate: string;
  latestDate: string;
  purchases: number;
}

/**
 * What a tablet costs now against what it cost the first time, per product.
 *
 * Per unit rather than per pack, because the pack can change size between one
 * restock and the next and the price per box would then be comparing two
 * different things. Only products bought more than once appear — a single
 * purchase has nothing to be a trend against.
 */
export async function getPriceTrends(): Promise<PriceTrend[]> {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      strength: products.strength,
      unitName: products.unitName,
      packSize: variants.packSize,
      purchaseDate: batches.purchaseDate,
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(and(isNotNull(batches.purchasePriceMinor), isNotNull(batches.purchaseDate)))
    // Insertion order breaks ties: every box bought on one trip shares a
    // purchase date, so date alone leaves "first" and "latest" up to whatever
    // order SQLite happens to return.
    .orderBy(sql`${batches.purchaseDate} asc`, asc(batches.id));

  const byProduct = new Map<number, PriceTrend>();

  for (const row of rows) {
    const eur = inEur(row.priceMinor!, row.currency, row.fxRateToEur);
    // Nothing to compare against if it cannot be put in euro, or if the pack
    // size is unusable as a denominator.
    if (eur === null || row.packSize <= 0) continue;

    const perUnit = eur / row.packSize;
    const date = row.purchaseDate!;
    const existing = byProduct.get(row.productId);

    if (!existing) {
      byProduct.set(row.productId, {
        productId: row.productId,
        name: row.name,
        strength: row.strength,
        unitName: row.unitName,
        firstPerUnit: perUnit,
        latestPerUnit: perUnit,
        firstDate: date,
        latestDate: date,
        purchases: 1,
      });
      continue;
    }

    // Rows arrive oldest first, so every later one is the latest so far.
    existing.latestPerUnit = perUnit;
    existing.latestDate = date;
    existing.purchases++;
  }

  return [...byProduct.values()]
    .filter((trend) => trend.purchases > 1)
    // Steepest rise first: that is the one worth doing something about.
    .sort((a, b) => b.latestPerUnit - b.firstPerUnit - (a.latestPerUnit - a.firstPerUnit));
}

export interface WasteSummary {
  /** Bought, never opened, binned. The figure worth pushing down. */
  thrownAwayMinorEur: number;
  neverOpenedBoxes: number;
  /** Left in packs that were opened and used. Not really waste. */
  leftInOpenedMinorEur: number;
  openedBoxes: number;
  /** Binned boxes whose price could not be converted, so are in neither figure. */
  uncostedBoxes: number;
}

/**
 * The two waste figures, deliberately not added together.
 *
 * A sealed box that expired is money thrown away. A box that was opened is
 * not: half a bottle left at its expiry date did its job on the wounds it was
 * opened for, and that size was the smallest one sold. Adding them would
 * flatter one and slander the other.
 *
 * Shared with the Expiring page rather than written out twice — the split is
 * the kind of rule that drifts the moment there are two copies of it.
 */
export function summariseWaste(rows: WasteRow[]): WasteSummary {
  const summary: WasteSummary = {
    thrownAwayMinorEur: 0,
    neverOpenedBoxes: 0,
    leftInOpenedMinorEur: 0,
    openedBoxes: 0,
    uncostedBoxes: 0,
  };

  for (const row of rows) {
    if (row.priceMinor === null || row.currency === null) continue;

    const unused = unusedValue(
      money(row.priceMinor, row.currency),
      row.packSize,
      row.quantityRemaining,
    );
    const eur = toEurOrNull(unused, row.fxRateToEur);

    if (eur === null) {
      summary.uncostedBoxes++;
      continue;
    }

    if (row.openedAt === null) {
      summary.thrownAwayMinorEur += eur.amountMinor;
      summary.neverOpenedBoxes++;
    } else {
      summary.leftInOpenedMinorEur += eur.amountMinor;
      summary.openedBoxes++;
    }
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/* Statistics — usage, read from the ledger                            */
/* ------------------------------------------------------------------ */

/**
 * Movements are timestamped; trips are calendar dates. Parsed as LOCAL
 * midnight, because that is what the date on a trip means to the person who
 * typed it. Reading it as UTC put anything that happened between midnight and
 * two in the morning into the previous window.
 */
function startOfDay(date: IsoDate): Date {
  return new Date(`${date}T00:00:00`);
}

/*
 * A note on what is deliberately NOT totalled here.
 *
 * Units are only comparable within a product. Sixty tablets, thirty millilitres
 * and one emergency blanket do not add up to ninety-one of anything, so no
 * figure on the usage page sums deltas across products — the per-product tables
 * carry units, and everything wider counts movements and boxes instead. It
 * would have been easy to print "316 units received" and it would have meant
 * nothing at all.
 */

export interface ProductUsage {
  productId: number;
  name: string;
  strength: string | null;
  unitName: string;
  summary: MovementSummary;
}

/**
 * What each product got through in a window.
 *
 * Grouped by product rather than by box, because "we get through a lot of
 * paracetamol" is a fact about the medicine, not about which box it came out
 * of — and FEFO means it comes out of a different box every few weeks.
 */
export async function getUsageByProduct(from: Date, to: Date): Promise<ProductUsage[]> {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      strength: products.strength,
      unitName: products.unitName,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
    })
    .from(stockMovements)
    .innerJoin(batches, eq(stockMovements.batchId, batches.id))
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(and(gte(stockMovements.occurredAt, from), lte(stockMovements.occurredAt, to)));

  const byProduct = new Map<number, { row: (typeof rows)[number]; movements: Movement[] }>();

  for (const row of rows) {
    const entry = byProduct.get(row.productId) ?? { row, movements: [] };
    entry.movements.push({ delta: row.delta, reason: row.reason });
    byProduct.set(row.productId, entry);
  }

  return [...byProduct.values()]
    .map(({ row, movements }) => ({
      productId: row.productId,
      name: row.name,
      strength: row.strength,
      unitName: row.unitName,
      summary: summariseMovements(movements),
    }))
    // Most used first: the question is always "what are we getting through".
    .sort((a, b) => b.summary.used - a.summary.used);
}

export interface RestockWindow {
  fromLabel: string;
  toLabel: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Counts, not units — see the note above on why these cannot be added up. */
  boxesReceived: number;
  /** Times something was taken: scheduled doses and hand-taken alike. */
  timesTaken: number;
  boxesBinned: number;
  corrections: number;
  countDifferences: number;
  productsTouched: number;
}

/**
 * What happened between one restock and the next.
 *
 * The question the whole ledger was built for: a trip is the natural unit of
 * this household's supply cycle, so "did we buy too much last time" is really
 * "what did we get through between these two collections". Windows are built
 * from consecutive completed trips — a planned one has not happened yet and
 * would open a window with no end.
 */
export async function getRestockWindows(): Promise<RestockWindow[]> {
  const completed = await db
    .select({ label: trips.label, collectionDate: trips.collectionDate })
    .from(trips)
    .where(eq(trips.status, 'completed'))
    .orderBy(asc(trips.collectionDate));

  if (completed.length < 2) return [];

  // One pass over the movements rather than a query per window: at this scale
  // the whole ledger is smaller than the round trips would be.
  const movements = await db
    .select({
      productId: variants.productId,
      batchId: stockMovements.batchId,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      occurredAt: stockMovements.occurredAt,
    })
    .from(stockMovements)
    .innerJoin(batches, eq(stockMovements.batchId, batches.id))
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .where(gte(stockMovements.occurredAt, startOfDay(completed[0]!.collectionDate)));

  const windows: RestockWindow[] = [];

  for (let i = 1; i < completed.length; i++) {
    const previous = completed[i - 1]!;
    const current = completed[i]!;
    const from = startOfDay(previous.collectionDate);
    const to = startOfDay(current.collectionDate);

    const inWindow = movements.filter((m) => m.occurredAt >= from && m.occurredAt < to);
    if (inWindow.length === 0) continue;

    windows.push({
      fromLabel: previous.label,
      toLabel: current.label,
      fromDate: previous.collectionDate,
      toDate: current.collectionDate,
      days: Math.round((to.getTime() - from.getTime()) / 86_400_000),
      boxesReceived: new Set(
        inWindow.filter((m) => m.reason === 'received' || m.reason === 'opening').map((m) => m.batchId),
      ).size,
      timesTaken: inWindow.filter(
        (m) => (m.reason === 'dose' || m.reason === 'taken') && m.delta < 0,
      ).length,
      boxesBinned: new Set(
        inWindow.filter((m) => m.reason === 'binned' && m.delta < 0).map((m) => m.batchId),
      ).size,
      corrections: inWindow.filter((m) => m.reason === 'adjust').length,
      countDifferences: inWindow.filter((m) => m.reason === 'audit').length,
      productsTouched: new Set(inWindow.map((m) => m.productId)).size,
    });
  }

  // Most recent first: last time is what you compare the next one against.
  return windows.reverse();
}

/* ------------------------------------------------------------------ */
/* Counting the shelf                                                  */
/* ------------------------------------------------------------------ */

/**
 * When the cupboard was last counted, or null if it never has been.
 *
 * The count is only meaningful next to a date: "nothing has drifted" means one
 * thing after a fortnight and quite another after a year.
 */
export async function getLastStockCount(): Promise<Date | null> {
  const rows = await db
    .select({ occurredAt: stockMovements.occurredAt })
    .from(stockMovements)
    .where(eq(stockMovements.reason, 'audit'))
    .orderBy(sql`${stockMovements.occurredAt} desc`)
    .limit(1);

  return rows[0]?.occurredAt ?? null;
}

/**
 * How much drift the last few counts turned up.
 *
 * The number the whole exercise exists to produce: correcting a miscount was
 * always possible, but until every correction was on the record there was no
 * way to ask how much stock leaves the house without anyone noticing.
 */
export async function getCountDrift(): Promise<{ movements: number; netUnits: number }> {
  const rows = await db
    .select({ delta: stockMovements.delta })
    .from(stockMovements)
    .where(eq(stockMovements.reason, 'audit'));

  return {
    movements: rows.length,
    netUnits: Math.round(rows.reduce((sum, row) => sum + row.delta, 0) * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/* What things cost                                                    */
/* ------------------------------------------------------------------ */

export interface PurchaseRow {
  batchId: number;
  purchaseDate: string | null;
  priceMinor: number;
  currency: 'PLN' | 'EUR';
  /** Rate recorded at purchase. Null for a euro buy, which needs none. */
  fxRateToEur: number | null;
  /** What was bought: one pack of this size. The denominator for unit cost. */
  packSize: number;
  packLabel: string | null;
  /** Set once the box has left stock, so waste can be costed. */
  status: string;
  tripLabel: string | null;
}

/**
 * Every priced box of a product, newest first.
 *
 * At two or three restocks a year most products will only ever have one row
 * here for a long while, so this is written to be useful with a single
 * purchase — what it cost, and what that works out at per tablet — rather than
 * as a trend that needs years of history before it says anything.
 */
export async function getProductPurchases(productId: number): Promise<PurchaseRow[]> {
  return db
    .select({
      batchId: batches.id,
      purchaseDate: batches.purchaseDate,
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
      packSize: variants.packSize,
      packLabel: variants.packLabel,
      status: batches.status,
      tripLabel: trips.label,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .leftJoin(shoppingItems, eq(shoppingItems.receivedBatchId, batches.id))
    .leftJoin(trips, eq(shoppingItems.tripId, trips.id))
    .where(
      and(
        eq(variants.productId, productId),
        isNotNull(batches.purchasePriceMinor),
        isNotNull(batches.purchaseCurrency),
      ),
    )
    .orderBy(sql`${batches.purchaseDate} is null`, sql`${batches.purchaseDate} desc`)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        priceMinor: row.priceMinor!,
        currency: row.currency!,
      })),
    );
}

export interface WasteRow {
  batchId: number;
  productName: string;
  strength: string | null;
  status: string;
  quantityRemaining: number;
  unitName: string;
  packSize: number;
  priceMinor: number | null;
  currency: 'PLN' | 'EUR' | null;
  fxRateToEur: number | null;
  expiryDate: string | null;
  /**
   * Whether the box was ever opened. The difference between money thrown away
   * and money spent on something that did its job — see the Expiring page.
   */
  openedAt: string | null;
}

/**
 * Boxes thrown away, with what they cost.
 *
 * Costed on the portion actually wasted, not the whole box: half a bottle
 * binned is half the money, and charging the full purchase price to waste would
 * make every figure here an overstatement.
 */
export async function getWaste(): Promise<WasteRow[]> {
  return db
    .select({
      batchId: batches.id,
      productName: products.name,
      strength: products.strength,
      status: batches.status,
      quantityRemaining: batches.quantityRemaining,
      unitName: products.unitName,
      packSize: variants.packSize,
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
      expiryDate: batches.expiryDate,
      openedAt: batches.openedAt,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(inArray(batches.status, ['expired', 'discarded']))
    .orderBy(byName);
}

export interface TripMoney {
  /** Actually spent: boxes received against this trip's lines. */
  spentMinorEur: number;
  spentBoxes: number;
  /** Received boxes priced in złoty with no rate against them, so not in the total. */
  uncostedBoxes: number;
  /** Expected for what is still outstanding, from the last price paid. */
  estimatedMinorEur: number;
  estimatedLines: number;
  /** Outstanding lines with no usable price to go on. Counted, never guessed at. */
  uncostedLines: number;
}

/**
 * What a trip has cost, and what the rest of its list is likely to cost.
 *
 * Everything is in euro at the rate recorded on each purchase, the same rule
 * the rest of the app uses — including for estimates, which are built from what
 * was last actually paid rather than from a notion of today's rate. It makes an
 * estimate a few percent stale at worst, and keeps one rule instead of two.
 *
 * Lines with no price history are reported separately rather than treated as
 * free. A total that silently omits them would read as complete and be wrong.
 */
export async function getTripMoney(tripId: number): Promise<TripMoney> {
  const receivedRows = await db
    .select({
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
    })
    .from(shoppingItems)
    .innerJoin(batches, eq(shoppingItems.receivedBatchId, batches.id))
    .where(and(eq(shoppingItems.tripId, tripId), isNotNull(batches.purchasePriceMinor)));

  let spentMinorEur = 0;
  let spentBoxes = 0;
  let uncostedBoxes = 0;

  for (const row of receivedRows) {
    const eur = inEur(row.priceMinor!, row.currency, row.fxRateToEur);
    if (eur === null) {
      uncostedBoxes++;
      continue;
    }
    spentMinorEur += eur;
    spentBoxes++;
  }

  // Still to buy: everything on the trip that has not produced a box yet.
  const outstanding = await db
    .select({ variantId: shoppingItems.variantId, quantityPacks: shoppingItems.quantityPacks })
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.tripId, tripId),
        inArray(shoppingItems.status, ['to_buy', 'ordered', 'arrived']),
      ),
    );

  let estimatedMinorEur = 0;
  let estimatedLines = 0;
  let uncostedLines = 0;

  for (const line of outstanding) {
    const lastPaid = await db
      .select({
        priceMinor: batches.purchasePriceMinor,
        currency: batches.purchaseCurrency,
        fxRateToEur: batches.fxRateToEur,
      })
      .from(batches)
      /*
       * The most recent price that can actually be converted, not simply the
       * most recent. Taking the newest and finding it had no rate against it
       * reported the line as having no price at all, while a perfectly usable
       * one sat in the row behind it.
       */
      .where(
        and(
          eq(batches.variantId, line.variantId),
          isNotNull(batches.purchasePriceMinor),
          or(eq(batches.purchaseCurrency, 'EUR'), isNotNull(batches.fxRateToEur)),
        ),
      )
      .orderBy(sql`${batches.purchaseDate} is null`, sql`${batches.purchaseDate} desc`)
      .limit(1);

    const price = lastPaid[0];
    const eur = price ? inEur(price.priceMinor!, price.currency, price.fxRateToEur) : null;
    if (eur === null) {
      uncostedLines++;
      continue;
    }

    estimatedMinorEur += eur * line.quantityPacks;
    estimatedLines++;
  }

  return {
    spentMinorEur,
    spentBoxes,
    uncostedBoxes,
    estimatedMinorEur,
    estimatedLines,
    uncostedLines,
  };
}

/**
 * Minor units in euro, using the rate stored alongside the amount. Null when
 * there is no rate to use — counted separately by every caller rather than
 * folded in as zero, which is what this used to do and which made a złoty
 * purchase look free.
 */
function inEur(
  minor: number,
  currency: 'PLN' | 'EUR' | null,
  fxRateToEur: number | null,
): number | null {
  if (currency === null) return null;
  const converted = toEurOrNull(money(minor, currency), fxRateToEur);
  return converted === null ? null : converted.amountMinor;
}

export interface StockValue {
  /** What the usable stock on the shelf originally cost, prorated by what is left. */
  minorEur: number;
  /**
   * Boxes in stock the total cannot account for: no price recorded, or a złoty
   * price with no exchange rate against it.
   */
  uncostedBoxes: number;
}

/**
 * What is in the cupboard, valued at what it cost.
 *
 * Prorated: half a bottle is half the money it was bought for. Not a market
 * valuation — nothing here is for sale — but it answers "how much is sitting
 * in those drawers", which is the number that makes over-buying visible.
 */
export async function getStockValue(): Promise<StockValue> {
  const rows = await db
    .select({
      priceMinor: batches.purchasePriceMinor,
      currency: batches.purchaseCurrency,
      fxRateToEur: batches.fxRateToEur,
      quantityRemaining: batches.quantityRemaining,
      packSize: variants.packSize,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .where(eq(batches.status, 'in_stock'));

  let minorEur = 0;
  let uncostedBoxes = 0;

  for (const row of rows) {
    const eur = row.priceMinor === null ? null : inEur(row.priceMinor, row.currency, row.fxRateToEur);
    if (eur === null) {
      uncostedBoxes++;
      continue;
    }
    const fraction = row.packSize > 0 ? Math.min(1, row.quantityRemaining / row.packSize) : 0;
    minorEur += Math.round(eur * fraction);
  }

  return { minorEur, uncostedBoxes };
}
