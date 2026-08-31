# XovenMart — VPS Deploy (Contabo VPS 4, Ubuntu 24.04)

End-to-end deploy pipeline. Every push to `main` that touches
`apps/api/**`, `apps/web/**`, `packages/db/**`, `infra/vps/**`, or
`.github/workflows/deploy-api-vps.yml` triggers a build → SSH → PM2 reload
on the live VPS.

---

## Files in this directory

| File | Purpose | Where it lives on the VPS |
|---|---|---|
| `bootstrap.sh` | One-shot setup for a fresh VPS | run once as root, then forgotten |
| `deploy.sh` | Runs on every push | `/var/www/xovenmart/deploy.sh` |
| `rollback.sh` | One-command rollback | `/var/www/xovenmart/rollback.sh` |
| `ecosystem.config.js` | PM2 process config | `/var/www/xovenmart/ecosystem.config.js` |
| `nginx-no-ssl.conf` | First-deploy HTTP-only nginx config | `/etc/nginx/sites-available/xovenmart` |
| `nginx.conf` | HTTPS version (use after certbot) | same |
| `postgresql.conf` | Postgres tuning drop-in | `/etc/postgresql/16/main/conf.d/xovenmart.conf` |
| `backup.sh` | Daily pg_dump cron job | `/usr/local/bin/xovenmart-backup.sh` |

---

## Day 1 — first-time VPS setup

Prerequisites:

- Contabo VPS 4 (Ubuntu 24.04 LTS, 4 GB RAM) ordered and reachable via SSH
- Domain DNS already pointing `api.xovenmart.com` and `app.xovenmart.com` at
  the VPS IP (A records, TTL 300)
- This repo cloned somewhere reachable by HTTPS

Steps:

```bash
# 1. SSH in as root
ssh root@<VPS_IP>

# 2. Clone the repo (bootstrap.sh pulls the infra/vps/* files from it)
git clone https://github.com/xoventechdev/xovenmart.git /tmp/xm
cd /tmp/xm && git checkout main

# 3. Run the bootstrap script (~5-8 min, idempotent)
bash infra/vps/bootstrap.sh
```

Bootstrap will:

- Install nginx, postgres-16, certbot, ufw, fail2ban, Node 22, pnpm@9, PM2
- Create `deploy` user (sudoer, used by GitHub Actions)
- Create `/var/www/xovenmart/{api,web,repo,backups}` layout
- Initialize bare git repo at `/var/www/xovenmart/repo`
- Create Postgres database `xovenmart` and role `xovenmart_app`
  (random password saved to `/root/.xovenmart_db_password` on the VPS)
- Write initial `.env` files (with random JWT secrets — replace before going live)
- Enable UFW (22, 80, 443 open; 3000/3001 bound to 127.0.0.1 only)
- Configure fail2ban SSH jail
- Install daily pg_dump cron at 03:00

After bootstrap, follow the on-screen "Next steps" instructions:

```bash
# 4. Edit env files with real secrets
sudo nano /var/www/xovenmart/api/shared/.env
sudo nano /var/www/xovenmart/web/shared/.env.production

# 5. Issue SSL certs (DNS must already be pointing to VPS)
sudo certbot --nginx \
  -d api.xovenmart.com \
  -d app.xovenmart.com \
  --agree-tos -m you@example.com --redirect

# 6. Switch nginx to the SSL config
sudo cp /var/www/xovenmart/repo/infra/vps/nginx.conf /etc/nginx/sites-available/xovenmart
sudo nginx -t && sudo systemctl reload nginx

# 7. Run first deploy manually
sudo -u deploy bash /var/www/xovenmart/deploy.sh manual-bootstrap
```

---

## Day 2 — wire GitHub Actions

1. **Generate SSH key for the deploy user on the VPS:**
   ```bash
   sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ""
   ```
   The public key is auto-added to `/home/deploy/.ssh/authorized_keys`. The
   private key is `/home/deploy/.ssh/id_ed25519`.

2. **Copy the private key** (`cat /home/deploy/.ssh/id_ed25519`) to your
   local PC, then paste it into the GitHub repo's secret `VPS_SSH_KEY`.

3. **Add 3 GitHub secrets** at
   Repo → Settings → Secrets and variables → Actions:

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | Your VPS public IP (e.g. `169.58.46.162`) |
   | `VPS_SSH_USER` | `deploy` |
   | `VPS_SSH_KEY` | contents of `/home/deploy/.ssh/id_ed25519` |

4. **Push a tiny test commit** to `apps/api/src/main.ts` (or anything in
   `apps/api/**`). Watch the Actions tab → you should see a green run for
   "Deploy → VPS" within 3-5 minutes.

---

## Day-to-day operations

```bash
# Check process status
sudo -u deploy pm2 status
sudo -u deploy pm2 logs xovenmart-api
sudo -u deploy pm2 logs xovenmart-web

# Tail logs
tail -f /var/log/xovenmart/api-error.log
tail -f /var/log/xovenmart/web-error.log

# Restart an app (graceful reload)
sudo -u deploy pm2 reload xovenmart-api
sudo -u deploy pm2 reload xovenmart-web

# Roll back to previous release
sudo -u deploy bash /var/www/xovenmart/rollback.sh
# or:
sudo -u deploy bash /var/www/xovenmart/rollback.sh api 2   # 2 releases back

# Re-run deploy manually
sudo -u deploy bash /var/www/xovenmart/deploy.sh main
```

---

## Filesystem layout on the VPS

```
/var/www/xovenmart/
├── repo/                          bare git mirror of GitHub
├── api/
│   ├── current → releases/<TS>    symlink (active release)
│   ├── releases/
│   │   ├── 2026-08-31T12-00-00Z/  ← full source + dist + node_modules
│   │   ├── 2026-08-31T13-00-00Z/  ← previous
│   │   └── ...                    (last 5 kept, older auto-pruned)
│   └── shared/
│       ├── .env                   secrets (operator-managed)
│       └── node_modules/          cached across releases
├── web/                           same shape as api/
├── backups/postgres/              daily pg_dump .sql.gz (7-day retention)
└── ecosystem.config.js            PM2 config
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pm2 status` shows `errored` | Bad env var or DB connection | `pm2 logs xovenmart-api` for stack trace |
| `curl https://api.xovenmart.com/api/v1/health` returns 502 | PM2 process crashed OR nginx can't reach :3001 | `pm2 status` + `curl http://127.0.0.1:3001/api/v1/health` |
| Cert renewal fails | DNS not pointing at VPS anymore | `dig +short api.xovenmart.com` should return VPS IP |
| `psql: password authentication failed for user "xovenmart_app"` | DB password rotated, `.env` not updated | Edit `/var/www/xovenmart/api/shared/.env`, `pm2 reload --update-env` |
| Deploy script hangs on `pnpm install` | Network blip | Re-run deploy |
| `EADDRINUSE :::3000` | Previous Next.js process didn't die | `pm2 delete xovenmart-web && pm2 start ecosystem.config.js --only xovenmart-web` |

---

## Backup + restore

Backups run daily at 03:00 (UTC) via cron →
`/var/www/xovenmart/backups/postgres/xovenmart-YYYY-MM-DDTHH-MM-SSZ.sql.gz`.

Manual backup:

```bash
sudo -u deploy bash /usr/local/bin/xovenmart-backup.sh
```

Restore from a backup:

```bash
# 1. Stop the API so it doesn't try to use the DB during restore
sudo -u deploy pm2 stop xovenmart-api

# 2. Restore (WARNING: this DROPs all current data)
gunzip -c /var/www/xovenmart/backups/postgres/xovenmart-2026-08-31T03-00-00Z.sql.gz \
  | sudo -u postgres psql xovenmart

# 3. Restart the API
sudo -u deploy pm2 start xovenmart-api
```