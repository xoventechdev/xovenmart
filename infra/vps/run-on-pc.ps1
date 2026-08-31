# =============================================================================
# XovenMart — one-shot VPS bootstrap + first deploy
# =============================================================================
# Run this from your Windows PC in PowerShell. It SSHes into your Contabo
# VPS and runs every step needed to get the API + Web live on
# api.xovenmart.com and app.xovenmart.com.
#
# USAGE
#
#   1. Open PowerShell as Administrator (right-click Start → "Terminal (Admin)"
#      or "PowerShell (Admin)").
#   2. cd into this folder:
#        cd "E:\App Ideas\XovenMart v1\tech\xovenmart\infra\vps"
#   3. Run:
#        .\run-on-pc.ps1 -VpsIp 169.58.46.162
#
# WHAT THIS DOES (in order)
#
#   Step 1  SSH into VPS as root, set the root password, update apt
#   Step 2  Clone the repo + run bootstrap.sh (installs everything)
#   Step 3  Print the auto-generated DB password + JWT secrets
#   Step 4  Configure DNS by printing the A-record instructions
#   Step 5  Wait for DNS, then issue Let's Encrypt SSL certs
#   Step 6  Run the first deploy (manual-bootstrap mode)
#   Step 7  Smoke-test https://api.xovenmart.com/api/v1/health
#   Step 8  Print summary + next steps for GitHub Actions wiring
#
# REQUIREMENTS
#
#   - OpenSSH client on Windows 10/11 (built-in; "Add Optional Feature")
#   - PuTTY's plink.exe (optional, for non-interactive SSH that bypasses the
#     Windows OpenSSH "first connection" prompt)
# =============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$VpsIp,
    [string]$RootPassword = "wsB~0hc72oKQypae",
    [string]$SshUser = "root",
    [int]$SshPort = 22,
    [switch]$SkipDns,
    [switch]$SkipSsl,
    [switch]$SkipDeploy,
    [string]$Email = "admin@xovenmart.com"
)

# ----- helpers ---------------------------------------------------------------
$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "=== Step $n : $msg ===" -ForegroundColor Cyan
}

function Write-Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  XX  $msg" -ForegroundColor Red }

# Detect SSH client: prefer Windows OpenSSH ssh.exe, fall back to plink.
$ssh = (Get-Command ssh.exe -ErrorAction SilentlyContinue)?.Source
$plink = (Get-Command plink.exe -ErrorAction SilentlyContinue)?.Source
if (-not $ssh -and -not $plink) {
    Write-Err "Neither ssh.exe nor plink.exe found."
    Write-Err "Install OpenSSH (Settings → Apps → Optional Features → OpenSSH Client)"
    Write-Err "  OR install PuTTY (https://www.putty.org/)"
    exit 1
}
if ($ssh)  { Write-Ok "Using OpenSSH: $ssh" } else { Write-Ok "Using PuTTY plink: $plink" }

# Function: run a remote command. Streams stdout live.
function Invoke-Ssh {
    param(
        [string]$Cmd,
        [string]$Host = $VpsIp,
        [string]$User = $SshUser,
        [int]$Port = $SshPort,
        [string]$Password = $RootPassword,
        [int]$TimeoutSec = 600
    )

    if ($ssh) {
        # sshpass isn't standard on Windows; use `ssh -tt` with password via plink
        # OR use a one-shot expect-like wrapper. For simplicity here, use plink
        # if available (it accepts -pw), else fall back to ssh + sshpass-like
        # workaround via posh-ssh if installed.
        if ($plink) {
            $plinkArgs = @(
                "-ssh",
                "-P", "$Port",
                "-l", $User,
                "-pw", $Password,
                "-no-antispoof",
                "-batch",
                $Host,
                $Cmd
            )
            & $plink @plinkArgs
        } else {
            # No plink. Try with sshpass (rare on Windows).
            $sshpass = (Get-Command sshpass.exe -ErrorAction SilentlyContinue)?.Source
            if ($sshpass) {
                & $sshpass -p $Password ssh -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$User@$Host" $Cmd
            } else {
                Write-Err "ssh.exe found but no password-injection tool (plink or sshpass)."
                Write-Err "Easiest fix: install PuTTY (https://www.putty.org/) so plink.exe is available."
                exit 1
            }
        }
    } else {
        $plinkArgs = @(
            "-ssh",
            "-P", "$Port",
            "-l", $User,
            "-pw", $Password,
            "-no-antispoof",
            "-batch",
            $Host,
            $Cmd
        )
        & $plink @plinkArgs
    }
}

# Function: upload a local file to the VPS via scp.
function Send-Scp {
    param(
        [string]$Local,
        [string]$Remote,
        [string]$Host = $VpsIp,
        [string]$User = $SshUser,
        [string]$Password = $RootPassword
    )
    if ($plink) {
        # pscp ships with PuTTY
        $pscp = (Get-Command pscp.exe -ErrorAction SilentlyContinue)?.Source
        if (-not $pscp) {
            Write-Err "pscp.exe not found (comes with PuTTY). Install PuTTY or use scp from WSL."
            exit 1
        }
        & $pscp -P $SshPort -l $User -pw $Password -batch $Local "${User}@${Host}:${Remote}"
    } else {
        Write-Err "scp upload needs pscp.exe (PuTTY) or scp.exe (OpenSSH with sshpass)."
        exit 1
    }
}

# ----- Step 0: test SSH connectivity ------------------------------------------
Write-Step 0 "Test SSH connectivity to $VpsIp"
try {
    $null = Invoke-Ssh "echo 'ssh ok' && uname -a && cat /etc/os-release | head -3"
    Write-Ok "Connected to $VpsIp"
} catch {
    Write-Err "Cannot SSH to $VpsIp. Check IP, port (22), and that root password is correct."
    exit 1
}

# ----- Step 1: preflight -----------------------------------------------------
Write-Step 1 "Preflight: update apt + check Ubuntu version"
Invoke-Ssh "export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get upgrade -y -qq && echo OS=\$(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"

# ----- Step 2: clone repo + run bootstrap ------------------------------------
Write-Step 2 "Clone repo + run bootstrap.sh (~5-8 min)"
$bootstrapCmd = @"
set -e
if [ ! -d /tmp/xm ]; then
  git clone https://github.com/xoventechdev/xovenmart.git /tmp/xm
  cd /tmp/xm && git checkout main
fi
cd /tmp/xm
bash infra/vps/bootstrap.sh 2>&1 | tee /tmp/bootstrap.log
echo BOOTSTRAP_DONE=\$?
"@
Invoke-Ssh $bootstrapCmd 1200

# ----- Step 3: read auto-generated secrets -----------------------------------
Write-Step 3 "Read generated DB password + JWT secrets"
$dbPass = Invoke-Ssh "cat /root/.xovenmart_db_password"
Write-Ok "DB password (also in /root/.xovenmart_db_password on VPS): $dbPass"

$envFile = Invoke-Ssh "cat /var/www/xovenmart/api/shared/.env"
Write-Host ""
Write-Host "--- api/shared/.env ---" -ForegroundColor DarkGray
Write-Host $envFile
Write-Host "--- end ---" -ForegroundColor DarkGray

# ----- Step 4: DNS instructions ----------------------------------------------
Write-Step 4 "DNS — point A records at $VpsIp"
if (-not $SkipDns) {
    Write-Host ""
    Write-Host "At your domain registrar (where xovenmart.com is registered), add these A records:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  api.xovenmart.com     A    $VpsIp   (TTL 300)"
    Write-Host "  app.xovenmart.com     A    $VpsIp   (TTL 300)"
    Write-Host "  xovenmart.com         A    $VpsIp   (TTL 300)   -- optional, redirects to app."
    Write-Host "  www.xovenmart.com     A    $VpsIp   (TTL 300)   -- optional"
    Write-Host "  admin.xovenmart.com   A    $VpsIp   (TTL 300)   -- optional, admin UI"
    Write-Host ""
    Write-Host "Press ENTER when DNS is configured (or Ctrl+C to abort)..." -ForegroundColor Yellow
    Read-Host
}

# ----- Step 5: SSL ----------------------------------------------------------
Write-Step 5 "Issue Let's Encrypt SSL certs"
if (-not $SkipSsl) {
    $certCmd = @"
set -e
certbot --nginx \
  -d api.xovenmart.com \
  -d app.xovenmart.com \
  -d xovenmart.com \
  -d www.xovenmart.com \
  -d admin.xovenmart.com \
  --agree-tos -m $Email --redirect --non-interactive
nginx -t && systemctl reload nginx
echo CERT_DONE
"@
    Invoke-Ssh $certCmd 300
    # Switch from http-only to SSL nginx config
    Invoke-Ssh "cp /var/www/xovenmart/repo/infra/vps/nginx.conf /etc/nginx/sites-available/xovenmart && nginx -t && systemctl reload nginx && echo NGINX_SSL_OK"
}

# ----- Step 6: first deploy -------------------------------------------------
Write-Step 6 "First deploy (manual-bootstrap mode)"
if (-not $SkipDeploy) {
    $deployCmd = @"
set -e
cd /var/www/xovenmart
sudo -u deploy bash /var/www/xovenmart/deploy.sh manual-bootstrap
"@
    Invoke-Ssh $deployCmd 600
}

# ----- Step 7: smoke test ---------------------------------------------------
Write-Step 7 "Smoke test https://api.xovenmart.com/api/v1/health"
Start-Sleep -Seconds 5
try {
    $resp = Invoke-WebRequest -Uri "https://api.xovenmart.com/api/v1/health" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    Write-Ok "Health endpoint returned $($resp.StatusCode)"
    Write-Host "  body: $($resp.Content)"
} catch {
    Write-Warn "Smoke test failed: $($_.Exception.Message)"
    Write-Warn "Try again in 30s, or check: sudo -u deploy pm2 logs xovenmart-api"
}

try {
    $resp2 = Invoke-WebRequest -Uri "https://app.xovenmart.com" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    Write-Ok "Web endpoint returned $($resp2.StatusCode) (HTML)"
} catch {
    Write-Warn "Web smoke test failed: $($_.Exception.Message)"
}

# ----- Step 8: GitHub Actions wiring -----------------------------------------
Write-Step 8 "Wire GitHub Actions for future auto-deploys"
Write-Host ""
Write-Host "On the VPS (still as root):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ''"
Write-Host "  cat /home/deploy/.ssh/id_ed25519    <-- copy this entire block"
Write-Host ""
Write-Host "On GitHub: Repo → Settings → Secrets and variables → Actions → New secret" -"
Write-Host ""
Write-Host "  VPS_HOST      =  $VpsIp"
Write-Host "  VPS_SSH_USER  =  deploy"
Write-Host "  VPS_SSH_KEY   =  (paste the key you copied above)"
Write-Host ""
Write-Host "Optional: VPS_HEALTH_URL = https://api.xovenmart.com/api/v1/health" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Test it: push any commit to apps/api/ or apps/web/. Actions tab should" -ForegroundColor Green
Write-Host "show a green 'Deploy to VPS' run within ~3 minutes." -ForegroundColor Green
Write-Host ""
Write-Host "DONE." -ForegroundColor Green