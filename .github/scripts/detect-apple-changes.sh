#!/usr/bin/env bash

set -euo pipefail

write_run_apple() {
  printf 'run_apple=%s\n' "$1" >> "$GITHUB_OUTPUT"
}

if [[ "${EVENT_NAME:-}" == "workflow_dispatch" ]]; then
  write_run_apple true
  exit 0
fi

if [[ "${EVENT_NAME:-}" == "pull_request" ]]; then
  range="${PR_BASE_SHA:-}...${PR_HEAD_SHA:-}"
elif [[ -z "${PUSH_BEFORE_SHA:-}" || "${PUSH_BEFORE_SHA:-}" =~ ^0+$ ]]; then
  write_run_apple true
  exit 0
else
  range="${PUSH_BEFORE_SHA}..${CURRENT_SHA:-}"
fi

if git diff --quiet "$range" --; then
  range_status=0
else
  range_status=$?
fi

if [[ "$range_status" -gt 1 ]]; then
  # An invalid diff range cannot safely exclude Apple changes.
  write_run_apple true
  exit 0
fi

if ! git diff --quiet "$range" -- \
  packages/shared/src/api.ts \
  packages/shared/src/domain.ts
then
  if git diff --quiet "$range" -- \
    clients/apple/ReTurn/Core/Contract/Models.swift
  then
    echo "::error::Shared contract changes must update the Swift mirror in Models.swift."
    exit 1
  fi
fi

if git diff --quiet "$range" -- \
  clients/apple \
  ':(exclude)clients/apple/notice.md' \
  packages/shared/src/api.ts \
  packages/shared/src/domain.ts \
  .github/workflows/ci.yml \
  .github/scripts
then
  write_run_apple false
else
  # A matching change or an invalid diff range must run the safe path.
  write_run_apple true
fi
