import { NextResponse } from 'next/server';
import { csvMoney, csvTimestamp, toCsv, type CsvValue } from '@/lib/csv';
import { getBoxExport, getMovementExport, getProductExport } from '@/lib/queries';
import { isLoggedIn } from '@/lib/session';

/**
 * Your data, in a file you can open anywhere.
 *
 * Three exports rather than one, because they answer different questions and a
 * single sheet would have to repeat the product on every row of the ledger.
 * Together they are enough to rebuild the cabinet by hand if this app ever
 * stops running.
 *
 * A route handler rather than a server action: this ends in a download, and an
 * action cannot hand the browser a file. Auth is checked here for the same
 * reason it is checked in the photo route — the proxy only looks for a cookie,
 * not a valid one — and a miss returns 404 rather than 401 so the endpoint does
 * not confirm it exists to someone without a session.
 */
const EXPORTS = {
  stock: {
    headers: [
      'batch id', 'product', 'also known as', 'strength', 'form', 'unit',
      'pack', 'pack size', 'quantity remaining', 'status', 'expiry', 'expiry precision',
      'lot', 'location', 'opened on', 'purchased on', 'price', 'currency',
      'rate to eur', 'notes',
    ],
    rows: async (): Promise<CsvValue[][]> =>
      (await getBoxExport()).map((row) => [
        row.batchId, row.product, row.productAlt, row.strength, row.form, row.unit,
        row.pack, row.packSize, row.quantityRemaining, row.status, row.expiryDate,
        row.expiryPrecision, row.lotNumber, row.location, row.openedAt, row.purchaseDate,
        csvMoney(row.priceMinor), row.currency, row.fxRateToEur, row.notes,
      ]),
  },

  movements: {
    headers: ['when', 'product', 'strength', 'unit', 'batch id', 'change', 'reason', 'note'],
    rows: async (): Promise<CsvValue[][]> =>
      (await getMovementExport()).map((row) => [
        csvTimestamp(row.occurredAt), row.product, row.strength, row.unit,
        row.batchId, row.delta, row.reason, row.note,
      ]),
  },

  products: {
    headers: [
      'product', 'also known as', 'form', 'strength', 'unit', 'manufacturer',
      'prescription', 'expires', 'grace days', 'packs', 'substances', 'used for',
      'barcodes', 'notes', 'archived',
    ],
    rows: async (): Promise<CsvValue[][]> =>
      (await getProductExport()).map((row) => [
        row.name, row.nameAlt, row.form, row.strength, row.unit, row.manufacturer,
        row.isPrescription, row.hasExpiry, row.expiryGraceDays, row.packs,
        row.substances, row.symptoms, row.barcodes, row.notes,
        row.archivedAt === null ? 'no' : csvTimestamp(row.archivedAt),
      ]),
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  if (!(await isLoggedIn())) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { kind } = await params;
  const spec = Object.hasOwn(EXPORTS, kind) ? EXPORTS[kind as keyof typeof EXPORTS] : undefined;
  if (!spec) {
    return new NextResponse('Not found', { status: 404 });
  }

  const csv = toCsv([...spec.headers], await spec.rows());
  // Dated, because these pile up in a downloads folder and "which one is newer"
  // should not need a file listing to answer.
  const filename = `parrothecary-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // A stale export is a wrong export.
      'Cache-Control': 'no-store',
    },
  });
}
