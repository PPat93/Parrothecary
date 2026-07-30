import 'server-only';

import { and, asc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  batches,
  doseEvents,
  doseSchedules,
  householdMembers,
  productSubstances,
  productSymptoms,
  products,
  shoppingItems,
  substances,
  symptoms,
  trips,
  variantBarcodes,
  variants,
} from '@/db/schema';
import type { IsoDate } from '@/domain/date';
import { todayIso } from '@/domain/date';
import { isDosable, type ExpiryInput } from '@/domain/expiry';
import type { FefoBatch } from '@/domain/fefo';

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

  const filter = pattern
    ? and(
        eq(batches.status, 'in_stock'),
        or(
          like(products.name, pattern),
          like(products.nameAlt, pattern),
          like(products.manufacturer, pattern),
          sql`exists (
            select 1 from product_substances ps
            join substances s on s.id = ps.substance_id
            where ps.product_id = ${products.id}
              and (s.name like ${pattern} or s.name_pl like ${pattern})
          )`,
          // "what do we have for a sore throat" — the question you actually ask
          // at 2am, when you cannot remember what the box is called.
          sql`exists (
            select 1 from product_symptoms psy
            join symptoms sy on sy.id = psy.symptom_id
            where psy.product_id = ${products.id}
              and (sy.name_en like ${pattern} or sy.name_pl like ${pattern})
          )`,
        ),
      )
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
 * `search` matches the same fields as the stock list — name, alternate name,
 * manufacturer, active substance and symptom tag — so the two searches behave
 * identically and you do not have to remember which page understands what.
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
    sql`exists (
      select 1 from product_symptoms psy
      join symptoms sy on sy.id = psy.symptom_id
      where psy.product_id = ${products.id}
        and (sy.name_en like ${pattern} or sy.name_pl like ${pattern})
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
  startDate: string;
  endDate: string | null;
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
      startDate: doseSchedules.startDate,
      endDate: doseSchedules.endDate,
    })
    .from(doseSchedules)
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .innerJoin(products, eq(doseSchedules.productId, products.id))
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
      rate: sql<number>`sum(${doseSchedules.doseUnits} * ${doseSchedules.timesPerDay})`,
    })
    .from(doseSchedules)
    .where(isNull(doseSchedules.archivedAt))
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
