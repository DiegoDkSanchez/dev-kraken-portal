#!/usr/bin/env bash
set -euo pipefail
# Run from this checkout after authenticating with gh auth login.
command -v gh >/dev/null || { echo 'Install GitHub CLI and run gh auth login first.'; exit 1; }
gh auth status
owner=$(gh api user --jq .login)
repo="$owner/dev-kraken-portal"
if ! git rev-parse --git-dir >/dev/null 2>&1; then git init -b main; fi
if ! gh repo view "$repo" >/dev/null 2>&1; then
  gh repo create "$repo" --private --description 'DEV KRAKEN customer portal · Angular, Express, PostgreSQL'
fi
if ! git remote get-url origin >/dev/null 2>&1; then git remote add origin "https://github.com/$repo.git"; fi
echo "Repository ready: https://github.com/$repo"
echo 'Review files, commit, and push main when production variables and Pages are configured.'
