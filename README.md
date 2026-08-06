# Parrothecary

Domowa apteczka — a LAN-only home medicine and supplement inventory for one household.

Stock is restocked abroad two, sometimes three times a year, mostly ordered online and shipped
ahead of the visit. So this is less an inventory app than a **supply-planning** one: the hard
question is not "what do we have" but "will it last until the next trip, and what do we need to
order before the deadline".

## Status

**Phases 1 to 3 are done.** The cabinet is usable end to end: products, packs and boxes; stock
and expiry; barcode scanning; dose schedules; run-out projection; trips with an order deadline;
the audit worksheet; prices, waste and cupboard value.

Phase 4 is next — a stock ledger and the features that stand on it — and deployment is
deliberately last, after end-to-end coverage. See "Roadmap" below. The app still runs locally
against test data, which gets wiped for a clean start when it is deployed.

## Getting started

```bash
npm install
```

Create `.env.local` from the example and generate a password:

```bash
npm run auth:hash -- "your master password here"
```

Paste the output **verbatim, including its backslashes**, into `.env.local`. Next's env loader
does shell-style variable expansion and an Argon2 hash is full of `$` signs; unescaped, it is
silently mangled and every login fails. Then:

```bash
npm run db:migrate
npm run dev
```

Open http://localhost:3000.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests (domain logic) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:studio` | Browse the database |
| `npm run db:symptoms` | Load the symptom tag vocabulary (run before any seed) |
| `npm run db:seed` | Load demo data |
| `npm run db:reset` | **Delete all data**, keep the schema (`-- --force` to skip the prompt) |
| `npm run db:check-ledger` | Verify every box agrees with its stock movements |
| `npm run auth:hash -- "…"` | Generate a master-password hash |
| `npm run audit:routes` | List routes and check each is behind the session guard |

Before entering real inventory, run `npm run db:reset` so no demo rows survive.

## The data model

Four layers, not two. Collapsing them — especially putting expiry on the product — makes the
app unfixable later without a migration.

| Layer | What it is | Example |
| --- | --- | --- |
| **Substance** | active ingredient | Ibuprofen |
| **Product** | branded concept + dose form | Ibuprom Max 400 mg tablets |
| **Variant** | a purchasable pack | box of 24 |
| **Batch** | a physical box in the house | bought 03/2026, exp 11/2027, 14 left |

Rules that must hold:

- **Expiry and price live on the Batch.** Two boxes of the same thing will differ.
- **Quantities are base units** (tablets / ml / sachets), never packs — half-used bottles are real.
- **Expiry is a full date**, with a `precision` flag so a box marked `11/2027` displays as
  `11/2027` rather than inventing a day. Month-only boxes store the last day of that month.
- **Expiry is nullable**, with a product-level `has_expiry` flag for plasters and thermometers.
- **Money is integer minor units** (grosze / cents), never floats, with the FX rate recorded at
  purchase so historical spend does not drift with the exchange rate.
- **Nothing is hard-deleted.** Products archive; batches get a terminal status. Consumption
  history is what makes the later phases possible.
- **Every quantity change is recorded.** `stock_movements` holds one signed row per change, with
  a reason. Undo writes an opposite row rather than erasing the first, so a mistake and its
  correction are both on the record. The invariant — `sum(delta)` equals what is in the box, and
  zero once it leaves stock — is checkable with `npm run db:check-ledger`.

## Layout

```
src/
  domain/     Pure logic — no framework imports. Fully unit-tested.
  db/         Drizzle schema and the (lazy) SQLite connection.
  lib/        Auth, sessions, queries.
  app/        Routes. (app)/ is the authenticated area.
  components/ Shared UI.
e2e/          Playwright — owned by the repo owner. Page objects, fixtures, smoke and
              functional specs, with a setup project that logs in once and stores the session.
scripts/      Password hashing, seed, reset.
```

`src/domain` deliberately imports nothing from Next. If the framework ever becomes a liability,
the shell can be replaced and the logic kept.

## Testing

Unit tests (Vitest) cover the domain modules — date arithmetic, expiry precision, pack
conversion, currency parsing, FEFO selection. These are where the subtle bugs live: date
maths across month boundaries, leap years and clock changes is a bug farm, and testing it
through a browser would be slow and brittle.

```bash
npm test
```

Browser and end-to-end tests live in `e2e/` and are written by the repo owner in Playwright.
Authentication is handled by a `setup` project that logs in once and saves the session to
`e2e/.auth/auth.json`, which every browser project then loads as its `storageState`.

```bash
npx playwright test
```

Note that in UI mode a dependency project is skipped unless it is ticked in the project filter,
so `setup` must be selected there or the stored session is never refreshed.

## Security

- Single master password, Argon2id, no user accounts.
- Sessions are server-side; the cookie holds a random token and the database stores only its
  SHA-256, so a leaked backup cannot mint a session.
- Failed logins are rate-limited per IP.
- **Do not expose this to the internet.** It is designed for the LAN, with remote access via
  the household VPN if needed.

## Deployment

Not yet done — the app runs locally for now, and is the last phase on the roadmap rather than the
next one. Target is an unprivileged Debian LXC on the household Proxmox host, behind Caddy with an
internal CA (a trusted certificate is required for camera access and home-screen install, both of
which browsers block on plain HTTP).

Updates are built and tested locally against a separate database, so production is never the place
anything is tried first. Migrations are forward-only and get a backup taken immediately before
they run.

## Roadmap

- **Phase 1 — done.** The four-layer data model, products, packs and boxes, the stock list, the
  expiry view, the shopping list, and single-password auth.
- **Phase 2 — done.** PWA install, HTTPS, barcode scanning (EAN-13 plus GS1 DataMatrix, which
  carries expiry and batch on EU prescription packs), seeded medicines catalog, photos, and one
  search covering both names, manufacturer, active substance, symptom tag and barcode.
- **Phase 3 — done.** Household members, dose schedules with one-tap confirmation (daily or every
  N days), run-out projection, per-product expiry grace, Trips with an `order_by` deadline, the
  cabinet audit worksheet, and price history per product with trip and cupboard totals.

  The shopping list is *assisted*, not auto-generated: only four of fifteen products are on a dose
  schedule, so a list built purely from projections would speak for a quarter of the cabinet and
  stay silent about the plasters. The worksheet computes what it can and leaves the rest to a human
  once every six months, which is what the audit was always for.

  Waste tracking arrived here rather than in Phase 4, since the prices it needed were already
  present. It reports binned-unopened separately from what was left in opened packs — the first is
  money wasted, the second is the cost of having something available, and adding them together
  would flatter one and slander the other.
### Phase 4 — before deployment

Ordered. The database is still disposable, and it stops being disposable the day the app is
deployed and real stock is entered — so anything that changes *what gets recorded* is cheapest
now, and anything that only reads it can wait.

1. **Stock ledger — done.** Every quantity change is an immutable row: batch, signed delta,
   reason (`received` / `dose` / `taken` / `adjust` / `binned` / `audit` / `opening`),
   timestamp. Before
   it, a tap on the minus button rewrote `quantity_remaining` and nothing recorded that it had
   happened, when, or why — only doses survived, in `dose_events`. Undo writes an opposite row
   rather than erasing the original, so a mistake and its correction are both on the record.

   The reasons distinguish three things that look identical in a database and are not: a tablet
   **taken** by hand off the stock list, a quantity **adjusted** because it was typed wrong, and
   a difference an **audit** count could not explain. Only the first is consumption. They shared
   one reason at first, which reported every unscheduled product — most of the cabinet — as never
   used at all, and could not be untangled afterwards because the distinction had never been
   written down.

   This is the foundation for everything below it, and the one item with a real deadline: a ledger
   cannot backfill history it never saw. It also replaces four separate features with one table —
   arbitrary date ranges, between-trip summaries, "start counting fresh" (an `opening` row, not a
   delete), and the audit below.
2. **Stock count — done.** Walk the cupboard, type what is actually in each box, and every
   difference lands as an `audit` movement. Correcting a miscount was already possible; what was
   missing was any record that it happened, and therefore any answer to how much stock quietly
   evaporates between counts. The page reports that running total back.

   Named "stock count" rather than "audit" because the trip page already calls its buying
   worksheet a cabinet audit, and the two ask opposite questions — that one asks what to buy,
   this one asks whether the shelf matches the app.

   Every field is optional: a blank box means "did not count this one". A cupboard gets counted
   in stages, and a form demanding all thirty numbers before accepting any would be abandoned
   halfway down the shelf. Rows that agree write nothing at all — agreement is not an event, and
   a row per box counted would bury the differences that are the point.
3. **Duplicate-substance warnings — done.** Two things containing the same active ingredient.
   Reaching for a headache tablet and a cold remedy an hour apart, both with paracetamol in
   them, is a double dose of something with a real ceiling, and nothing in the app said a word
   about it.

   Split deliberately into a fact and a warning, because most overlaps are neither dangerous nor
   interesting. A saline nasal gel and saline ampoules share sodium chloride and that is all they
   share — a cabinet that raises an alarm about those is one whose alarms get ignored. So the
   product page *states* what else contains the same ingredient, in passing and in muted text,
   while the Doses board *warns*, in red, only where two things are on the same person's
   schedule at once.

   Per person, never per household: two people each taking their own paracetamol is not a double
   dose, and flagging it would be both wrong and annoying.
4. **Alternatives between products — done.** What else would do when one has run out, on the
   product page, sorted so anything actually on the shelf comes first. Three relations:
   same active substance, local equivalent, works instead.

   Stored as one row per pair and read from both ends. Storing a direction and reading only that
   way is the version that goes half-linked — recorded on the paracetamol, missing from the
   ibuprofen, which is exactly the page you would be on when you needed it. Adding the same pair
   the other way round is refused rather than duplicated.

   Stock counts come from the same helpers every other screen uses, so an alternative is never
   offered out of a box the app would refuse to take a dose from.
5. **Travel kit.** See below.
6. **Help view.** What each screen is for and what the words on it mean — grace, FEFO, order-by,
   the difference between binning a box and using it up.
7. **CSV export — done.** Three downloads from the Money page: boxes, stock movements, and the
   product catalogue. Together they are enough to rebuild the cabinet by hand if this app ever
   stops running. No dependencies; formatting is two clicks in a spreadsheet, which is why xlsx
   was dropped.

   Three files rather than one, because they answer different questions and a single sheet would
   repeat the product name on every row of the ledger. Boxes include the ones used up and binned:
   an escape hatch that quietly omits everything thrown away is a worse record than the database
   it came from. Every file starts with a byte-order mark — without one Excel reads UTF-8 as the
   local codepage and turns `Roztwór` and `µg` into mojibake.

   Served by a route handler rather than a server action, since an action cannot hand the browser
   a file, with the session checked in the handler the same way the photo route does it.
8. **Statistics: money — done.** Cupboard value, spend per year, spend per trip, what a unit
   costs now against the first time it was bought, and the waste split. Every figure has years
   of purchases behind it, so this half was meaningful the day it was built.

   A cross-product "which pack size is cheapest" section was dropped after checking the data:
   no product has ever been bought in two different pack sizes, so it would have rendered
   nothing. Price-per-unit over time replaced it, which the same data does support.
9. **Statistics: usage — done.** What moved per product over a chosen window, and what happened
   between one restock and the next. Reads the ledger rather than the purchase history, so it is
   the half that fills in as the app gets used.

   **Nothing here adds units across products.** Sixty tablets, thirty millilitres and one
   emergency blanket are not ninety-one of anything — units are only comparable within a product.
   The per-product table carries units; anything spanning the whole cabinet counts boxes and
   movements instead. Printing "316 units received" would have been easy and meaningless.

   Sections with nothing to show render nothing. No placeholder text explaining what the page is
   waiting for — this app has two users and both of them know.

End-to-end happy-path coverage runs alongside, per feature as each settles. Items 3, 4 and 6
barely move existing screens; item 1 changes what the stock buttons do underneath, so stock specs
should wait for it.

### Phase 5 — deployment

Deliberately last: the app should be tested before it becomes the thing the household actually
relies on, and this is the part that needs learning rather than reviewing.

Backups ship *with* it, not after. Deployment day is when real stock and fresh photos get entered,
and that data is valuable immediately — while today there is exactly one copy of the database on
one machine. `VACUUM INTO` gives a consistent single-file backup while the app keeps running,
which is also the safe way to take a copy for testing a migration against realistic data.

The database is wiped for this: a clean start, entered fresh against the real cupboard.

Statistics moved here from after deployment, where they were originally placed to let the ledger
accrue first. That reasoning was wrong: the database is wiped at deployment, so nothing recorded
beforehand survives and waiting buys nothing. What is genuinely time-dependent is narrower —
comparing one restock to the next needs two real restocks, and no amount of sequencing produces
those early.

### The travel kit, in more detail

A trip gains a `kind`: a restock, or ordinary travel. Ordinary travel opens a packing list.

Two things it is not. It does **not** share `shopping_items` — that table carries a purchase
lifecycle (`to_buy → ordered → arrived → in_stock`), while a packing line is "N units of this,
from this box". Same `trips` table, separate `travel_kit_items`. And it does **not** move stock
out of the cupboard, at first: that needs a "what came back" step which nobody performs while
actually travelling, and a forgotten return leaves the numbers worse than never having tried. The
ledger makes that upgrade a pair of reasons whenever the drift starts to matter.

What makes it more than a notes app is that the list arrives filled in. Active dose schedules must
come along and the app already knows how many — `unitsDueBetween` is unit-tested and is what the
audit worksheet uses, so twelve days away with one tablet daily packs twelve and says the box only
holds nine. Expiry is checked so nothing packed dies mid-trip. Symptom coverage is checked so the
bag is not missing a whole category.

**Open, to settle before development starts:** whether the suggested list is editable as a
*default* — a standing "always pack something for stomach, headache and allergy" that the user
maintains, rather than a suggestion recomputed from scratch each time. It is the difference
between a template and an algorithm, and probably wants both: computed doses that cannot be
forgotten, plus a saved list of standing items.

### Deferred

Wanted, agreed, and deliberately not built. Written down because otherwise they exist only in
somebody's memory, which is how a small good idea quietly disappears.

- **Thumbnail plus name in search results.** Recognising a box by sight beats reading a foreign
  name, which the stock list already relies on; search results still return text only.
- **Prescription renewal reminders.** Prescription products already carry a flag; nothing yet
  tracks when a script needs renewing, which is a different deadline from running out.

### Dropped

- **xlsx export** — a heavyweight dependency for formatting that takes two clicks in a spreadsheet.
  CSV instead.
- **Push notifications** — the app is used daily, so reminders would be noise, and they would have
  forced the first background scheduler into an app that deliberately derives everything on read.
- **Passkeys** — sessions already last 90 days and renew on use, so "remember me" exists in all
  but name; a password manager covers the rest.
- **Audit log as a changelog** — who-changed-what has no audience in a two-person household. The
  reconciliation people actually mean by "audit" is item 2 above.

Not planned: a PL/EN interface toggle (dropped 2026-07-27 — the UI stays English, while product
*data* is bilingual through name/nameAlt and the Polish symptom tags), and anything paediatric.
