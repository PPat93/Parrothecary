'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  ALTERNATIVE_RELATIONS,
  BARCODE_TYPES,
  BATCH_STATUSES,
  CURRENCIES,
  DOSE_FORMS,
  SHOPPING_STATUSES,
  TERMINAL_SHOPPING_STATUSES,
  TRIP_KINDS,
  TRIP_STATUSES,
  UNIT_NAMES,
  batches,
  doseEvents,
  doseSchedules,
  householdMembers,
  productAlternatives,
  productSubstances,
  products,
  shoppingItems,
  productSymptoms,
  stockMovements,
  substances,
  travelKitItems,
  symptoms,
  trips,
  variantBarcodes,
  variants,
} from '@/db/schema';
import { barcodeVariants, isValidEan13, parseScan } from '@/domain/barcode';
import { addDays, isIsoDate, todayIso } from '@/domain/date';
import { allocateFefo, type FefoBatch } from '@/domain/fefo';
import { isScheduleActiveOn } from '@/domain/dosing';
import {
  applyAdjustment,
  closureMovement,
  movementForCount,
  movementForStatusChange,
  type LedgerBatchStatus,
} from '@/domain/ledger';
import { deletePhoto, savePhoto } from '@/lib/photos';
import {
  findVariantByBarcode,
  getBatchCapacities,
  getPreviousCollectionDate,
  runningSchedulesOn,
} from '@/lib/queries';
import { defaultOrderByDate } from '@/domain/trip';
import { formatExpiry, normaliseExpiry, parseGraceDays } from '@/domain/expiry';
import { UNIT_PRECISION, formatQuantity, isTrackableQuantity, parseUnits } from '@/domain/quantity';
import { parseAmount, parseFxRate } from '@/domain/money';
import { destroyAllSessions } from '@/lib/auth';
import { endSession } from '@/lib/session';

function refreshAll() {
  revalidatePath('/', 'layout');
}

/**
 * Leave a finished form, and take it out of the back stack.
 *
 * `redirect()` defaults to pushing, so a submitted form stayed in history:
 * add a box, land back on stock, tap the phone's back arrow, and you were
 * inside the add-box form again — filled in, already saved, inviting a second
 * submission. Every form in the app behaved this way, and in a standalone PWA
 * the hardware back button is the only back there is, so it happened constantly.
 *
 * Replacing swaps the form's history entry for the destination, so back goes to
 * wherever the form was opened from. The receive-shopping guard further down
 * exists because of the same push behaviour — it catches a line being received
 * twice after somebody navigated back into the form.
 *
 * Only for a form that has done its work. Guard redirects that turn somebody
 * away keep pushing: the page they came from is still a legitimate place to be.
 */
function finish(url: string): never {
  redirect(url, RedirectType.replace);
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

/*
 * Long enough for anything on a real box — "Solgar Omega 3-6-9 Fish, Flax,
 * Borage" is 37 — and short enough that a name is still a name.
 *
 * A person's name has been capped at 80 and a substance's Polish alias at 100
 * since those were written; a product's was capped at nothing, and it is the
 * one that appears on every screen in the app. Three thousand characters
 * pasted into it rendered in full on Stock, Expiring, Products and Shopping,
 * taking that last page from 20 KB to 160 KB, and went into the middle of the
 * bin confirmation as one unbroken word.
 */
const MAX_PRODUCT_NAME = 120;
const MAX_PRODUCT_TEXT = 200;

/**
 * An ingredient name, not an essay. Long enough for "Pyridoxine hydrochloride".
 *
 * Up here with the others because both doors into the substance and symptom
 * catalogues now use it, and the second of those is the product form above.
 */
const MAX_TAG_NAME = 100;

const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(MAX_PRODUCT_NAME, `A name longer than ${MAX_PRODUCT_NAME} characters is not a name — put the detail in the notes.`),
  nameAlt: optionalText.refine(
    (value) => value === null || value.length <= MAX_PRODUCT_NAME,
    `That other name is longer than ${MAX_PRODUCT_NAME} characters.`,
  ),
  form: z.enum(DOSE_FORMS),
  unitName: z.enum(UNIT_NAMES),
  strength: optionalText.refine(
    (value) => value === null || value.length <= MAX_PRODUCT_TEXT,
    `That strength is longer than ${MAX_PRODUCT_TEXT} characters.`,
  ),
  manufacturer: optionalText.refine(
    (value) => value === null || value.length <= MAX_PRODUCT_TEXT,
    `That manufacturer is longer than ${MAX_PRODUCT_TEXT} characters.`,
  ),
  // Notes are deliberately uncapped: they are prose, they render in their own
  // wrapping block, and they appear on one screen rather than on every one.
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
  packLabel: optionalText.refine(
    (value) => value === null || value.length <= MAX_PRODUCT_TEXT,
    `That pack label is longer than ${MAX_PRODUCT_TEXT} characters.`,
  ),
  /*
   * The new-product form is the second door into the substance and symptom
   * catalogues; `addSubstanceToProduct` is the first. Capping only that one
   * would have left this one open, and a catalogue entry made here is shared
   * with every product that later links to it.
   */
  substance: optionalText.refine(
    (value) => value === null || value.length <= MAX_TAG_NAME,
    `That substance name is longer than ${MAX_TAG_NAME} characters.`,
  ),
  substanceAmount: optionalText.refine(
    (value) => value === null || value.length <= MAX_PRODUCT_TEXT,
    `That amount is longer than ${MAX_PRODUCT_TEXT} characters.`,
  ),
  symptom: optionalText.refine(
    (value) => value === null || value.length <= MAX_TAG_NAME,
    `That is longer than ${MAX_TAG_NAME} characters — a symptom is a word or two.`,
  ),
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
  // The same ceiling the add-a-pack form applies. This creates the first pack.
  if (packSize > MAX_PACK_SIZE) {
    return {
      error: `${packSize} is too large for a pack. ${MAX_PACK_SIZE} is the most — check the number on the box.`,
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
  finish(`/products/${productId}`);
}

/**
 * Does this product still exist?
 *
 * Everything that hangs something off a product — a substance, a symptom, a
 * pack, an alternative — writes a real foreign key. A product page is open on a
 * phone for a long time, and if the other phone deletes that product in the
 * meantime, every one of those writes failed with
 * `SQLITE_CONSTRAINT_FOREIGNKEY` and a crash page, on a form that answers
 * everything else with one line of plain English.
 */
/** Units in one pack. A ten-litre bottle of anything is 10 000 ml. */
const MAX_PACK_SIZE = 100_000;

async function productIsThere(id: number): Promise<boolean> {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  return rows.length > 0;
}

/** The same, for a pack. Barcodes hang off the pack rather than the product. */
async function variantIsThere(id: number): Promise<boolean> {
  const rows = await db.select({ id: variants.id }).from(variants).where(eq(variants.id, id)).limit(1);
  return rows.length > 0;
}

const PRODUCT_GONE = 'That product is no longer there — it may have been deleted on another phone.';

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
  namePl: string | null = null,
): Promise<void> {
  const existing = await db
    .select({ id: substances.id, namePl: substances.namePl })
    .from(substances)
    .where(sql`lower(${substances.name}) = lower(${name})`)
    .limit(1);

  let substanceId = existing[0]?.id;
  if (substanceId === undefined) {
    const created = await db
      .insert(substances)
      .values({ name, namePl })
      .returning({ id: substances.id });
    substanceId = created[0]?.id;
  } else if (namePl !== null && existing[0]!.namePl === null) {
    /*
     * Fill a missing alias, never overwrite one. Typing an existing substance
     * is the common way to reach this, and quietly replacing the Polish name
     * somebody else set from a form where it is an afterthought would be the
     * wrong way round — the pencil is where an alias gets changed on purpose.
     */
    await db.update(substances).set({ namePl }).where(eq(substances.id, substanceId));
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
  const namePl = emptyToNull(String(formData.get('substancePl') ?? '').trim());

  if (!Number.isInteger(productId)) return { error: 'Unknown product.' };
  if (!name) return { error: 'Enter a substance name.', values: snapshot(formData) };
  /*
   * The alias below has always been capped and the name it aliases never was —
   * and this one is the worse of the two to leave open, because a substance is
   * shared: one long name lands on every product linked to it and on the
   * substance list beside them.
   */
  if (name.length > MAX_TAG_NAME) {
    return {
      error: `That substance name is longer than ${MAX_TAG_NAME} characters.`,
      values: snapshot(formData),
    };
  }
  if (namePl !== null && namePl.length > MAX_TAG_NAME) {
    return { error: `That Polish name is longer than ${MAX_TAG_NAME} characters.` };
  }

  if (!(await productIsThere(productId))) return { error: PRODUCT_GONE };

  await linkSubstance(productId, name, amount, namePl);
  refreshAll();
  return { error: null, ok: true };
}

/**
 * Tag a product with what it is for. Matching is case-insensitive so "Sore
 * throat" and "sore throat" stay one tag — two spellings would split the shelf
 * in half and quietly hide things from the search.
 */
async function linkSymptom(
  productId: number,
  name: string,
  namePl: string | null = null,
): Promise<void> {
  const existing = await db
    .select({ id: symptoms.id, namePl: symptoms.namePl })
    .from(symptoms)
    .where(sql`lower(${symptoms.nameEn}) = lower(${name})`)
    .limit(1);

  let symptomId = existing[0]?.id;
  if (symptomId === undefined) {
    const created = await db
      .insert(symptoms)
      .values({ nameEn: name, namePl })
      .returning({ id: symptoms.id });
    symptomId = created[0]?.id;
  } else if (namePl !== null && existing[0]!.namePl === null) {
    // Fill a missing alias, never overwrite one — same rule as substances.
    await db.update(symptoms).set({ namePl }).where(eq(symptoms.id, symptomId));
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
  const namePl = emptyToNull(String(formData.get('symptomPl') ?? '').trim());

  if (!Number.isInteger(productId)) return { error: 'Unknown product.' };
  if (!name) return { error: 'Enter what it is used for.', values: snapshot(formData) };
  // Same as substances: the alias was capped, the name was not.
  if (name.length > MAX_TAG_NAME) {
    return {
      error: `That is longer than ${MAX_TAG_NAME} characters — a symptom is a word or two.`,
      values: snapshot(formData),
    };
  }
  if (namePl !== null && namePl.length > MAX_TAG_NAME) {
    return { error: `That Polish name is longer than ${MAX_TAG_NAME} characters.` };
  }

  if (!(await productIsThere(productId))) return { error: PRODUCT_GONE };

  await linkSymptom(productId, name, namePl);
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

/**
 * Correct the spelling of a substance, everywhere it is used.
 *
 * Renaming rather than re-typing matters beyond tidiness: a misspelling is a
 * *different* substance as far as the database is concerned, so "Paracetmol"
 * and "Paracetamol" never trigger the double-dose warning against each other.
 * Fixing it on one product fixes it on all of them.
 *
 * Renaming onto a name that already exists merges the two: every product
 * carrying the misspelling is moved onto the real one, and the empty row goes.
 * A product already carrying both keeps the amount recorded against the name it
 * is being merged into — one of the two has to win, and that is the one whose
 * spelling was right.
 */
export async function renameSubstance(
  _prev: RenameResult,
  formData: FormData,
): Promise<RenameResult> {
  const id = Number(formData.get('substanceId'));
  const name = String(formData.get('name') ?? '').trim();
  const namePl = emptyToNull(String(formData.get('namePl') ?? '').trim());
  /*
   * "Left blank" and "not asked" are different answers, and only the form knows
   * which happened. Emptying the field on purpose has to be able to clear an
   * alias, while a submit that never carried the field must not wipe one.
   */
  const aliasWasAsked = formData.has('namePl');
  if (!Number.isInteger(id)) return { error: 'That substance is no longer there.', merge: null };
  if (!name) return { error: 'Give it a name.', merge: null };
  if (name.length > MAX_TAG_NAME) {
    return { error: `That name is longer than ${MAX_TAG_NAME} characters.`, merge: null };
  }
  if (namePl !== null && namePl.length > MAX_TAG_NAME) {
    return { error: `That Polish name is longer than ${MAX_TAG_NAME} characters.`, merge: null };
  }

  const targetRows = await db
    .select({ id: substances.id, name: substances.name })
    .from(substances)
    .where(and(sql`lower(${substances.name}) = lower(${name})`, ne(substances.id, id)))
    .limit(1);

  const target = targetRows[0]?.id;

  /*
   * A plain rename is one tap. A merge is not: it folds two entries into one,
   * moves every product across and deletes the row, and there is no undo short
   * of re-adding the substance to each product by hand. So the second one asks
   * first, and says how much moves.
   */
  if (target !== undefined && formData.get('confirm') !== 'yes') {
    /*
     * Only the ones that actually move. A product already carrying both names
     * keeps the one it is being merged into and simply loses the duplicate, so
     * counting every link overstated what the merge would do — "moves all 2
     * products" when one of them was already there.
     */
    const moving = await db.all<{ n: number }>(sql`
      select count(*) as n from ${productSubstances}
      where substance_id = ${id}
        and product_id not in (
          select product_id from ${productSubstances} where substance_id = ${target}
        )
    `);

    return {
      error: null,
      merge: { name: targetRows[0]!.name, products: moving[0]?.n ?? 0 },
    };
  }

  db.transaction((tx) => {
    if (target === undefined) {
      tx.update(substances).set({ name, namePl }).where(eq(substances.id, id)).run();
      return;
    }

    // Merging: whatever the form said wins, including an empty box. Only a
    // submit that never carried the field falls through to the inheritance
    // below, which is there to stop a merge quietly destroying an alias.
    if (aliasWasAsked) {
      tx.update(substances).set({ namePl }).where(eq(substances.id, target)).run();
    }

    // Move the links that will not collide, drop the ones that would, then the
    // now-empty row. Doing it in this order keeps the unique pair intact.
    /*
     * Carry the Polish alias across before the row goes.
     *
     * Which of the two survives is decided by which one you happened to rename,
     * and the seeded catalogue entries are the ones with an alias — so merging
     * the correctly-spelled seeded name onto a typo deleted a search alias that
     * no form in this app can type back in. The surviving row inherits it,
     * whichever direction the merge went.
     */
    if (!aliasWasAsked) {
      tx.run(sql`
        update ${substances} set
          name_pl = coalesce(name_pl, (select name_pl from ${substances} where id = ${id})),
          notes   = coalesce(notes,   (select notes   from ${substances} where id = ${id}))
        where id = ${target}
      `);
    } else {
      // Notes are never edited here, so they are rescued either way.
      tx.run(sql`
        update ${substances} set
          notes = coalesce(notes, (select notes from ${substances} where id = ${id}))
        where id = ${target}
      `);
    }

    tx.run(sql`
      update ${productSubstances} set substance_id = ${target}
      where substance_id = ${id}
        and product_id not in (
          select product_id from ${productSubstances} where substance_id = ${target}
        )
    `);
    tx.delete(productSubstances).where(eq(productSubstances.substanceId, id)).run();
    tx.delete(substances).where(eq(substances.id, id)).run();
  });

  refreshAll();
  return { error: null, merge: null, ok: true };
}

/** The same for a symptom tag, for the same reason: one spelling, one tag. */
export async function renameSymptom(
  _prev: RenameResult,
  formData: FormData,
): Promise<RenameResult> {
  const id = Number(formData.get('symptomId'));
  const name = String(formData.get('name') ?? '').trim();
  const namePl = emptyToNull(String(formData.get('namePl') ?? '').trim());
  const aliasWasAsked = formData.has('namePl');
  if (!Number.isInteger(id)) return { error: 'That tag is no longer there.', merge: null };
  if (!name) return { error: 'Give it a name.', merge: null };
  if (name.length > MAX_TAG_NAME) {
    return { error: `That name is longer than ${MAX_TAG_NAME} characters.`, merge: null };
  }
  if (namePl !== null && namePl.length > MAX_TAG_NAME) {
    return { error: `That Polish name is longer than ${MAX_TAG_NAME} characters.`, merge: null };
  }

  const targetRows = await db
    .select({ id: symptoms.id, name: symptoms.nameEn })
    .from(symptoms)
    .where(and(sql`lower(${symptoms.nameEn}) = lower(${name})`, ne(symptoms.id, id)))
    .limit(1);

  const target = targetRows[0]?.id;

  // Merging asks first, exactly as it does for a substance, and counts only
  // the products that actually move.
  if (target !== undefined && formData.get('confirm') !== 'yes') {
    const moving = await db.all<{ n: number }>(sql`
      select count(*) as n from ${productSymptoms}
      where symptom_id = ${id}
        and product_id not in (
          select product_id from ${productSymptoms} where symptom_id = ${target}
        )
    `);

    return { error: null, merge: { name: targetRows[0]!.name, products: moving[0]?.n ?? 0 } };
  }

  db.transaction((tx) => {
    if (target === undefined) {
      tx.update(symptoms).set({ nameEn: name, namePl }).where(eq(symptoms.id, id)).run();
      return;
    }

    if (aliasWasAsked) {
      tx.update(symptoms).set({ namePl }).where(eq(symptoms.id, target)).run();
    }

    // The surviving tag inherits the Polish alias, same as a substance does —
    // unless the form said what the alias should be.
    if (!aliasWasAsked) {
      tx.run(sql`
        update ${symptoms} set
          name_pl = coalesce(name_pl, (select name_pl from ${symptoms} where id = ${id}))
        where id = ${target}
      `);
    }

    tx.run(sql`
      update ${productSymptoms} set symptom_id = ${target}
      where symptom_id = ${id}
        and product_id not in (
          select product_id from ${productSymptoms} where symptom_id = ${target}
        )
    `);
    tx.delete(productSymptoms).where(eq(productSymptoms.symptomId, id)).run();
    tx.delete(symptoms).where(eq(symptoms.id, id)).run();
  });

  refreshAll();
  return { error: null, merge: null, ok: true };
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

  /*
   * Saving a product that has since been deleted updated nothing and then
   * redirected to its page, which 404s — so a careful edit ended at "not found"
   * with no hint that the work had gone nowhere.
   */
  if (!(await productIsThere(id))) return { error: PRODUCT_GONE, values: snapshot(formData) };

  /*
   * Turning expiry off is not a labelling change — it decides whether dates
   * already written on boxes mean anything.
   *
   * `isDosable` answers true for a product that does not expire, whatever the
   * box says. So unticking this on a product holding long-expired stock made
   * that stock usable again: the boxes dropped off Expiring, the dose board
   * stopped refusing, and a dose came out of a box 221 days past its date. One
   * checkbox, no warning, nothing in the ledger to show why.
   *
   * The grace-days field beside it already refuses to quietly extend how long
   * something counts as safe to take. This is the same rule at a larger scale.
   */
  if (!parsed.data.hasExpiry) {
    const dated = await db
      .select({ id: batches.id })
      .from(batches)
      .innerJoin(variants, eq(batches.variantId, variants.id))
      .where(and(eq(variants.productId, id), isNotNull(batches.expiryDate)));

    if (dated.length > 0) {
      return {
        error: `${dated.length} ${dated.length === 1 ? 'box' : 'boxes'} of this have an expiry date recorded. Turning expiry off would ignore those dates and treat past-date stock as usable — clear the dates on those boxes first if this really does not expire.`,
        values: snapshot(formData),
      };
    }
  }

  await db
    .update(products)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(products.id, id));

  refreshAll();
  finish(`/products/${id}`);
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

  /*
   * The photo is a file, not a row, so nothing cascades it. Deleting the
   * product used to leave the picture of its box on disk for good — invisible
   * to the app, and a photograph of somebody's medication outliving the record
   * it belonged to. Read the path before the row goes.
   */
  const photoRows = await db
    .select({ photoPath: products.photoPath })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  // Variants, substance links and shopping lines cascade from the schema.
  await db.delete(products).where(eq(products.id, id));

  const photo = photoRows[0]?.photoPath;
  if (photo) await deletePhoto(photo);

  refreshAll();
  finish('/products?archived=1');
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

  /*
   * The same predicate the product page uses to explain this refusal. They
   * were written separately and disagreed: the page said a product could not
   * be archived because of a course that had already finished.
   */
  const activeSchedules = await db
    .select({ id: doseSchedules.id })
    .from(doseSchedules)
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .where(and(eq(doseSchedules.productId, id), runningSchedulesOn(todayIso())))
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
  if (!(await productIsThere(productId))) return { error: PRODUCT_GONE };
  if (packSize === null || packSize <= 0) {
    return { error: 'Pack size must be a positive number.', values: snapshot(formData) };
  }
  /*
   * And a believable one. Only a lower bound was checked, and the pack size is
   * now what every money figure divides by — a mistyped pack of a billion made
   * each box's share of its own price round to nothing.
   */
  if (packSize > MAX_PACK_SIZE) {
    return {
      error: `${packSize} is too large for a pack. ${MAX_PACK_SIZE} is the most — check the number on the box.`,
      values: snapshot(formData),
    };
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
function parseBatchFields(
  formData: FormData,
  /*
   * A box arriving must hold something — an empty new box is a typo. A box
   * being corrected may hold nothing at all, because used-up and binned-empty
   * are ordinary states, and refusing them closed the only door to the rest of
   * the form. That is not theoretical: a złoty box with no exchange rate sits
   * outside every euro total until somebody adds the rate, and the one in this
   * cabinet that needs it most was long since used up — so the screen built to
   * repair it turned the save away over a quantity nobody was trying to change.
   */
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): { fields: BatchFields } | { error: string } {
  const quantity = parseUnits(String(formData.get('quantityRemaining') ?? ''));
  if (quantity === null || quantity < 0 || (!allowEmpty && quantity === 0)) {
    return {
      error: allowEmpty
        ? 'Quantity cannot be negative — 0, 30, 32.5 or 32,5 all work.'
        : 'Quantity must be a positive number — 30, 32.5 or 32,5 all work.',
    };
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

  /*
   * Stored raw before, so "soon" went straight into the column and came back
   * out of Statistics as a year: a bar labelled "soon" sitting between 2025 and
   * 2026, because the year is the first four characters of this string.
   */
  const purchaseDate = emptyToNull(String(formData.get('purchaseDate') ?? '').trim());
  if (purchaseDate !== null && !isIsoDate(purchaseDate)) {
    return { error: `Could not read "${purchaseDate}" as a purchase date. Pick it from the calendar.` };
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
      purchaseDate,
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

  /*
   * The pack has to exist, and its product must not be retired.
   *
   * The picker already leaves archived products out and the archive dialog
   * promises exactly that — but nothing enforced it, so the two ordinary ways
   * of arriving here with a stale pack both worked: a form left open while the
   * other phone archives, and scanning an old box, which resolves its barcode
   * without caring that the product was retired. Either one quietly put stock
   * back into a cupboard someone had just cleared out.
   *
   * Receiving a shopping line is deliberately not held to this: that order was
   * placed before the product was retired and the boxes are physically here, so
   * refusing would leave real stock unrecordable. The list marks those lines
   * as archived instead.
   */
  const packRows = await db
    .select({
      id: variants.id,
      packSize: variants.packSize,
      productName: products.name,
      archivedAt: products.archivedAt,
    })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .where(eq(variants.id, variantId))
    .limit(1);

  const pack = packRows[0];
  if (!pack) return fail('That pack no longer exists. Pick another one.');
  if (pack.archivedAt !== null) {
    return fail(
      `${pack.productName} is archived, so it takes no new boxes. Restore it first if this is going back in the cupboard.`,
    );
  }

  const parsed = parseBatchFields(formData);
  if ('error' in parsed) return fail(parsed.error);

  /*
   * Did this box arrive, or was it already in the drawer?
   *
   * The ledger has had both words since it was written — `opening` reads back
   * as "already in the cupboard when this started" — and nothing in the app
   * could ever write the second one. Every box entered by hand was recorded as
   * having arrived that day, which is exactly wrong for the case that matters
   * most: setting the app up against a cupboard that is already full. Sixteen
   * boxes would each have said "arrived" on the day they were typed in, with a
   * purchase date from two years earlier sitting beside it in the same history.
   */
  const alreadyHad = formData.get('alreadyHad') === 'on';

  /*
   * A box holding less than one full pack has been opened. Nobody says so on
   * the form, and nothing else was inferring it: `openedAt` was only ever set
   * by the stepper and by dosing, so a box typed in part-used stayed "sealed"
   * for the rest of its life.
   *
   * That is not cosmetic. The waste figures split on this exact field, and they
   * split the wrong way: a box entered at six of a sixty-pack and later binned
   * was reported as "bought and binned without being used" — the number the
   * page calls the one worth pushing down — when a part-used box is precisely
   * what that split exists to keep out of it.
   *
   * Compared against one pack rather than against what was ordered, so a
   * three-pack line that arrives two packes short is still two sealed packs.
   * Dated to the purchase rather than to today: "opened" on a box bought two
   * years ago did not happen this afternoon.
   */
  const partUsed = pack.packSize > 0 && parsed.fields.quantityRemaining < pack.packSize;
  const openedAt = partUsed ? (parsed.fields.purchaseDate ?? todayIso()) : null;

  /*
   * The box and the row saying where it came from go in together. A torn write
   * here would leave the ledger disagreeing with the shelf, which is the one
   * thing it exists not to do.
   */
  try {
    db.transaction((tx) => {
      const inserted = tx
        .insert(batches)
        .values({ variantId, ...parsed.fields, openedAt })
        .returning({ id: batches.id })
        .all();

      const batchId = inserted[0]?.id;
      if (batchId === undefined) throw new Error('insert produced no row');

      tx.insert(stockMovements)
        .values({
          batchId,
          delta: parsed.fields.quantityRemaining,
          reason: alreadyHad ? 'opening' : 'received',
        })
        .run();
    });
  } catch {
    // The throw rolls the transaction back; without catching it the user got a
    // crash page instead of the form telling them what happened.
    return fail('Could not add the box. Nothing was saved.');
  }

  refreshAll();
  finish('/');
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
    .select({
      variantId: shoppingItems.variantId,
      status: shoppingItems.status,
      packSize: variants.packSize,
      productName: products.name,
      productArchivedAt: products.archivedAt,
    })
    .from(shoppingItems)
    .innerJoin(variants, eq(shoppingItems.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(eq(shoppingItems.id, itemId))
    .limit(1);

  const item = itemRows[0];
  if (!item) return fail('That shopping item no longer exists.');
  if (item.status === 'in_stock') {
    return fail('This one is already in the cupboard — it was received before.');
  }
  if (item.status === 'not_received') {
    /*
     * Not "move it back into the flow first": there is no control that does
     * that. A settled line gets a Clear button and nothing else, and
     * `setShoppingStatus` refuses to walk one backwards. The receive page used
     * to give the same wrong instruction — this was its twin, one screen
     * deeper, and fixing only the page would have left the advice alive here.
     */
    return fail(
      'This line is marked as never arrived, and that cannot be walked back. Clear it on the shopping list and add the item again.',
    );
  }

  /*
   * The product must not be retired — the same rule `addBatch` enforces, for
   * the same reason, and it was missing here.
   *
   * Archiving refuses only while somebody is on a course; an open shopping line
   * does not stop it. So the ordinary sequence — retire something, then collect
   * the order that was already on its way — put a box of it straight back into
   * a cupboard it had just been retired from. The row on the shopping list even
   * says "it cannot be added to the list any more", while the Add-to-stock
   * button beside it did exactly that.
   *
   * Refused rather than warned: unlike binning, there is no hurry here. The
   * line keeps its place, and restoring the product makes it work.
   */
  if (item.productArchivedAt !== null) {
    return fail(
      `${item.productName} has been archived, so nothing more of it can enter the cupboard. Restore the product first, or clear this line if it is no longer wanted.`,
    );
  }

  const parsed = parseBatchFields(formData);
  if ('error' in parsed) return fail(parsed.error);

  /*
   * Less than one full pack means the pack is open — the same inference the
   * add-box path makes, for the same reason the waste figures need it. Against
   * one pack, not against what was ordered: a three-pack line that turns up two
   * packs short is still sealed packs.
   */
  const partUsed =
    item.packSize > 0 && parsed.fields.quantityRemaining < item.packSize;
  const openedAt = partUsed ? (parsed.fields.purchaseDate ?? todayIso()) : null;

  /*
   * Three writes that only make sense together: the box, the row saying it
   * arrived, and the shopping line that becomes it.
   */
  let batchId: number | undefined;
  try {
    batchId = db.transaction((tx) => {
      const inserted = tx
        .insert(batches)
        .values({ variantId: item.variantId, ...parsed.fields, openedAt })
        .returning({ id: batches.id })
        .all();

      const newId = inserted[0]?.id;
      if (newId === undefined) throw new Error('insert produced no row');

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
  } catch {
    // Rolled back — the line is untouched and no box was created.
    return fail('Could not add the box to stock. Nothing was saved.');
  }

  if (batchId === undefined) return fail('Could not add the box to stock.');

  refreshAll();
  finish('/shopping');
}

/**
 * Correct a box that was entered wrongly.
 *
 * Without this the only way to fix "100" typed instead of "10" was to tap the
 * minus button ninety times, which would also record ninety doses as consumed —
 * turning a typo into fabricated consumption history.
 */
/**
 * Where to land after correcting or deleting a box.
 *
 * The same edit screen is reached from Stock and from Expiring, and being
 * dumped on the other one afterwards means hunting for the row again. Only
 * these two names are honoured — a redirect target is never taken from the
 * client as a URL.
 */
function backTo(formData: FormData): string {
  return formData.get('from') === 'expiring' ? '/expiring' : '/';
}

export async function updateBatch(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  const fail = (error: string): FormResult => ({ error, values: snapshot(formData) });

  if (!Number.isInteger(id)) return fail('That box no longer exists.');

  // Empty allowed here: this is the screen that corrects a box, and a used-up
  // or binned-empty one still has a price, a date and a rate worth fixing.
  const parsed = parseBatchFields(formData, { allowEmpty: true });
  if ('error' in parsed) return fail(parsed.error);

  const before = await db
    .select({ quantityRemaining: batches.quantityRemaining, status: batches.status })
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

      /*
       * Correcting the quantity on a box that is already in the bin is a real
       * correction, but it does not put anything back in the cupboard — so the
       * closing row moves with it and the batch stays balanced at zero.
       */
      const closure = closureMovement(previous.status as LedgerBatchStatus, delta);
      if (closure) {
        tx.insert(stockMovements)
          .values({ batchId: id, delta: closure.delta, reason: closure.reason, note: 'still binned' })
          .run();
      }
    }
  });

  refreshAll();
  finish(backTo(formData));
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

  /*
   * And not a box that a shopping line became. That line is the record of a
   * purchase: the trip reads its spend through it, and the pointer is
   * `set null`, so deleting the box left the line still saying "in the
   * cupboard" while pointing at nothing, and quietly took the money off the
   * trip — €30.70 became €25.77 with nothing to show why.
   *
   * Same reasoning as the dose-event guard above. Binning is the way to say a
   * box is gone; deleting is only for one entered by mistake, and a box that
   * arrived against an order was not.
   */
  const lineRows = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(eq(shoppingItems.receivedBatchId, id))
    .limit(1);

  if (lineRows.length > 0) return;

  await db.delete(batches).where(eq(batches.id, id));
  refreshAll();
  finish(backTo(formData));
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

  /*
   * Compared against every shape of the same code, not just the canonical one.
   * The lookup that resolves a scan does the same — see `barcodeVariants` — and
   * an exact match here let one physical stripe be stored twice on one pack,
   * once as twelve digits and once as thirteen, which is precisely the "same
   * pack failing to match itself" this normalising exists to prevent.
   */
  const existing = await db
    .select({ variantId: variantBarcodes.variantId })
    .from(variantBarcodes)
    .where(inArray(variantBarcodes.code, barcodeVariants(code)))
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

/**
 * Teach the cabinet a code it has not seen, so the next scan just works.
 *
 * Shaped like `addBarcode` below, and it has to be. This used to return
 * `Promise<void>` and throw away whatever `attachBarcode` said, so pressing
 * "Attach to the selected pack" looked identical whether it worked, whether the
 * code already belonged to another pack, or whether the pack had been deleted
 * from the other phone: nothing happened on screen. The row really was written
 * — leaving the page and coming back showed it attached — which is the worst
 * version of this, because it teaches you the button is broken when the data is
 * fine.
 *
 * `refreshAll()` was already here and was never the problem: it re-renders
 * server components, and the summary that needed clearing is client state on
 * the add-stock form. Returning a result is what lets the caller clear it.
 */
export async function linkBarcode(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  const code = String(formData.get('code') ?? '').trim();

  if (!Number.isInteger(variantId)) return { error: 'Choose a pack first.' };
  if (!code) return { error: 'Nothing to attach — scan a barcode first.' };
  /*
   * The typed-in form checks this; the scanned one did not, and it is the more
   * likely of the two to be stale — the scan summary sits on screen with a pack
   * already chosen while somebody on the other phone tidies up. Attaching to a
   * pack that has gone threw a foreign key error at a camera.
   */
  if (!(await variantIsThere(variantId))) return { error: 'That pack is no longer there.' };

  const error = await attachBarcode(variantId, code, String(formData.get('barcodeType') ?? 'ean13'));
  if (error) return { error };

  refreshAll();
  return { error: null, ok: true };
}

/** Typed in by hand, for packs whose code was never scanned or photographed. */
export async function addBarcode(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const variantId = Number(formData.get('variantId'));
  const code = String(formData.get('code') ?? '').trim();

  if (!Number.isInteger(variantId)) return { error: 'Unknown pack.' };
  if (!(await variantIsThere(variantId))) return { error: 'That pack is no longer there.' };
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
  // Before writing the file, not after: saving one for a product that has gone
  // updates no row and leaves the image on disk with nothing pointing at it.
  if (!(await productIsThere(productId))) return { error: PRODUCT_GONE };

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
  if (!Number.isInteger(id)) return;

  /*
   * The amount is typed now, not fixed at one, so it arrives as text and has
   * to be parsed the way every other quantity in the app is — "0,5" comes off
   * a Polish phone keyboard and has to mean half a tablet, not nothing.
   *
   * Sign is handled separately because parseUnits deliberately refuses
   * negatives: a quantity is never below zero, only the direction is.
   */
  const raw = String(formData.get('delta') ?? '').trim();
  const takingOut = raw.startsWith('-');
  const magnitude = parseUnits(takingOut ? raw.slice(1) : raw);
  if (magnitude === null || magnitude <= 0 || !isTrackableQuantity(magnitude)) return;

  const delta = takingOut ? -magnitude : magnitude;

  const rows = await db
    .select({
      quantityRemaining: batches.quantityRemaining,
      status: batches.status,
      // The box cannot hold more than the pack it is.
      packSize: variants.packSize,
    })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .where(eq(batches.id, id))
    .limit(1);

  const current = rows[0];
  if (!current) return;

  /*
   * The stepper means "I have just taken one out of the cupboard", and you
   * cannot take one out of a box that is in the bin. The stock list only shows
   * boxes in stock, but a tab left open while the box was binned somewhere else
   * still has the buttons on screen — and pressing one used to move units on a
   * batch whose ledger is supposed to be closed at zero.
   *
   * Refused rather than balanced. Editing a binned box's quantity is a real
   * correction and gets a balancing row; pressing minus on one is a stale page.
   */
  if (current.status !== 'in_stock') return;

  /*
   * Computed here rather than in SQL because the ledger needs the delta that
   * was actually applied. Pressing minus on a box with 0.5 left takes half a
   * tablet, not a whole one, and recording the button press instead of the
   * movement would put the two out of step immediately.
   */
  /*
   * The ceiling is what this box has ever held, not its pack size — a line for
   * three packs arrives as one batch of three packs, and capping at one meant
   * ten taken out of it could never be put back.
   */
  const capacity = (await getBatchCapacities([id])).get(id) ?? current.packSize;
  const { next, applied } = applyAdjustment(current.quantityRemaining, delta, capacity);
  // Nothing moved: an empty box asked to give, or a full one asked to take back.
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

    /*
     * `taken`, not `adjust`: pressing minus on the stock list is somebody
     * swallowing a tablet, and most of this cabinet is never on a dose
     * schedule. Filing it as a correction reported the plasters, the
     * painkillers and the vitamins as never used at all.
     */
    tx.insert(stockMovements).values({ batchId: id, delta: applied, reason: 'taken' }).run();
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

  /*
   * A count is absolute where the stepper is relative — you are stating a fact,
   * not asking for a change — so it does not get clamped. But a fifty-tablet
   * pack still does not hold five hundred, and this was the one number-entry
   * screen in the app that never said so.
   *
   * The consequence was silent and self-concealing. A stray zero wrote an
   * `audit` movement of +478, and because a box's capacity is "the most it has
   * ever held", that movement redefined the capacity from 50 to 500 — so the
   * integrity check, whose whole job is catching a box holding more than it
   * can, looked at the box afterwards and agreed with it. The cupboard's value
   * moved and the stock list read "500 tablets" of a 50-tablet pack.
   *
   * Refused with the same reasoning the stepper gives for the same mistake,
   * and pointing at the same tool: correcting a quantity that was never right
   * is the edit form's job, not the count sheet's.
   */
  const capacities = await getBatchCapacities(counts.map((c) => c.batchId));
  const named = await db
    .select({ id: batches.id, name: products.name, unitName: products.unitName })
    .from(batches)
    .innerJoin(variants, eq(batches.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(
      inArray(
        batches.id,
        counts.map((c) => c.batchId),
      ),
    );
  const labels = new Map(named.map((row) => [row.id, row]));

  for (const { batchId, counted } of counts) {
    const capacity = capacities.get(batchId);
    if (capacity === undefined || capacity <= 0 || counted <= capacity) continue;

    const box = labels.get(batchId);
    const most = box ? formatQuantity(capacity, box.unitName) : `${capacity} units`;
    return fail(
      `${box?.name ?? 'That box'}: counted ${counted} in a box that has never held more than ${most}. If that really is what is in it, correct the box with the pencil — the count sheet records what is on the shelf, not what a box turned out to hold.`,
    );
  }

  let changed = 0;
  let netUnits = 0;

  db.transaction((tx) => {
    /*
     * Read inside the transaction, not before it. Counting a cupboard takes
     * long enough that a box can be binned from the other phone while the
     * numbers are being typed, and a guard checking a status fetched minutes
     * earlier would happily resurrect it.
     */
    const current = tx
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
      )
      .all();

    const byId = new Map(current.map((row) => [row.id, row]));

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
  finish(
    `/count?counted=${counts.length}&changed=${changed}` +
      `&net=${Math.round(netUnits * 100) / 100}`,
  );
}

/**
 * Record that one product could stand in for another.
 *
 * Stored once, read from both ends. The pair is checked in both directions
 * before inserting, because A-instead-of-B and B-instead-of-A are the same
 * fact, and holding both would show the product twice on one page and let the
 * two rows disagree about the relation.
 */
export async function addAlternative(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const productId = Number(formData.get('productId'));
  const alternativeId = Number(formData.get('alternativeId'));
  const relation = String(formData.get('relation') ?? '');
  const note = emptyToNull(String(formData.get('note') ?? '').trim());

  if (!Number.isInteger(productId)) return { error: 'Unknown product.' };
  if (!Number.isInteger(alternativeId) || alternativeId <= 0) {
    return { error: 'Pick something for it to stand in for.', values: snapshot(formData) };
  }
  if (alternativeId === productId) {
    return { error: 'A product cannot be an alternative to itself.', values: snapshot(formData) };
  }
  if (!ALTERNATIVE_RELATIONS.some((r) => r === relation)) {
    return { error: 'Pick how the two are related.', values: snapshot(formData) };
  }
  if (!(await productIsThere(productId))) return { error: PRODUCT_GONE };
  if (!(await productIsThere(alternativeId))) {
    return { error: 'That alternative is no longer there.', values: snapshot(formData) };
  }

  const existing = await db
    .select({ productId: productAlternatives.productId })
    .from(productAlternatives)
    .where(
      or(
        and(
          eq(productAlternatives.productId, productId),
          eq(productAlternatives.alternativeProductId, alternativeId),
        ),
        and(
          eq(productAlternatives.productId, alternativeId),
          eq(productAlternatives.alternativeProductId, productId),
        ),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { error: 'These two are already linked.', values: snapshot(formData) };
  }

  await db.insert(productAlternatives).values({
    productId,
    alternativeProductId: alternativeId,
    relation: relation as (typeof ALTERNATIVE_RELATIONS)[number],
    note,
  });

  refreshAll();
  return { error: null, ok: true };
}

/** Unlinks whichever way round the pair happens to be stored. */
export async function removeAlternative(formData: FormData): Promise<void> {
  const productId = Number(formData.get('productId'));
  const alternativeId = Number(formData.get('alternativeId'));
  if (!Number.isInteger(productId) || !Number.isInteger(alternativeId)) return;

  await db
    .delete(productAlternatives)
    .where(
      or(
        and(
          eq(productAlternatives.productId, productId),
          eq(productAlternatives.alternativeProductId, alternativeId),
        ),
        and(
          eq(productAlternatives.productId, alternativeId),
          eq(productAlternatives.alternativeProductId, productId),
        ),
      ),
    );

  refreshAll();
}

/* ------------------------------------------------------------------ */
/* The travel kit                                                      */
/* ------------------------------------------------------------------ */

/**
 * Put something in the bag.
 *
 * Idempotent on (trip, product): the suggestion list and the kit are on one
 * screen, and tapping "add" twice before it re-renders should not produce two
 * lines for the same thing.
 */
export async function addKitItem(formData: FormData): Promise<void> {
  const tripId = await parseTripId(formData.get('tripId'));
  const productId = Number(formData.get('productId'));
  if (tripId === null || tripId === UNUSABLE_TRIP || !Number.isInteger(productId)) return;

  const units = parseUnits(String(formData.get('units') ?? '')) ?? 0;
  if (units < 0 || (units > 0 && !isTrackableQuantity(units))) return;

  /*
   * Both ends checked before writing, because both were reachable and neither
   * failed usefully: a packing line against a restock trip was accepted and
   * then invisible — the kit page sends restocks away, so the row existed and
   * nothing could ever show or remove it — and an unknown product broke the
   * foreign key and put a crash page in front of the list.
   */
  const trip = await db
    .select({ kind: trips.kind })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (trip[0]?.kind !== 'travel') return;

  const product = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (product.length === 0) return;

  await db
    .insert(travelKitItems)
    .values({ tripId, productId, units })
    .onConflictDoNothing();

  refreshAll();
}

export async function removeKitItem(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db.delete(travelKitItems).where(eq(travelKitItems.id, id));
  refreshAll();
}

/** Tick it off, or untick it. Packing a bag is not a one-way process. */
export async function toggleKitPacked(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db
    .update(travelKitItems)
    .set({
      packed: sql`case when ${travelKitItems.packed} then 0 else 1 end`,
      updatedAt: new Date(),
    })
    .where(eq(travelKitItems.id, id));

  refreshAll();
}

/** Change how much of something to take. */
export async function setKitUnits(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const units = parseUnits(String(formData.get('units') ?? ''));
  if (!Number.isInteger(id) || units === null || units < 0) return;
  if (units > 0 && !isTrackableQuantity(units)) return;

  await db
    .update(travelKitItems)
    .set({ units, updatedAt: new Date() })
    .where(eq(travelKitItems.id, id));

  refreshAll();
}

/**
 * Mark a product as one that always goes in the bag.
 *
 * On the product rather than on any trip, because it is a standing decision:
 * plasters belong in a suitcase in general, not on the trip to Kraków.
 */
export async function setPackForTravel(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  await db
    .update(products)
    .set({
      packForTravel: sql`case when ${products.packForTravel} then 0 else 1 end`,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  refreshAll();
}

export async function setBatchStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!BATCH_STATUSES.some((s) => s === status)) return;
  /*
   * "Used up" is derived from the quantity reaching zero, never chosen. Setting
   * it by hand on a box that still holds something would close the box out of
   * the ledger with a `binned` row — reporting units that were never thrown
   * away as waste.
   */
  if (status === 'consumed') return;

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

/** Packs on a single shopping line. Generous for a household, still a number. */
const MAX_PACKS_PER_LINE = 999;

export async function addShoppingItem(_prev: FormResult, formData: FormData): Promise<FormResult> {
  /*
   * Empty is "nothing chosen", not "pack number zero". `Number('')` is 0, which
   * is a perfectly good integer, so a form submitted without a choice sailed
   * past the check below and came back with "that pack size no longer exists" —
   * about a pack the person had never named. The picker now opens on a blank
   * row, so this is a reachable state rather than a theoretical one.
   */
  const variantRaw = String(formData.get('variantId') ?? '').trim();
  if (variantRaw === '') {
    return { error: 'Pick which pack to buy.', values: snapshot(formData) };
  }

  const variantId = Number(variantRaw);
  const quantityPacks = Number(formData.get('quantityPacks') ?? 1);
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());
  const tripId = await parseTripId(formData.get('tripId'), 'restock');

  if (!Number.isInteger(variantId)) {
    return { error: 'Pick which pack to buy.', values: snapshot(formData) };
  }
  if (!Number.isInteger(quantityPacks) || quantityPacks < 1) {
    return {
      error: 'Number of packs must be a whole number, at least 1.',
      values: snapshot(formData),
    };
  }
  /*
   * Only a lower bound was checked. A thousand million packs went on the list
   * happily and turned the trip's estimate into €5,780,000,033.87, which is
   * not a number anyone can read past.
   */
  if (quantityPacks > MAX_PACKS_PER_LINE) {
    return {
      error: `${quantityPacks} packs on one line is more than this is meant for — ${MAX_PACKS_PER_LINE} is the most. Add a second line if you really need more.`,
      values: snapshot(formData),
    };
  }

  /*
   * The pack has to still be there. `variant_id` is a real foreign key, so a
   * form left open while the other phone deletes that pack size threw
   * SQLITE_CONSTRAINT_FOREIGNKEY and put a crash page in front of the list.
   * An archived product is refused for the same reason it cannot take a new
   * box: buying more of something you have retired is not a thing to plan.
   */
  const variantRows = await db
    .select({ id: variants.id, productName: products.name, archivedAt: products.archivedAt })
    .from(variants)
    .innerJoin(products, eq(variants.productId, products.id))
    .where(eq(variants.id, variantId))
    .limit(1);

  const variant = variantRows[0];
  if (!variant) {
    return { error: 'That pack size no longer exists. Pick another one.', values: snapshot(formData) };
  }
  if (variant.archivedAt !== null) {
    return {
      error: `${variant.productName} is archived. Restore it first if you mean to buy more.`,
      values: snapshot(formData),
    };
  }

  /*
   * Said, not swallowed. A stale form naming a trip that has since been deleted
   * used to add the line with no trip at all — off the restock it was chosen
   * for, out of its estimate, and silently. The pack-no-longer-exists case one
   * block up has always been reported; this is the same kind of staleness and
   * gets the same treatment.
   */
  if (tripId === UNUSABLE_TRIP) {
    return {
      error: 'That trip is no longer there. Pick another one, or "No trip".',
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
async function parseTripId(
  raw: FormDataEntryValue | null,
  kind?: (typeof TRIP_KINDS)[number],
): Promise<number | null | typeof UNUSABLE_TRIP> {
  const value = String(raw ?? '').trim();
  if (value === '') return null;

  const id = Number(value);
  if (!Number.isInteger(id)) return UNUSABLE_TRIP;

  /*
   * Optionally the right sort of trip, too. The picker only ever offers planned
   * restocks for a shopping line, but nothing enforced it, so a line could end
   * up on a holiday — where the trip page has no shopping section at all and
   * would never show it again.
   */
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(kind === undefined ? eq(trips.id, id) : and(eq(trips.id, id), eq(trips.kind, kind)))
    .limit(1);
  return rows[0]?.id ?? UNUSABLE_TRIP;
}

/**
 * A trip was named, and it cannot be used: deleted since the form was drawn, or
 * the wrong sort of trip for what is being written. Distinct from null, which
 * means "no trip", a deliberate and ordinary answer.
 */
const UNUSABLE_TRIP = Symbol('unusable trip');

/** Move a line to another trip, or off trips entirely. */
export async function setShoppingTrip(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const tripId = await parseTripId(formData.get('tripId'), 'restock');
  /*
   * Moving a line to a trip that has gone is not the same as taking it off
   * trips, and doing the second when the first was asked for is how a line
   * disappears from the restock it was meant for. Leave it where it is; the
   * list will be showing the truth again by the time this returns.
   */
  if (tripId === UNUSABLE_TRIP) return;

  await db
    .update(shoppingItems)
    .set({ tripId, updatedAt: new Date() })
    .where(eq(shoppingItems.id, id));
  refreshAll();
}

export async function setShoppingStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isInteger(id)) return;
  if (!SHOPPING_STATUSES.some((s) => s === status)) return;
  /*
   * "In the cupboard" is not a status anyone gets to set: it is what
   * `receiveShoppingItem` writes in the same transaction that creates the box.
   * Setting it here marked a line as bought with no box behind it — and since
   * it is also terminal, the line could not be walked back afterwards, so a
   * list that said something false could only be cleared, never corrected.
   */
  if (status === 'in_stock') return;

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

/** Long enough for any name anyone actually has. */
const MAX_PERSON_NAME = 80;

export async function createMember(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const name = String(formData.get('name') ?? '').trim();
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());
  if (!name) return { error: 'Enter a name.', values: snapshot(formData) };
  /* A name, not a paragraph — it goes in a heading beside a dose board. */
  if (name.length > MAX_PERSON_NAME) {
    return { error: `That name is longer than ${MAX_PERSON_NAME} characters.`, values: snapshot(formData) };
  }

  const inserted = await db
    .insert(householdMembers)
    .values({ name, notes })
    .returning({ id: householdMembers.id });

  const id = inserted[0]?.id;
  if (id === undefined) return { error: 'Could not save that.', values: snapshot(formData) };

  refreshAll();
  finish(`/household/${id}`);
}

export async function updateMember(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  const name = String(formData.get('name') ?? '').trim();
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());

  if (!Number.isInteger(id)) return { error: 'Unknown person.' };
  if (!name) return { error: 'Enter a name.', values: snapshot(formData) };
  if (name.length > MAX_PERSON_NAME) {
    return { error: `That name is longer than ${MAX_PERSON_NAME} characters.`, values: snapshot(formData) };
  }

  /*
   * Saving a person who has since been deleted updated nothing and then sent
   * you to their page, which 404s — the same dead end product editing had.
   */
  const present = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.id, id))
    .limit(1);
  if (present.length === 0) {
    return { error: 'That person is no longer on the list.', values: snapshot(formData) };
  }

  await db
    .update(householdMembers)
    .set({ name, notes, updatedAt: new Date() })
    .where(eq(householdMembers.id, id));

  refreshAll();
  finish(`/household/${id}`);
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
  finish('/household?archived=1');
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
  /*
   * Capped at hourly. The lower bound was there from the start; the upper one
   * was not, and the board renders a pill per occurrence per day — a typed 9999
   * produced 38 MB of HTML and a page no phone could open. Nothing is taken
   * more than a few times a day, so 24 is already far past generous.
   */
  if (!Number.isInteger(timesPerDay) || timesPerDay < 1 || timesPerDay > 24) {
    return fail('Times per day must be a whole number from 1 to 24.');
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
  /*
   * Real dates, not merely non-empty strings.
   *
   * A start date of "soon" was stored happily and then broke three pages with
   * `Not an ISO date` — the dose board, the trip page and the audit worksheet
   * all walk every schedule and do arithmetic on these. One row from one stale
   * form took out the screen this app exists for, and the only way back was
   * deleting the schedule.
   */
  if (!isIsoDate(startDate)) return fail('That start date did not come through as a date. Pick it again.');
  if (endDate !== null && !isIsoDate(endDate)) {
    return fail('That end date did not come through as a date. Pick it again.');
  }
  if (endDate && endDate < startDate) return fail('The end date is before the start date.');

  /*
   * Both ends must exist, and the product must still be kept. Neither was
   * checked: an unknown id broke the foreign key and returned a crash page
   * instead of a form error, and nothing stopped a schedule being started
   * against something already archived — which would then block un-archiving
   * it and show as a contradiction on the board.
   */
  const member = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.id, memberId), isNull(householdMembers.archivedAt)))
    .limit(1);
  if (member.length === 0) return fail('That person is no longer on the list.');

  const scheduled = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.archivedAt)))
    .limit(1);
  if (scheduled.length === 0) {
    return fail('That product is archived or no longer exists — restore it first.');
  }

  /*
   * The identical schedule twice is a double tap, not a plan.
   *
   * Two schedules for one product are legitimate and sometimes the only way to
   * say what is actually happening: one tablet in the morning and two at night
   * cannot be written as a single "twice a day", so the app adds them up. But
   * the *same* dose at the same frequency, again, is a resubmitted form — and
   * it does real damage quietly, because the rates are summed. A duplicate of
   * two-a-day turned a cupboard with four days left into one with two, and the
   * board showed two cards nothing could tell apart.
   */
  const identical = await db
    .select({ id: doseSchedules.id })
    .from(doseSchedules)
    .where(
      and(
        eq(doseSchedules.memberId, memberId),
        eq(doseSchedules.productId, productId),
        eq(doseSchedules.doseUnits, doseUnits),
        eq(doseSchedules.timesPerDay, timesPerDay),
        eq(doseSchedules.intervalDays, intervalDays),
        isNull(doseSchedules.archivedAt),
      ),
    )
    .limit(1);

  if (identical.length > 0) {
    return fail(
      'That exact course is already running for this person. Change the dose or how often it is taken if this is meant to be a second one.',
    );
  }

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
  finish(`/household/${memberId}`);
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

  /*
   * Already confirmed? Then this is the same tap arriving twice.
   *
   * A pill that has been taken re-renders as "tap to undo", but on a slow
   * phone the second tap lands before that happens — and each one used to
   * deduct a full dose. Two taps took three tablets out of the cupboard for
   * one dose actually swallowed.
   *
   * Not a unique index, because FEFO legitimately splits one dose across two
   * boxes and writes an event per box. The occurrence is what must be unique,
   * not the row.
   */
  const alreadyTaken = await db
    .select({ id: doseEvents.id })
    .from(doseEvents)
    .where(
      and(
        eq(doseEvents.scheduleId, scheduleId),
        eq(doseEvents.date, date),
        eq(doseEvents.occurrence, occurrence),
      ),
    )
    .limit(1);

  if (alreadyTaken.length > 0) return;

  const scheduleRows = await db
    .select({
      doseUnits: doseSchedules.doseUnits,
      timesPerDay: doseSchedules.timesPerDay,
      intervalDays: doseSchedules.intervalDays,
      startDate: doseSchedules.startDate,
      endDate: doseSchedules.endDate,
      productId: doseSchedules.productId,
      hasExpiry: products.hasExpiry,
      expiryGraceDays: products.expiryGraceDays,
    })
    .from(doseSchedules)
    .innerJoin(products, eq(doseSchedules.productId, products.id))
    /*
     * `runningSchedulesOn` is the same predicate the board itself is built
     * from, so a schedule the board will not show cannot be confirmed against
     * either. Stopping a course or archiving the person who takes it used to
     * leave the old page working: each tap took a real tablet out of the
     * cupboard and wrote it to an event no screen renders, which also means
     * nobody could undo it. The member join is what that predicate needs.
     */
    .innerJoin(householdMembers, eq(doseSchedules.memberId, householdMembers.id))
    .where(and(eq(doseSchedules.id, scheduleId), runningSchedulesOn(date)))
    .limit(1);
  const schedule = scheduleRows[0];
  if (!schedule) return;

  /*
   * The occurrence and the day both have to be ones this schedule actually has.
   *
   * Neither was checked, and the board only ever renders valid ones — but a
   * page left open across an edit does not. Dropping a schedule from three
   * times a day to one leaves the old page offering occurrences two and three,
   * and each tap deducted a real tablet into an event no screen would ever show
   * again, so it could not even be undone.
   */
  if (occurrence < 1 || occurrence > schedule.timesPerDay) return;
  if (!isScheduleActiveOn(schedule, date)) return;
  /*
   * The board only ever draws today and the days behind it, so nothing it
   * renders can land here with a future date at all. The extra day of slack is
   * for the phone left open overnight: the form was drawn before midnight and
   * submitted after it, and the dose it describes is real. Anything past that
   * is a crafted request.
   */
  if (date > addDays(todayIso(), 1)) return;

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
    .select({
      id: doseEvents.id,
      batchId: doseEvents.batchId,
      quantity: doseEvents.quantity,
      batchStatus: batches.status,
    })
    .from(doseEvents)
    .innerJoin(batches, eq(doseEvents.batchId, batches.id))
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

      /*
       * A box auto-retired at zero comes back to `in_stock` on the row above,
       * so its units genuinely return and nothing needs balancing. One that
       * was deliberately binned stays binned — the dose is still undone, but
       * the tablet is in the bin, not the cupboard.
       */
      const closure = closureMovement(
        event.batchStatus === 'consumed' ? 'in_stock' : (event.batchStatus as LedgerBatchStatus),
        event.quantity,
      );
      if (closure) {
        tx.insert(stockMovements)
          .values({
            batchId: event.batchId,
            delta: closure.delta,
            reason: closure.reason,
            note: 'still binned',
          })
          .run();
      }

      tx.delete(doseEvents).where(eq(doseEvents.id, event.id)).run();
    });
  }

  refreshAll();
}

/* ------------------------------------------------------------------ */

export async function logout(): Promise<void> {
  await endSession();
  finish('/login');
}

/**
 * Sign every device out at once.
 *
 * `destroyAllSessions` was written for the case it names — a phone left
 * somewhere — and then nothing ever called it. The capability existed in the
 * code and not in the app, which is the same as not existing: recovering a lost
 * phone meant opening the database by hand.
 *
 * Deliberately not beside the everyday logout in the header. It is the thing
 * you want twice in a lifetime and never by accident.
 */
export async function logoutEverywhere(): Promise<void> {
  await destroyAllSessions();
  finish('/login');
}

/**
 * What a rename came back with.
 *
 * `merge` is set when the new name is already taken: nothing has happened yet,
 * and the form asks before folding the two together, because that step cannot
 * be undone.
 */
export interface RenameResult {
  error: string | null;
  merge: { name: string; products: number } | null;
  ok?: boolean;
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
): Promise<
  | {
      fields: {
        label: string;
        kind: (typeof TRIP_KINDS)[number];
        collectionDate: string;
        orderByDate: string | null;
        returnDate: string | null;
        notes: string | null;
      };
    }
  | { error: string }
> {
  const label = String(formData.get('label') ?? '').trim();
  const collectionDate = String(formData.get('collectionDate') ?? '').trim();
  const notes = emptyToNull(String(formData.get('notes') ?? '').trim());
  const kind = TRIP_KINDS.find((k) => k === String(formData.get('kind') ?? '')) ?? 'restock';

  if (!label) return { error: 'Give the trip a name — "October 2026" is enough.' };

  /*
   * The date means different things for the two kinds, which is why the label
   * on the form changes with it: a restock is collected on that day, a holiday
   * begins on it.
   */
  if (!collectionDate) {
    return {
      error: kind === 'travel' ? 'When do you leave?' : 'When is everything being collected?',
    };
  }

  /*
   * A real date, not merely a non-empty string. The field is a date picker, so
   * this only shows up on a stale or hand-made submit — but everything below
   * does arithmetic on it, and "tomorrow" threw `Not an ISO date` out of the
   * date helpers, which reaches the browser as a crash page rather than as the
   * one-line correction the rest of this form gives.
   */
  if (!isIsoDate(collectionDate)) {
    return { error: 'That date did not come through as a date. Pick it again.' };
  }

  if (kind === 'travel') {
    const returnDate = String(formData.get('returnDate') ?? '').trim();
    if (!returnDate) {
      return {
        error: 'When do you come back? Without that there is no way to work out how much to pack.',
      };
    }
    if (!isIsoDate(returnDate)) {
      return { error: 'That return date did not come through as a date. Pick it again.' };
    }
    if (returnDate < collectionDate) {
      return { error: 'The return date is before you leave.' };
    }

    // A holiday has nothing to order ahead, so it carries no deadline.
    return { fields: { label, kind, collectionDate, orderByDate: null, returnDate, notes } };
  }

  const orderByRaw = String(formData.get('orderByDate') ?? '').trim();
  if (orderByRaw && !isIsoDate(orderByRaw)) {
    return { error: 'That order deadline did not come through as a date. Pick it again.' };
  }
  const previous = await getPreviousCollectionDate(collectionDate, excludeTripId);
  const orderByDate = orderByRaw || defaultOrderByDate(collectionDate, previous);

  if (orderByDate > collectionDate) {
    return { error: 'The order deadline is after the collection date — orders would arrive too late.' };
  }

  return { fields: { label, kind, collectionDate, orderByDate, returnDate: null, notes } };
}

export async function createTrip(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const parsed = await parseTripFields(formData);
  if ('error' in parsed) return { error: parsed.error, values: snapshot(formData) };

  const inserted = await db.insert(trips).values(parsed.fields).returning({ id: trips.id });
  const id = inserted[0]?.id;
  if (id === undefined) return { error: 'Could not save the trip.', values: snapshot(formData) };

  refreshAll();
  finish(`/trips/${id}`);
}

export async function updateTrip(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return { error: 'Unknown trip.' };

  const parsed = await parseTripFields(formData, id);
  if ('error' in parsed) return { error: parsed.error, values: snapshot(formData) };

  /*
   * A holiday has no shopping section, so turning a restock into one hides
   * every line attached to it: still on the shopping list, but orphaned from
   * the only page that shows a trip's list, its costs and its audit. Say what
   * is in the way instead of quietly stranding them.
   */
  if (parsed.fields.kind === 'travel') {
    const attached = await db
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(eq(shoppingItems.tripId, id));

    if (attached.length > 0) {
      return {
        error: `This trip has ${attached.length} shopping ${attached.length === 1 ? 'line' : 'lines'} on it, and a holiday cannot carry a shopping list. Move them to another restock first, or take them off the trip.`,
        values: snapshot(formData),
      };
    }
  }

  /*
   * And the same the other way round. A restock has no packing list, so turning
   * a holiday into one leaves its bag behind: rows still pointing at the trip,
   * on a page with nowhere to show them. Kit items are deleted with their trip,
   * never orphaned, and this keeps that true.
   */
  if (parsed.fields.kind === 'restock') {
    const packed = await db
      .select({ id: travelKitItems.id })
      .from(travelKitItems)
      .where(eq(travelKitItems.tripId, id));

    if (packed.length > 0) {
      return {
        error: `This trip has ${packed.length} ${packed.length === 1 ? 'thing' : 'things'} on its packing list, and a restock does not have one. Clear the list first if this really is a restock.`,
        values: snapshot(formData),
      };
    }
  }

  await db
    .update(trips)
    .set({ ...parsed.fields, updatedAt: new Date() })
    .where(eq(trips.id, id));

  refreshAll();
  finish(`/trips/${id}`);
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
  finish(`/trips/${id}`);
}

/**
 * A mistyped trip can simply go. One that boxes actually arrived on cannot.
 *
 * The old reasoning here was that a trip "carries no history of its own",
 * because the boxes keep their own dates and prices and the shopping lines are
 * only unassigned. Half true, and the missing half matters: a box records no
 * trip at all, so the line's `trip_id` is the only thing that says which
 * restock it came on. `set null` erases that. Deleting October 2024 left its
 * six boxes sitting in the cupboard with their prices intact and no way to
 * learn where they came from — the price history stopped saying "October 2024"
 * beside them, and what that restock cost stopped being answerable.
 *
 * So: refused, in the way products and people with history are refused. The
 * way out is on the same page — unassign those lines one by one, which is a
 * deliberate act per box rather than a single tap over the lot.
 */
export async function deleteTrip(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const received = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.tripId, id), isNotNull(shoppingItems.receivedBatchId)))
    .limit(1);

  // The page offers an explanation instead of the button in this case; this is
  // the backstop for a page left open while the last box was received.
  if (received.length > 0) return;

  await db.delete(trips).where(eq(trips.id, id));
  refreshAll();
  finish('/trips');
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
  /*
   * Through parseTripId, which checks the trip still exists. A worksheet is
   * open for a while — long enough for the trip to be deleted on the other
   * phone — and inserting a shopping line against a trip that has gone failed
   * on the foreign key and put a crash page in front of a completed audit.
   */
  const tripId = await parseTripId(formData.get('tripId'));
  if (tripId === null || tripId === UNUSABLE_TRIP) redirect('/trips');

  /*
   * And it has to be a restock. This writes shopping lines, and a holiday with
   * a shopping list is a list nothing will ever collect — the same reason the
   * packing list refuses to attach itself to a restock.
   */
  const trip = await db
    .select({ kind: trips.kind, status: trips.status })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (trip[0]?.kind !== 'restock') redirect(`/trips/${tripId}`);
  /*
   * And a trip still ahead of us. The shopping form only ever offers planned
   * restocks for exactly this reason, but the worksheet checked the kind and
   * not the status, so a trip already collected could still be added to —
   * lines nobody will ever pick up, on the one page that no longer shows what
   * is running out.
   */
  if (trip[0].status !== 'planned') redirect(`/trips/${tripId}`);

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
    // The same ceiling the shopping form applies. This writes the same rows.
    if (packs > MAX_PACKS_PER_LINE) continue;

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
  finish(`/trips/${tripId}`);
}
