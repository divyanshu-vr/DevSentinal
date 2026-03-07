#!/usr/bin/env bash
# ============================================================
# DevSentinel Pipeline Test Script
# Tests the full analysis pipeline via CLI (no frontend needed)
# ============================================================

set -eo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
REPO_URL="${1:-}"
PRD_FILE="${2:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }
header(){ echo -e "\n${BOLD}═══════════════════════════════════════${NC}"; echo -e "${BOLD} $*${NC}"; echo -e "${BOLD}═══════════════════════════════════════${NC}"; }

usage() {
  echo ""
  echo "Usage: $0 <github-repo-url> <prd-file-path>"
  echo ""
  echo "Examples:"
  echo "  $0 https://github.com/expressjs/express ./my-prd.md"
  echo "  $0 https://github.com/owner/repo ./DevSentinel_PRD_v1.docx"
  echo ""
  echo "Supported PRD formats: .pdf, .md, .docx"
  echo ""
  echo "Prerequisites:"
  echo "  1. Dev server running:  cd devsentinal && npm run dev"
  echo "  2. Inngest dev server:  npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"
  echo ""
  exit 1
}

# ── Validate args ──────────────────────────────────────────
if [[ -z "$REPO_URL" || -z "$PRD_FILE" ]]; then
  usage
fi

if [[ ! -f "$PRD_FILE" ]]; then
  err "PRD file not found: $PRD_FILE"
  exit 1
fi

# ── Check server is running ────────────────────────────────
header "Checking Server"
if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/projects" | grep -qE "^[23]"; then
  err "Dev server not running at $BASE_URL"
  echo "  Start it first:  cd devsentinal && npm run dev"
  exit 1
fi
ok "Dev server is running at $BASE_URL"

# ── Step 1: Create Project ─────────────────────────────────
header "Step 1: Create Project"
log "Creating project from repo: $REPO_URL"

CREATE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"repo_url\": \"$REPO_URL\"}")

HTTP_CODE=$(echo "$CREATE_RESP" | tail -1)
BODY=$(echo "$CREATE_RESP" | sed '$d')

if [[ -z "$HTTP_CODE" ]] || [[ "$HTTP_CODE" -ge 400 ]]; then
  err "Failed to create project (HTTP ${HTTP_CODE:-unknown})"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

PROJECT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['project']['id'])" 2>/dev/null) || true
PROJECT_NAME=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['project']['name'])" 2>/dev/null) || true
TECH_STACK=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ts=d.get('tech_stack',[])
if isinstance(ts, list): print(', '.join(ts))
elif isinstance(ts, dict): print(', '.join(ts.keys()))
else: print('unknown')
" 2>/dev/null) || TECH_STACK="unknown"

if [[ -z "$PROJECT_ID" ]]; then
  err "Failed to parse project ID from response"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

ok "Project created!"
echo "  ID:         $PROJECT_ID"
echo "  Name:       ${PROJECT_NAME:-unknown}"
echo "  Tech Stack: ${TECH_STACK:-unknown}"

# ── Step 2: Upload PRD ─────────────────────────────────────
header "Step 2: Upload PRD"
log "Uploading PRD: $PRD_FILE"

UPLOAD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
  -F "file=@$PRD_FILE" \
  -F "project_id=$PROJECT_ID")

HTTP_CODE=$(echo "$UPLOAD_RESP" | tail -1)
BODY=$(echo "$UPLOAD_RESP" | sed '$d')

if [[ "$HTTP_CODE" -ge 400 ]]; then
  err "Failed to upload PRD (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

REQ_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('requirements',[])))" 2>/dev/null)
DOC_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['document']['id'])" 2>/dev/null)

ok "PRD uploaded and parsed!"
echo "  Document ID:   $DOC_ID"
echo "  Requirements:  $REQ_COUNT extracted"

# Print requirement summaries
echo ""
log "Extracted requirements:"
echo "$BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, r in enumerate(data.get('requirements', []), 1):
    cat = r.get('category', '?')
    name = r.get('feature_name', '?')
    prio = r.get('priority', '?')
    print(f'  {i:2d}. [{prio}] {cat} / {name}')
" 2>/dev/null || true

# ── Step 3: Trigger Analysis ──────────────────────────────
header "Step 3: Trigger Analysis"
log "Starting analysis pipeline..."

ANALYZE_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/projects/$PROJECT_ID/analyze")

HTTP_CODE=$(echo "$ANALYZE_RESP" | tail -1)
BODY=$(echo "$ANALYZE_RESP" | sed '$d')

if [[ "$HTTP_CODE" -ge 400 ]]; then
  err "Failed to trigger analysis (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

RUN_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['run_id'])" 2>/dev/null)
SSE_URL=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['sse_url'])" 2>/dev/null)

ok "Analysis triggered!"
echo "  Run ID:   $RUN_ID"
echo "  SSE URL:  $SSE_URL"

# ── Step 4: Poll for results ──────────────────────────────
header "Step 4: Waiting for Analysis to Complete"
log "Polling every 3 seconds... (Ctrl+C to stop)"
echo ""

POLL_COUNT=0
MAX_POLLS=120  # 6 minutes max

while [[ $POLL_COUNT -lt $MAX_POLLS ]]; do
  FINDINGS_RESP=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID/findings?run_id=$RUN_ID")

  STATUS=$(echo "$FINDINGS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('run',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")

  case "$STATUS" in
    "complete")
      echo ""
      HEALTH=$(echo "$FINDINGS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['run'].get('health_score',0))" 2>/dev/null)
      TOTAL=$(echo "$FINDINGS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['run'].get('total_tests',0))" 2>/dev/null)
      PASSED=$(echo "$FINDINGS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['run'].get('passed',0))" 2>/dev/null)
      FAILED=$(echo "$FINDINGS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['run'].get('failed',0))" 2>/dev/null)

      header "Analysis Complete!"
      echo ""
      echo -e "  ${BOLD}Health Score:${NC}  ${HEALTH}%"
      echo -e "  ${BOLD}Total Tests:${NC}   $TOTAL"
      echo -e "  ${GREEN}Passed:${NC}        $PASSED"
      echo -e "  ${RED}Failed:${NC}        $FAILED"
      echo ""

      # Print findings summary
      echo -e "${BOLD}Findings:${NC}"
      echo "$FINDINGS_RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
findings = data.get('findings', [])
for i, f in enumerate(findings, 1):
    status = f.get('status', '?')
    icon = '\033[0;32mPASS\033[0m' if status == 'pass' else '\033[0;31mFAIL\033[0m'
    feature = f.get('feature_name', '?')
    test = f.get('test_description', '?')[:60]
    conf = f.get('confidence', 0)
    fpath = f.get('file_path', '')
    print(f'  {i:2d}. [{icon}] {feature}')
    print(f'      {test}')
    if fpath:
        print(f'      File: {fpath}')
    print(f'      Confidence: {conf}%')
    if status != 'pass' and f.get('explanation'):
        expl = f['explanation'][:100]
        print(f'      Reason: {expl}')
    print()
" 2>/dev/null || echo "$FINDINGS_RESP" | python3 -m json.tool 2>/dev/null

      # Save full results to file
      RESULTS_FILE="/data/divyanshu/DevSentinal/test-results-$(date +%Y%m%d-%H%M%S).json"
      echo "$FINDINGS_RESP" | python3 -m json.tool > "$RESULTS_FILE" 2>/dev/null
      ok "Full results saved to: $RESULTS_FILE"
      exit 0
      ;;

    "error")
      echo ""
      ERR_MSG=$(echo "$FINDINGS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('run',{}).get('error_message','Unknown error'))" 2>/dev/null)
      err "Analysis failed: $ERR_MSG"
      exit 1
      ;;

    "pending"|"parsing_prd"|"understanding_code"|"generating_tests"|"running_tests")
      printf "\r  Status: %-25s (poll %d/%d)" "$STATUS" "$POLL_COUNT" "$MAX_POLLS"
      ;;

    *)
      printf "\r  Status: %-25s (poll %d/%d)" "$STATUS" "$POLL_COUNT" "$MAX_POLLS"
      ;;
  esac

  sleep 3
  POLL_COUNT=$((POLL_COUNT + 1))
done

echo ""
err "Timed out after $((MAX_POLLS * 3)) seconds. Check Inngest dashboard for details."
exit 1
