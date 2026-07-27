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
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
      values: snapshot(formData),
    };
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
  if (productId === undefined) {
    return { error: 'Could not save the product.', values: snapshot(formData) };
  }

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

/** Editing never touches pack sizes — those belong to variants, not the product. */
const productEditSchema = productSchema.omit({ packSize: true, packLabel: true });

export async function updateProduct(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return { error: 'Unknown product.' };

  const parsed = productEditSchema.safeParse({
    name: formData.get('name'),
    nameAlt: formData.get('nameAlt'),
    form: formData.get('form'),
    unitName: formData.get('unitName'),
    strength: formData.get('strength'),
    manufacturer: formData.get('manufacturer'),
    notes: formData.get('notes'),
    isPrescription: formData.get('isPrescription') === 'on',
    hasExpiry: formData.get('hasExpiry') === 'on',
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
      values: snapshot(formData),
    };
  }

  await db
    .update(products)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(products.id, id));

  refreshAll();
  redirect(`/products/${id}`);
}

export async function unarchiveProduct(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db.update(products).set({ archivedAt: null }).where(eq(products.id, id));
  refreshAll();
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

interface BatchFields {
  quantityRemaining: number;
  expiryDate: string | null;
  expiryPrecision: 'day' | 'month' | null;
  lotNumber: string | null;
  location: string | null;
  purchaseDate: string | null;
  purchasePriceMinor: number | null;
  purchaseCurrency: (typeof CURRENCIES)[number] | null;
}

/**
 * Shared by "add box" and by receiving a shopping item — both describe the same
 * physical thing arriving in the house, so they parse identically.
 */
function parseBatchFields(formData: FormData): { fields: BatchFields } | { error: string } {
  const quantity = Number(String(formData.get('quantityRemaining') ?? '').trim());
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive number.' };
  }

  let expiryDate: string | null = null;
  let expiryPrecision: 'day' | 'month' | null = null;
  const expiryRaw = String(formData.get('expiry') ?? '').trim();
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
  const priceRaw = String(formData.get('price') ?? '').trim();
  if (priceRaw) {
    const currency =
      CURRENCIES.find((c) => c === String(formData.get('currency') ?? '')) ?? 'PLN';
    try {
      purchasePriceMinor = parseAmount(priceRaw, currency).amountMinor;
      purchaseCurrency = currency;
    } catch {
      return { error: `Could not read "${priceRaw}" as a price.` };
    }
  }

  return {
    fields: {
      quantityRemaining: quantity,
      expiryDate,
      expiryPrecision,
      lotNumber: emptyToNull(String(formData.get('lotNumber') ?? '').trim()),
      location: emptyToNull(String(formData.get('location') ?? '').trim()),
      purchaseDate: emptyToNull(String(formData.get('purchaseDate') ?? '').trim()),
      purchasePriceMinor,
      purchaseCurrency,
    },
  };
}

export async function addBatch(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  // Hand everything back on failure — one bad field must not cost the rest.
  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  if (!Number.isInteger(variantId)) return fail('Pick which pack this is.');

  const parsed = parseBatchFields(formData);
  if ('error' in parsed) return fail(parsed.error);

  await db.insert(batches).values({ variantId, ...parsed.fields });

  refreshAll();
  redirect('/');
}

/**
 * The last step of the shopping lifecycle: a pack that has been collected
 * becomes a real box in the cupboard. Previously this stage just deleted the
 * line, which threw away the thing you had been tracking all along.
 */
export async function receiveShoppingItem(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const itemId = Number(formData.get('itemId'));
  const variantId = Number(formData.get('variantId'));
  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  if (!Number.isInteger(itemId) || !Number.isInteger(variantId)) {
    return fail('That shopping item no longer exists.');
  }

  const parsed = parseBatchFields(formData);
  if ('error' in parsed) return fail(parsed.error);

  const inserted = await db
    .insert(batches)
    .values({ variantId, ...parsed.fields })
    .returning({ id: batches.id });

  const batchId = inserted[0]?.id;
  if (batchId === undefined) return fail('Could not add the box to stock.');

  // Keep the line, mark it received, and remember which box it became.
  await db
    .update(shoppingItems)
    .set({ status: 'in_stock', receivedBatchId: batchId, updatedAt: new Date() })
    .where(eq(shoppingItems.id, itemId));

  refreshAll();
  redirect('/shopping');
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

  if (!Number.isInteger(variantId)) {
    return { error: 'Pick which pack to buy.', values: snapshot(formData) };
  }
  if (!Number.isInteger(quantityPacks) || quantityPacks < 1) {
    return {
      error: 'Number of packs must be a whole number, at least 1.',
      values: snapshot(formData),
    };
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
  /**
   * What the user had typed. Returned with every validation failure so the form
   * can be rebuilt exactly as they left it — mistyping an expiry date should
   * cost one field, not the whole box.
   */
  values?: Record<string, string>;
}

/** Everything the user typed, so a rejected form can be handed straight back. */
function snapshot(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    // Skip React's internal server-action fields.
    if (typeof value === 'string' && !key.startsWith('$')) values[key] = value;
  }
  return values;
}

function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}
