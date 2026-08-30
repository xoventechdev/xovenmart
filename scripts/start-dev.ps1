# XovenMart dev startup (Windows PowerShell)
# - Starts Postgres + Adminer via Docker
# - Installs deps if needed
# - Generates Prisma client + runs migrations
# - Optionally seeds the DB
# - Runs pnpm dev (API + Web via Turbo)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $RepoRoot

# 1. Check Docker is running
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

# 2. Start postgres + adminer
Write-Host "🐳 Starting Postgres + Adminer..." -ForegroundColor Cyan
docker compose -f infra/docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose failed" }

# 3. Wait for Postgres to be healthy
Write-Host "⏳ Waiting for Postgres to be healthy..." -ForegroundColor Cyan
$healthy = $false
for ($i = 1; $i -le 30; $i++) {
    $status = (docker inspect --format='{{.State.Health.Status}}' xovenmart-postgres-dev 2>$null)
    if ($status -eq "healthy") {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $healthy) {
    Write-Host "❌ Postgres did not become healthy in time." -ForegroundColor Red
    Write-Host "    Check logs with: docker logs xovenmart-postgres-dev" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Postgres is healthy." -ForegroundColor Green

# 4. pnpm install if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing workspace dependencies..." -ForegroundColor Cyan
    pnpm install
} else {
    Write-Host "� node_modules already present, skipping install." -ForegroundColor Cyan
}

# 5. Generate Prisma client
Write-Host "🔧 Generating Prisma client..." -ForegroundColor Cyan
pnpm db:generate

# 6. Run migrations
Write-Host "🗄️  Running database migrations..." -ForegroundColor Cyan
pnpm db:migrate

# 7. Ask about seeding
$seedReply = Read-Host "🌱 Seed the database? (y/n)"
if ($seedReply -match '^[Yy]$') {
    Write-Host "🌱 Seeding..." -ForegroundColor Cyan
    pnpm db:seed
} else {
    Write-Host "↩️  Skipping seed." -ForegroundColor Cyan
}

# 8. Start dev
Write-Host "🚀 Starting API + Web (Ctrl+C to stop)..." -ForegroundColor Cyan
pnpm dev
