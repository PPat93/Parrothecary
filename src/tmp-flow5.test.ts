import Database from 'better-sqlite3';
import { describe, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const db = () => new Database(process.env.DATABASE_PATH!, { readonly: true });
const caught = (e: unknown) => {
  const d = (e as { digest?: string }).digest ?? '';
  return d.startsWith('NEXT_REDIRECT') ? `redirected to ${d.split(';')[2]}` : `THREW ${e}`;
};
const box = (id: number) => {
  const b = db()
    .prepare('select quantity_remaining q, status from batches where id=?')
    .get(id) as { q: number; status: string };
  const last = db()
    .prepare("select delta, reason from stock_movements where batch_id=? order by id desc limit 1")
    .get(id) as { delta: number; reason: string } | undefined;
  return `q=${b.q} (${b.status}) last: ${last ? `${last.reason} ${last.delta > 0 ? '+' : ''}${last.delta}` : 'none'}`;
};

describe('flow 5: counting the shelf', () => {
  it('counts', async () => {
    const { recordStockCount } = await import('./app/(app)/actions');

    console.log(`  box 1 before: ${box(1)}`);
    console.log(`  box 5 before: ${box(5)}`);

    // One box counted lower, one left blank, one counted to zero.
    const f = new FormData();
    f.set('count_1', '18');
    f.set('count_5', '');
    const out = await recordStockCount({ error: null }, f).catch(caught);
    console.log(`  count 18 on box 1, blank on box 5 -> ${out}`);
    console.log(`  box 1 after:  ${box(1)}`);
    console.log(`  box 5 after:  ${box(5)}   (blank must write nothing)`);

    // Counting to zero.
    const z = new FormData();
    z.set('count_5', '0');
    console.log(`  count 0 on box 5 -> ${await recordStockCount({ error: null }, z).catch(caught)}`);
    console.log(`  box 5 now:    ${box(5)}`);

    // Counting MORE than the box could ever have held: 80 in a 60-pack.
    const m = new FormData();
    m.set('count_1', '80');
    console.log(`  count 80 on box 1 (60-pack) -> ${await recordStockCount({ error: null }, m).catch(caught)}`);
    console.log(`  box 1 now:    ${box(1)}`);

    // And nonsense.
    for (const v of ['-5', 'lots']) {
      const n = new FormData();
      n.set('count_12', v);
      const r = await recordStockCount({ error: null }, n).catch(caught);
      console.log(`  count "${v}" on box 12 -> ${typeof r === 'string' ? r : (r.error ?? 'ACCEPTED')}`);
    }
  });
});
