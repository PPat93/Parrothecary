'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  BARCODE_TYPES,
  BATCH_STATUSES,
  CURRENCIES,
  DOSE_FORMS,
  SHOPPING_STATUSES,
  TERMINAL_SHOPPING_STATUSES,
  TRIP_STATUSES,
  UNIT_NAMES,
  batches,
  doseEvents,
  doseSchedules,
  householdMembers,
  productSubstances,
  products,
  shoppingItems,
  productSymptoms,
  stockMovements,
  substances,
  symptoms,
  trips,
  variantBarcodes,
  variants,
} from '@/db/schema';
import { isValidEan13, parseScan } from '@/domain/barcode';
import { todayIso } from '@/domain/date';
import { allocateFefo, type FefoBatch } from '@/domain/fefo';
import {
  applyAdjustment,
  movementForCount,
  movementForStatusChange,
  type LedgerBatchStatus,
} from '@/domain/ledger';
import { deletePhoto, savePhoto } from '@/lib/photos';
import { findVariantByBarcode, getPreviousCollectionDate } from '@/lib/queries';
import { defaultOrderByDate } from '@/domain/trip';
import { formatExpiry, normaliseExpiry, parseGraceDays } from '@/domain/expiry';
import { UNIT_PRECISION, isTrackableQuantity, parseUnits } from '@/domain/quantity';
import { parseAmount, parseFxRate } from '@/domain/money';
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
  // .nullish() covers all three cases a form can produce: a string, an explicit
  // null from FormData.get on a missing field, and a key not passed in at all.
  .string()
  .nullish()
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
  /*
   * Blank means zero — no tolerance past the printed date. That has to be the
   * default: a field left alone must never quietly extend how long something
   * is treated as safe to take.
   */
  expiryGraceDays: optionalText.transform((value, ctx) => {
    const result = parseGraceDays(value);
    if (!result.ok) {
      ctx.addIssue(result.message);
      return z.NEVER;
    }
    return result.days;
  }),
  /*
   * Required, not optional. A product with no pack cannot receive a box and
   * cannot be put on a shopping list, so it can only ever be archived — a dead
   * end that was easy to create and easy to miss.
   */
  packSize: optionalText,
  packLabel: optionalText,
  substance: optionalText,
  substanceAmount: optionalText,
  symptom: optionalText,
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
    expiryGraceDays: formData.get('expiryGraceDays'),
    packSize: formData.get('packSize'),
    packLabel: formData.get('packLabel'),
    substance: formData.get('substance'),
    substanceAmount: formData.get('substanceAmount'),
    symptom: formData.get('symptom'),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
      values: snapshot(formData),
    };
  }

  const data = parsed.data;

  // Distinguish missing from invalid: telling someone a filled-in field is
  // "required" sends them looking for a blank box that is not there.
  const packSize = parseUnits(data.packSize ?? '');
  if (data.packSize === null) {
    return {
      error: 'Pack size is required — how many units are in one sealed pack?',
      values: snapshot(formData),
    };
  }
  if (packSize === null || packSize <= 0) {
    return {
      error: `"${data.packSize}" is not a valid pack size. Enter a positive number, like 60.`,
      values: snapshot(formData),
    };
  }

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
      expiryGraceDays: data.expiryGraceDays,
    })
    .returning({ id: products.id });

  const productId = inserted[0]?.id;
  if (productId === undefined) {
    return { error: 'Could not save the product.', values: snapshot(formData) };
  }

  await db.insert(variants).values({ productId, packSize, packLabel: data.packLabel });

  if (data.substance) {
    await linkSubstance(productId, data.substance, data.substanceAmount);
  }
  if (data.symptom) {
    await linkSymptom(productId, data.symptom);
  }

  refreshAll();
  redirect(`/products/${productId}`);
}

/**
 * Attach an active substance, creating it if this is the first product to use
 * it. Matching is case-insensitive so "Paracetamol" and "paracetamol" do not
 * become two different substances — which would silently defeat the
 * duplicate-ingredient warnings later.
 */
async function linkSubstance(
  productId: number,
  name: string,
  amountText: string | null,
): Promise<void> {
  const existing = await db
    .select({ id: substances.id })
    .from(substances)
    .where(sql`lower(${substances.name}) = lower(${name})`)
    .limit(1);

  let substanceId = existing[0]?.id;
  if (substanceId === undefined) {
    const created = await db
      .insert(substances)
      .values({ name })
      .returning({ id: substances.id });
    substanceId = created[0]?.id;
  }
  if (substanceId === undefined) return;

  const amountMg = amountText !== null && /^[\d.]+\s*mg$/i.test(amountText.trim())
    ? Number(amountText.replace(/\s*mg$/i, ''))
    : null;

  await db
    .insert(productSubstances)
    .values({ productId, substanceId, amountMg, amountText })
    /*
     * Update, not ignore. Re-submitting a substance is how you correct its
     * amount, and doing nothing looked identical to success — the form cleared,
     * no error appeared, and the old value stayed.
     */
    .onConflictDoUpdate({
      target: [productSubstances.productId, productSubstances.substanceId],
      set: { amountMg, amountText },
    });
}

export async function addSubstanceToProduct(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const productId = Number(formData.get('productId'));
  const name = String(formData.get('substance') ?? '').trim();
  const amount = emptyToNull(String(formData.get('substanceAmount') ?? '').trim());

  if (!Number.isInteger(productId)) return { error: 'Unknown product.' };
  if (!name) return { error: 'Enter a substance name.', values: snapshot(formData) };

  await linkSubstance(productId, name, amount);
  refreshAll();
  return { error: null, ok: true };
}

/**
 * Tag a product with what it is for. Matching is case-insensitive so "Sore
 * throat" and "sore throat" stay one tag — two spellings would split the shelf
 * in half and quietly hide things from the search.
 */
async function linkSymptom(productId: number, name: string): Promise<void> {
  const existing = await db
    .select({ id: symptoms.id })
    .from(symptoms)
    .where(sql`lower(${symptoms.nameEn}) = lower(${name})`)
    .limit(1);

  let symptomId = existing[0]?.id;
  if (symptomId === undefined) {
    const created = await db
      .insert(symptoms)
      .values({ nameEn: name })
      .returning({ id: symptoms.id });
    symptomId = created[0]?.id;
  }
  if (symptomId === undefined) return;

  await db.insert(productSymptoms).values({ productId, symptomId }).onConflictDoNothing();
}

export async function addSymptomToProduct(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const productId = Number(formData.get('productId'));
  const name = String(formData.get('symptom') ?? '').trim();

  if (!Number.isInteger(productId)) return { error: 'Unknown product.' };
  if (!name) return { error: 'Enter what it is used for.', values: snapshot(formData) };

  await linkSymptom(productId, name);
  refreshAll();
  return { error: null, ok: true };
}

export async function removeSymptomFromProduct(formData: FormData): Promise<void> {
  const productId = Number(formData.get('productId'));
  const symptomId = Number(formData.get('symptomId'));
  if (!Number.isInteger(productId) || !Number.isInteger(symptomId)) return;

  await db
    .delete(productSymptoms)
    .where(
      and(eq(productSymptoms.productId, productId), eq(productSymptoms.symptomId, symptomId)),
    );
  refreshAll();
}

export async function removeSubstanceFromProduct(formData: FormData): Promise<void> {
  const productId = Number(formData.get('productId'));
  const substanceId = Number(formData.get('substanceId'));
  if (!Number.isInteger(productId) || !Number.isInteger(substanceId)) return;

  await db
    .delete(productSubstances)
    .where(
      and(
        eq(productSubstances.productId, productId),
        eq(productSubstances.substanceId, substanceId),
      ),
    );
  refreshAll();
}

/**
 * Editing never touches pack sizes or substances — those are their own records,
 * managed on the product page. Omitting them here keeps the edit form from
 * being asked for fields it does not render.
 */
const productEditSchema = productSchema.omit({
  packSize: true,
  packLabel: true,
  substance: true,
  substanceAmount: true,
  symptom: true,
});

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
    expiryGraceDays: formData.get('expiryGraceDays'),
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

/**
 * Permanent delete, so the archive does not silently become a junk drawer.
 *
 * Guarded twice: the product must already be archived, and it must have no
 * batches at all — not even used-up or binned ones. Those rows are the record
 * of what was taken and what it cost, and deleting a product must never be a
 * way to lose them.
 */
export async function deleteProduct(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const rows = await db
    .select({ archivedAt: products.archivedAt })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!rows[0]?.archivedAt) return;

  const batchRows = await db
    .select({ id: batches.id })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .where(eq(variants.productId, id))
    .limit(1);

  if (batchRows.length > 0) return;

  // doseSchedules.productId is restrict, not cascade — a schedule (even an
  // archived one with zero confirmed doses) still blocks the delete outright.
  const scheduleRows = await db
    .select({ id: doseSchedules.id })
    .from(doseSchedules)
    .where(eq(doseSchedules.productId, id))
    .limit(1);

  if (scheduleRows.length > 0) return;

  // Variants, substance links and shopping lines cascade from the schema.
  await db.delete(products).where(eq(products.id, id));
  refreshAll();
  redirect('/products?archived=1');
}

export async function unarchiveProduct(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db.update(products).set({ archivedAt: null }).where(eq(products.id, id));
  refreshAll();
}

/**
 * Archiving is refused while someone is still being dosed from this product.
 *
 * The alternative — archive it and quietly drop the schedule off the dose board
 * — would turn a tidying gesture into a stopped medication, with no missed-dose
 * marks and nothing to notice. Better to refuse at the moment we can still say
 * why. Stopping the dose first is one tap away on the household page.
 */
export async function archiveProduct(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const activeSchedules = await db
    .select({ id: doseSchedules.id })
    .from(doseSchedules)
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .where(
      and(
        eq(doseSchedules.productId, id),
        isNull(doseSchedules.archivedAt),
        isNull(householdMembers.archivedAt),
      ),
    )
    .limit(1);
  if (activeSchedules.length > 0) return;

  // Soft delete — batch history and past spend depend on this row surviving.
  await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, id));
  refreshAll();
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

export async function createVariant(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const productId = Number(formData.get('productId'));
  const packSize = parseUnits(String(formData.get('packSize') ?? ''));
  const packLabel = emptyToNull(String(formData.get('packLabel') ?? '').trim());

  if (!Number.isInteger(productId)) return { error: 'Pick a product.' };
  if (packSize === null || packSize <= 0) {
    return { error: 'Pack size must be a positive number.', values: snapshot(formData) };
  }

  // Two identical pack sizes would appear as indistinguishable options in every
  // picker, with boxes split arbitrarily between them.
  const duplicate = await db
    .select({ id: variants.id })
    .from(variants)
    .where(
      and(
        eq(variants.productId, productId),
        eq(variants.packSize, packSize),
        isNull(variants.archivedAt),
      ),
    )
    .limit(1);

  if (duplicate.length > 0) {
    return {
      error: `This product already has a pack of ${packSize}.`,
      values: snapshot(formData),
    };
  }

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
  fxRateToEur: number | null;
}

/**
 * Shared by "add box" and by receiving a shopping item — both describe the same
 * physical thing arriving in the house, so they parse identically.
 */
function parseBatchFields(formData: FormData): { fields: BatchFields } | { error: string } {
  const quantity = parseUnits(String(formData.get('quantityRemaining') ?? ''));
  if (quantity === null || quantity <= 0) {
    return { error: 'Quantity must be a positive number — 30, 32.5 or 32,5 all work.' };
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
  /*
   * The rate belongs to the box, not to today: it is what a złoty cost in euro
   * on the day this was bought, so last year's spend does not move when the
   * rate does. Nothing wrote it before, which meant every price typed into the
   * app was złoty that could never be compared with a euro one.
   */
  let fxRateToEur: number | null = null;
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

    // Euro needs no rate, and storing one would only be something to contradict.
    if (currency !== 'EUR') {
      const rate = parseFxRate(String(formData.get('fxRate') ?? ''));
      if (!rate.ok) return { error: rate.message };
      fxRateToEur = rate.rate;
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
      fxRateToEur,
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

  /*
   * The box and the row saying it arrived go in together. A torn write here
   * would leave the ledger disagreeing with the shelf, which is the one thing
   * it exists not to do.
   */
  db.transaction((tx) => {
    const inserted = tx
      .insert(batches)
      .values({ variantId, ...parsed.fields })
      .returning({ id: batches.id })
      .all();

    const batchId = inserted[0]?.id;
    if (batchId === undefined) throw new Error('Could not add the box.');

    tx.insert(stockMovements)
      .values({ batchId, delta: parsed.fields.quantityRemaining, reason: 'received' })
      .run();
  });

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
  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  if (!Number.isInteger(itemId)) {
    return fail('That shopping item no longer exists.');
  }

  /*
   * Re-read the line rather than trusting the form, and refuse one that has
   * already been received. Without this, resubmitting the page — a back button,
   * a bookmark, a double tap before the redirect lands — created a second box
   * in the cupboard and left the first one orphaned from its shopping line.
   *
   * The variant comes from the line too. It decides which product the new box
   * belongs to, and that is not something a stale form should get to choose.
   */
  const itemRows = await db
    .select({ variantId: shoppingItems.variantId, status: shoppingItems.status })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, itemId))
    .limit(1);

  const item = itemRows[0];
  if (!item) return fail('That shopping item no longer exists.');
  if (item.status === 'in_stock') {
    return fail('This one is already in the cupboard — it was received before.');
  }
  if (item.status === 'not_received') {
    return fail('This line is marked as never arrived. Move it back into the flow first.');
  }

  const parsed = parseBatchFields(formData);
  if ('error' in parsed) return fail(parsed.error);

  /*
   * Three writes that only make sense together: the box, the row saying it
   * arrived, and the shopping line that becomes it.
   */
  const batchId = db.transaction((tx) => {
    const inserted = tx
      .insert(batches)
      .values({ variantId: item.variantId, ...parsed.fields })
      .returning({ id: batches.id })
      .all();

    const newId = inserted[0]?.id;
    if (newId === undefined) throw new Error('Could not add the box to stock.');

    tx.insert(stockMovements)
      .values({ batchId: newId, delta: parsed.fields.quantityRemaining, reason: 'received' })
      .run();

    // Keep the line, mark it received, and remember which box it became.
    tx.update(shoppingItems)
      .set({ status: 'in_stock', receivedBatchId: newId, updatedAt: new Date() })
      .where(eq(shoppingItems.id, itemId))
      .run();

    return newId;
  });

  if (batchId === undefined) return fail('Could not add the box to stock.');

  refreshAll();
  redirect('/shopping');
}

/**
 * Correct a box that was entered wrongly.
 *
 * Without this the only way to fix "100" typed instead of "10" was to tap the
 * minus button ninety times, which would also record ninety doses as consumed —
 * turning a typo into fabricated consumption history.
 */
export async function updateBatch(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  if (!Number.isInteger(id)) return fail('That box no longer exists.');

  const parsed = parseBatchFields(formData);
  if ('error' in parsed) return fail(parsed.error);

  const before = await db
    .select({ quantityRemaining: batches.quantityRemaining })
    .from(batches)
    .where(eq(batches.id, id))
    .limit(1);

  const previous = before[0];
  if (!previous) return fail('That box no longer exists.');

  /*
   * Correcting a typed-in quantity is still stock moving, even though it looks
   * like editing a field. Recorded as the difference so that fixing "100"
   * to "10" reads as the ninety that were never there, not as a fresh count.
   */
  const delta = Math.round((parsed.fields.quantityRemaining - previous.quantityRemaining) * 100) / 100;

  db.transaction((tx) => {
    tx.update(batches)
      .set({ ...parsed.fields, updatedAt: new Date() })
      .where(eq(batches.id, id))
      .run();

    if (delta !== 0) {
      tx.insert(stockMovements).values({ batchId: id, delta, reason: 'adjust' }).run();
    }
  });

  refreshAll();
  redirect('/');
}

/**
 * Erase a box that never existed — a mis-scan or a duplicate entry.
 *
 * Deliberately separate from binning. "Binned" and "used up" are real events
 * worth keeping; a typo is not, and leaving it as a zeroed batch would pollute
 * the consumption and waste figures the later phases depend on.
 */
/**
 * Guarded: a batch with a confirmed dose against it cannot be deleted — the
 * FK from dose_events restricts it, and rightly so, since that row is real
 * consumption history. The edit page hides the button in this case; this is
 * the backstop for a stale render, so the delete fails quietly rather than
 * crashing with a raw FOREIGN KEY constraint error.
 */
export async function deleteBatch(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const eventRows = await db
    .select({ id: doseEvents.id })
    .from(doseEvents)
    .where(eq(doseEvents.batchId, id))
    .limit(1);
  if (eventRows.length > 0) return;

  await db.delete(batches).where(eq(batches.id, id));
  refreshAll();
  redirect('/');
}

export interface ScanResult {
  code: string;
  /** Null when this code has never been seen before. */
  variantId: number | null;
  variantLabel: string | null;
  expiry: string | null;
  lotNumber: string | null;
}

/**
 * Resolve a scan against the barcode table and hand back whatever the code
 * itself carried. Called from the scanner as soon as the camera reads a code.
 */
export async function resolveScan(raw: string, format?: string): Promise<ScanResult> {
  const parsed = parseScan(raw, format);
  const variant = await findVariantByBarcode(parsed.code);

  return {
    code: parsed.code,
    variantId: variant?.id ?? null,
    variantLabel: variant?.productLabel ?? null,
    // Re-formatted the way the expiry field expects it, so it can be dropped
    // straight into the form. Grace is irrelevant to how a date is written, but
    // this goes through formatExpiry rather than slicing the string by hand so
    // there is only one definition of what an expiry looks like on screen.
    expiry: parsed.expiryDate
      ? formatExpiry({
          expiryDate: parsed.expiryDate,
          precision: parsed.expiryPrecision,
          hasExpiry: true,
          graceDays: 0,
        })
      : null,
    lotNumber: parsed.lotNumber,
  };
}

/**
 * Attach a code to a pack. Shared by the scanner and by typing one in.
 *
 * Normalised through the same parser either way, so a code typed from the box
 * matches the same box when scanned — a 12-digit UPC-A widened to 13, a GS1
 * payload reduced to its GTIN.
 */
async function attachBarcode(
  variantId: number,
  rawCode: string,
  declaredType: string,
): Promise<string | null> {
  const parsed = parseScan(rawCode);
  const code = parsed.code;
  if (!code) return 'Enter a barcode.';

  // Typos are the whole risk with manual entry, and a 13-digit code carries its
  // own check digit — so refuse one that fails it rather than storing a code
  // that will never match anything.
  if (/^\d{13}$/.test(code) && !isValidEan13(code)) {
    return `${code} is not a valid barcode — its check digit does not match. Re-read the digits under the stripe.`;
  }

  const existing = await db
    .select({ variantId: variantBarcodes.variantId })
    .from(variantBarcodes)
    .where(eq(variantBarcodes.code, code))
    .limit(1);

  const owner = existing[0]?.variantId;
  if (owner !== undefined) {
    return owner === variantId
      ? 'That barcode is already on this pack.'
      : 'That barcode already belongs to a different pack.';
  }

  const type =
    parsed.type === 'other'
      ? ((BARCODE_TYPES.find((t) => t === declaredType) ?? 'other') as (typeof BARCODE_TYPES)[number])
      : (parsed.type as (typeof BARCODE_TYPES)[number]);

  await db.insert(variantBarcodes).values({ variantId, code, type });
  return null;
}

/** Teach the cabinet a code it has not seen, so the next scan just works. */
export async function linkBarcode(formData: FormData): Promise<void> {
  const variantId = Number(formData.get('variantId'));
  const code = String(formData.get('code') ?? '').trim();
  if (!Number.isInteger(variantId) || !code) return;

  await attachBarcode(variantId, code, String(formData.get('barcodeType') ?? 'ean13'));
  refreshAll();
}

/** Typed in by hand, for packs whose code was never scanned or photographed. */
export async function addBarcode(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  const code = String(formData.get('code') ?? '').trim();

  if (!Number.isInteger(variantId)) return { error: 'Unknown pack.' };
  if (!code) return { error: 'Enter a barcode.', values: snapshot(formData) };

  const error = await attachBarcode(variantId, code, String(formData.get('barcodeType') ?? 'ean13'));
  if (error) return { error, values: snapshot(formData) };

  refreshAll();
  return { error: null, ok: true };
}

export async function setProductPhoto(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const productId = Number(formData.get('productId'));
  const file = formData.get('photo');

  if (!Number.isInteger(productId)) return { error: 'Unknown product.' };
  if (!(file instanceof File)) return { error: 'Choose a photo first.' };

  const saved = await savePhoto(file);
  if ('error' in saved) return { error: saved.error };

  const rows = await db
    .select({ photoPath: products.photoPath })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  await db
    .update(products)
    .set({ photoPath: saved.id, updatedAt: new Date() })
    .where(eq(products.id, productId));

  // Replacing a photo should not leave the old pair behind for ever.
  const previous = rows[0]?.photoPath;
  if (previous) await deletePhoto(previous);

  refreshAll();
  return { error: null, ok: true };
}

export async function removeProductPhoto(formData: FormData): Promise<void> {
  const productId = Number(formData.get('productId'));
  if (!Number.isInteger(productId)) return;

  const rows = await db
    .select({ photoPath: products.photoPath })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  await db
    .update(products)
    .set({ photoPath: null, updatedAt: new Date() })
    .where(eq(products.id, productId));

  const existing = rows[0]?.photoPath;
  if (existing) await deletePhoto(existing);

  refreshAll();
}

export async function removeBarcode(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return;

  // Codes are globally unique, so this needs no pack id.
  await db.delete(variantBarcodes).where(eq(variantBarcodes.code, code));
  refreshAll();
}

/** One-tap +/- from the stock list. Clamps at zero rather than going negative. */
export async function adjustBatch(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const delta = Number(formData.get('delta'));
  if (!Number.isInteger(id) || !Number.isFinite(delta)) return;

  const rows = await db
    .select({ quantityRemaining: batches.quantityRemaining })
    .from(batches)
    .where(eq(batches.id, id))
    .limit(1);

  const current = rows[0];
  if (!current) return;

  /*
   * Computed here rather than in SQL because the ledger needs the delta that
   * was actually applied. Pressing minus on a box with 0.5 left takes half a
   * tablet, not a whole one, and recording the button press instead of the
   * movement would put the two out of step immediately.
   */
  const { next, applied } = applyAdjustment(current.quantityRemaining, delta);
  if (applied === 0) return;

  db.transaction((tx) => {
    tx.update(batches)
      .set({
        quantityRemaining: next,
        // Adjusting a sealed box means it has just been opened.
        openedAt: sql`coalesce(${batches.openedAt}, date('now'))`,
        updatedAt: new Date(),
        // Emptying a box retires it so it drops out of the stock list. No
        // movement for that: the units already left on the row above.
        ...(next <= 0 ? { status: 'consumed' as const } : {}),
      })
      .where(eq(batches.id, id))
      .run();

    tx.insert(stockMovements).values({ batchId: id, delta: applied, reason: 'adjust' }).run();
  });

  refreshAll();
}

/**
 * Reconcile the cupboard against a physical count.
 *
 * Every field is optional and blank means "did not count this one". Counting a
 * cabinet is a job you do in stages between other things, and a form that
 * demanded a number for all thirty boxes before it would accept any of them
 * would simply not get used — the trip worksheet already learned that lesson
 * the hard way.
 *
 * Rows that agree are left alone: no update, no movement. Agreement is not an
 * event, and writing a row for every box counted would bury the differences,
 * which are the only reason to do this at all.
 */
export async function recordStockCount(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  const counts: { batchId: number; counted: number }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('count_') || typeof value !== 'string') continue;

    const raw = value.trim();
    if (raw === '') continue; // not counted, which is a normal answer

    const batchId = Number(key.slice('count_'.length));
    if (!Number.isInteger(batchId)) continue;

    const counted = parseUnits(raw);
    if (counted === null || counted < 0) {
      return fail(`"${raw}" is not a count. Enter a number — 30, 32.5 or 32,5 all work.`);
    }
    // Zero is legitimate: an empty box on the shelf. Anything finer than a
    // hundredth is not, for the same reason the stepper refuses it.
    if (counted > 0 && !isTrackableQuantity(counted)) {
      return fail(`Counts go down to ${UNIT_PRECISION} of a unit — "${raw}" is finer than that.`);
    }

    counts.push({ batchId, counted });
  }

  if (counts.length === 0) {
    return fail('Nothing counted yet. Fill in the boxes you have checked and leave the rest blank.');
  }

  const current = await db
    .select({
      id: batches.id,
      quantityRemaining: batches.quantityRemaining,
      status: batches.status,
    })
    .from(batches)
    .where(
      inArray(
        batches.id,
        counts.map((c) => c.batchId),
      ),
    );

  const byId = new Map(current.map((row) => [row.id, row]));

  let changed = 0;
  let netUnits = 0;

  db.transaction((tx) => {
    for (const { batchId, counted } of counts) {
      const box = byId.get(batchId);
      // A box that left stock while the count was being typed is not ours to
      // resurrect — the count was of a shelf that has since moved on.
      if (!box || box.status !== 'in_stock') continue;

      const movement = movementForCount(box.quantityRemaining, counted);
      if (!movement) continue;

      tx.update(batches)
        .set({
          quantityRemaining: counted,
          updatedAt: new Date(),
          // Counted as empty means empty, and an empty box leaves the shelf.
          ...(counted <= 0 ? { status: 'consumed' as const } : {}),
        })
        .where(eq(batches.id, batchId))
        .run();

      tx.insert(stockMovements)
        .values({
          batchId,
          delta: movement.delta,
          reason: movement.reason,
          note: 'stock count',
        })
        .run();

      changed++;
      netUnits += movement.delta;
    }
  });

  refreshAll();
  redirect(
    `/count?counted=${counts.length}&changed=${changed}` +
      `&net=${Math.round(netUnits * 100) / 100}`,
  );
}

export async function setBatchStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!BATCH_STATUSES.some((s) => s === status)) return;

  const rows = await db
    .select({ status: batches.status, quantityRemaining: batches.quantityRemaining })
    .from(batches)
    .where(eq(batches.id, id))
    .limit(1);

  const current = rows[0];
  if (!current) return;

  /*
   * Binning leaves `quantity_remaining` alone — the waste figures cost what
   * was left in the box, so that number has to survive. The units leave the
   * cupboard here instead, as a closing row that takes this batch's running
   * total to zero. Restoring the box writes the same row the other way up.
   */
  const movement = movementForStatusChange(
    current.status as LedgerBatchStatus,
    status as LedgerBatchStatus,
    current.quantityRemaining,
  );

  db.transaction((tx) => {
    tx.update(batches)
      .set({ status: status as (typeof BATCH_STATUSES)[number], updatedAt: new Date() })
      .where(eq(batches.id, id))
      .run();

    if (movement) {
      tx.insert(stockMovements)
        .values({ batchId: id, delta: movement.delta, reason: movement.reason })
        .run();
    }
  });

  refreshAll();
}

/* ------------------------------------------------------------------ */
/* Shopping list                                                       */
/* ------------------------------------------------------------------ */

export async function addShoppingItem(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  const quantityPacks = Number(formData.get('quantityPacks') ?? 1);
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());
  const tripId = await parseTripId(formData.get('tripId'));

  if (!Number.isInteger(variantId)) {
    return { error: 'Pick which pack to buy.', values: snapshot(formData) };
  }
  if (!Number.isInteger(quantityPacks) || quantityPacks < 1) {
    return {
      error: 'Number of packs must be a whole number, at least 1.',
      values: snapshot(formData),
    };
  }

  await db.insert(shoppingItems).values({ variantId, quantityPacks, notes, tripId });
  refreshAll();
  return { error: null, ok: true };
}

/**
 * Empty means "no trip", which is a real answer rather than a missing one —
 * plenty gets bought locally, outside any restock trip.
 *
 * The trip is checked to still exist, not merely to be a number. Two phones
 * share this app: one can delete a trip while the other has the shopping form
 * open, and `trip_id` is a real foreign key, so writing a stale id throws
 * SQLITE_CONSTRAINT_FOREIGNKEY and the form dies with a crash page. Falling
 * back to "no trip" loses only the association, which the trip page can restore
 * in one tap.
 */
async function parseTripId(raw: FormDataEntryValue | null): Promise<number | null> {
  const value = String(raw ?? '').trim();
  if (value === '') return null;

  const id = Number(value);
  if (!Number.isInteger(id)) return null;

  const rows = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, id)).limit(1);
  return rows[0]?.id ?? null;
}

/** Move a line to another trip, or off trips entirely. */
export async function setShoppingTrip(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db
    .update(shoppingItems)
    .set({ tripId: await parseTripId(formData.get('tripId')), updatedAt: new Date() })
    .where(eq(shoppingItems.id, id));
  refreshAll();
}

export async function setShoppingStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!SHOPPING_STATUSES.some((s) => s === status)) return;

  /*
   * Settled lines do not move. The list already stops offering the arrows once
   * something is in the cupboard or recorded as never-arrived, and the server
   * has to agree: dragging an in_stock line back to "to buy" would leave a real
   * box in the cupboard attached to a line pretending it was never bought.
   * Clearing the line is the way out, not walking it backwards.
   */
  const rows = await db
    .select({ status: shoppingItems.status })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id))
    .limit(1);

  const current = rows[0]?.status;
  if (current === undefined) return;
  if (TERMINAL_SHOPPING_STATUSES.some((s) => s === current)) return;

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
/* Household members and dosing                                       */
/* ------------------------------------------------------------------ */

export async function createMember(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const name = String(formData.get('name') ?? '').trim();
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());
  if (!name) return { error: 'Enter a name.', values: snapshot(formData) };

  const inserted = await db
    .insert(householdMembers)
    .values({ name, notes })
    .returning({ id: householdMembers.id });

  const id = inserted[0]?.id;
  if (id === undefined) return { error: 'Could not save that.', values: snapshot(formData) };

  refreshAll();
  redirect(`/household/${id}`);
}

export async function updateMember(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  const name = String(formData.get('name') ?? '').trim();
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());

  if (!Number.isInteger(id)) return { error: 'Unknown person.' };
  if (!name) return { error: 'Enter a name.', values: snapshot(formData) };

  await db
    .update(householdMembers)
    .set({ name, notes, updatedAt: new Date() })
    .where(eq(householdMembers.id, id));

  refreshAll();
  redirect(`/household/${id}`);
}

export async function archiveMember(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await db.update(householdMembers).set({ archivedAt: new Date() }).where(eq(householdMembers.id, id));
  refreshAll();
}

export async function unarchiveMember(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await db.update(householdMembers).set({ archivedAt: null }).where(eq(householdMembers.id, id));
  refreshAll();
}

/**
 * Guarded like deleteProduct: only when archived, and only when none of their
 * schedules ever logged a confirmed dose — those rows are real stock history.
 */
export async function deleteMember(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const rows = await db
    .select({ archivedAt: householdMembers.archivedAt })
    .from(householdMembers)
    .where(eq(householdMembers.id, id))
    .limit(1);
  if (!rows[0]?.archivedAt) return;

  const scheduleIds = (
    await db
      .select({ id: doseSchedules.id })
      .from(doseSchedules)
      .where(eq(doseSchedules.memberId, id))
  ).map((s) => s.id);

  if (scheduleIds.length > 0) {
    const eventRows = await db
      .select({ id: doseEvents.id })
      .from(doseEvents)
      .where(inArray(doseEvents.scheduleId, scheduleIds))
      .limit(1);
    if (eventRows.length > 0) return;
  }

  // Schedules cascade from the member; safe, since we just confirmed none of
  // them have a single confirmed dose to lose.
  await db.delete(householdMembers).where(eq(householdMembers.id, id));
  refreshAll();
  redirect('/household?archived=1');
}

export async function createSchedule(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const memberId = Number(formData.get('memberId'));
  const productId = Number(formData.get('productId'));
  const doseUnits = parseUnits(String(formData.get('doseUnits') ?? ''));
  const timesPerDay = Number(formData.get('timesPerDay') || 1);
  const intervalDays = Number(formData.get('intervalDays') || 1);
  const startDate = String(formData.get('startDate') ?? '').trim();
  const endDate = emptyToNull(String(formData.get('endDate') ?? '').trim());
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());

  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  if (!Number.isInteger(memberId)) return fail('Unknown person.');
  if (!Number.isInteger(productId)) return fail('Pick what is being taken.');
  if (doseUnits === null || doseUnits <= 0) {
    return fail('Dose per time must be a positive number — 1, 0.5 or 0,5 all work.');
  }
  /*
   * Refused rather than rounded. Quantities are stored to two decimals, so an
   * eighth of a tablet would leave 0.04 of it behind after eight doses — the
   * kind of quiet arithmetic error that makes someone stop trusting the counts.
   */
  if (!isTrackableQuantity(doseUnits)) {
    return fail(
      `Doses are tracked to ${UNIT_PRECISION} of a unit. ${doseUnits} is finer than that — round it, or record the dose in a smaller unit.`,
    );
  }
  if (!Number.isInteger(timesPerDay) || timesPerDay < 1) {
    return fail('Times per day must be a whole number, at least 1.');
  }
  /*
   * Capped at a year for the same reason the expiry grace period is: past that
   * the number is a typo, not an intent. The lower bound matters more — a zero
   * or negative interval would make the modulo meaningless and could turn a
   * weekly dose into a daily prompt.
   */
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    return fail('Repeat every how many days? A whole number from 1 (daily) to 365.');
  }
  if (!startDate) return fail('Pick a start date.');
  if (endDate && endDate < startDate) return fail('The end date is before the start date.');

  await db.insert(doseSchedules).values({
    memberId,
    productId,
    doseUnits,
    timesPerDay,
    intervalDays,
    startDate,
    endDate,
    notes,
  });

  refreshAll();
  redirect(`/household/${memberId}`);
}

/**
 * One button, no separate archive step. A schedule that never logged a dose
 * is deleted outright — recreating it costs nothing. One that did is archived
 * instead, silently: the doses board and this person's list both already
 * filter to non-archived schedules, so it disappears from view either way,
 * but a confirmed dose is never erased.
 */
export async function removeSchedule(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const eventRows = await db
    .select({ id: doseEvents.id })
    .from(doseEvents)
    .where(eq(doseEvents.scheduleId, id))
    .limit(1);

  if (eventRows.length > 0) {
    await db.update(doseSchedules).set({ archivedAt: new Date() }).where(eq(doseSchedules.id, id));
  } else {
    await db.delete(doseSchedules).where(eq(doseSchedules.id, id));
  }

  refreshAll();
}

/**
 * Confirm one dose occurrence. Allocates the units via FEFO from the
 * schedule's product and writes one dose_events row per batch actually
 * touched, so undoDose can reverse exactly what happened rather than guessing.
 *
 * No explicit transaction, matching the rest of this file (e.g.
 * receiveShoppingItem) — better-sqlite3 statements are synchronous and this
 * runs single-user on a home LAN, so the risk of a mid-write crash is the same
 * one already accepted elsewhere.
 */
export async function confirmDose(formData: FormData): Promise<void> {
  const scheduleId = Number(formData.get('scheduleId'));
  const date = String(formData.get('date') ?? '').trim();
  const occurrence = Number(formData.get('occurrence'));
  if (!Number.isInteger(scheduleId) || !date || !Number.isInteger(occurrence)) return;

  const scheduleRows = await db
    .select({
      doseUnits: doseSchedules.doseUnits,
      productId: doseSchedules.productId,
      hasExpiry: products.hasExpiry,
      expiryGraceDays: products.expiryGraceDays,
    })
    .from(doseSchedules)
    .innerJoin(products, eq(doseSchedules.productId, products.id))
    .where(eq(doseSchedules.id, scheduleId))
    .limit(1);
  const schedule = scheduleRows[0];
  if (!schedule) return;

  const batchRows = await db
    .select({
      id: batches.id,
      quantityRemaining: batches.quantityRemaining,
      expiryDate: batches.expiryDate,
      expiryPrecision: batches.expiryPrecision,
      openedAt: batches.openedAt,
      status: batches.status,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .where(and(eq(variants.productId, schedule.productId), eq(batches.status, 'in_stock')));

  const fefoBatches: FefoBatch[] = batchRows.map((b) => ({
    ...b,
    hasExpiry: schedule.hasExpiry,
    expiryGraceDays: schedule.expiryGraceDays,
  }));
  const { allocations } = allocateFefo(fefoBatches, schedule.doseUnits, todayIso());
  if (allocations.length === 0) return; // nothing in stock to take this from

  for (const allocation of allocations) {
    db.transaction((tx) => {
      tx.update(batches)
        .set({
          quantityRemaining: sql`max(0, round((${batches.quantityRemaining} - ${allocation.quantity}) * 100) / 100)`,
          // Taking a dose implicitly opens the pack, same as the stock stepper.
          openedAt: sql`coalesce(${batches.openedAt}, date('now'))`,
          updatedAt: new Date(),
        })
        .where(eq(batches.id, allocation.batchId))
        .run();

      tx.update(batches)
        .set({ status: 'consumed' })
        .where(sql`${batches.id} = ${allocation.batchId} and ${batches.quantityRemaining} <= 0`)
        .run();

      const event = tx
        .insert(doseEvents)
        .values({
          scheduleId,
          date,
          occurrence,
          batchId: allocation.batchId,
          quantity: allocation.quantity,
        })
        .returning({ id: doseEvents.id })
        .all();

      // FEFO never allocates more than a box holds, so the applied delta is
      // the allocation — no clamping to account for, unlike the stepper.
      tx.insert(stockMovements)
        .values({
          batchId: allocation.batchId,
          delta: -allocation.quantity,
          reason: 'dose',
          doseEventId: event[0]?.id ?? null,
        })
        .run();
    });
  }

  refreshAll();
}

/** Un-confirm a dose, returning exactly what was taken to the batch it came from. */
export async function undoDose(formData: FormData): Promise<void> {
  const scheduleId = Number(formData.get('scheduleId'));
  const date = String(formData.get('date') ?? '').trim();
  const occurrence = Number(formData.get('occurrence'));
  if (!Number.isInteger(scheduleId) || !date || !Number.isInteger(occurrence)) return;

  const events = await db
    .select({ id: doseEvents.id, batchId: doseEvents.batchId, quantity: doseEvents.quantity })
    .from(doseEvents)
    .where(
      and(
        eq(doseEvents.scheduleId, scheduleId),
        eq(doseEvents.date, date),
        eq(doseEvents.occurrence, occurrence),
      ),
    );

  for (const event of events) {
    db.transaction((tx) => {
      tx.update(batches)
        .set({
          quantityRemaining: sql`round((${batches.quantityRemaining} + ${event.quantity}) * 100) / 100`,
          updatedAt: new Date(),
        })
        .where(eq(batches.id, event.batchId))
        .run();

      // Only resurrect a batch that was auto-retired by hitting zero — leave a
      // deliberately discarded or expired batch exactly as the user left it.
      // Putting the units back is the row above; the status just follows.
      tx.update(batches)
        .set({ status: 'in_stock' })
        .where(and(eq(batches.id, event.batchId), eq(batches.status, 'consumed')))
        .run();

      /*
       * An opposite row rather than deleting the original: the tap and the
       * correction both happened, and a ledger that quietly forgets the first
       * one cannot be reconciled against anything.
       *
       * Unlinked from the dose event on purpose — that row is about to be
       * deleted, and this movement has to outlive it.
       */
      tx.insert(stockMovements)
        .values({
          batchId: event.batchId,
          delta: event.quantity,
          reason: 'dose',
          note: 'dose undone',
        })
        .run();

      tx.delete(doseEvents).where(eq(doseEvents.id, event.id)).run();
    });
  }

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

/* ------------------------------------------------------------------ */
/* Trips                                                              */
/* ------------------------------------------------------------------ */

/**
 * Shared by create and edit. The order-by date is optional in the form: left
 * blank it is derived, because the midpoint rule is what you want nine times
 * out of ten and typing it out by hand invites arithmetic mistakes.
 */
async function parseTripFields(
  formData: FormData,
  excludeTripId?: number,
): Promise<{ fields: { label: string; collectionDate: string; orderByDate: string; notes: string | null } } | { error: string }> {
  const label = String(formData.get('label') ?? '').trim();
  const collectionDate = String(formData.get('collectionDate') ?? '').trim();
  const orderByRaw = String(formData.get('orderByDate') ?? '').trim();
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());

  if (!label) return { error: 'Give the trip a name — "October 2026" is enough.' };
  if (!collectionDate) return { error: 'When is everything being collected?' };

  const previous = await getPreviousCollectionDate(collectionDate, excludeTripId);
  const orderByDate = orderByRaw || defaultOrderByDate(collectionDate, previous);

  if (orderByDate > collectionDate) {
    return { error: 'The order deadline is after the collection date — orders would arrive too late.' };
  }

  return { fields: { label, collectionDate, orderByDate, notes } };
}

export async function createTrip(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const parsed = await parseTripFields(formData);
  if ('error' in parsed) return { error: parsed.error, values: snapshot(formData) };

  const inserted = await db.insert(trips).values(parsed.fields).returning({ id: trips.id });
  const id = inserted[0]?.id;
  if (id === undefined) return { error: 'Could not save the trip.', values: snapshot(formData) };

  refreshAll();
  redirect(`/trips/${id}`);
}

export async function updateTrip(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return { error: 'Unknown trip.' };

  const parsed = await parseTripFields(formData, id);
  if ('error' in parsed) return { error: parsed.error, values: snapshot(formData) };

  await db
    .update(trips)
    .set({ ...parsed.fields, updatedAt: new Date() })
    .where(eq(trips.id, id));

  refreshAll();
  redirect(`/trips/${id}`);
}

export async function setTripStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!TRIP_STATUSES.some((s) => s === status)) return;

  await db
    .update(trips)
    .set({ status: status as (typeof TRIP_STATUSES)[number], updatedAt: new Date() })
    .where(eq(trips.id, id));

  refreshAll();
  redirect(`/trips/${id}`);
}

/**
 * No archive step and no guard, unlike products and people. A trip carries no
 * history of its own — the boxes bought on it keep their own purchase dates and
 * prices, and shopping lines are only unassigned (the FK is `set null`), never
 * deleted. So a mistyped trip can simply go.
 */
export async function deleteTrip(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db.delete(trips).where(eq(trips.id, id));
  refreshAll();
  redirect('/trips');
}

/**
 * Add everything ticked on the trip audit worksheet to that trip's list.
 *
 * One submit for the whole cabinet, because the audit is a single sitting twice
 * a year, not fifteen separate decisions spread over a week.
 *
 * Idempotent by product: a line already on this trip is skipped rather than
 * duplicated. The worksheet shows those as "on the list" instead of a tick box,
 * but two phones can be looking at the same screen, so the check is repeated
 * here where it actually counts.
 */
export async function addAuditSelection(formData: FormData): Promise<void> {
  const tripId = Number(formData.get('tripId'));
  if (!Number.isInteger(tripId)) return;

  const picked = formData.getAll('pick').map(String);
  if (picked.length === 0) redirect(`/trips/${tripId}`);

  // Already-listed is judged per product, not per pack: having the sixties on
  // the list already means this product is handled, whichever size it was.
  const existing = await db
    .select({ productId: variants.productId })
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .where(
      and(
        eq(shoppingItems.tripId, tripId),
        inArray(shoppingItems.status, ['to_buy', 'ordered', 'arrived']),
      ),
    );
  const alreadyOn = new Set(existing.map((row) => row.productId));

  for (const key of picked) {
    const productId = Number(key);
    if (!Number.isInteger(productId) || alreadyOn.has(productId)) continue;

    // Each row carries its own pack choice and quantity, both keyed by product
    // — the chosen pack can change while the form is open, so it cannot be the
    // key itself.
    const variantId = Number(formData.get(`variant-${key}`) ?? 0);
    const packs = Number(formData.get(`packs-${key}`) ?? 0);
    if (!Number.isInteger(variantId) || !Number.isInteger(packs) || packs < 1) continue;

    /*
     * The pack has to belong to the product that was ticked. Nothing in the UI
     * can produce a mismatch, but this writes a shopping line from ids in a
     * submitted form, and a line pointing at another product's pack would be
     * silently wrong rather than loudly broken.
     */
    const owned = await db
      .select({ id: variants.id })
      .from(variants)
      .where(and(eq(variants.id, variantId), eq(variants.productId, productId)))
      .limit(1);
    if (owned.length === 0) continue;

    await db.insert(shoppingItems).values({
      tripId,
      variantId,
      quantityPacks: packs,
      notes: 'From the trip audit.',
    });
  }

  refreshAll();
  redirect(`/trips/${tripId}`);
}
