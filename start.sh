#!/usr/bin/env bash
set -Eeuo pipefail

# Jarvis startup helper for macOS and Linux.
# Run with: bash start.sh

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log()  { printf '\n[Jarvis] %s\n' "$*"; }
ok()   { printf '[  OK  ] %s\n' "$*"; }
warn() { printf '[ WARN ] %s\n' "$*" >&2; }
fail() { printf '\n[ ERROR ] %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js 20 or newer, then rerun bash start.sh."
command -v npm  >/dev/null 2>&1 || fail "npm is not installed. Install Node.js (which includes npm), then rerun bash start.sh."

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 20 ]] || fail "Node.js 20+ is required. Current version: $(node --version)."
ok "Node.js $(node --version) and npm $(npm --version) found."

# Create local environment file without overwriting existing user settings.
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    ok "Created .env from .env.example."
  else
    fail ".env.example is missing. Restore it from the repository."
  fi
else
  ok ".env already exists; leaving it unchanged."
fi

# Read the model setting without sourcing .env as shell code.
OLLAMA_MODEL="$(sed -n 's/^[[:space:]]*OLLAMA_MODEL[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d '\r' | sed -E 's/^["\x27]//; s/["\x27]$//')"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:4b}"
OLLAMA_BASE_URL="$(sed -n 's/^[[:space:]]*OLLAMA_BASE_URL[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d '\r' | sed -E 's/^["\x27]//; s/["\x27]$//')"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

if ! command -v ollama >/dev/null 2>&1; then
  fail "Ollama is not installed. Install it from https://ollama.com/download, then rerun bash start.sh."
fi
ok "Ollama command found."

# Check the local Ollama server. If it's not running, try to start it.
if ! curl --silent --fail --max-time 2 "${OLLAMA_BASE_URL%/}/api/tags" >/dev/null 2>&1; then
  log "Ollama server is not responding at $OLLAMA_BASE_URL; trying to start 'ollama serve'..."
  ollama serve > /tmp/jarvis-ollama.log 2>&1 &
  OLLAMA_PID=$!
  for _ in {1..20}; do
    if curl --silent --fail --max-time 2 "${OLLAMA_BASE_URL%/}/api/tags" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! curl --silent --fail --max-time 2 "${OLLAMA_BASE_URL%/}/api/tags" >/dev/null 2>&1; then
    warn "Could not start Ollama automatically. Log: /tmp/jarvis-ollama.log"
    warn "Start Ollama manually, verify OLLAMA_BASE_URL in .env, then rerun this script."
    exit 1
  fi
fi
ok "Ollama server is responding at $OLLAMA_BASE_URL."

# Confirm the configured model is available; offer to download it if missing.
if ! ollama list 2>/dev/null | awk 'NR > 1 {print $1}' | grep -Fxq "$OLLAMA_MODEL"; then
  printf '\nConfigured Ollama model "%s" is not installed.\n' "$OLLAMA_MODEL"
  read -r -p "Download it now with 'ollama pull $OLLAMA_MODEL'? [y/N] " ANSWER
  case "$ANSWER" in
    y|Y|yes|YES)
      ollama pull "$OLLAMA_MODEL" || fail "Model download failed. Check your internet connection and rerun bash start.sh."
      ;;
    *)
      fail "Model is required. Install it with: ollama pull $OLLAMA_MODEL"
      ;;
  esac
fi
ok "Ollama model '$OLLAMA_MODEL' is available."

# Install npm dependencies when needed.
if [[ ! -d node_modules ]]; then
  log "node_modules is missing; installing npm dependencies..."
  npm install || fail "npm install failed. Review the error above and rerun bash start.sh."
else
  ok "npm dependencies directory exists."
fi

# Make sure Playwright's Chromium browser is available.
if [[ ! -d "${HOME}/.cache/ms-playwright" ]] && [[ "$(uname -s)" != "Darwin" ]]; then
  log "Playwright browser cache not found; installing Chromium..."
  npx playwright install chromium || fail "Could not install Playwright Chromium."
elif ! npx playwright --version >/dev/null 2>&1; then
  log "Playwright CLI unavailable; installing project dependencies..."
  npm install || fail "npm install failed."
  npx playwright install chromium || fail "Could not install Playwright Chromium."
else
  # The browser may be installed in a platform-specific cache; let Playwright verify/repair it.
  if ! node --input-type=module -e "import { chromium } from 'playwright'; const b = await chromium.launch({headless:true}); await b.close();" >/dev/null 2>&1; then
    log "Playwright Chromium is missing or cannot launch; installing it..."
    npx playwright install chromium || fail "Could not install Playwright Chromium."
  else
    ok "Playwright Chromium can launch."
  fi
fi

log "Starting Jarvis API. Press Ctrl+C to stop it."
exec npm run dev
