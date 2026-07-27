# Parrothecary

Domowa apteczka — a LAN-only home medicine and supplement inventory for one household.

Stock is bought in Poland two, sometimes three times a year, mostly ordered online and shipped
to family ahead of the visit. So this is less an inventory app than a **supply-planning** one:
the hard question is not "what do we have" but "will it last until the next trip, and what do
we need to order before the deadline".

## Status

**Phase 1 — core.** Products, packs and boxes; stock list; expiry view; shopping list.
Barcode scanning, dose tracking and run-out projection come later. See "Roadmap" below.

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
| `npm run db:seed` | Load demo data |
| `npm run db:reset` | **Delete all data**, keep the schema |
| `npm run auth:hash -- "…"` | Generate a master-password hash |

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
e2e/          Playwright — owned by the repo owner, intentionally empty.
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

Browser and end-to-end tests belong in `e2e/` and are written by the repo owner in Playwright.

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

- **Phase 2** — PWA install, HTTPS, barcode scanning (EAN-13 plus GS1 DataMatrix, which carries
  expiry and batch on EU prescription packs), seeded medicines catalog, photos, symptom search.
- **Phase 3** — household members, dose schedules with one-tap daily confirmation, run-out
  projection, Trips with an `order_by` deadline, auto-generated shopping list, price history.
- **Phase 4** — push notifications, statistics, waste tracking, xlsx export, passkeys.
- **Phase 5** — duplicate-substance warnings, audit log, PL/EN toggle, deployment and backups.
