#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/install.sh

Create the ReTurn service user and persistent directories, then install the
systemd unit and an empty environment file template. This script does not
install Node.js and never overwrites an existing environment file.
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  "") ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [ "$(id -u)" -ne 0 ]; then
  echo "error: run this script with sudo" >&2
  exit 1
fi

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

if ! command -v /usr/local/bin/node >/dev/null 2>&1; then
  echo "error: /usr/local/bin/node is missing; install Node.js 22 first" >&2
  exit 1
fi

if ! /usr/local/bin/node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
'; then
  echo "error: ReTurn requires Node.js >=22.13" >&2
  exit 1
fi

if ! getent passwd return >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/return \
    --no-create-home --shell /usr/sbin/nologin return
fi

install -d -m 0755 -o root -g root /opt/return /opt/return/releases
install -d -m 0750 -o return -g return /var/lib/return
install -d -m 0750 -o root -g return /etc/return
install -d -m 0750 -o root -g return /var/backups/return

install -m 0644 "$script_dir/return-server.service" \
  /etc/systemd/system/return-server.service

if [ -d /etc/avahi/services ]; then
  install -m 0644 "$script_dir/return-http.service" \
    /etc/avahi/services/return-http.service
fi

if [ ! -e /etc/return/return.env ]; then
  install -m 0640 -o root -g return "$script_dir/return.env.example" \
    /etc/return/return.env
  echo "created /etc/return/return.env; configure secrets before final validation"
else
  echo "kept existing /etc/return/return.env"
fi

systemctl daemon-reload

echo "ReTurn service foundation installed."
echo "Next: configure /etc/return/return.env, then run ./deploy/deploy.sh."
