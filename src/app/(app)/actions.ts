'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  BATCH_STATUSES,
  CURRENCIES,
  DOSE_FORMS,
  SHOPPING_STATUSES,
  UNIT_NAMES,
  batches,
  products,
  shoppingItems,
  variants,
} from '@/db/schema';
import { normaliseExpiry } from '@/domain/expiry';
import { parseAmount } from '@/domain/money';
import { endSession } from '@/lib/session';

function refreshAll() {
  revalidatePath('/', 'layout');
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

/**
 * FormData.get() returns null for a field the form does not contain, and zod's
 * .optional() accepts undefined but not null — so every optional text field
 * needs to tolerate null explicitly or the whole form rejects.
 */
const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  });

const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  nameAlt: optionalText,
  form: z.enum(DOSE_FORMS),
  unitName: z.enum(UNIT_NAMES),
  strength: optionalText,
  manufacturer: optionalText,
  notes: optionalText,
  isPrescription: z.coerce.boolean(),
  hasExpiry: z.coerce.boolean(),
  // Optional first pack, so adding a product is one screen not two.
  packSize: optionalText,
  packLabel: optionalText,
});

export async function createProduct(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const parsed = productSchema.safeParse({
    name: formData.get('name'),
    nameAlt: formData.get('nameAlt'),
    form: formData.get('form'),
    unitName: formData.get('unitName'),
    strength: formData.get('strength'),
    manufacturer: formData.get('manufacturer'),
    notes: formData.get('notes'),
    isPrescription: formData.get('isPrescription') === 'on',
    hasExpiry: formData.get('hasExpiry') === 'on',
    packSize: formData.get('packSize'),
    packLabel: formData.get('packLabel'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const data = parsed.data;

  const inserted = await db
    .insert(products)
    .values({
      name: data.name,
      nameAlt: data.nameAlt,
      form: data.form,
      unitName: data.unitName,
      strength: data.strength,
      manufacturer: data.manufacturer,
      notes: data.notes,
      isPrescription: data.isPrescription,
      hasExpiry: data.hasExpiry,
    })
    .returning({ id: products.id });

  const productId = inserted[0]?.id;
  if (productId === undefined) return { error: 'Could not save the product.' };

  const packSize = Number(data.packSize ?? '');
  if (data.packSize !== null && Number.isFinite(packSize) && packSize > 0) {
    await db.insert(variants).values({
      productId,
      packSize,
      packLabel: data.packLabel,
    });
  }

  refreshAll();
  redirect('/products');
}

export async function archiveProduct(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  // Soft delete — batch history and past spend depend on this row surviving.
  await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, id));
  refreshAll();
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

export async function createVariant(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const productId = Number(formData.get('productId'));
  const packSize = Number(formData.get('packSize'));
  const packLabel = emptyToNull(String(formData.get('packLabel') ?? '').trim());

  if (!Number.isInteger(productId)) return { error: 'Pick a product.' };
  if (!Number.isFinite(packSize) || packSize <= 0) return { error: 'Pack size must be a positive number.' };

  await db.insert(variants).values({ productId, packSize, packLabel });
  refreshAll();
  return { error: null, ok: true };
}

/* ------------------------------------------------------------------ */
/* Batches — actual boxes                                              */
/* ------------------------------------------------------------------ */

export async function addBatch(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  const quantityRaw = String(formData.get('quantityRemaining') ?? '').trim();
  const expiryRaw = String(formData.get('expiry') ?? '').trim();
  const priceRaw = String(formData.get('price') ?? '').trim();
  const currency = String(formData.get('currency') ?? 'PLN');
  const lotNumber = emptyToNull(String(formData.get('lotNumber') ?? '').trim());
  const location = emptyToNull(String(formData.get('location') ?? '').trim());
  const purchaseDate = emptyToNull(String(formData.get('purchaseDate') ?? '').trim());

  if (!Number.isInteger(variantId)) return { error: 'Pick which pack this is.' };

  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.' };
  }

  let expiryDate: string | null = null;
  let expiryPrecision: 'day' | 'month' | null = null;
  if (expiryRaw) {
    try {
      const normalised = normaliseExpiry(expiryRaw);
      expiryDate = normalised.expiryDate;
      expiryPrecision = normalised.precision;
    } catch {
      return { error: `Could not read "${expiryRaw}" as a date. Try 11/2027 or 15.11.2027.` };
    }
  }

  let purchasePriceMinor: number | null = null;
  let purchaseCurrency: (typeof CURRENCIES)[number] | null = null;
  if (priceRaw) {
    const parsedCurrency = CURRENCIES.find((c) => c === currency) ?? 'PLN';
    try {
      purchasePriceMinor = parseAmount(priceRaw, parsedCurrency).amountMinor;
      purchaseCurrency = parsedCurrency;
    } catch {
      return { error: `Could not read "${priceRaw}" as a price.` };
    }
  }

  await db.insert(batches).values({
    variantId,
    quantityRemaining: quantity,
    expiryDate,
    expiryPrecision,
    lotNumber,
    location,
    purchaseDate,
    purchasePriceMinor,
    purchaseCurrency,
  });

  refreshAll();
  redirect('/');
}

/** One-tap +/- from the stock list. Clamps at zero rather than going negative. */
export async function adjustBatch(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const delta = Number(formData.get('delta'));
  if (!Number.isInteger(id) || !Number.isFinite(delta)) return;

  await db
    .update(batches)
    .set({
      quantityRemaining: sql`max(0, round((${batches.quantityRemaining} + ${delta}) * 100) / 100)`,
      // Adjusting a sealed box means it has just been opened.
      openedAt: sql`coalesce(${batches.openedAt}, date('now'))`,
      updatedAt: new Date(),
    })
    .where(eq(batches.id, id));

  // Emptying a box retires it so it drops out of the stock list.
  await db
    .update(batches)
    .set({ status: 'consumed' })
    .where(sql`${batches.id} = ${id} and ${batches.quantityRemaining} <= 0`);

  refreshAll();
}

export async function setBatchStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!BATCH_STATUSES.some((s) => s === status)) return;

  await db
    .update(batches)
    .set({ status: status as (typeof BATCH_STATUSES)[number], updatedAt: new Date() })
    .where(eq(batches.id, id));
  refreshAll();
}

/* ------------------------------------------------------------------ */
/* Shopping list                                                       */
/* ------------------------------------------------------------------ */

export async function addShoppingItem(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  const quantityPacks = Number(formData.get('quantityPacks') ?? 1);
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());

  if (!Number.isInteger(variantId)) return { error: 'Pick which pack to buy.' };
  if (!Number.isInteger(quantityPacks) || quantityPacks < 1) {
    return { error: 'Number of packs must be a whole number, at least 1.' };
  }

  await db.insert(shoppingItems).values({ variantId, quantityPacks, notes });
  refreshAll();
  return { error: null, ok: true };
}

export async function setShoppingStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!SHOPPING_STATUSES.some((s) => s === status)) return;

  await db
    .update(shoppingItems)
    .set({ status: status as (typeof SHOPPING_STATUSES)[number], updatedAt: new Date() })
    .where(eq(shoppingItems.id, id));
  refreshAll();
}

export async function removeShoppingItem(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
  refreshAll();
}

/* ------------------------------------------------------------------ */

export async function logout(): Promise<void> {
  await endSession();
  redirect('/login');
}

export interface FormResult {
  error: string | null;
  ok?: boolean;
}

function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}
