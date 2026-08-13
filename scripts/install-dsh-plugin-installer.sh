#!/usr/bin/env bash

# Downloads and installs the latest DSH Plugin Installer release.
# Usage: bash install-dsh-plugin-installer.sh [--profile NAME] [--no-start]

set -euo pipefail

readonly REPOSITORY='Toukaiteio/dsh-plugin-installer'
profile='web'
start_web=true

usage() {
  cat <<'EOF'
Usage: install-dsh-plugin-installer.sh [options]

Downloads the latest stable DSH Plugin Installer release and installs it into
a DSH Profile.

Options:
  -p, --profile NAME  Target DSH Profile (default: web)
      --no-start      Install without starting DSH afterwards
  -h, --help          Show this help message
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--profile)
      [[ $# -ge 2 ]] || fail 'Missing value for --profile.'
      profile="$2"
      shift 2
      ;;
    --no-start)
      start_web=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

[[ "$profile" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'Profile names may contain only letters, numbers, hyphens, and underscores.'
command -v dsh >/dev/null 2>&1 || fail 'The DSH CLI was not found on PATH. Install DeepSeek Harness first, then run this script again.'
command -v curl >/dev/null 2>&1 || fail 'curl is required to download the release.'
command -v node >/dev/null 2>&1 || fail 'Node.js is required to read the GitHub Release metadata.'

temporary_directory=''
cleanup() {
  if [[ -n "$temporary_directory" && -d "$temporary_directory" ]]; then
    rm -rf "$temporary_directory"
  fi
}
trap cleanup EXIT

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/dsh-plugin-installer.XXXXXX")"
release_json="$temporary_directory/release.json"
archive_path="$temporary_directory/dsh-plugin-installer.tgz"

printf 'Finding the latest DSH Plugin Installer release...\n'
curl --fail --location --retry 3 --silent --show-error \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: dsh-plugin-installer-bootstrap' \
  "https://api.github.com/repos/$REPOSITORY/releases/latest" \
  -o "$release_json"

release_metadata="$(node - "$release_json" <<'NODE'
const { readFileSync } = require('node:fs')

const release = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (release.message) throw new Error(`GitHub API error: ${release.message}`)

const asset = (release.assets ?? []).find(({ name }) => /^dsh-plugin-installer-.+\.tgz$/.test(name))
if (!asset) throw new Error(`Release ${release.tag_name ?? 'latest'} does not contain a DSH Plugin Installer package archive.`)

process.stdout.write(JSON.stringify({
  tag: release.tag_name ?? 'latest',
  url: asset.browser_download_url,
  digest: typeof asset.digest === 'string' ? asset.digest : '',
}))
NODE
)" || fail 'Unable to read the GitHub Release metadata.'

release_tag="$(printf '%s' "$release_metadata" | node -e 'const { readFileSync } = require("node:fs"); process.stdout.write(JSON.parse(readFileSync(0, "utf8")).tag)')"
download_url="$(printf '%s' "$release_metadata" | node -e 'const { readFileSync } = require("node:fs"); process.stdout.write(JSON.parse(readFileSync(0, "utf8")).url)')"
asset_digest="$(printf '%s' "$release_metadata" | node -e 'const { readFileSync } = require("node:fs"); process.stdout.write(JSON.parse(readFileSync(0, "utf8")).digest)')"

printf 'Downloading %s...\n' "$release_tag"
curl --fail --location --retry 3 --silent --show-error \
  -H 'User-Agent: dsh-plugin-installer-bootstrap' \
  "$download_url" \
  -o "$archive_path"

if [[ "$asset_digest" =~ ^sha256:([[:xdigit:]]{64})$ ]]; then
  expected_hash="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_hash="$(sha256sum "$archive_path" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual_hash="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  else
    fail 'GitHub provided a SHA-256 checksum, but neither sha256sum nor shasum is available to verify it.'
  fi
  actual_hash="$(printf '%s' "$actual_hash" | tr '[:upper:]' '[:lower:]')"
  [[ "$actual_hash" == "$expected_hash" ]] || fail 'The downloaded package checksum does not match the GitHub Release checksum.'
fi

printf "Installing into the '%s' DSH Profile...\n" "$profile"
dsh plugin --profile "$profile" add "$archive_path"
printf 'DSH Plugin Installer %s was installed successfully.\n' "$release_tag"

if [[ "$start_web" == true && "$profile" == 'web' ]]; then
  printf 'Starting DSH Web...\n'
  dsh web
elif [[ "$start_web" == true ]]; then
  printf "Installation is complete. Start this Profile with: dsh --profile %s\n" "$profile"
fi
