import { BackLink } from '@/components/back-link';
import { AboutTabs, Panel } from '../tabs';

/**
 * How one screen leads to the next.
 *
 * Help explains a page on its own terms; this explains what happens between
 * them — which is where most of the surprises live, because a tap in one place
 * usually changes a number somewhere else.
 */
export default function FlowsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href="/" label="Stock" />

      <h1 className="mb-4 text-2xl font-semibold tracking-tight" test-data="flows-title">
        Flows
      </h1>

      <AboutTabs active="flows" />

      <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
        Almost nothing here happens on one screen. A tap in one place changes a number in another,
        and these are the paths it takes.
      </p>

      <Panel title="Something new arrives">
        <Step>
          <b>Products</b> — the product exists first, with at least one pack size. Without a pack
          there is nothing to say how many tablets a box holds.
        </Step>
        <Step>
          <b>Stock → Add box</b>, or scan it. A box records its own expiry, lot, price and the
          exchange rate if it was bought in złoty.
        </Step>
        <Step>
          The box appears on <b>Stock</b>, and its units enter the <b>ledger</b> as{' '}
          <code>received</code>. From that moment it counts towards the cupboard’s value and
          towards what is available for doses.
        </Step>
      </Panel>

      <Panel title="Buying for a restock">
        <Step>
          <b>Trips → the restock → cabinet audit.</b> The worksheet compares what each schedule
          will need before the order deadline against what is usable now, and suggests quantities.
        </Step>
        <Step>
          Ticking rows adds <b>Shopping</b> lines against that trip. Anything already on the list
          for that product is left alone rather than duplicated.
        </Step>
        <Step>
          A line moves <code>to buy → ordered → arrived</code> as things happen.
        </Step>
        <Step>
          <b>Add to stock</b> on an arrived line asks for the expiry and price, creates a real box,
          and marks the line <code>in the cupboard</code> — the line keeps a pointer to the box it
          became, which is how a purchase can be traced back to its order.
        </Step>
        <Step>
          The trip’s <b>What it cost</b> and the yearly figures on <b>Statistics → Money</b> both
          read from those boxes, not from the shopping lines.
        </Step>
      </Panel>

      <Panel title="Taking a scheduled dose">
        <Step>
          <b>Household</b> — a person and a schedule: how much, how often, from when, optionally
          until when.
        </Step>
        <Step>
          <b>Doses</b> shows a pill per occurrence. Confirming one asks FEFO which box to take
          from — the one expiring soonest that is still within its grace.
        </Step>
        <Step>
          Three things happen together: the box’s quantity drops, a dose event is recorded, and the
          <b> ledger</b> gains a <code>dose</code> movement linked to it. Undoing writes the
          opposite movement rather than erasing anything.
        </Step>
        <Step>
          <b>Stock</b> and the run-out projection change immediately, because both read the same
          quantities.
        </Step>
      </Panel>

      <Panel title="Taking something that is not on a schedule">
        <Step>
          <b>Stock</b> — type the amount and press −. Most of the cupboard is never on a schedule,
          and this is how it gets used.
        </Step>
        <Step>
          The ledger records it as <code>taken</code>, which counts as consumption on{' '}
          <b>Statistics → Usage</b> exactly like a scheduled dose. Pressing + puts some back and
          nets it out again.
        </Step>
        <Step>
          Correcting a mistyped quantity with the pencil instead writes <code>adjust</code>, which
          is kept out of “used” — it is stock that was never there.
        </Step>
        <Step>
          Take the last of a box and it leaves the stock list, which takes the <b>+</b> with it.
          The box is still on its <b>product</b> page, where <b>Put back</b> returns it empty; the{' '}
          <b>+</b> then puts the units back and nets the mistake out. Same button as an
          unbinned box, for the same reason: the way out has to exist somewhere.
        </Step>
      </Panel>

      <Panel title="Counting the shelf">
        <Step>
          <b>Stock → Count.</b> Type what is really in each box; leave the rest blank.
        </Step>
        <Step>
          Differences become <code>audit</code> movements. Rows that agree write nothing.
        </Step>
        <Step>
          The page reports how much has gone unaccounted for over time, and{' '}
          <b>Statistics → Usage</b> shows the same differences per product, separately from what
          was actually used.
        </Step>
      </Panel>

      <Panel title="Throwing something away">
        <Step>
          <b>Expiring</b> — bin the box. Its status becomes expired or discarded and it leaves the
          cupboard, but its remaining quantity stays on the record.
        </Step>
        <Step>
          The ledger closes that box out with a <code>binned</code> movement, so its running total
          reaches zero — it no longer claims units that are in the bin.
        </Step>
        <Step>
          That remaining quantity is what the waste figures cost, split between boxes never opened
          and part-used ones, on both <b>Expiring</b> and <b>Statistics → Money</b>.
        </Step>
        <Step>
          A box binned by mistake is still listed on its <b>product</b> page, where{' '}
          <b>Put back</b> returns it to the cupboard. The ledger gains the opposite movement, so the
          units come back and stop counting as waste.
        </Step>
      </Panel>

      <Panel title="Going away">
        <Step>
          <b>Products</b> — mark the things that always travel. A standing decision, made once.
        </Step>
        <Step>
          <b>Trips → New trip → ordinary travel</b>, with a departure and a return date. The two
          dates are what make a packing list possible at all.
        </Step>
        <Step>
          <b>Packing list</b> suggests two things: every course running while you are away, with
          the quantity worked out from the days, and everything marked as always travelling,
          without one. Nothing is on the list until you add it.
        </Step>
        <Step>
          It warns when you want more than the cupboard holds, and when the box FEFO would reach
          for expires before you are home. Ticking a line off does not change any stock.
        </Step>
        <Step>
          While you are away this app is still at home — it lives on the house network, so unless
          you are on the household VPN there is nothing to tap. Doses taken on the trip simply go
          unrecorded, and the cupboard carries on believing it has them.
        </Step>
        <Step>
          So the trip ends back on <b>Stock</b>. Confirm whatever the dose board still shows —
          it reaches back three days, or one full interval for anything less frequent — then take
          the rest off with the stepper: type the amount and press <b>−</b> on the box that
          travelled. Eleven days at two a day is one press of 22, recorded as taken, which is what
          it was. Only reach for <b>Count</b> if you are not sure what went: that files the gap as
          drift rather than claiming it was swallowed.
        </Step>
      </Panel>

      <Panel title="Where the numbers come from">
        <Step>
          <b>Boxes</b> carry price, currency and the exchange rate recorded on the day — so last
          year’s spend does not move when the rate does. Everything on{' '}
          <b>Statistics → Money</b> reads from them.
        </Step>
        <Step>
          <b>The ledger</b> carries every unit that moved and why. Everything on{' '}
          <b>Statistics → Usage</b> reads from that, which is why it fills in over time rather than
          being complete on day one.
        </Step>
        <Step>
          The two never mix. Money can be added up across the whole cabinet; units cannot.
        </Step>
      </Panel>
    </div>
  );
}

/** One numbered-feeling step. A plain bullet reads better than a real list here. */
function Step({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 pl-3" style={{ borderColor: 'var(--border)' }}>
      {children}
    </p>
  );
}
