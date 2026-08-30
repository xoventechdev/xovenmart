#!/usr/bin/env bash
# XovenMart dev startup (Linux / macOS)
# - Starts Postgres + Adminer via Docker
# - Installs deps if needed
# - Generates Prisma client + runs migrations
# - Optionally seeds the DB
# - Runs pnpm dev (API + Web via Turbo)

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Check Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop (or the daemon) and retry."
  exit 1
fi

# 2. Start postgres + adminer
echo "🐳 Starting Postgres + Adminer..."
docker compose -f infra/docker-compose.dev.yml up -d

# 3. Wait for Postgres to be healthy
echo "⏳ Waiting for Postgres to be healthy..."
for i in {1..30}; do
  status=$(docker inspect --format='{{.State.Health.Status}}' xovenmart-postgres-dev 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "✅ Postgres is healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ Postgres did not become healthy in time."
    echo "    Check logs with: docker logs xovenmart-postgres-dev"
    exit 1
  fi
  sleep 1
done

# 4. pnpm install if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing workspace dependencies..."
  pnpm install
else
  echo "📦 node_modules already present, skipping install."
fi

# 5. Generate Prisma client
echo "🔧 Generating Prisma client..."
pnpm db:generate

# 6. Run migrations
echo "🗄️  Running database migrations..."
pnpm db:migrate

# 7. Ask about seeding
read -p "🌱 Seed the database? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🌱 Seeding..."
  pnpm db:seed
else
  echo "↩️  Skipping seed."
fi

# 8. Start dev
echo "🚀 Starting API + Web (Ctrl+C to stop)..."
pnpm dev
