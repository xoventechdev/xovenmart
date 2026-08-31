#!/usr/bin/env bash
# =============================================================================
# XovenMart — one-command rollback
# =============================================================================
# Usage (run as deploy user):
#
#   bash rollback.sh                 # rollback both api + web to previous release
#   bash rollback.sh api             # rollback only api
#   bash rollback.sh web             # rollback only web
#   bash rollback.sh api 2           # rollback api to release N-2 (relative to newest)
#
# Lists the available releases and prompts before doing anything destructive.
# =============================================================================

set -euo pipefail

APP=/var/www/xovenmart

list_releases() {
  local app_dir=$1
  ls -1t "$APP/$app_dir/releases" 2>/dev/null | nl -v 1 -w 2 -s '. '
}

rollback() {
  local app_dir=$1
  local offset=${2:-1}
  local releases_path=$APP/$app_dir/releases
  local current=$APP/$app_dir/current

  if [[ ! -L "$current" ]]; then
    echo "✗ $current is not a symlink — refusing to rollback" >&2
    return 1
  fi

  local target
  target=$(ls -1t "$releases_path" | sed -n "$((offset + 1))p")
  if [[ -z "$target" ]]; then
    echo "✗ no previous release available for $app_dir" >&2
    return 1
  fi

  echo "About to rollback $app_dir → $target"
  echo "Current symlink points at: $(readlink $current)"
  echo ""
  echo "Available releases:"
  list_releases "$app_dir"
  echo ""
  read -r -p "Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "aborted"
    return 0
  fi

  ln -sfn "$releases_path/$target" "$current"
  pm2 reload "xovenmart-$app_dir" --update-env
  pm2 save --force >/dev/null

  echo "✓ $app_dir rolled back to $target"
}

case "${1:-both}" in
  api)   rollback api "${2:-1}" ;;
  web)   rollback web "${2:-1}" ;;
  both|"") rollback api 1; rollback web 1 ;;
  *)
    echo "usage: bash rollback.sh [api|web|both] [N=1]" >&2
    exit 1
    ;;
esac
