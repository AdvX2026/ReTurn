#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/install.sh [--hostname NAME]

Create the ReTurn service user and persistent directories, then install the
systemd unit, mDNS discovery, and an empty environment file template. NAME
defaults to "return", making the device available as return.local. This script
does not install packages or Node.js and never overwrites an existing
environment file.
EOF
}

device_hostname="return"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --hostname)
      [ "$#" -ge 2 ] || { echo "error: --hostname requires a name" >&2; exit 2; }
      device_hostname=$2
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$device_hostname" in
  *[!a-z0-9-]*|-*|*-|"")
    echo "error: hostname must use lowercase letters, digits, and internal hyphens" >&2
    exit 2
    ;;
esac
[ "${#device_hostname}" -le 63 ] || {
  echo "error: hostname must be at most 63 characters" >&2
  exit 2
}

if [ "$(id -u)" -ne 0 ]; then
  echo "error: run this script with sudo" >&2
  exit 1
fi

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

for command_name in getent hostnamectl systemctl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "error: required command not found: $command_name" >&2
    exit 1
  }
done

[ -d /etc/avahi/services ] || {
  echo "error: Avahi is missing; install avahi-daemon before running this script" >&2
  exit 1
}

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
install -m 0644 "$script_dir/return-http.service" \
  /etc/avahi/services/return-http.service

if [ ! -e /etc/return/return.env ]; then
  install -m 0640 -o root -g return "$script_dir/return.env.example" \
    /etc/return/return.env
  echo "created /etc/return/return.env; configure secrets before final validation"
else
  echo "kept existing /etc/return/return.env"
fi

if ! awk '
  /^[[:space:]]*API_TOKEN[[:space:]]*=/ {
    value = $0
    sub(/^[^=]*=/, "", value)
    sub(/[[:space:]]*#.*/, "", value)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
    if (value == "\"\"" || value == "\047\047") value = ""
    configured = value != ""
  }
  END { exit configured ? 0 : 1 }
' /etc/return/return.env; then
  cat >&2 <<'EOF'
WARNING: API_TOKEN is empty while Issue #4 is incomplete.
Use ReTurn only on the controlled private hotspot. Do not connect this Pi to a
WAN-facing network or configure port forwarding for TCP 8787.
EOF
fi

hostnamectl hostname "$device_hostname"
systemctl daemon-reload
systemctl enable --now avahi-daemon.service >/dev/null
systemctl restart avahi-daemon.service

mdns_name="$device_hostname.local"
attempt=1
while [ "$attempt" -le 10 ]; do
  if getent hosts "$mdns_name" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  attempt=$((attempt + 1))
done
[ "$attempt" -le 10 ] || {
  echo "error: Avahi did not publish $mdns_name" >&2
  exit 1
}

echo "ReTurn service foundation installed."
echo "mDNS=http://$mdns_name:8787"
echo "Next: configure /etc/return/return.env, then run ./deploy/deploy.sh."
