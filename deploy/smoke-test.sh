#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: ./deploy/smoke-test.sh [options]

Options:
  --base-url URL    Server URL (default: http://127.0.0.1:8787)
  --health DATE     Test authenticated health upsert for DATE (YYYY-MM-DD)
  --voice FILE      Test voice upload/transcription with an audio file
  --save DATE       Seal DATE and require a non-degraded LLM result
  -h, --help        Show this help

Environment:
  RETURN_API_TOKEN  Optional API token for protected routes
  HEALTH_TOKEN      Required when --health is used

The default smoke test creates and then deletes one text node. --health,
--voice, and --save write additional durable data and are opt-in.
EOF
}

base_url=${RETURN_SERVER_URL:-http://127.0.0.1:8787}
health_date=""
voice_file=""
save_date=""
api_token=${RETURN_API_TOKEN:-}
node_id=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --base-url)
      [ "$#" -ge 2 ] || { echo "error: --base-url requires a URL" >&2; exit 2; }
      base_url=${2%/}
      shift 2
      ;;
    --health)
      [ "$#" -ge 2 ] || { echo "error: --health requires a date" >&2; exit 2; }
      health_date=$2
      shift 2
      ;;
    --voice)
      [ "$#" -ge 2 ] || { echo "error: --voice requires a file" >&2; exit 2; }
      voice_file=$2
      shift 2
      ;;
    --save)
      [ "$#" -ge 2 ] || { echo "error: --save requires a date" >&2; exit 2; }
      save_date=$2
      shift 2
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for command_name in curl jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "error: required command not found: $command_name" >&2
    exit 1
  }
done

validate_date() {
  printf '%s' "$1" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || {
    echo "error: invalid date: $1" >&2
    exit 2
  }
}

[ -z "$health_date" ] || validate_date "$health_date"
[ -z "$save_date" ] || validate_date "$save_date"
[ -z "$voice_file" ] || [ -f "$voice_file" ] || {
  echo "error: voice file not found: $voice_file" >&2
  exit 2
}

curl_api() {
  if [ -n "$api_token" ]; then
    curl --fail --silent --show-error --connect-timeout 5 --max-time 90 \
      -H "X-Return-Token: $api_token" "$@"
  else
    curl --fail --silent --show-error --connect-timeout 5 --max-time 90 "$@"
  fi
}

cleanup() {
  status=$?
  trap - 0
  if [ -n "$node_id" ]; then
    echo "==> cleanup default text node"
    if ! curl_api -X DELETE "$base_url/api/nodes/$node_id" | \
      jq -e '.ok == true' >/dev/null; then
      echo "error: failed to clean up smoke-test node $node_id" >&2
      [ "$status" -ne 0 ] || status=1
    fi
  fi
  exit "$status"
}

trap cleanup 0

echo "==> ping"
curl --fail --silent --show-error --connect-timeout 5 --max-time 10 \
  "$base_url/api/ping" | jq -e '.ok == true' >/dev/null

echo "==> device registration"
device_payload=$(jq -nc '{name:"Pi deployment smoke",platform:"linux"}')
device_id=$(curl_api -H 'Content-Type: application/json' \
  -d "$device_payload" "$base_url/api/devices/register" | jq -er '.device_id')

test_uuid=$(cat /proc/sys/kernel/random/uuid)
test_date=$(date +%F)
test_title="deployment-smoke-$test_uuid"
node_payload=$(jq -nc \
  --arg device "$device_id" \
  --arg uuid "$test_uuid" \
  --arg date "$test_date" \
  --arg title "$test_title" \
  '{device_id:$device,nodes:[{client_uuid:$uuid,kind:"text",title:$title,content:"ReTurn deployment smoke test",date:$date}]}')

echo "==> node create"
create_response=$(curl_api -H 'Content-Type: application/json' \
  -d "$node_payload" "$base_url/api/nodes")
node_id=$(printf '%s' "$create_response" | jq -er '.created[0].id')

echo "==> idempotent replay"
curl_api -H 'Content-Type: application/json' \
  -d "$node_payload" "$base_url/api/nodes" | \
  jq -e --arg uuid "$test_uuid" '.duplicates | index($uuid) != null' >/dev/null

echo "==> node read"
curl_api "$base_url/api/nodes?date=$test_date" | \
  jq -e --arg uuid "$test_uuid" '.nodes | any(.client_uuid == $uuid)' >/dev/null

echo "==> read APIs"
curl_api "$base_url/api/continue" | jq -e '.future.date != null' >/dev/null
curl_api "$base_url/api/stats/today" | jq -e '.stats.energy >= 0' >/dev/null
curl_api "$base_url/api/timeline?date=$test_date" | jq -e '.segments != null' >/dev/null
curl_api "$base_url/api/days?range=7" | jq -e '.days | length == 7' >/dev/null

if [ -n "$health_date" ]; then
  [ -n "${HEALTH_TOKEN:-}" ] || {
    echo "error: HEALTH_TOKEN is required with --health" >&2
    exit 2
  }
  echo "==> health authentication and upsert"
  health_payload=$(jq -nc --arg date "$health_date" \
    '{date:$date,sleep_minutes:420,steps:6000}')
  bad_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    -H 'Content-Type: application/json' -H 'X-Return-Token: deliberately-wrong' \
    -d "$health_payload" "$base_url/api/health")
  [ "$bad_status" = "401" ] || {
    echo "error: wrong health token returned HTTP $bad_status, expected 401" >&2
    exit 1
  }
  curl --fail --silent --show-error --max-time 30 \
    -H 'Content-Type: application/json' -H "X-Return-Token: $HEALTH_TOKEN" \
    -d "$health_payload" "$base_url/api/health" | jq -e '.node.kind == "health_daily"' >/dev/null
fi

if [ -n "$voice_file" ]; then
  echo "==> voice upload and transcription"
  voice_uuid=$(cat /proc/sys/kernel/random/uuid)
  voice_response=$(curl_api -X POST \
    -F "device_id=$device_id" \
    -F "client_uuid=$voice_uuid" \
    -F "date=$test_date" \
    -F "file=@$voice_file" \
    "$base_url/api/voice")
  printf '%s' "$voice_response" | jq -e '.transcript | length > 0' >/dev/null
fi

if [ -n "$save_date" ]; then
  echo "==> Save Today with real ferment result"
  save_payload=$(jq -nc --arg date "$save_date" --arg device "$device_id" \
    '{date:$date,device_id:$device,note_text:"Deployment end-to-end validation"}')
  curl_api -H 'Content-Type: application/json' -d "$save_payload" \
    "$base_url/api/save" | jq -e '.degraded == false and .saved_at != null' >/dev/null
fi

echo "smoke test passed"
