# XovenMart — run seed on live VPS
#
# Usage (PowerShell):
#   .\.runtime\200-run-seed-via-ssh.ps1
#
# Runs infra/vps/run-seed.sh on the live Contabo VPS (169.58.46.162) using
# the same SSH key the GitHub Actions deploy workflow uses. The seed is
# idempotent — it's safe to re-run.
#
# Requires the SSH key to be available at:
#   $HOME\.ssh\xovenmart_vps_ed25519
# Override with $env:VPS_SSH_KEY

$ErrorActionPreference = "Stop"

$VPS_HOST = "169.58.46.162"
$VPS_USER = "deploy"
$KEY_PATH = if ($env:VPS_SSH_KEY) { $env:VPS_SSH_KEY } else { "$HOME\.ssh\xovenmart_vps_ed25519" }

if (-not (Test-Path $KEY_PATH)) {
  Write-Host "ERROR: SSH key not found at $KEY_PATH" -ForegroundColor Red
  Write-Host "Set the VPS_SSH_KEY env var to the private key path, or save it to the default location."
  exit 1
}

Write-Host "Running seed on $VPS_USER@$VPS_HOST..." -ForegroundColor Cyan
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=$null `
    "$VPS_USER@$VPS_HOST" "bash /var/www/xovenmart/run-seed.sh"

Write-Host "`nDone. Check the home page: https://app.xovenmart.com" -ForegroundColor Green
