# Orange Pi deployment

This runbook deploys `@return/server` natively on the ReTurn Orange Pi. The
server is LAN-only; do not expose port 8787 to the public internet.

## Device baseline

- Orange Pi 3B v2.1, ARM64
- Armbian / Debian 13
- Node.js 22 LTS, version 22.13 or newer
- systemd, SQLite via Node built-in `node:sqlite`
- Persistent data at `/var/lib/return`

## Fresh-system prerequisites

Install the runtime tools before running the repository scripts:

```bash
sudo apt update
sudo apt install -y ca-certificates curl xz-utils git sqlite3 avahi-daemon libnss-mdns jq rsync
```

The Debian 13 repository currently provides Node 20, which is too old. Install
an official Node.js 22 Linux ARM64 archive, verify its `SHASUMS256.txt`, and
place the versioned distribution under `/usr/local/lib/nodejs`. Expose `node`,
`npm`, `npx`, and `corepack` through `/usr/local/bin`; do not use nvm for a
systemd service. Activate the repository-pinned pnpm version:

```bash
sudo corepack enable
sudo corepack prepare pnpm@9.15.0 --activate
node --version
pnpm --version
node -e "require('node:sqlite'); console.log('node:sqlite ok')"
```

## First installation

From a clean Git checkout containing this deployment toolkit:

```bash
sudo ./deploy/install.sh
sudoedit /etc/return/return.env
./deploy/deploy.sh
./deploy/smoke-test.sh
```

`install.sh` never overwrites an existing environment file. It configures the
dedicated Pi hostname as `return`, enables Avahi, advertises HTTP port 8787,
and verifies `return.local`. Use `--hostname NAME` only when the installation
needs a different lowercase mDNS name; clients must then use `NAME.local`.

Configure at least a strong `HEALTH_TOKEN` and the LLM/Whisper settings before
final end-to-end validation. Until Issue #4 propagates `API_TOKEN` through the
sampler and clients, an empty token is a temporary hackathon mode: use only the
controlled private hotspot, keep the Pi disconnected from WAN-facing networks,
and never forward TCP 8787. After Issue #4, configure a strong random token and
complete a client/sampler authentication regression before using other LANs.

Keep the `NODE_OPTIONS` value from `return.env.example`. On the validated
hotspot, Node 22's network-family auto-selection timed out while an IPv4-only
connection was still usable. Disabling that selection made native `fetch`
reliable; changing the application to shell out to curl is not required.

Check the service:

```bash
systemctl status return-server --no-pager
curl --fail http://127.0.0.1:8787/api/ping
journalctl -u return-server -n 100 --no-pager
```

## Updating

Update the clean checkout to a reviewed commit, then run:

```bash
./deploy/deploy.sh
```

The deployment records the exact commit, verifies shared/server, publishes a
new release, atomically changes `/opt/return/current`, and checks `/api/ping`.
If the new process fails its health check, the previous symlink is restored.
After a successful health check, only the current and immediately previous
release are retained. Data under `/var/lib/return` is never part of a code
release.

## Network discovery

The demo uses a private hotspot. The current observed subnet is
`192.168.137.0/24`, but confirm the final hotspot's gateway and DHCP pool before
setting a static address. Prefer a DHCP reservation when supported. Keep both:

- `http://return.local:8787` for normal discovery;
- a tested fixed IP URL for the iOS/demo fallback.

Avahi supplies `.local` discovery:

```bash
systemctl is-active avahi-daemon
getent hosts return.local
```

`install.sh` also advertises `_http._tcp` on port 8787 via
`deploy/return-http.service`. The installer sets the hostname explicitly;
the DNS-SD XML alone does not create the `return.local` host record.

Do not change the static network configuration from the only active remote
session. Keep a local console or a second connection available for rollback.
The current hotspot gateway intermittently timed out as a DNS resolver during
validation. This was diagnosed but no DNS override is persisted: the final DNS
choice must be tested with the final hotspot and applied only with local
console access or an automatic rollback path. Never run `netplan apply` from
the only active SSH session.

## Smoke tests

The default test creates and deletes one text node:

```bash
./deploy/smoke-test.sh
```

Durable and external-service checks are explicit:

```bash
HEALTH_TOKEN='set-outside-shell-history' ./deploy/smoke-test.sh --health 2026-07-24
./deploy/smoke-test.sh --voice /path/to/test.m4a
./deploy/smoke-test.sh --save 2026-07-24
```

`--save` seals the supplied date and requires `degraded: false`; never point it
at valuable unsaved demo data by accident.

## Backup and restore

Create a consistent backup. The service is stopped briefly so SQLite WAL and
audio files are captured together:

```bash
sudo ./deploy/backup.sh
```

Only the newest three local archives are retained. Copy the final pre-demo
archive to the maintenance Mac. Secrets in `/etc/return/return.env` are not
included. If the server was active before the backup but cannot be restarted,
the command exits non-zero and reports the service failure even when the
archive itself was created successfully.

Restore only after verifying the selected archive path:

```bash
sudo ./deploy/restore.sh --yes /var/backups/return/return-backup-TIMESTAMP.tar.gz
```

Before replacing live data, the restore script runs SQLite `integrity_check` on
the extracted database. If copying, ownership repair, service startup, or the
HTTP health check fails, it restores the previous data directory and restarts
the service automatically. The failed restored directory is retained for
diagnosis when possible.

Restore creates another safety backup and retains the replaced data directory.
Remove that directory manually only after checking nodes, days, and audio.

## Troubleshooting

```bash
systemctl is-active return-server
journalctl -u return-server -f
ss -lntp | grep ':8787'
df -h /
du -sh /var/lib/return /var/backups/return /opt/return
```

Common causes:

- Exit at startup: inspect `return.env`, directory ownership, and absolute Node
  path without printing secrets.
- Health endpoint returns 503: `HEALTH_TOKEN` is empty or a known placeholder.
- Save is degraded: verify model key, base URL, DNS, TLS, and outbound internet.
- Node `fetch` times out while curl succeeds: confirm `NODE_OPTIONS` contains
  `--no-network-family-autoselection --dns-result-order=ipv4first` and restart
  `return-server`.
- Sampler receives 401: `API_TOKEN` was enabled before Issue #4 was completed.
- `return.local` does not resolve on a fresh Pi: confirm `hostname` prints
  `return`, then check `systemctl status avahi-daemon` and rerun `install.sh`.
- `.local` fails on iPhone: switch the client to the fixed IP immediately.
- Disk below 1 GiB: stop creating local backups, copy archives to Mac, and
  remove obsolete releases/caches only after identifying exact paths.
