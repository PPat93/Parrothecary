/**
 * Demo data for development only. Never run this against the real database —
 * `npm run db:reset` clears it out again.
 *
 *   npm run db:symptoms   (first, so the symptom tags exist)
 *   npm run db:seed
 *
 * Two jobs. It has to include the awkward cases the app must get right — a
 * month-precision expiry, an already-expired box, a part-used bottle measured
 * in ml, an item that never expires, a box whose date nobody wrote down, and
 * two products sharing an active ingredient. And it has to look like a real
 * cabinet, because it is what a screenshot shows and what somebody cloning this
 * sees first.
 *
 * Dates are relative to today, so the demo never rots into a screen full of
 * things that expired years ago.
 */
import Database from 'better-sqlite3';
import { databasePath } from '../src/lib/data-paths.ts';

const dbPath = databasePath();
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const insertProduct = db.prepare(
  `insert into products (name, name_alt, form, strength, unit_name, manufacturer, is_prescription, has_expiry, expiry_grace_days, pack_for_travel)
   values (@name, @nameAlt, @form, @strength, @unitName, @manufacturer, @rx, @hasExpiry, @grace, @packForTravel)`,
);
const insertVariant = db.prepare(
  `insert into variants (product_id, pack_size, pack_label) values (?, ?, ?)`,
);
const insertBatch = db.prepare(
  `insert into batches (variant_id, quantity_remaining, expiry_date, expiry_precision, purchase_price_minor, purchase_currency, fx_rate_to_eur, purchase_date, location, opened_at)
   values (@variantId, @quantity, @expiry, @precision, @price, 'PLN', 0.2312, @purchased, @location, @opened)`,
);
const insertMember = db.prepare(`insert into household_members (name) values (?)`);
const insertSchedule = db.prepare(
  `insert into dose_schedules (member_id, product_id, dose_units, times_per_day, interval_days, start_date, end_date)
   values (@memberId, @productId, @doseUnits, @timesPerDay, @intervalDays, @startDate, @endDate)`,
);
const insertTrip = db.prepare(
  `insert into trips (label, collection_date, order_by_date, return_date, kind, status, notes)
   values (@label, @collectionDate, @orderByDate, @returnDate, @kind, @status, @notes)`,
);
const insertShopping = db.prepare(
  `insert into shopping_items (trip_id, variant_id, quantity_packs, status, notes) values (?, ?, ?, ?, ?)`,
);
const insertSubstance = db.prepare(`insert or ignore into substances (name, name_pl) values (?, ?)`);
const linkSubstance = db.prepare(
  `insert into product_substances (product_id, substance_id, amount_mg)
   values (?, (select id from substances where name = ?), ?)`,
);
const linkSymptom = db.prepare(
  `insert or ignore into product_symptoms (product_id, symptom_id)
   select ?, id from symptoms where name_en = ?`,
);
const insertKitItem = db.prepare(
  `insert into travel_kit_items (trip_id, product_id, units, packed) values (?, ?, ?, ?)`,
);
const insertReceivedLine = db.prepare(
  `insert into shopping_items (trip_id, variant_id, quantity_packs, status, received_batch_id)
   values (?, ?, 1, 'in_stock', ?)`,
);
const setBatchStatus = db.prepare(`update batches set status = ? where id = ?`);
const insertAlternative = db.prepare(
  `insert into product_alternatives (product_id, alternative_product_id, relation, note) values (?, ?, ?, ?)`,
);

/** Offset in days from today, as an ISO date. */
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
/** Last day of the month, `months` from now — how most boxes are printed. */
const monthEnd = (months) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
};

const product = (fields) =>
  insertProduct.run({
    nameAlt: null,
    strength: null,
    manufacturer: null,
    rx: 0,
    hasExpiry: 1,
    grace: 0,
    packForTravel: 0,
    ...fields,
  }).lastInsertRowid;

const batch = (fields) =>
  insertBatch.run({
    expiry: null,
    precision: null,
    price: null,
    purchased: null,
    location: null,
    opened: null,
    ...fields,
  }).lastInsertRowid;

const seed = db.transaction(() => {
  for (const [name, namePl] of [
    ['Ibuprofen', 'Ibuprofen'],
    ['Paracetamol', 'Paracetamol'],
    ['Levothyroxine', 'Lewotyroksyna'],
    ['Acetylcysteine', 'Acetylocysteina'],
    ['Cholecalciferol', 'Cholekalcyferol'],
  ]) {
    insertSubstance.run(name, namePl);
  }

  // Tablets, month-precision expiry, two boxes — the common case, and the one
  // that shows FEFO reaching for the older box first.
  const ibuprom = product({
    name: 'Ibuprom Max',
    nameAlt: 'Nurofen',
    form: 'tablet',
    strength: '400 mg',
    unitName: 'tablet',
    manufacturer: 'US Pharmacia',
    grace: 30,
  });
  const ibupromPack = insertVariant.run(ibuprom, 24, '24 tabl.').lastInsertRowid;
  linkSubstance.run(ibuprom, 'Ibuprofen', 400);
  linkSymptom.run(ibuprom, 'pain');
  linkSymptom.run(ibuprom, 'headache');
  batch({ variantId: ibupromPack, quantity: 24, expiry: monthEnd(18), precision: 'month', price: 1299, purchased: day(-120), location: 'bathroom cabinet' });
  batch({ variantId: ibupromPack, quantity: 9, expiry: monthEnd(2), precision: 'month', price: 1299, purchased: day(-300), location: 'bathroom cabinet', opened: day(-40) });

  // Prescription, day-precision, and the thing a schedule runs against.
  const euthyrox = product({
    name: 'Euthyrox N 50',
    form: 'tablet',
    strength: '50 µg',
    unitName: 'tablet',
    manufacturer: 'Merck',
    rx: 1,
  });
  const euthyroxPack = insertVariant.run(euthyrox, 100, '100 tabl.').lastInsertRowid;
  linkSubstance.run(euthyrox, 'Levothyroxine', 0.05);
  batch({ variantId: euthyroxPack, quantity: 62, expiry: monthEnd(20), precision: 'day', price: 1850, purchased: day(-60), location: 'kitchen drawer', opened: day(-38) });

  // Part-used, measured in ml — the case the typed amount field exists for.
  const acc = product({
    name: 'ACC 200',
    nameAlt: 'Acetylcysteine syrup',
    form: 'syrup',
    strength: '20 mg/ml',
    unitName: 'ml',
    manufacturer: 'Sandoz',
    grace: 14,
  });
  const accPack = insertVariant.run(acc, 100, '100 ml').lastInsertRowid;
  linkSubstance.run(acc, 'Acetylcysteine', 20);
  linkSymptom.run(acc, 'cough');
  batch({ variantId: accPack, quantity: 32.5, expiry: monthEnd(1), precision: 'month', price: 2499, purchased: day(-90), location: 'kitchen drawer', opened: day(-25) });

  // Already past its date, with no grace — the red row, and the waste figure.
  const gripex = product({
    name: 'Gripex Hot',
    form: 'sachet',
    unitName: 'sachet',
    manufacturer: 'US Pharmacia',
  });
  const gripexPack = insertVariant.run(gripex, 12, '12 sasz.').lastInsertRowid;
  linkSubstance.run(gripex, 'Paracetamol', 650);
  linkSymptom.run(gripex, 'cold and flu');
  batch({ variantId: gripexPack, quantity: 5, expiry: monthEnd(-3), precision: 'month', price: 1699, purchased: day(-400), location: 'kitchen drawer', opened: day(-360) });

  /*
   * Shares paracetamol with Gripex Hot, and both are on one person's schedule
   * below — which is the only case the app raises a red double-dose warning
   * for. Without this pair that warning has nothing to show.
   */
  const apap = product({
    name: 'APAP',
    form: 'tablet',
    strength: '500 mg',
    unitName: 'tablet',
    manufacturer: 'US Pharmacia',
    grace: 60,
  });
  const apapPack = insertVariant.run(apap, 50, '50 tabl.').lastInsertRowid;
  linkSubstance.run(apap, 'Paracetamol', 500);
  linkSymptom.run(apap, 'pain');
  linkSymptom.run(apap, 'fever');
  batch({ variantId: apapPack, quantity: 41, expiry: monthEnd(9), precision: 'month', price: 1149, purchased: day(-30), location: 'kitchen drawer' });

  const vitd = product({
    name: 'Vigalex Max',
    form: 'tablet',
    strength: '4000 IU',
    unitName: 'tablet',
    manufacturer: 'Sanofi',
  });
  const vitdPack = insertVariant.run(vitd, 60, '60 tabl.').lastInsertRowid;
  linkSubstance.run(vitd, 'Cholecalciferol', 0.1);
  linkSymptom.run(vitd, 'supplement');
  batch({ variantId: vitdPack, quantity: 47, expiry: monthEnd(14), precision: 'month', price: 2149, purchased: day(-45), location: 'kitchen drawer', opened: day(-13) });

  // Never expires at all — must stay out of the expiry view entirely.
  const plasters = product({
    name: 'Plastry opatrunkowe',
    nameAlt: 'Plasters',
    form: 'device',
    unitName: 'piece',
    hasExpiry: 0,
    packForTravel: 1,
  });
  const plastersPack = insertVariant.run(plasters, 20, '20 szt.').lastInsertRowid;
  linkSymptom.run(plasters, 'cuts and grazes');
  batch({ variantId: plastersPack, quantity: 14, price: 899, purchased: day(-200), location: 'bathroom cabinet', opened: day(-150) });

  /*
   * Expires, but nobody wrote the date down. Invisible on the expiry screen
   * until that was fixed, so the demo keeps one to prove it is not.
   */
  const saline = product({
    name: 'katarek NaCl 0,9%',
    nameAlt: 'Saline drops',
    form: 'drops',
    unitName: 'ampoule',
    packForTravel: 1,
  });
  const salinePack = insertVariant.run(saline, 10, '10 x 5 ml').lastInsertRowid;
  linkSymptom.run(saline, 'blocked nose');
  batch({ variantId: salinePack, quantity: 10, price: 949, purchased: day(-20), location: 'bathroom cabinet' });

  insertAlternative.run(ibuprom, apap, 'substitute', 'Different molecule, same job on a headache.');

  /* ---- who takes what ---------------------------------------------- */

  const anna = insertMember.run('Anna').lastInsertRowid;
  const marek = insertMember.run('Marek').lastInsertRowid;

  insertSchedule.run({ memberId: anna, productId: euthyrox, doseUnits: 1, timesPerDay: 1, intervalDays: 1, startDate: day(-200), endDate: null });
  insertSchedule.run({ memberId: anna, productId: vitd, doseUnits: 1, timesPerDay: 1, intervalDays: 2, startDate: day(-90), endDate: null });
  // Both contain paracetamol: this is the pair the clash warning is for.
  insertSchedule.run({ memberId: marek, productId: apap, doseUnits: 1, timesPerDay: 2, intervalDays: 1, startDate: day(-6), endDate: day(2) });
  insertSchedule.run({ memberId: marek, productId: gripex, doseUnits: 1, timesPerDay: 3, intervalDays: 1, startDate: day(-6), endDate: day(2) });

  /* ---- journeys ----------------------------------------------------- */

  const trip = (fields) =>
    insertTrip.run({ orderByDate: null, returnDate: null, kind: 'restock', notes: null, ...fields })
      .lastInsertRowid;

  const springRestock = trip({ label: 'Spring restock', collectionDate: day(-210), orderByDate: day(-260), status: 'completed' });
  const autumnRestock = trip({ label: 'Autumn restock', collectionDate: day(-40), orderByDate: day(-125), status: 'completed' });
  const nextRestock = trip({
    label: 'Next restock',
    collectionDate: day(70),
    orderByDate: day(15),
    status: 'planned',
    notes: 'Most of it ships ahead — the order deadline is the date that matters.',
  });
  const holiday = trip({
    label: 'Summer holiday',
    collectionDate: day(24),
    returnDate: day(38),
    kind: 'travel',
    status: 'planned',
    notes: 'Fifteen days away.',
  });

  /*
   * History. Without it the app has nothing to say: no spend per trip, no
   * price trend, and no waste — three of the things it exists to show. Each of
   * these boxes came in on a completed trip and has since been used up or
   * thrown out, which is the ordinary life of a box.
   */
  const past = (variantId, tripId, price, purchased, expiry, status, quantity) => {
    const id = batch({ variantId, quantity, expiry, precision: 'month', price, purchased });
    insertReceivedLine.run(tripId, variantId, id);
    setBatchStatus.run(status, id);
    return id;
  };

  // Used up normally — the price history a trend is drawn from.
  past(ibupromPack, springRestock, 1149, day(-210), monthEnd(-2), 'consumed', 0);
  past(apapPack, springRestock, 999, day(-210), monthEnd(-1), 'consumed', 0);
  past(euthyroxPack, autumnRestock, 1790, day(-40), monthEnd(16), 'consumed', 0);
  past(accPack, autumnRestock, 2299, day(-40), monthEnd(-4), 'consumed', 0);

  /*
   * Two boxes binned, and the difference between them is the whole point of
   * the waste split. One was never opened — that is money thrown away. The
   * other was part-used and did its job; calling that waste would be true
   * arithmetically and a lie practically.
   */
  const wasted = past(apapPack, springRestock, 1149, day(-215), monthEnd(-5), 'expired', 50);
  const leftover = batch({
    variantId: accPack,
    quantity: 18,
    expiry: monthEnd(-6),
    precision: 'month',
    price: 2399,
    purchased: day(-260),
    opened: day(-240),
  });
  setBatchStatus.run('expired', leftover);
  void wasted;

  insertShopping.run(nextRestock, apapPack, 2, 'to_buy', 'Down to the last box.');
  insertShopping.run(nextRestock, euthyroxPack, 1, 'ordered', 'Ordered online, shipping ahead.');
  insertShopping.run(nextRestock, accPack, 1, 'arrived', 'Waiting to be collected.');
  insertShopping.run(null, ibupromPack, 1, 'to_buy', 'Buy locally, not worth shipping.');

  insertKitItem.run(holiday, euthyrox, 15, 1);
  insertKitItem.run(holiday, plasters, 6, 0);
});

seed();

/*
 * Opening balances, so the ledger agrees with the shelf from the first run.
 *
 * Skips any box that already has movements. Without that guard, running the
 * seed twice gave every existing box a second opening row and doubled its
 * ledger — the invariant broken by the very script meant to establish it.
 * Demo boxes did not arrive through the app and have no history to replay, so
 * each starts with one row saying what was in it.
 */
db.exec(`
  insert into stock_movements (batch_id, delta, reason, occurred_at)
  select id, quantity_remaining, 'opening',
         coalesce(strftime('%s', purchase_date), unixepoch())
  from batches b
  where quantity_remaining > 0
    and not exists (select 1 from stock_movements m where m.batch_id = b.id);

  insert into stock_movements (batch_id, delta, reason, occurred_at)
  select id, -quantity_remaining, 'binned', unixepoch()
  from batches b
  where status <> 'in_stock' and quantity_remaining > 0
    and not exists (
      select 1 from stock_movements m where m.batch_id = b.id and m.reason = 'binned'
    );
`);

const counts = ['products', 'variants', 'batches', 'stock_movements', 'trips', 'shopping_items'].map(
  (t) => `${t}: ${db.prepare(`select count(*) c from ${t}`).get().c}`,
);
console.log(`Seeded ${dbPath}`);
console.log('  ' + counts.join(', '));
