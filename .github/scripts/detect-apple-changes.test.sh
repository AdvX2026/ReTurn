#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
detector="$script_dir/detect-apple-changes.sh"
repo="$(mktemp -d)"
trap 'rm -rf "$repo"' EXIT

git init -q "$repo"
git -C "$repo" config user.email ci@example.invalid
git -C "$repo" config user.name "CI Test"

mkdir -p \
  "$repo/.github/scripts" \
  "$repo/.github/workflows" \
  "$repo/clients/apple/ReTurn/Core/Contract" \
  "$repo/clients/apple/ReTurn" \
  "$repo/packages/shared/src"
touch \
  "$repo/.github/scripts/detect-apple-changes.sh" \
  "$repo/.github/workflows/ci.yml" \
  "$repo/clients/apple/notice.md" \
  "$repo/clients/apple/ReTurn/App.swift" \
  "$repo/clients/apple/ReTurn/Core/Contract/Models.swift" \
  "$repo/packages/shared/src/api.ts" \
  "$repo/packages/shared/src/domain.ts" \
  "$repo/README.md"
git -C "$repo" add .
git -C "$repo" commit -qm base
base_sha="$(git -C "$repo" rev-parse HEAD)"

make_commit() {
  local name="$1"
  shift

  git -C "$repo" switch --detach -q "$base_sha"
  for path in "$@"; do
    printf '%s\n' "$name" >> "$repo/$path"
  done
  git -C "$repo" add "$@"
  git -C "$repo" commit -qm "$name"
  git -C "$repo" rev-parse HEAD
}

run_pull_request_case() {
  local name="$1"
  local head_sha="$2"
  local expected_status="$3"
  local expected_output="$4"
  local output="$repo/$name.output"
  local status

  : > "$output"
  set +e
  (
    cd "$repo"
    EVENT_NAME=pull_request \
      PR_BASE_SHA="$base_sha" \
      PR_HEAD_SHA="$head_sha" \
      GITHUB_OUTPUT="$output" \
      bash "$detector"
  ) > "$repo/$name.log" 2>&1
  status=$?
  set -e

  if [[ "$status" -ne "$expected_status" ]]; then
    printf 'case %s: expected status %s, got %s\n' "$name" "$expected_status" "$status" >&2
    exit 1
  fi

  if [[ "$(<"$output")" != "$expected_output" ]]; then
    printf 'case %s: expected output %q, got %q\n' \
      "$name" "$expected_output" "$(<"$output")" >&2
    exit 1
  fi
}

non_apple_sha="$(make_commit non-apple README.md)"
contract_only_sha="$(make_commit contract-only packages/shared/src/api.ts)"
synchronized_sha="$(make_commit synchronized \
  packages/shared/src/domain.ts \
  clients/apple/ReTurn/Core/Contract/Models.swift)"
notice_only_sha="$(make_commit notice-only clients/apple/notice.md)"
apple_source_sha="$(make_commit apple-source clients/apple/ReTurn/App.swift)"
detector_sha="$(make_commit detector-source .github/scripts/detect-apple-changes.sh)"

run_pull_request_case non-apple "$non_apple_sha" 0 'run_apple=false'
run_pull_request_case contract-only "$contract_only_sha" 1 ''
run_pull_request_case synchronized "$synchronized_sha" 0 'run_apple=true'
run_pull_request_case notice-only "$notice_only_sha" 0 'run_apple=false'
run_pull_request_case apple-source "$apple_source_sha" 0 'run_apple=true'
run_pull_request_case detector-source "$detector_sha" 0 'run_apple=true'
run_pull_request_case invalid-range invalid 0 'run_apple=true'

dispatch_output="$repo/workflow-dispatch.output"
: > "$dispatch_output"
(
  cd "$repo"
  EVENT_NAME=workflow_dispatch GITHUB_OUTPUT="$dispatch_output" bash "$detector"
)
[[ "$(<"$dispatch_output")" == 'run_apple=true' ]]

printf 'Apple change detector tests passed.\n'
