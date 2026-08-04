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

What is left is reporting and delivery rather than new mechanics — see "Roadmap" below. The app
still runs locally; it has not been deployed yet.

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

Not yet done — the app runs locally for now. Target is an unprivileged Debian LXC on the
household Proxmox host, behind Caddy with an internal CA (a trusted certificate is required for
camera access, passkeys and home-screen install, all of which browsers block on plain HTTP).

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
- **Phase 4** — push notifications, statistics, xlsx export, passkeys.
- **Phase 5** — duplicate-substance warnings, alternatives between products, audit log, deployment
  and backups.

### Deferred

Wanted, agreed, and deliberately not built yet. Written down because otherwise they exist only in
somebody's memory, which is how a small good idea quietly disappears.

- **Help view.** What each screen is for and what the words on it mean — grace, FEFO, order-by,
  the difference between binning a box and using it up. Split off from the v1.2 branch to keep
  that one small.
- **Thumbnail plus name in search results.** Recognising a box by sight beats reading a foreign
  name, which the stock list already relies on; search results still return text only.
- **Travel kit builder.** Pick what comes along for a trip and take it out of the cupboard's
  figures while it is away, so "what is at home" stays honest.
- **Prescription renewal reminders.** Prescription products already carry a flag; nothing yet
  tracks when a script needs renewing, which is a different deadline from running out.

Not planned: a PL/EN interface toggle (dropped 2026-07-27 — the UI stays English, while product
*data* is bilingual through name/nameAlt and the Polish symptom tags), and anything paediatric.
