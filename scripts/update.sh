#!/usr/bin/env bash
# Local Brain — update script
# Pulls the latest code, rebuilds containers, runs migrations, and restarts.
#
# Usage:
#   ./scripts/update.sh          # normal update
#   ./scripts/update.sh --check  # just check if an update is available
#
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

CURRENT_VERSION=$(cat VERSION 2>/dev/null || echo "unknown")
REPO_URL="https://api.github.com/repos/Chapworks/local-brain/releases/latest"

# --- Check-only mode ---
if [[ "${1:-}" == "--check" ]]; then
  echo "Current version: $CURRENT_VERSION"
  LATEST=$(curl -sf "$REPO_URL" | grep '"tag_name"' | head -1 | sed 's/.*"v\?\([^"]*\)".*/\1/' || echo "")
  if [[ -z "$LATEST" ]]; then
    echo "Could not check latest version (no releases yet or GitHub unreachable)."
    exit 0
  fi
  echo "Latest release:  $LATEST"
  if [[ "$CURRENT_VERSION" == "$LATEST" ]]; then
    echo "You are up to date."
  else
    echo "Update available: $CURRENT_VERSION -> $LATEST"
    echo "Run ./scripts/update.sh to update."
  fi
  exit 0
fi

echo "=== Local Brain Update ==="
echo "Current version: $CURRENT_VERSION"
echo ""

# --- Pre-flight checks ---
if ! command -v docker &>/dev/null; then
  echo "Error: docker not found."
  exit 1
fi

if ! command -v git &>/dev/null; then
  echo "Error: git not found."
  exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet 2>/dev/null; then
  echo "Warning: You have local modifications."
  echo "Stashing changes before pull..."
  git stash
  STASHED=1
else
  STASHED=0
fi

# --- Pull latest ---
echo ""
echo "Pulling latest changes..."
git pull --ff-only origin main

NEW_VERSION=$(cat VERSION 2>/dev/null || echo "unknown")
echo "New version: $NEW_VERSION"

# --- Rebuild containers ---
echo ""
echo "Rebuilding Docker images..."
COMPOSE_FILE="docker-compose.yml"
if [[ -f "docker-compose.cloud.yml" ]] && docker compose -f docker-compose.cloud.yml ps --quiet 2>/dev/null | grep -q .; then
  COMPOSE_FILE="docker-compose.cloud.yml"
  echo "Detected cloud deployment."
fi

docker compose -f "$COMPOSE_FILE" build --no-cache mcp-server db-backup

# --- Run migrations ---
echo ""
echo "Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec mcp-server deno run \
  --allow-net --allow-env --allow-read \
  /app/scripts/migrate.ts 2>/dev/null || echo "Migration script not available or no pending migrations."

# --- Restart services ---
echo ""
echo "Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d mcp-server db-backup

# --- Restore stashed changes ---
if [[ "$STASHED" -eq 1 ]]; then
  echo ""
  echo "Restoring your local modifications..."
  git stash pop || echo "Warning: could not auto-restore stashed changes. Run 'git stash pop' manually."
fi

# --- Done ---
echo ""
echo "=== Update complete ==="
echo "Version: $NEW_VERSION"
echo ""
echo "Check health: curl -s http://localhost:8000/health | python3 -m json.tool"
