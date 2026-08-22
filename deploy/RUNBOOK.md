# Deployment runbook

Written to be followed rather than remembered. The order is deliberate: everything
that can be got wrong cheaply happens before any real data exists.

The machine is a Debian LXC on Proxmox. The app runs as `parrothecary` out of
`/srv/parrothecary`, behind Caddy, reachable on the LAN only.

---

## 0. Getting to it

All of this is done from another computer on the home network. Nothing here needs a keyboard
plugged into the Dell.

Three ways in, in the order they are usually reached for:

```sh
ssh root@<proxmox-host>          # then: pct enter <container-id>
ssh root@<container-ip>          # straight in, once the container has openssh-server
```

and the Proxmox web interface at `https://<proxmox-host>:8006`, which has a console for the
container built into the page.

**That third one is the safety net, and it is worth knowing before starting.** The web console
attaches to the container the way a monitor and keyboard would, so it still works when the
container's own networking does not — a firewall rule, a bad address, a service that will not come
up. There is no way to lock yourself out of the container from inside it.

Nothing in this runbook touches the Proxmox host's own networking, which is the one thing that
*could* cut you off. Changes are confined to a container.

**But something else on the host might.** A VPN client installed on the Proxmox host — NordVPN,
Tailscale, WireGuard — does not merely add a tunnel: it takes over the host's firewall and
routing. One wrong setting and the host stops answering, on every path at once. SSH, the web
interface at port 8006, even a shell on another guest trying to reach it.

The guests keep running when this happens, which is confusing until you know why: they are
plugged into a bridge and reach the network directly, without passing through the host. So the
app and Home Assistant carry on serving while the machine underneath them is unreachable.

There is no network route back. The recovery is a monitor and a keyboard on the machine, then:

```sh
systemctl disable --now nordvpnd     # or tailscaled, or whatever was installed
```

`disable` as well as `stop` — otherwise it comes back at boot and locks you out again.

The specific setting that caused this, in NordVPN's case, is `lan-discovery`. Turning it off
tells the client to stop permitting traffic from your own network, and it obeys. Leave it on.

**Take a Proxmox snapshot of the container before section 6**, and again before any later upgrade.
It is instant, it rolls the whole container back in one click, and it covers the things a database
backup cannot — a broken package install, a botched Caddy config, a half-finished Node upgrade.

**A note on `sudo`.** Debian container templates log you in as root, and minimal ones have no
`sudo` installed at all — which is why section 1 installs it before anything else uses it.

Do not work around a missing `sudo` by dropping the word. It works for `sudo apt install`, where
you are already root anyway, and it is silently wrong for `sudo -u parrothecary`: that form is not
about privilege, it is about running as the *service user*. Dropped, those commands run as root
and leave a tree of root-owned files that the service then cannot write, plus an `npm ci` that
behaves differently. The failures land much later than the mistake.

The commands below keep `sudo` throughout because the alternative is a runbook that quietly
encourages working as root on a machine holding the household's medical records.

---

## 0b. Making the container

Skip this if the container already exists. The container is created **from the Proxmox host**;
everything after it is done **inside the container**.

```sh
ip -4 addr show vmbr0            # what subnet the house is on
ip route | head -3

pveam update
pveam available --section system | grep debian-12
pveam download local debian-12-standard_12.7-1_amd64.tar.zst
```

```sh
pct create 101 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname parrothecary \
  --cores 2 \
  --memory 1024 \
  --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1
```

A **static** address, not DHCP: it is what the phones are pointed at and what goes in the
Caddyfile, so it cannot be allowed to move. Pick one on the house subnet and outside the
router's DHCP pool.

`--rootfs local-lvm:8` puts the container's disk in the thin pool, not on the Proxmox root
filesystem. 8 GB is generous — the app and `node_modules` are about 500 MB, the database grows
to a few MB over years, and the photographs a few MB a year.

Then:

```sh
pct enter 101
```

---

## 1. The machine

> **Check the prompt first.** It must read `root@parrothecary`. If it says `root@proxmox1`
> (or whatever the Proxmox host is called), you are on the hypervisor and everything below
> will install a web server and a compiler onto the machine that runs everything else in the
> house. `pct enter 101` first.

```sh
# sudo first: the container template has none, and every command below wants it.
apt update
apt install -y sudo

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

In practice all three usually arrive as prebuilt binaries for linux-x64, and the compiler is
never invoked — but it has to be there for the case where they do not.

npm 11.19 and later refuse to run package install scripts unless approved, so `npm ci` ends
with a warning naming `better-sqlite3` and `esbuild`. **Do not approve them reflexively.**
Check whether anything actually broke first:

```sh
sudo -u parrothecary node -e "
const D=require('better-sqlite3');
const d=new D(':memory:');
d.exec('create table t(a)');
d.prepare('insert into t values (1)').run();
console.log('sqlite', d.prepare('select count(*) c from t').get());
require('@node-rs/argon2').hash('x').then(h=>console.log('argon2', h.slice(0,12)+'...'));
require('sharp')({create:{width:4,height:4,channels:3,background:'#fff'}})
  .webp().toBuffer().then(b=>console.log('sharp', b.length, 'bytes'));
"
```

Three lines of output means the prebuilt binaries were enough and the skipped scripts were
irrelevant. Only if one fails is there anything to do:

```sh
sudo -u parrothecary npm install-scripts ls          # read it before approving
sudo -u parrothecary npm install-scripts approve better-sqlite3
sudo -u parrothecary npm ci                          # minutes this time, with compiler output
```

Loading is not the same as working, which is why the check above opens a database, hashes a
password and encodes an image rather than just calling `require`.

Node from NodeSource, because Debian's package is older than the scripts need —
they import TypeScript directly, which requires **22.18 or newer**. Bookworm ships 18.20,
so `apt install nodejs` on its own gets the wrong one.

The repository has to be added *before* installing, and it needs its own prerequisites:

```sh
sudo apt install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # must be >= 22.18
```

Two ways this quietly goes wrong:

- **`sudo: command not found`** — the pipe still runs, `curl` writes into nothing, and the
  script never executes. Drop `sudo -E` and pipe straight into `bash -`. The failure is easy
  to miss because the only visible complaint is `curl: (23) Failed writing body`.
- **Debian's Node is already installed.** The NodeSource repository pins itself at priority
  600, so a later `apt install nodejs` does upgrade — but if `node --version` still says v18,
  `apt purge nodejs libnode108` and install again.

The version check is not a formality. Node 18 gets through the install, through `npm ci`, and
fails later at the scripts, where the reason is much less obvious.

**Then upgrade npm itself**, which is a separate thing from Node:

```sh
sudo npm install -g npm@11
npm --version    # must be >= 11
```

Node 22 ships npm 10.9.8, and npm 10 mishandles *optional peer dependencies* — it tries to
install them, finds no entry for them in the lockfile, and stops:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json ... are in sync.
npm error Missing: esbuild@0.28.2 from lock file
```

The lockfile is correct. `esbuild` is an optional peer of the `vite` inside `vitest`, npm 11
rightly leaves it out, and npm 10 rightly should too but does not.

Do **not** reach for `npm install` to get past this. It would rewrite the lockfile on the
server and unpin every dependency — the opposite of what a deployment wants, and the change
would sit there unnoticed until the next `git pull` conflicted with it.

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

The folders first. `parrothecary.service` lists them in `ReadWritePaths`, and systemd will not
start a unit whose `ReadWritePaths` names something that does not exist. It fails with
`Failed to set up mount namespacing: No such file or directory` — which names neither the path
nor the reason, and sends you looking at the wrong thing entirely.

```sh
sudo -u parrothecary mkdir -p /srv/parrothecary/data/uploads /srv/parrothecary/backups
```

The app would create both on its own the first time it needed them. Under
`ProtectSystem=strict` it never gets that far, because the namespace is built before the
process starts.

```sh
sudo cp deploy/parrothecary.service /etc/systemd/system/
sudo cp deploy/parrothecary-backup.service /etc/systemd/system/
sudo cp deploy/parrothecary-backup.timer /etc/systemd/system/
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile      # check the address in it matches this machine
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

### Clearing what the drills left behind

Sections 4 and 5 involve making a box, taking a photograph and scanning a barcode, so the
cupboard now holds a few rows that are not real. They have to go before real stock goes in,
or the cupboard is part fiction and there is no way to tell which part.

**Delete them from the app** if there are only a handful — a couple of boxes made by hand
during the drills is the usual case, and deleting them on the phone is a minute's work with
nothing at stake.

`db:reset` is for the other case: a database that was seeded with demo data, where the rows
number in the hundreds.

```sh
sudo systemctl stop parrothecary
sudo -u parrothecary npm run db:reset      # asks for confirmation
sudo systemctl start parrothecary
```

> It deletes **every row and every box photograph**, and the only way back is a backup. Do not
> run it on a cupboard holding real stock. There is no partial version of this command and no
> undo — it prints what it is about to destroy and waits for the word `yes`, and that prompt is
> the entire safety mechanism.

### Then the real thing

Enter the cupboard from the phone. When you are done, press
**Statistics → Backup → Download a backup.zip** — an evening of typing is worth a copy that is
not on this machine.

## 7. Still open after this

**Getting backups off the machine.** `BACKUP_DIR` sends them anywhere: a mount, a share, another
box. Until that is done, a backup survives a bad deploy but not a dead disk.

**Reaching it from outside the house.** Only worth doing if there is a real reason — checking the
cupboard from abroad before restocking is one; "it would be nice" is not, and the cost is a VPN
client on a machine that has to stay reachable.

The shape that works: the VPN terminates on the host, a forwarding rule sends its address to the
container, and the Caddyfile names *both* addresses so each gets a valid certificate. The details,
including the two ways it silently fails, are in `deploy/Caddyfile`.

The address to use away from home is then the same one used at home, or a second one that works in
both places — either way, one home-screen icon rather than two. Test with wifi **off**: on wifi the
phone reaches the app directly and proves nothing.

**Security updates.** Nothing patches this machine on its own. Either remember `apt update &&
apt upgrade` — which nobody does — or let it happen:

```sh
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades      # answer yes
```

Debian's default is security updates only, which is the right setting here: it patches Node,
Caddy and OpenSSL without moving anything the app depends on. The app itself is never touched —
it is a git checkout, not a package.

Worth knowing what it will not do: it does not restart the service afterwards. A patched Node
binary is only in use after the next start, so a reboot every few months is part of the deal.

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

## Bringing changes over from the repository

**Stop first.** `npm ci` empties `node_modules`, and the running app is loading files out of it.

```sh
cd /srv/parrothecary
sudo -u parrothecary git fetch
sudo -u parrothecary git log --oneline HEAD..origin/master        # what is about to arrive
sudo -u parrothecary git diff --stat HEAD..origin/master -- deploy/
```

That third line is the one worth reading. Everything under `deploy/` lives at `/etc/` once
installed, so a change there is **not** applied by pulling — see below.

```sh
sudo systemctl stop parrothecary
sudo -u parrothecary git pull
sudo -u parrothecary npm ci
sudo -u parrothecary npm run build
sudo -u parrothecary npm run db:migrate
sudo systemctl start parrothecary
sudo -u parrothecary npm run preflight
```

The migration takes its own backup first, into `backups/before-migrate/`, and stops if that
backup fails — migrations here are forward-only, so that copy is the only way back.

### If anything under `deploy/` changed

The files in the repository are the source; the ones systemd and Caddy read are copies. Pulling
updates the source and nothing else, so a corrected unit file appears to change nothing and the
next person concludes the fix did not work.

```sh
sudo cp deploy/parrothecary.service /etc/systemd/system/
sudo cp deploy/parrothecary-backup.service /etc/systemd/system/
sudo cp deploy/parrothecary-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart parrothecary
```

The Caddyfile carries an address, and the one in the repository is the address of the machine it
was last deployed to. Diff before overwriting, and check the site line afterwards:

```sh
grep '^https://' /etc/caddy/Caddyfile          # write down EVERY address on this line first
diff /etc/caddy/Caddyfile deploy/Caddyfile
# then, if you take the new one:
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
grep '^https://' /etc/caddy/Caddyfile          # all of them back, and this machine's
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Note the addresses before overwriting, not after.** The copy in the repository carries one
address; a deployed machine may carry more — a second name for reaching it over a VPN, added
locally and deliberately not committed. Overwriting drops it, and the loss is quiet: the app
keeps working at home and stops working from outside, with a certificate warning and a dead
barcode scanner as the only clues, weeks later.

`caddy validate` will happily approve a syntactically perfect file naming the wrong machine, so
that `grep` is not redundant — it is the only check that catches the one mistake this step
invites.

`caddy validate` before `reload`, always. A reload with a broken config leaves the old one
running, which is the good outcome — but you will not know the new one is broken until the next
restart, which is likely to be a reboot you did not plan.

### Did it actually work?

```sh
systemctl is-active parrothecary caddy
curl -sk https://<this machine> -o /dev/null -w '%{http_code}\n'    # 200 or 307
sudo -u parrothecary npm run audit:routes
```

Then open it on a phone. `systemctl is-active` says a process is running, not that the app
serves pages.

### If it goes wrong

The Proxmox snapshot is the fastest way back — it restores the whole container, code and
database together, in one action. Take one **before** the upgrade, not after:

```sh
pct snapshot <container-id> before-upgrade     # on the Proxmox host
pct rollback <container-id> before-upgrade     # if needed
```

For code alone, `git log` gives the previous commit and `git checkout <sha>` returns to it —
but a migration that has already run is not undone by checking out old code. That is what
`backups/before-migrate/` is for.
