#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/backup.sh [--output-dir DIR] [--keep COUNT]

Create a consistent archive of /var/lib/return by briefly stopping the
service. The environment file and secrets are intentionally excluded.
EOF
}

output_dir=/var/backups/return
keep=3

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --output-dir)
      [ "$#" -ge 2 ] || { echo "error: --output-dir requires a directory" >&2; exit 2; }
      output_dir=$2
      shift 2
      ;;
    --keep)
      [ "$#" -ge 2 ] || { echo "error: --keep requires a count" >&2; exit 2; }
      keep=$2
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

case "$output_dir" in
  /*) ;;
  *) echo "error: output directory must be an absolute path" >&2; exit 2 ;;
esac
case "$keep" in
  *[!0-9]*|0|"") echo "error: --keep must be a positive integer" >&2; exit 2 ;;
esac
[ "$output_dir" != "/" ] || { echo "error: refusing to use / as output directory" >&2; exit 2; }
[ -d /var/lib/return ] || { echo "error: /var/lib/return does not exist" >&2; exit 1; }

install -d -m 0750 -o root -g return "$output_dir"
manifest_dir=$(mktemp -d)
archive_tmp=""
service_was_active=0

restart_service() {
  if [ "$service_was_active" -eq 1 ]; then
    systemctl start return-server.service || true
  fi
}

cleanup() {
  restart_service
  rm -rf -- "$manifest_dir"
  [ -z "$archive_tmp" ] || rm -f -- "$archive_tmp"
}
trap cleanup EXIT HUP INT TERM

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$output_dir/return-backup-$timestamp.tar.gz"
archive_tmp=$(mktemp "$output_dir/.return-backup.XXXXXX.tar.gz")
deployed_commit=unknown
if [ -r /opt/return/current/DEPLOYED_COMMIT ]; then
  deployed_commit=$(cat /opt/return/current/DEPLOYED_COMMIT)
fi

cat >"$manifest_dir/manifest.txt" <<EOF
created_at=$timestamp
hostname=$(hostname)
deployed_commit=$deployed_commit
data_dir=/var/lib/return
EOF

if systemctl is-active --quiet return-server.service; then
  service_was_active=1
  systemctl stop return-server.service
fi

tar -C /var/lib -czf "$archive_tmp" return -C "$manifest_dir" manifest.txt
tar -tzf "$archive_tmp" >/dev/null
chmod 0600 "$archive_tmp"
mv "$archive_tmp" "$archive"
archive_tmp=""

restart_service
service_was_active=0

find "$output_dir" -maxdepth 1 -type f -name 'return-backup-*.tar.gz' \
  -printf '%T@ %p\n' | sort -nr | awk -v keep="$keep" '
    NR > keep { sub(/^[^ ]+ /, ""); print }
  ' | while IFS= read -r old_archive; do
    [ -n "$old_archive" ] && rm -f -- "$old_archive"
  done

echo "$archive"
