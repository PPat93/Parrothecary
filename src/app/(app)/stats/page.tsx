import Link from 'next/link';
import { formatMoney, formatPricePerUnit, money } from '@/domain/money';
import {
  getPriceTrends,
  getSpendByYear,
  getStockValue,
  getTrips,
  getWaste,
  summariseWaste,
} from '@/lib/queries';
import { StatsTabs } from './tabs';

const eur = (minor: number) => formatMoney(money(minor, 'EUR'), { showCurrency: true });

/**
 * What all of this costs.
 *
 * Money only. How fast things get used lives on its own page and reads the
 * ledger instead of the purchase history — a different question with a
 * different shape, and no reason to squeeze both into one screen.
 *
 * Sections with nothing in them render nothing at all.
 */
export default async function StatsPage() {
  const [value, byYear, trips, trends, waste] = await Promise.all([
    getStockValue(),
    getSpendByYear(),
    getTrips(),
    getPriceTrends(),
    getWaste(),
  ]);

  const wasted = summariseWaste(waste);
  const spentTrips = trips.filter((trip) => trip.spentMinorEur > 0);
  const peakYear = Math.max(1, ...byYear.map((year) => year.minorEur));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight" test-data="stats-title">
        Statistics
      </h1>

      <StatsTabs active="money" />

      {/* What is sitting in the drawers, prorated by what is left in each box. */}
      {value.minorEur > 0 ? (
        <Section title="In the cupboard">
          <p className="text-3xl font-semibold tabular-nums" test-data="stats-stock-value">
            {eur(value.minorEur)}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            of stock at what it cost
            {value.uncostedBoxes > 0
              ? `, plus ${value.uncostedBoxes} ${value.uncostedBoxes === 1 ? 'box' : 'boxes'} with no price it can use`
              : ''}
            .
          </p>
        </Section>
      ) : null}

      {byYear.length > 0 ? (
        <Section title="Spent by year">
          <ul className="flex flex-col gap-2" test-data="stats-by-year">
            {byYear.map((year) => (
              <li key={year.year} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                  {year.year}
                </span>

                {/* A plain div is the whole chart. Nothing here needs a library. */}
                <span className="h-5 flex-1 overflow-hidden rounded" style={{ background: 'var(--bg)' }}>
                  <span
                    className="block h-full rounded"
                    style={{
                      width: `${Math.max(2, Math.round((year.minorEur / peakYear) * 100))}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </span>

                <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                  {eur(year.minorEur)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            By purchase date, so boxes bought locally count too — they belong to a year but to no
            trip.
          </p>
        </Section>
      ) : null}

      {spentTrips.length > 0 ? (
        <Section title="Spent by trip">
          <ul className="flex flex-col gap-1" test-data="stats-by-trip">
            {spentTrips.map((trip) => (
              <li key={trip.id} className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/trips/${trip.id}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                  {trip.label}
                </Link>
                <span className="shrink-0 tabular-nums">
                  {eur(trip.spentMinorEur)}
                  {trip.uncostedBoxes > 0 ? (
                    <span
                      style={{ color: 'var(--muted)' }}
                      title={`${trip.uncostedBoxes} box(es) priced in złoty with no exchange rate recorded.`}
                    >
                      +
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/*
        Per unit, not per pack: the pack can change size between restocks, and
        comparing box prices would then be comparing two different things.
      */}
      {trends.length > 0 ? (
        <Section title="What a unit costs now">
          <ul className="flex flex-col gap-2" test-data="stats-price-trends">
            {trends.map((trend) => {
              const change = trend.latestPerUnit - trend.firstPerUnit;
              const percent = trend.firstPerUnit > 0 ? (change / trend.firstPerUnit) * 100 : 0;
              const rising = change > 0;

              return (
                <li key={trend.productId} className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/products/${trend.productId}`}
                    className="min-w-0 text-sm underline-offset-4 hover:underline"
                  >
                    {trend.name}
                    {trend.strength ? (
                      <span style={{ color: 'var(--muted)' }}> {trend.strength}</span>
                    ) : null}
                  </Link>

                  <span className="shrink-0 text-right text-sm tabular-nums">
                    {formatPricePerUnit(trend.latestPerUnit, 'EUR')}
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {' '}
                      / {trend.unitName}
                    </span>
                    {Math.abs(percent) >= 1 ? (
                      <span
                        className="block text-xs"
                        style={{ color: rising ? 'var(--color-warning)' : 'var(--color-ok)' }}
                      >
                        {rising ? '+' : ''}
                        {Math.round(percent)}% since {trend.firstDate.slice(0, 4)}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {wasted.neverOpenedBoxes > 0 || wasted.openedBoxes > 0 ? (
        <Section title="Binned">
          {wasted.neverOpenedBoxes > 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }} test-data="stats-wasted">
              <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--color-critical)' }}>
                {eur(wasted.thrownAwayMinorEur)}
              </span>
              <br />
              in {wasted.neverOpenedBoxes} {wasted.neverOpenedBoxes === 1 ? 'box' : 'boxes'} never
              opened — bought and binned without being used.
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }} test-data="stats-wasted">
              Nothing has been binned unopened. That is the figure that would mean money wasted, and
              it is zero.
            </p>
          )}

          {wasted.openedBoxes > 0 ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              A further {eur(wasted.leftInOpenedMinorEur)} was left in {wasted.openedBoxes} opened{' '}
              {wasted.openedBoxes === 1 ? 'pack' : 'packs'}. Not really waste: they were opened
              because they were needed, and you cannot buy half a bottle.
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-2xl border p-4"
      test-data={`stats-${title.replace(/\s/g, '-').toLowerCase()}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
