# Deployment runbook

Written to be followed rather than remembered. The order is deliberate: everything
that can be got wrong cheaply happens before any real data exists.

The machine is a Debian LXC on Proxmox. The app runs as `parrothecary` out of
`/srv/parrothecary`, behind Caddy, reachable on the LAN only.

---

## 1. The machine

```sh
sudo adduser --system --group --home /srv/parrothecary --no-create-home parrothecary
sudo mkdir -p /srv/parrothecary
sudo chown parrothecary:parrothecary /srv/parrothecary
sudo apt install -y git caddy build-essential python3
```

`--no-create-home` and the explicit `mkdir` are deliberate: `adduser` would create that folder and
put shell dotfiles in it, and `git clone` refuses to clone into a folder that is not empty.

`build-essential` and `python3` are not optional: `better-sqlite3`, `sharp` and
`@node-rs/argon2` are compiled for this machine's platform and Node version.
That is also why the app cannot be built on a laptop and copied here.

Node from NodeSource, because Debian's package is older than the scripts need —
they import TypeScript directly, which requires **22.18 or newer**:

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # must be >= 22.18
```

## 2. The app

```sh
sudo -u parrothecary git clone <this repo> /srv/parrothecary
cd /srv/parrothecary
sudo -u parrothecary npm ci
sudo -u parrothecary npm run build
```

Set the password. Paste the output **verbatim**, escaping included:

```sh
npm run auth:hash -- "the password"
sudo -u parrothecary tee /srv/parrothecary/.env.local   # MASTER_PASSWORD_HASH=\$argon2id\$...
sudo chmod 600 /srv/parrothecary/.env.local
```

Every `$` must be written `\$`. Next expands `$name` in that file, and an
unescaped hash means the app starts normally and refuses every login with no
visible reason. The check below catches exactly that.

```sh
sudo -u parrothecary npm run db:migrate
sudo -u parrothecary npm run preflight     # must end "Ready"
```

## 3. Services

```sh
sudo cp deploy/parrothecary.service /etc/systemd/system/
sudo cp deploy/parrothecary-backup.service /etc/systemd/system/
sudo cp deploy/parrothecary-backup.timer /etc/systemd/system/
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile      # edit the hostname first
sudo systemctl daemon-reload
sudo systemctl enable --now parrothecary
sudo systemctl reload caddy
```

Two of those files were written on a machine with neither systemd nor Caddy on it, so check them
rather than trusting them — one command each, and both are instant:

```sh
systemd-analyze calendar "Mon,Fri 03:30"     # should print the next two firing times
sudo caddy validate --config /etc/caddy/Caddyfile
systemctl list-timers parrothecary-backup.timer
```

## 4. Prove it works, with the test data still in place

- open it on a phone, log in
- **install Caddy's root certificate** on each phone, then reload — without it
  the camera is unavailable and the barcode scanner cannot work
- scan a barcode
- open a box photograph
- take a dose, then undo it

```sh
sudo -u parrothecary npm run audit:routes   # every route behind the guard
```

That last one needs the app running and probes it from this machine.

## 5. Backups, and a restore drill

```sh
sudo systemctl enable --now parrothecary-backup.timer
sudo systemctl start parrothecary-backup.service
ls /srv/parrothecary/backups/
journalctl -u parrothecary-backup.service -n 20
```

Then the part people skip. **Restore, before there is anything to lose:**

```sh
sudo systemctl stop parrothecary
sudo -u parrothecary npm run db:restore -- backups/<the folder just written>
sudo systemctl start parrothecary
```

Open a box photograph afterwards. That is the test — anything can put a database
back; a picture is the half a database-only backup loses silently.

Do this now, on test data. A drill that has never been run is not a backup plan.

## 6. Real data

Only once everything above has passed.

```sh
sudo systemctl stop parrothecary
sudo -u parrothecary npm run db:reset      # asks for confirmation
sudo systemctl start parrothecary
```

That deletes every row **and every box photograph**. Then enter the real cupboard
from the phone, and press **Statistics → Backup → Download a backup.zip** when you
are done — an evening of typing is worth a copy that is not on this machine.

## 7. Still open after this

Getting backups off the machine. `BACKUP_DIR` sends them anywhere: a mount, a
share, another box. Until that is done, a backup survives a bad deploy but not a
dead disk.

---

## Afterwards

| Question | Command |
|---|---|
| Is the machine still healthy? | `npm run preflight` |
| Did the last backup run? | `journalctl -u parrothecary-backup.service -n 20` |
| Does the cupboard still add up? | `npm run db:check-ledger` |
| Is every route still behind the guard? | `npm run audit:routes` (app must be running) |
| Take a backup now | `npm run db:backup` |
| Put one back | stop the app, `npm run db:restore -- <folder or zip>`, start it |

Upgrades, in this order — **stop first**, because `npm ci` empties `node_modules` and the running app
is loading files out of it:

```sh
sudo systemctl stop parrothecary
sudo -u parrothecary git pull
sudo -u parrothecary npm ci
sudo -u parrothecary npm run build
sudo -u parrothecary npm run db:migrate
sudo systemctl start parrothecary
```

The migration takes its own backup first,
into `backups/before-migrate/`, and stops if that backup fails — migrations here
are forward-only, so that copy is the only way back.
