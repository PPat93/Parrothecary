/**
 * Demo data for development only. Never run this against the real database —
 * `npm run db:reset` clears it out again.
 *
 *   npm run db:seed
 *
 * Deliberately includes the awkward cases the app has to get right: a
 * month-precision expiry, an already-expired box, a part-used bottle measured
 * in ml, and an item that never expires at all.
 */
import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/wydawka.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const insertProduct = db.prepare(
  `insert into products (name_pl, name_en, form, strength, unit_name, manufacturer, is_prescription, has_expiry)
   values (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertVariant = db.prepare(
  `insert into variants (product_id, pack_size, pack_label) values (?, ?, ?)`,
);
const insertBatch = db.prepare(
  `insert into batches (variant_id, quantity_remaining, expiry_date, expiry_precision, purchase_price_minor, purchase_currency, location, opened_at)
   values (?, ?, ?, ?, ?, ?, ?, ?)`,
);

const seed = db.transaction(() => {
  // Tablets, month-precision expiry — the common case.
  const ibuprom = insertProduct.run('Ibuprom Max', 'Nurofen', 'tablet', '400 mg', 'tablet', 'US Pharmacia', 0, 1)
    .lastInsertRowid;
  const ibupromPack = insertVariant.run(ibuprom, 24, '24 tabl.').lastInsertRowid;
  insertBatch.run(ibupromPack, 24, '2027-11-30', 'month', 1299, 'PLN', 'bathroom cabinet', null);
  insertBatch.run(ibupromPack, 9, '2026-09-30', 'month', 1299, 'PLN', 'bathroom cabinet', '2026-06-14');

  // Prescription, full-date expiry from a DataMatrix.
  const euthyrox = insertProduct.run('Euthyrox N 50', 'Levothyroxine', 'tablet', '50 µg', 'tablet', 'Merck', 1, 1)
    .lastInsertRowid;
  const euthyroxPack = insertVariant.run(euthyrox, 100, '100 tabl.').lastInsertRowid;
  insertBatch.run(euthyroxPack, 100, '2028-03-15', 'day', 1850, 'PLN', 'kitchen drawer', null);

  // Liquid, part-used — exercises fractional base units.
  const acc = insertProduct.run('ACC 200', 'Acetylcysteine', 'syrup', '20 mg/ml', 'ml', 'Sandoz', 0, 1)
    .lastInsertRowid;
  const accPack = insertVariant.run(acc, 100, '100 ml').lastInsertRowid;
  insertBatch.run(accPack, 32.5, '2026-08-31', 'month', 2499, 'PLN', 'kitchen drawer', '2026-05-02');

  // Already expired — should surface in red.
  const gripex = insertProduct.run('Gripex Hot', null, 'sachet', null, 'sachet', 'US Pharmacia', 0, 1)
    .lastInsertRowid;
  const gripexPack = insertVariant.run(gripex, 12, '12 sasz.').lastInsertRowid;
  insertBatch.run(gripexPack, 5, '2026-04-30', 'month', 1699, 'PLN', 'kitchen drawer', '2026-01-10');

  // Never expires — must not appear in the expiry view at all.
  const plasters = insertProduct.run('Plastry opatrunkowe', 'Plasters', 'device', null, 'piece', null, 0, 0)
    .lastInsertRowid;
  const plastersPack = insertVariant.run(plasters, 20, '20 szt.').lastInsertRowid;
  insertBatch.run(plastersPack, 14, null, null, 899, 'PLN', 'bathroom cabinet', '2026-02-01');
});

seed();

const counts = ['products', 'variants', 'batches'].map(
  (t) => `${t}: ${db.prepare(`select count(*) c from ${t}`).get().c}`,
);
console.log(`Seeded ${dbPath}`);
console.log('  ' + counts.join(', '));
