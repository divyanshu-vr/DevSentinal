#!/usr/bin/env bash
# ============================================================
# Seed the stub test user into Supabase
# The auth middleware returns a hardcoded user ID — this ensures
# that user exists in the DB so foreign key constraints pass.
# ============================================================

set -euo pipefail

# Load env vars (strip inline comments)
ENV_FILE="$(dirname "$0")/devsentinal/.env"
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^# ]] && continue
    [[ -z "$line" ]] && continue
    # Strip inline comments and trailing whitespace
    line=$(echo "$line" | sed 's/\s*#.*//')
    [[ -z "$line" ]] && continue
    # Only export lines with = that have a value
    if [[ "$line" == *"="* ]]; then
      key=$(echo "$line" | cut -d= -f1)
      val=$(echo "$line" | cut -d= -f2-)
      [[ -z "$val" ]] && continue
      export "$key=$val"
    fi
  done < "$ENV_FILE"
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:?Missing NEXT_PUBLIC_SUPABASE_URL}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?Missing SUPABASE_SERVICE_ROLE_KEY}"

echo "Seeding test user into Supabase..."

RESP=$(curl -s -w "\n%{http_code}" \
  -X POST "${SUPABASE_URL}/rest/v1/users" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d '{
    "id": "00000000-0000-0000-0000-000000000001",
    "github_id": "stub-github-id",
    "username": "stub-user",
    "email": "stub@example.com",
    "avatar_url": null,
    "github_token": null
  }')

HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]] || [[ "$HTTP_CODE" == "409" ]]; then
  echo "Test user seeded successfully (or already exists)."
  echo "  User ID: 00000000-0000-0000-0000-000000000001"
  echo "  Username: stub-user"
else
  echo "Warning: Could not seed user (HTTP $HTTP_CODE)"
  echo "$BODY"
  echo ""
  echo "You may need to insert manually via Supabase dashboard:"
  echo "  INSERT INTO users (id, github_id, username, email)"
  echo "  VALUES ('00000000-0000-0000-0000-000000000001', 'stub-github-id', 'stub-user', 'stub@example.com')"
  echo "  ON CONFLICT (id) DO NOTHING;"
fi
