#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/restore.sh --yes BACKUP.tar.gz

Restore /var/lib/return from a backup created by backup.sh. A safety backup is
created first. The replaced data directory is retained for manual recovery.
EOF
}

confirmed=0
backup=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --yes)
      confirmed=1
      [ "$#" -ge 2 ] || { echo "error: --yes requires a backup path" >&2; exit 2; }
      backup=$2
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "error: run this script with sudo" >&2
  exit 1
fi
if [ "$confirmed" -ne 1 ] || [ -z "$backup" ]; then
  echo "error: restore requires explicit --yes BACKUP.tar.gz" >&2
  exit 2
fi

backup=$(readlink -f -- "$backup")
[ -f "$backup" ] || { echo "error: backup not found: $backup" >&2; exit 1; }
tar -tzf "$backup" >/dev/null
if tar -tzf "$backup" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "error: unsafe path found in backup" >&2
  exit 1
fi

temp_dir=$(mktemp -d)
cleanup() {
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT HUP INT TERM

tar -xzf "$backup" -C "$temp_dir"
[ -f "$temp_dir/return/return.db" ] || {
  echo "error: backup does not contain return/return.db" >&2
  exit 1
}

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
echo "==> Creating pre-restore safety backup"
"$script_dir/backup.sh" --keep 3 >/dev/null

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
old_data="/var/lib/return.pre-restore-$timestamp"
failed_data="/var/lib/return.failed-restore-$timestamp"
[ ! -e "$old_data" ] || { echo "error: safety path already exists: $old_data" >&2; exit 1; }

systemctl stop return-server.service
mv /var/lib/return "$old_data"
install -d -m 0750 -o return -g return /var/lib/return
cp -a "$temp_dir/return/." /var/lib/return/
chown -R return:return /var/lib/return

systemctl start return-server.service
healthy=0
attempt=1
while [ "$attempt" -le 15 ]; do
  if curl --fail --silent --show-error --max-time 2 \
    http://127.0.0.1:8787/api/ping >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
  attempt=$((attempt + 1))
done

if [ "$healthy" -ne 1 ]; then
  echo "error: restored data failed health check; reverting" >&2
  systemctl stop return-server.service || true
  mv /var/lib/return "$failed_data"
  mv "$old_data" /var/lib/return
  systemctl start return-server.service
  exit 1
fi

echo "restore completed"
echo "previous_data=$old_data"
echo "Remove the previous data directory only after manual validation."
