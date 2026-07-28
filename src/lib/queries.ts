import 'server-only';

import { and, asc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  batches,
  productSubstances,
  products,
  shoppingItems,
  substances,
  trips,
  variantBarcodes,
  variants,
} from '@/db/schema';

/**
 * SQLite compares TEXT byte-by-byte by default, so every lowercase name sorts
 * after every uppercase one — "elastoBAND" and "katarek" landed below
 * "Vigalex". NOCASE folds ASCII only, so Polish diacritics still sort after
 * plain letters; good enough for a cabinet of this size.
 */
const byName = sql`${products.name} collate nocase`;

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
  totalUnits: number;
  boxes: StockRow[];
}

export function groupByProduct(rows: StockRow[]): ProductStock[] {
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
        boxes: [],
      };
      map.set(row.productId, entry);
    }
    entry.boxes.push(row);
    entry.totalUnits = Math.round((entry.totalUnits + row.quantityRemaining) * 100) / 100;
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
  variantCount: number;
  inStockUnits: number;
}

export async function getProducts(includeArchived = false): Promise<ProductRow[]> {
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
      variantCount: sql<number>`count(distinct ${variants.id})`,
      inStockUnits: sql<number>`coalesce(sum(case when ${batches.status} = 'in_stock' then ${batches.quantityRemaining} else 0 end), 0)`,
    })
    .from(products)
    .leftJoin(variants, eq(variants.productId, products.id))
    .leftJoin(batches, eq(batches.variantId, variants.id))
    .where(includeArchived ? isNotNull(products.archivedAt) : isNull(products.archivedAt))
    .groupBy(products.id)
    .orderBy(byName);

  return rows;
}

export interface ProductDetail extends ProductRow {
  archivedAt: Date | null;
  /** True when any batch exists, including used-up ones. Blocks permanent delete. */
  hasBatches: boolean;
  substances: {
    id: number;
    name: string;
    namePl: string | null;
    amountMg: number | null;
    amountText: string | null;
  }[];
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

  const inStockUnits = batchRows
    .filter((b) => b.status === 'in_stock')
    .reduce((sum, b) => sum + b.quantityRemaining, 0);

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
    notes: product.notes,
    archivedAt: product.archivedAt,
    hasBatches: batchRows.length > 0,
    variantCount: variantRows.length,
    inStockUnits: Math.round(inStockUnits * 100) / 100,
    substances: substanceRows,
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

/** Distinct manufacturers already in use, for the product form's suggestions. */
export async function getManufacturers(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ manufacturer: products.manufacturer })
    .from(products)
    .where(isNull(products.archivedAt))
    .orderBy(sql`${products.manufacturer} collate nocase`);

  return rows.map((r) => r.manufacturer).filter((m): m is string => m !== null && m !== '');
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
    .where(isNull(variants.archivedAt))
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
