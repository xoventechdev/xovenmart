# Deploying the API to cPanel (shared hosting with Node.js + Postgres)

This is the **recommended production setup** for XovenMart when you don't want
to pay for a VPS. The web/admin panel goes to Vercel free tier (see
`DEPLOY_VERCEL.md`); only the API runs on cPanel.

## What you need on the cPanel side

| Resource | Where to set it up |
|---|---|
| Node.js 18+ app | cPanel → **Setup Node.js App** → Create application |
| PostgreSQL DB | cPanel → **PostgreSQL Databases** → create DB + grant user |
| FTP account | cPanel → **FTP Accounts** → create account (any folder under your home) |
| Cron job (optional) | cPanel → **Cron Jobs** → runs every 5 min to clear stale deploy triggers |
| Cron + Phusion Passenger watches `package.json` + `src/` and restarts on change |

## One-time setup on the server

### 1. Create the API directory and upload
- Pick a path outside `public_html`: e.g. `/home/<user>/xovenmart-api/`
- Create the directory in cPanel **File Manager** or via FTP.

### 2. Create the Postgres database
- cPanel → **PostgreSQL Databases**
- DB name: `xovenmart` (cPanel prefixes with your account, final name is
  `<cpaneluser>_xovenmart`)
- User: `xovenmart_app` (full prefix: `<cpaneluser>_xovenmart_app`)
- Privileges: ALL on the new DB
- **Write down** the DB host (often `localhost`), name, user, password.

### 3. Create the Node.js app
- cPanel → **Setup Node.js App** → **Create Application**
  - Node.js version: **20.x** (matches GitHub Actions runner)
  - Application mode: **Production**
  - Application root: `/home/<user>/xovenmart-api`
  - Application URL: pick a domain/subdomain (e.g. `api.yourdomain.com`)
  - Application startup file: `dist/main.js` (after we deploy)
  - Passenger log file: `/home/<user>/xovenmart-api/passenger.log`

### 4. Set environment variables
In the Node.js app panel → **Environment Variables** add:

```
NODE_ENV=production
PORT=3001
API_PREFIX=api/v1
DATABASE_URL=postgresql://<cpaneluser>_xovenmart_app:PASSWORD@localhost:5432/<cpaneluser>_xovenmart
JWT_SECRET=<run: openssl rand -hex 32>
JWT_REFRESH_SECRET=<run: openssl rand -hex 32>
CORS_ORIGIN=https://your-project.vercel.app
BULKSMSBD_API_KEY=...
BULKSMSBD_SENDER_ID=...
```

After saving, click **Restart** to load the env.

### 5. First upload (manual, then auto)
For the first deploy, push from your local machine:

```bash
# On your laptop
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @xovenmart/db prisma:generate
pnpm --filter @xovenmart/api build

# Then via FTP, upload everything under apps/api/ and packages/db/ to
# /home/<user>/xovenmart-api/ preserving the structure
```

Then in cPanel → Terminal (or SSH):

```bash
cd /home/<user>/xovenmart-api
# Use cPanel's pnpm if installed; otherwise npm install (slower but works)
pnpm install --prod --frozen-lockfile --ignore-scripts
cd packages/db
DATABASE_URL=$DATABASE_URL npx prisma db push --skip-generate
cd ../..
touch package.json   # trigger Passenger restart
```

After this, the API is live. Smoke-test:
```bash
curl https://api.yourdomain.com/api/v1/health
```

## Wire up GitHub Actions for auto-deploy

### 6. Create a GitHub repo
If you haven't already:

```bash
cd /path/to/xovenmart
git init
git add .
git commit -m "Initial commit"
gh repo create xovenmart/xovenmart --public --source=. --push
# Or create via GitHub web UI and add the remote manually
```

### 7. Add GitHub Secrets
Go to **Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `CPANEL_FTP_HOST` | e.g. `ftp.yourdomain.com` or the server IP |
| `CPANEL_FTP_USER` | e.g. `<cpaneluser>` or a dedicated FTP user like `<cpaneluser>@xovenmart-api` |
| `CPANEL_FTP_PASSWORD` | The FTP account password |
| `CPANEL_API_DIR` | e.g. `/home/<cpaneluser>/xovenmart-api` |
| `CPANEL_SSH_HOST` | (recommended) `yourdomain.com` or server IP |
| `CPANEL_SSH_USER` | (recommended) `<cpaneluser>` |
| `CPANEL_SSH_KEY` | (recommended) contents of a private SSH key authorized for that user |
| `CPANEL_HEALTH_URL` | `https://api.yourdomain.com/api/v1/health` |
| `CPANEL_DEPLOY_URL` | (fallback) `https://yourdomain.com/deploy-api.php` |
| `CPANEL_DEPLOY_TOKEN` | (fallback) the random string you set in the webhook PHP |

For SSH access: cPanel → **SSH Access** → upload your public key. Then paste
the matching **private** key into `CPANEL_SSH_KEY` (the whole `-----BEGIN OPENSSH PRIVATE KEY-----` block).

For the webhook fallback: edit `apps/api/scripts/cpanel-deploy-webhook.php`,
set `$TOKEN` to a random string, edit `$APP_DIR` and `$LOG_FILE` paths, then
upload the file via FTP to `/home/<user>/public_html/deploy-api.php`. Set
`CPANEL_DEPLOY_TOKEN` to that same string.

### 8. Push to deploy
Any commit on `main` that touches `apps/api/**` or `packages/**` will trigger
the workflow. You can also run it manually via the **Actions** tab → **Deploy API → cPanel** → **Run workflow**.

The workflow:
1. Builds the API in CI (Ubuntu, Node 20)
2. Bundles `apps/api/dist/`, `apps/api/scripts/`, `packages/db/`, `pnpm-lock.yaml`
3. Uploads via FTP (preserves any other files in the directory)
4. SSHes into the server (or hits the webhook)
5. Runs `cpanel-restart.sh` — installs prod deps, generates Prisma, optionally `db push`, touches `package.json` to trigger Passenger
6. Smoke-tests the health endpoint

## Local dev vs production

The dev loop:
```bash
pnpm install
pnpm db:push      # apply schema to local Postgres
pnpm dev          # turbo runs api + web in parallel
```

The prod loop (after a `git push`):
1. GitHub Action builds the API
2. FTP uploads to cPanel
3. SSH/webhook runs `cpanel-restart.sh`
4. Passenger restarts the Node process

## Troubleshooting

**"EACCES: permission denied" on cPanel during install** — pnpm tries to write
to `/root/.local/share/pnpm`. Either set `PNPM_HOME=$HOME/.local/share/pnpm`
in the Node.js app env, or use `npm install` instead (slower, no workspace
awareness — drop the `--frozen-lockfile` and use `--omit=dev`).

**"Cannot find module '@xovenmart/db'"** — `packages/db` didn't get uploaded
or `pnpm install` didn't run in the right directory. Check
`/home/<user>/xovenmart-api/packages/db/package.json` exists.

**Prisma client not generated** — `cpanel-restart.sh` runs `prisma generate`
in `packages/db`. If it fails, check the `deploy.log` on the server.

**App doesn't restart** — Passenger watches `src/`, `dist/`, `package.json`.
Touching `package.json` is the most reliable trigger. The restart script
does this for you. If it still doesn't, manually click **Restart** in the
Node.js app panel.

**CORS errors on the storefront** — make sure `CORS_ORIGIN` in the env
includes your Vercel URL, exactly (no trailing slash, with https://).

## What you'll do day-to-day

```bash
# Make code change locally
git add .
git commit -m "Add new feature"
git push origin main
# ... GitHub builds and uploads ...
# ... a minute later, your API is live with the new code
```

No more SSH'ing into the server for routine deploys.