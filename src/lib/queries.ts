import 'server-only';

import { asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { batches, products, shoppingItems, trips, variants } from '@/db/schema';

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
  namePl: string;
  nameEn: string | null;
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
  namePl: products.namePl,
  nameEn: products.nameEn,
  strength: products.strength,
  form: products.form,
  unitName: products.unitName,
  hasExpiry: products.hasExpiry,
};

export async function getStock(): Promise<StockRow[]> {
  return db
    .select(stockSelection)
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(eq(batches.status, 'in_stock'))
    // Nulls last so non-expiring stock does not lead the list.
    .orderBy(asc(products.namePl), sql`${batches.expiryDate} is null`, asc(batches.expiryDate));
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
  namePl: string;
  nameEn: string | null;
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
        namePl: row.namePl,
        nameEn: row.nameEn,
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
  namePl: string;
  nameEn: string | null;
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

export async function getProducts(): Promise<ProductRow[]> {
  const rows = await db
    .select({
      id: products.id,
      namePl: products.namePl,
      nameEn: products.nameEn,
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
    .where(isNull(products.archivedAt))
    .groupBy(products.id)
    .orderBy(asc(products.namePl));

  return rows;
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
      namePl: products.namePl,
      strength: products.strength,
      unitName: products.unitName,
    })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .where(isNull(variants.archivedAt))
    .orderBy(asc(products.namePl), asc(variants.packSize));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    packSize: r.packSize,
    packLabel: r.packLabel,
    unitName: r.unitName,
    productLabel: [r.namePl, r.strength, r.packLabel ?? `${r.packSize} ${r.unitName}`]
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
  namePl: string;
  nameEn: string | null;
  strength: string | null;
  unitName: string;
}

export async function getShoppingList(): Promise<ShoppingRow[]> {
  return db
    .select({
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
      namePl: products.namePl,
      nameEn: products.nameEn,
      strength: products.strength,
      unitName: products.unitName,
    })
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .leftJoin(trips, eq(shoppingItems.tripId, trips.id))
    .orderBy(asc(products.namePl));
}
