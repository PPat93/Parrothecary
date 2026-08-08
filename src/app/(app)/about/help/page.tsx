import { BackLink } from '@/components/back-link';
import { AboutTabs, Panel, Term } from '../tabs';

/**
 * What the words mean and why the app behaves as it does.
 *
 * Written as mechanisms and rules rather than click-by-click instructions. A
 * walkthrough is a lie waiting to happen — the first button that moves makes it
 * wrong — while "doses come out of the box that expires first" stays true
 * through any redesign.
 */
export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href="/" label="Stock" />

      <h1 className="mb-4 text-2xl font-semibold tracking-tight" test-data="help-title">
        Help
      </h1>

      <AboutTabs active="help" />

      <Panel title="Words worth knowing" id="glossary">
        <Term term="Product">
          The thing in general — “APAP 500 mg”. Carries the name, the ingredients, the symptom
          tags, and the photo. It is not a quantity of anything.
        </Term>
        <Term term="Pack">
          A size the product is sold in — a box of 50. One product can have several, which is why
          the shopping list asks which one you are buying.
        </Term>
        <Term term="Box">
          One physical thing in the cupboard, with its own expiry date, its own lot number and its
          own price. Two boxes of the same pack are two boxes: they went off on different days and
          cost different amounts.
        </Term>
        <Term term="Base units">
          Everything is counted in tablets, millilitres, sachets or pieces — never in packs. Half a
          bottle is real, and “1.5 packs” is not a thing you can hold.
        </Term>
        <Term term="Grace">
          Days past the printed date that a product is still considered usable, set per product.
          Paracetamol a month past date is fine; sterile saline is not, and one shared number could
          not tell them apart. It only affects what doses are allowed to come out of — the expiry
          screen still reports the box as past its date, because it is.
        </Term>
        <Term term="FEFO">
          First expiry, first out. A dose comes from the box that goes off soonest, even if a
          different one is already open — which is why the box you are handed is not always the one
          you used yesterday. Only when two boxes share an expiry date does the already-open one
          win, so seals are not broken for nothing.
        </Term>
        <Term term="Used up vs binned">
          A box that ran out was used. A box thrown away was not. They are counted separately
          everywhere, because one is the cost of living and the other is money wasted.
        </Term>
        <Term term="Movement">
          One line in the stock ledger: a batch, a signed number of units, and a reason. Every
          change to how much is in a box writes one, and nothing ever edits or deletes one — an
          undo writes the opposite row instead.
        </Term>
      </Panel>

      <Panel title="Stock" id="stock">
        <p>
          Every box currently in the cupboard, grouped by product. The number on the right is what
          the app is willing to count — anything further past its date than the product tolerates
          is listed separately as “past date” rather than folded in, so it never quietly props up a
          decision about whether to buy more.
        </p>
        <p>
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            The two ways to change a number are not the same thing.
          </span>{' '}
          The − and + take stock out or put it back: somebody swallowed a tablet, or put one back
          in the box. The pencil corrects a quantity that was typed wrong — stock that was never
          there. The first counts as consumption in the statistics, the second does not, and the
          app cannot tell them apart afterwards unless you use the right one at the time.
        </p>
        <p>
          The amount field between the buttons defaults to 1 and stays wherever you leave it, so a
          box of tablets never needs touching and a bottle needs typing once. A spoonful of
          something liquid is one movement of 10 ml rather than ten movements of one.
        </p>
        <p>
          A box will not give out more than it holds, and will not take back more than the pack can
          contain. Both refuse out loud rather than silently doing something else.
        </p>
        <p>
          Tapping the product name opens the product, where the photo, ingredients, prices and
          alternatives live. An <em>archived</em> chip means the product is no longer kept — it is
          off the products list and cannot be added to a new box — but what is here is still here.
        </p>
      </Panel>

      <Panel title="Doses" id="doses">
        <p>
          One card per person, one row per scheduled medicine, and a pill for each time it is due.
          Tapping a pill records that the dose was taken, takes the units out of the cupboard using
          FEFO, and writes a movement. Tapping it again undoes all of that.
        </p>
        <p>
          Confirming the same dose twice does nothing the second time. A tap that has already been
          recorded is the same tap arriving late, not a second dose.
        </p>
        <p>
          Schedules can be daily, several times a day, or every N days, and can have an end date. A
          course that has finished says so and stops projecting: it no longer counts towards how
          fast the cupboard is emptying.
        </p>
        <p>
          A red warning appears when two things on{' '}
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            one person’s
          </span>{' '}
          schedule contain the same active ingredient — taking both is a double dose of something
          with a ceiling. Two people each taking their own is not that, and is not flagged.
        </p>
      </Panel>

      <Panel title="Expiring" id="expiring">
        <p>
          Boxes going off in the next six months, in the order they need attention: past their date
          and past what they tolerate; past the date but still in use; going before the next
          restock; worth watching; and last, any box whose date was never written down. That last
          group cannot be warned about until someone fills the date in.
        </p>
        <p>
          Binning a box records it as waste and takes it out of the cupboard. The quantity stays on
          the record, because what was left in it is what the waste figure costs.
        </p>
        <p>
          The two money figures are deliberately never added together. A sealed box that expired is
          money thrown away and worth pushing down. A part-used one is not — it did its job, and
          you cannot buy half a bottle.
        </p>
      </Panel>

      <Panel title="Shopping" id="shopping">
        <p>
          A line moves through stages rather than being ticked off, because most things are ordered
          online and shipped ahead: to buy, ordered, arrived, and finally in the cupboard. The last
          step is not a status flip — collecting a pack means a real box arrives, so it asks for the
          expiry and the price off the label.
        </p>
        <p>
          A line can belong to a restock trip or to none at all. Lines with no trip are things
          bought locally, which is a real answer rather than a gap.
        </p>
      </Panel>

      <Panel title="Trips" id="trips">
        <p>
          Two different journeys live here. A{' '}
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            restock
          </span>{' '}
          brings stock in — it has an order deadline, a shopping list and a cabinet audit. Ordinary{' '}
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            travel
          </span>{' '}
          takes a kit out and mostly brings it back — it has a departure date, a return date and a
          packing list. Neither shows the other’s tools.
        </p>
        <p>
          For a restock the date that matters is the order deadline, not the collection: anything
          not ordered by then will not be there to pick up. Left blank it is worked out as the
          midpoint since the last restock, which is also when the cabinet audit naturally falls.
        </p>
        <p>
          The <em>cabinet audit</em> is a buying worksheet: what will run out before the trip can
          replace it, what is empty, and everything else for a human eye. It fills in quantities
          where the maths can and leaves the rest to you.
        </p>
        <p>
          The <em>packing list</em> is the opposite question. Doses are worked out from the number
          of days away — both the day you leave and the day you come back count. Anything marked
          “always pack for travel” on its product page is offered too, without a quantity, because
          only a person can say how many plasters. Ticking a line off does not move stock: nobody
          records what came home from a holiday, and a half-done return would leave the numbers
          worse than not trying.
        </p>
      </Panel>

      <Panel title="Products" id="products">
        <p>
          The catalogue. One search covers names in both languages, the manufacturer, the active
          substance, the symptom tag and the barcode — so “what do we have for a sore throat” works
          at two in the morning without remembering a brand.
        </p>
        <p>
          A product page also carries what else in the cupboard shares an ingredient with it, and
          what could stand in for it if you run out. Sharing an ingredient is stated plainly rather
          than warned about: saline in a nasal gel and saline in ampoules is true and harmless, and
          a cabinet that raises an alarm about that is one whose alarms get ignored.
        </p>
        <p>
          Archiving hides the catalogue entry, not the stock. Deleting is only offered once a
          product is archived and nothing would be lost by it — no box of it was ever recorded and
          no dose schedule points at it.
        </p>
      </Panel>

      <Panel title="Counting the cupboard" id="count">
        <p>
          Walk the shelf and type what is actually in each box. Every field is optional and blank
          means “did not count this one” — a cupboard gets counted in stages, and a form demanding
          all thirty numbers before accepting any would be abandoned halfway along.
        </p>
        <p>
          Rows that agree write nothing at all. Only differences are recorded, which is what makes
          the running total meaningful: it is how much stock leaves this house without anyone
          noticing. Counting a box as zero retires it, the same as using it up.
        </p>
      </Panel>

      <Panel title="Statistics" id="statistics">
        <p>
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            Money
          </span>{' '}
          comes from the purchase history and was complete on day one: what the cupboard is worth,
          spend by year and by trip, what a unit costs now against the first time it was bought,
          and the waste split.
        </p>
        <p>
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            Usage
          </span>{' '}
          comes from the stock ledger and fills in as the app is used. “Used” counts both scheduled
          doses and anything taken by hand; corrections and count differences are kept apart from
          it, because stock that was never there is not stock anybody got through.
        </p>
        <p>
          Nothing adds units across products. Sixty tablets, thirty millilitres and one emergency
          blanket are not ninety-one of anything — so per-product tables carry units and anything
          wider counts boxes and movements instead.
        </p>
        <p>
          A <strong>+</strong> after a money figure means some boxes are priced in złoty with no
          exchange rate recorded, so the total is a floor rather than a sum. Adding a rate to the
          box makes it exact.
        </p>
      </Panel>

      <Panel title="Why won’t it let me?" id="refusals">
        <p>
          Everything below is the app declining on purpose. None of it is a fault.
        </p>
        <Term term="A dose pill is grey and will not tick">
          Either there is nothing in stock, or all of it is further past its date than the product
          allows, or the course has an end date that has passed. The card says which.
        </Term>
        <Term term="The + on a box is disabled">
          The pack cannot hold any more. If the quantity really is wrong, correct it with the
          pencil instead — that is a different kind of change and gets recorded differently.
        </Term>
        <Term term="The − on a box is disabled">
          The box is empty, or the amount typed is not a number the app can use.
        </Term>
        <Term term="No “Archive this product” button">
          Someone is still on a course of it. Stop the dose first — archiving would take it off the
          board while it was still being taken.
        </Term>
        <Term term="No “Delete permanently” button">
          It is not archived yet, or boxes of it were recorded, or a dose schedule still points at
          it. All three are real history that deleting the product would take with it. Archive
          instead — nothing is lost and it can be restored.
        </Term>
        <Term term="A person cannot be deleted">
          A dose was confirmed for them at some point, which is stock that actually left the
          cupboard.
        </Term>
        <Term term="The Save button on a packing amount is missing">
          Nothing has changed yet. It appears once the number differs from what is stored.
        </Term>
        <Term term="A holiday is not offered for a shopping line">
          Things get bought for a restock. A shopping list attached to a holiday is a list nothing
          would ever collect.
        </Term>
        <Term term="A product is missing from the alternatives picker">
          It is already linked, or it is archived, or it is the product you are looking at.
        </Term>
      </Panel>

      <Panel title="What it deliberately does not do" id="not-doing">
        <p>
          Each of these is a decision rather than a gap, and each looks like something missing from
          the outside.
        </p>
        <Term term="Packing a bag does not move stock">
          A kit mostly comes home again, and nobody records what came back while actually
          travelling. A half-done return would leave the cupboard less accurate than not trying.
        </Term>
        <Term term="The shopping list is not generated for you">
          Only a few products are on a dose schedule, so a list built from projections alone would
          speak for a quarter of the cabinet and stay silent about the plasters. The audit computes
          what it can and leaves the rest to a human twice a year.
        </Term>
        <Term term="Sharing an ingredient is not always a warning">
          Most overlaps are harmless. The red warning is reserved for two things on one person’s
          schedule, which is the case that can actually double a dose.
        </Term>
        <Term term="Nothing is deleted quietly">
          Products archive, boxes get a terminal status, and an undo writes an opposite movement
          rather than erasing the first one. A mistake and its correction are both on the record.
        </Term>
        <Term term="Units are never added across products">
          See Statistics. A single total mixing tablets and millilitres would be easy to print and
          would mean nothing.
        </Term>
        <Term term="There are no reminders or notifications">
          The app is opened most days anyway, so a notification would be noise — and it would need
          a background process the rest of the app deliberately does without.
        </Term>
      </Panel>
    </div>
  );
}
