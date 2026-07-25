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

# Only create missing dirs: never rewrite owner/mode of an existing directory
# (e.g. --output-dir /tmp must not become root:return 0750).
if [ ! -d "$output_dir" ]; then
  install -d -m 0750 -o root -g return "$output_dir"
fi
manifest_dir=$(mktemp -d)
archive_tmp=""
service_was_active=0

restart_service() {
  if [ "$service_was_active" -eq 1 ]; then
    if systemctl start return-server.service; then
      service_was_active=0
    else
      return 1
    fi
  fi
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM

  if ! restart_service; then
    echo "error: failed to restart return-server.service" >&2
    [ "$status" -ne 0 ] || status=1
  fi
  rm -rf -- "$manifest_dir"
  [ -z "$archive_tmp" ] || rm -f -- "$archive_tmp"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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

if ! restart_service; then
  echo "error: backup created, but return-server.service failed to restart" >&2
  exit 1
fi

find "$output_dir" -maxdepth 1 -type f -name 'return-backup-*.tar.gz' \
  -printf '%T@ %p\n' | sort -nr | awk -v keep="$keep" '
    NR > keep { sub(/^[^ ]+ /, ""); print }
  ' | while IFS= read -r old_archive; do
    [ -n "$old_archive" ] && rm -f -- "$old_archive"
  done

echo "$archive"
