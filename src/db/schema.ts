import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * The four-layer model:
 *
 *   Substance  -> the active ingredient            (Ibuprofen)
 *   Product    -> branded concept + dose form      (Ibuprom 200 mg tablets)
 *   Variant    -> a purchasable pack / SKU         (box of 60)
 *   Batch      -> a physical box in the house      (bought 2026-03, exp 2028-11, 14 left)
 *
 * Rules that must not be broken:
 *   - Expiry and price live on the BATCH. Two boxes of the same thing differ.
 *   - Quantities are BASE UNITS (tablets / ml / sachets), never packs.
 *   - Money is stored as INTEGER MINOR UNITS (grosze / cents). Never floats.
 *   - Nothing is hard-deleted; rows are archived or given a terminal status.
 */

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

/* ------------------------------------------------------------------ */
/* Substances                                                          */
/* ------------------------------------------------------------------ */

export const substances = sqliteTable(
  'substances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** International non-proprietary name, e.g. "Ibuprofen". */
    name: text('name').notNull(),
    /** Polish rendering where it differs, e.g. "Paracetamol" vs "Acetaminophen". */
    namePl: text('name_pl'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [uniqueIndex('substances_name_unique').on(t.name)],
);

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export const DOSE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'drops',
  'sachet',
  'spray',
  'cream',
  'ointment',
  'suppository',
  'patch',
  'injection',
  'device',
  'other',
] as const;

/** What one base unit is called. Drives every quantity display in the app. */
export const UNIT_NAMES = [
  'tablet',
  'capsule',
  'ml',
  'g',
  'sachet',
  'drop',
  /** Single-use ampoule, e.g. katarek saline 10 x 5 ml. */
  'ampoule',
  'piece',
  'dose',
] as const;

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    /**
     * The name as printed on the box, whatever language that happens to be.
     * Most stock is Polish, but Solgar, NeilMed and Mollelast have no Polish
     * name at all — a brand is a brand, and language belongs to the packaging
     * rather than to the product.
     */
    name: text('name').notNull(),
    /** The other-language or local-equivalent name, where one exists. Search matches both. */
    nameAlt: text('name_alt'),

    form: text('form', { enum: DOSE_FORMS }).notNull().default('tablet'),
    /** Free text because combination products exist: "200 mg", "500 mg + 65 mg". */
    strength: text('strength'),
    unitName: text('unit_name', { enum: UNIT_NAMES }).notNull().default('tablet'),

    manufacturer: text('manufacturer'),
    isPrescription: integer('is_prescription', { mode: 'boolean' }).notNull().default(false),

    /**
     * False for plasters, thermometers, saline and similar. When false the product
     * never appears in the expiry view and its batches may have a null expiry.
     */
    hasExpiry: integer('has_expiry', { mode: 'boolean' }).notNull().default(true),

    /**
     * How many days past the printed date this product is still considered
     * usable for dosing. Per product, not global, and 0 by default — because
     * an expiry date means different things for different things. Paracetamol
     * tablets a month past date are fine; sterile saline, eye drops, an
     * adrenaline pen or an antibiotic are not, and one shared constant could
     * not tell them apart.
     *
     * Affects only what FEFO is willing to allocate. The expiry view still
     * reports the box as expired, because it factually is.
     */
    expiryGraceDays: integer('expiry_grace_days').notNull().default(0),

    /** Photo of the box front, relative to the uploads directory. */
    photoPath: text('photo_path'),
    notes: text('notes'),

    /** Soft delete. Never hard-delete; history depends on these rows surviving. */
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [
    index('products_name_idx').on(t.name),
    index('products_name_alt_idx').on(t.nameAlt),
    index('products_archived_idx').on(t.archivedAt),
  ],
);

/** Which active substances a product contains, and how much per base unit. */
export const productSubstances = sqliteTable(
  'product_substances',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    substanceId: integer('substance_id')
      .notNull()
      .references(() => substances.id, { onDelete: 'cascade' }),
    /** Milligrams per base unit, where it can be expressed numerically. */
    amountMg: real('amount_mg'),
    /** Fallback for things mg cannot express, e.g. "10 000 IU". */
    amountText: text('amount_text'),
  },
  (t) => [primaryKey({ columns: [t.productId, t.substanceId] })],
);

export const ALTERNATIVE_RELATIONS = [
  /** Identical active substance and strength. */
  'same_substance',
  /** What you can buy in an Irish pharmacy instead. */
  'local_equivalent',
  /** Different molecule, comparable effect. */
  'substitute',
] as const;

/**
 * "We're out of Ibuprom — what do we buy in Tesco instead?"
 * Directional: A -> B does not imply B -> A.
 */
export const productAlternatives = sqliteTable(
  'product_alternatives',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    alternativeProductId: integer('alternative_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    relation: text('relation', { enum: ALTERNATIVE_RELATIONS }).notNull(),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.productId, t.alternativeProductId] })],
);

/* ------------------------------------------------------------------ */
/* Symptoms — "what do we have for a sore throat?"                     */
/* ------------------------------------------------------------------ */

export const symptoms = sqliteTable(
  'symptoms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * Optional. The interface is English-only, so requiring a Polish name for
     * every tag would be friction — but keeping the column means searching
     * "gardło" can still find the sore-throat shelf.
     */
    namePl: text('name_pl'),
    nameEn: text('name_en').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('symptoms_name_en_unique').on(t.nameEn)],
);

export const productSymptoms = sqliteTable(
  'product_symptoms',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    symptomId: integer('symptom_id')
      .notNull()
      .references(() => symptoms.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.symptomId] })],
);

/* ------------------------------------------------------------------ */
/* Variants — purchasable packs                                        */
/* ------------------------------------------------------------------ */

export const variants = sqliteTable(
  'variants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    /** Base units in one sealed pack: 60 tablets, 100 ml, 20 sachets. */
    packSize: real('pack_size').notNull(),
    /** How it reads on the shelf: "60 tabl.", "100 ml". Display only. */
    packLabel: text('pack_label'),

    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [index('variants_product_idx').on(t.productId)],
);

export const BARCODE_TYPES = [
  /** Plain retail barcode. Identification only — carries no expiry. */
  'ean13',
  /** 12-digit US/retail code, as on Solgar and NeilMed. A UPC-A is an EAN-13 with a leading zero. */
  'upc_a',
  /** GS1 DataMatrix on EU prescription packs: GTIN + expiry + batch + serial. */
  'gs1_datamatrix',
  'other',
] as const;

/** A variant may carry several codes — regional repackaging is common. */
export const variantBarcodes = sqliteTable(
  'variant_barcodes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    /** For GS1 codes this is the GTIN alone, not the whole encoded payload. */
    code: text('code').notNull(),
    type: text('type', { enum: BARCODE_TYPES }).notNull().default('ean13'),
    ...timestamps,
  },
  (t) => [uniqueIndex('variant_barcodes_code_unique').on(t.code)],
);

/* ------------------------------------------------------------------ */
/* Batches — actual boxes in the house                                 */
/* ------------------------------------------------------------------ */

export const BATCH_STATUSES = [
  'in_stock',
  /** Used up normally. */
  'consumed',
  /** Passed its expiry date and was thrown out. */
  'expired',
  /** Thrown out, given away, or lent and not coming back. */
  'discarded',
] as const;

export const EXPIRY_PRECISIONS = ['day', 'month'] as const;

export const CURRENCIES = ['PLN', 'EUR'] as const;

export const batches = sqliteTable(
  'batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'restrict' }),

    /** Base units left. Fractional because half tablets and part-used bottles are real. */
    quantityRemaining: real('quantity_remaining').notNull(),

    /**
     * ISO date. Always a full date so comparison and sorting are trivial; when the
     * box only printed a month we store the last day of it and set precision to
     * 'month' so the UI shows "11/2027" rather than inventing a day.
     * Null only when the product has hasExpiry = false.
     */
    expiryDate: text('expiry_date'),
    expiryPrecision: text('expiry_precision', { enum: EXPIRY_PRECISIONS }),

    lotNumber: text('lot_number'),

    purchaseDate: text('purchase_date'),
    /** Minor units: grosze for PLN, cents for EUR. Integer, never float. */
    purchasePriceMinor: integer('purchase_price_minor'),
    purchaseCurrency: text('purchase_currency', { enum: CURRENCIES }),
    /** PLN->EUR rate on the purchase date, so historical spend stays truthful. */
    fxRateToEur: real('fx_rate_to_eur'),

    openedAt: text('opened_at'),
    status: text('status', { enum: BATCH_STATUSES }).notNull().default('in_stock'),

    /** Optional free text. Four cupboards within three metres — not worth a table. */
    location: text('location'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('batches_variant_idx').on(t.variantId),
    index('batches_status_idx').on(t.status),
    index('batches_expiry_idx').on(t.expiryDate),
  ],
);

/* ------------------------------------------------------------------ */
/* Trips and the shopping list                                         */
/* ------------------------------------------------------------------ */

export const TRIP_STATUSES = ['planned', 'completed'] as const;

/**
 * Most stock is ordered online and shipped to family in Poland ahead of the
 * visit, so the date that actually constrains us is orderByDate, not the
 * collection date. Audits and shopping-list reminders hang off orderByDate.
 */
export const trips = sqliteTable('trips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  /** When we physically collect everything. Typically mid-October and Feb/March. */
  collectionDate: text('collection_date').notNull(),
  /** Deadline for placing online orders. Defaults to the midpoint since the last trip. */
  orderByDate: text('order_by_date'),
  status: text('status', { enum: TRIP_STATUSES }).notNull().default('planned'),
  notes: text('notes'),
  ...timestamps,
});

export const SHOPPING_STATUSES = [
  'to_buy',
  'ordered',
  'arrived',
  /** Received and added to stock. Terminal. */
  'in_stock',
  /** Damaged in transit, lost, or the order was cancelled. Terminal, no stock created. */
  'not_received',
] as const;

/** Settled states: they cannot be moved back into the flow, only cleared. */
export const TERMINAL_SHOPPING_STATUSES = ['in_stock', 'not_received'] as const;

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Null until assigned to a trip. */
    tripId: integer('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),

    /** How many sealed packs to buy. */
    quantityPacks: integer('quantity_packs').notNull().default(1),
    status: text('status', { enum: SHOPPING_STATUSES }).notNull().default('to_buy'),

    /*
     * There was an estimated_price_minor / estimated_currency pair here. Never
     * written by anything, and the trip page answers the same question better
     * by deriving an estimate from what each thing was last actually paid for —
     * no typing, and it improves on its own as purchases accumulate. A column
     * nobody fills in is a promise the app does not keep, so it is gone rather
     * than left waiting for a form that was never going to be built.
     */

    /** Set when status moves to in_stock, so we can trace a box back to its order. */
    receivedBatchId: integer('received_batch_id').references(() => batches.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('shopping_items_trip_idx').on(t.tripId),
    index('shopping_items_status_idx').on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Household members and dosing                                       */
/* ------------------------------------------------------------------ */

export const householdMembers = sqliteTable(
  'household_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    notes: text('notes'),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [index('household_members_archived_idx').on(t.archivedAt)],
);

/**
 * "Piotr: 1 Euthyrox tablet daily." Tied to a Product, not a Variant — dosing
 * does not care which pack size is open, only what is being taken.
 */
export const doseSchedules = sqliteTable(
  'dose_schedules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    memberId: integer('member_id')
      .notNull()
      .references(() => householdMembers.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),

    /** Units per single dose, in the product's own base unit. */
    doseUnits: real('dose_units').notNull(),
    /** Independent doses per day (morning + evening = 2), not a split of one. */
    timesPerDay: integer('times_per_day').notNull().default(1),

    /**
     * Days between dosing days. 1 is every day, 7 is weekly, 2 is alternate
     * days. Combines with timesPerDay: interval 7 and timesPerDay 2 means two
     * doses, one day a week.
     *
     * Deliberately an interval and not a set of weekdays. "Every 3 days" and
     * "weekly" cover what a household actually needs, and an interval cannot
     * quietly disagree with itself the way a weekday set plus a start date can.
     *
     * Due dates are phased from startDate, so moving startDate moves every
     * future dose with it — which is why the form does not offer to change it.
     */
    intervalDays: integer('interval_days').notNull().default(1),

    /**
     * Confirming a dose before this date is not offered. Also the anchor every
     * dosing day is counted from, once intervalDays is above 1.
     */
    startDate: text('start_date').notNull(),
    /** Null = ongoing. Set for a course of antibiotics or a seasonal supplement. */
    endDate: text('end_date'),

    notes: text('notes'),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [
    index('dose_schedules_member_idx').on(t.memberId),
    index('dose_schedules_product_idx').on(t.productId),
  ],
);

/**
 * A confirmed dose. Rows are only ever created by tapping "taken" — there is
 * no row for a missed dose, because "missed" is derived (see domain/dosing.ts),
 * not stored. batchId + quantity record exactly what was decremented, so
 * un-confirming can put it back precisely rather than guessing.
 *
 * One dose can produce more than one row: if it emptied one batch and spilled
 * into the next (FEFO), each batch touched gets its own row.
 */
export const doseEvents = sqliteTable(
  'dose_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => doseSchedules.id, { onDelete: 'cascade' }),
    /** Calendar day this dose belongs to — not when it was actually tapped. */
    date: text('date').notNull(),
    /** 1-based: which of the day's timesPerDay occurrences this is. */
    occurrence: integer('occurrence').notNull(),
    batchId: integer('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'restrict' }),
    quantity: real('quantity').notNull(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('dose_events_schedule_date_idx').on(t.scheduleId, t.date),
    index('dose_events_batch_idx').on(t.batchId),
  ],
);

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

/** Server-side sessions so a stolen phone can be logged out from the other phone. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('sessions_expires_idx').on(t.expiresAt)],
);

/** Failed login attempts, for rate limiting. */
export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull(),
  attemptedAt: integer('attempted_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
