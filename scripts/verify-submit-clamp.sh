#!/usr/bin/env bash
# Clamp boundary proof (mirrors PRD §9 test plan): the same-origin stub
# shares the clamp table with the Edge Function, so these four POSTs pin
# the boundary — valid 201, zero 422, forged 422, short-duration 422.
# Requires the dev or preview server on $BASE_URL (default :5173).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5173}"
SUBMIT="$BASE_URL/functions/v1/submit"

pass=0
fail=0

check() {
  local name="$1" expected_status="$2" expected_code="$3" payload="$4"
  local response status body
  response="$(curl -s -w '\n%{http_code}' -X POST "$SUBMIT" \
    -H 'Content-Type: application/json' -d "$payload")"
  status="$(printf '%s' "$response" | tail -n 1)"
  body="$(printf '%s' "$response" | head -n -1)"
  if [[ "$status" == "$expected_status" && "$body" == *"$expected_code"* ]]; then
    echo "PASS: $name (HTTP $status, $expected_code)"
    pass=$((pass + 1))
  else
    echo "FAIL: $name (want HTTP $expected_status $expected_code, got HTTP $status $body)"
    fail=$((fail + 1))
  fi
}

check "valid Ngozi payload boards" 201 'Ngozi' \
  '{"name":"Ngozi","score":12400,"wave":8,"duration_s":212}'
check "zero score is non-qualifying" 422 'NON_QUALIFYING_SCORE' \
  '{"name":"Techa","score":0,"wave":2,"duration_s":60}'
check "forged wave-2 score is implausible" 422 'IMPLAUSIBLE_SCORE' \
  '{"name":"Hax","score":9999999,"wave":2,"duration_s":60}'
check "short wave-8 duration is implausible" 422 'IMPLAUSIBLE_DURATION' \
  '{"name":"Speedy","score":100,"wave":8,"duration_s":5}'

echo "clamp boundary: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
