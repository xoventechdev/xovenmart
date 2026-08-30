# Deploying XovenMart to Hetzner CPX21

## 1. Initial setup (one-time)

### 1.1 Buy VPS
- Hetzner Cloud → CPX21 (€8.29/mo): 3 vCPU, 4 GB RAM, 80 GB SSD, Nuremberg
- Add SSH key
- Enable backups (+€1.6/mo, worth it)

### 1.2 Point domain
- Cloudflare DNS:
  - `xovenmart.com` → A → VPS IP
  - `www.xovenmart.com` → CNAME → xovenmart.com
  - `api.xovenmart.com` → A → VPS IP
  - `cdn.xovenmart.com` → A → VPS IP
- Cloudflare proxy: ON (orange cloud) → gives free TLS + DDoS + BD edge POP

### 1.3 Reserve ports
```bash
sudo apt update && sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 1.4 Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# log out and back in
```

### 1.5 Clone + env
```bash
git clone <your-repo> /opt/xovenmart
cd /opt/xovenmart
cp .env.example .env
nano .env  # fill in production secrets
```

### 1.6 Bootstrap R2 + first DB push
```bash
# Create R2 bucket: xovenmart-backups
# Create R2 API token
# Save to .env

docker compose -f infra/docker-compose.yml up -d postgres
docker compose -f infra/docker-compose.yml run --rm api npx prisma migrate deploy
docker compose -f infra/docker-compose.yml run --rm api pnpm seed  # optional, dev only
```

## 2. Deploy

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Wait ~30s for health checks. Verify:
```bash
curl https://api.xovenmart.com/api/v1/health
curl https://xovenmart.com
```

## 3. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` builds images on push to `main`, pushes to
GHCR, then SSHes into VPS and runs `docker compose pull && docker compose up -d`.

## 4. Backups

- Nightly 03:00 BDT → R2 (kept 14 days)
- Test restore quarterly: `pg_restore --clean -d xovenmart_test latest.dump`

## 5. Monitoring

- UptimeRobot free tier → ping `https://api.xovenmart.com/api/v1/health` every 5 min
- Sentry free tier → application errors
- Watch `docker stats` for RAM

## 6. Capacity

- 4 GB box comfortably handles ~50 concurrent users, ~10K products, ~500 orders/day
- Upgrade to CPX31 (8 GB / €15/mo) when order rate > 1K/day
