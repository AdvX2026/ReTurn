#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: ./deploy/deploy.sh [--source DIR] [--version ID]

Build and verify ReTurn from a clean Git checkout, publish it under
/opt/return/releases, atomically update /opt/return/current, and restart the
systemd service. A failed health check restores the previous release.
EOF
}

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_dir=$(CDPATH='' cd -- "$script_dir/.." && pwd)
version=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --source)
      [ "$#" -ge 2 ] || { echo "error: --source requires a directory" >&2; exit 2; }
      source_dir=$2
      shift 2
      ;;
    --version)
      [ "$#" -ge 2 ] || { echo "error: --version requires an ID" >&2; exit 2; }
      version=$2
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

source_dir=$(CDPATH='' cd -- "$source_dir" && pwd)

for command_name in git node pnpm rsync curl sudo; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "error: required command not found: $command_name" >&2
    exit 1
  }
done

[ -f "$source_dir/pnpm-lock.yaml" ] || {
  echo "error: not a ReTurn source directory: $source_dir" >&2
  exit 1
}

if [ -d "$source_dir/.git" ]; then
  tracked_changes=$(git -C "$source_dir" status --porcelain --untracked-files=no)
  if [ -n "$tracked_changes" ]; then
    echo "error: source checkout is dirty; commit or stash changes before deployment" >&2
    exit 1
  fi
  if git -C "$source_dir" status --porcelain | grep -v '^?? deploy/' | grep -q .; then
    echo "error: source checkout has uncommitted files outside deploy/" >&2
    exit 1
  fi
  commit=$(git -C "$source_dir" rev-parse HEAD)
else
  echo "error: deployment requires a Git checkout to record the exact commit" >&2
  exit 1
fi

if [ -z "$version" ]; then
  version=$(printf '%s' "$commit" | cut -c1-12)
fi

case "$version" in
  *[!A-Za-z0-9._-]*|"")
    echo "error: version may contain only letters, digits, dot, underscore, and dash" >&2
    exit 1
    ;;
esac

release_dir="/opt/return/releases/$version"
if sudo test -e "$release_dir"; then
  echo "error: release already exists: $release_dir" >&2
  exit 1
fi

available_kb=$(df -Pk / | awk 'NR == 2 {print $4}')
if [ "$available_kb" -lt 1048576 ]; then
  echo "error: less than 1 GiB free on root filesystem" >&2
  exit 1
fi

echo "==> Installing frozen dependencies"
(cd "$source_dir" && pnpm install --frozen-lockfile)

echo "==> Verifying shared and server packages"
(cd "$source_dir" && pnpm --filter @return/shared build)
(cd "$source_dir" && pnpm --filter @return/server typecheck)
(cd "$source_dir" && pnpm --filter @return/server test)
(cd "$source_dir" && pnpm exec biome check packages/shared packages/server)
(cd "$source_dir" && pnpm --filter @return/server build)

stage_dir=$(sudo mktemp -d /opt/return/releases/.stage.XXXXXX)
cleanup() {
  case "$stage_dir" in
    /opt/return/releases/.stage.*) sudo rm -rf -- "$stage_dir" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

echo "==> Publishing release $version ($commit)"
sudo rsync -a --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.codegraph/' \
  --exclude 'data/' \
  --exclude 'packages/client/' \
  --exclude 'packages/sampler/' \
  --exclude 'target/' \
  --exclude '*.log' \
  "$source_dir/" "$stage_dir/"
printf '%s\n' "$commit" | sudo tee "$stage_dir/DEPLOYED_COMMIT" >/dev/null
sudo chown -R root:root "$stage_dir"
sudo chmod -R a+rX "$stage_dir"
sudo mv "$stage_dir" "$release_dir"
stage_dir=""

previous=""
if sudo test -L /opt/return/current; then
  previous=$(sudo readlink -f /opt/return/current)
fi

new_link="/opt/return/.current.$version"
sudo ln -s "$release_dir" "$new_link"
sudo mv -Tf "$new_link" /opt/return/current

sudo systemctl enable return-server.service >/dev/null
sudo systemctl restart return-server.service

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
  echo "error: new release failed health check; rolling back" >&2
  if [ -n "$previous" ] && sudo test -d "$previous"; then
    rollback_link="/opt/return/.rollback.$version"
    sudo ln -s "$previous" "$rollback_link"
    sudo mv -Tf "$rollback_link" /opt/return/current
    sudo systemctl restart return-server.service
  else
    sudo systemctl stop return-server.service
    sudo unlink /opt/return/current
  fi
  exit 1
fi

# Keep the current and immediately previous release on the small SD card.
sudo find /opt/return/releases -mindepth 1 -maxdepth 1 -type d \
  ! -name '.stage.*' -printf '%T@ %p\n' | sort -nr | awk '
    NR > 2 { sub(/^[^ ]+ /, ""); print }
  ' | while IFS= read -r old_release; do
    case "$old_release" in
      /opt/return/releases/*) sudo rm -rf -- "$old_release" ;;
      *) echo "error: refusing to remove unexpected release path: $old_release" >&2 ;;
    esac
  done

echo "deployed=$version"
echo "commit=$commit"
echo "health=http://127.0.0.1:8787/api/ping"
