/**
 * A starter set of symptom tags.
 *
 *   npm run db:symptoms
 *
 * Idempotent — safe to re-run, and safe against a database that already has
 * tags. Exists because an empty suggestion list is a cold start: the feature is
 * only useful once there is something to pick from, and typing every tag from
 * scratch is exactly the friction that stops people tagging at all.
 *
 * The Polish column is a search alias, not a translation of the interface.
 */
import Database from 'better-sqlite3';
import { databasePath } from '../src/lib/data-paths.ts';

const db = new Database(databasePath());

const SYMPTOMS = [
  ['pain', 'ból'],
  ['headache', 'ból głowy'],
  ['fever', 'gorączka'],
  ['sore throat', 'ból gardła'],
  ['cough', 'kaszel'],
  ['blocked nose', 'katar'],
  ['cold and flu', 'przeziębienie'],
  ['allergy', 'alergia'],
  ['heartburn', 'zgaga'],
  ['indigestion', 'niestrawność'],
  ['diarrhoea', 'biegunka'],
  ['nausea', 'mdłości'],
  ['constipation', 'zaparcia'],
  ['cuts and grazes', 'skaleczenia'],
  ['burns', 'oparzenia'],
  ['bruising and sprains', 'stłuczenia'],
  ['muscle and joint pain', 'bóle mięśni i stawów'],
  ['dry eyes', 'suche oczy'],
  ['dry nose', 'suchy nos'],
  ['sleep', 'sen'],
  ['stress', 'stres'],
  ['supplement', 'suplement'],
];

const insert = db.prepare(
  'insert or ignore into symptoms (name_en, name_pl) values (?, ?)',
);

const before = db.prepare('select count(*) c from symptoms').get().c;
db.transaction(() => {
  for (const [nameEn, namePl] of SYMPTOMS) insert.run(nameEn, namePl);
})();
const after = db.prepare('select count(*) c from symptoms').get().c;

console.log(`Symptom tags: ${before} -> ${after} (${after - before} added)`);
