#!/usr/bin/env bash
# Based on CS 260 simon-service/deployService.sh. The deployed service is the
# Node application, with Vite's frontend build copied into its public/ folder.
set -euo pipefail

usage() {
  printf 'Usage: ./deployService.sh -k <pem key file> -h <hostname> -s startup\n' >&2
}

key=''
hostname=''
service=''
while getopts ':k:h:s:' flag; do
  case "$flag" in
    k) key=$OPTARG ;;
    h) hostname=$OPTARG ;;
    s) service=$OPTARG ;;
    *) usage; exit 1 ;;
  esac
done

if [[ -z "$key" || -z "$hostname" || -z "$service" ]]; then
  usage
  exit 1
fi
if [[ "$service" != startup ]]; then
  printf 'This repository deploys only the startup service; pass -s startup.\n' >&2
  exit 1
fi
if [[ ! "$hostname" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then
  printf 'Invalid deployment hostname.\n' >&2
  exit 1
fi
if [[ ! -f "$key" ]]; then
  printf 'SSH key file not found: %s\n' "$key" >&2
  exit 1
fi

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$project_root"

printf '\n----> Building React frontend\n'
npm ci
npm run build

# The Simon service deployment expects a public/ directory beside index.js.
# Preserve backend subdirectories for later service modules, but never copy
# local dependencies, private environment files, or private scripture sources.
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/scripture-baseball-deploy.XXXXXXXX")
trap 'rm -rf "$build_dir"' EXIT
mkdir -p "$build_dir/public"
cp -R dist/. "$build_dir/public/"
tar -C service \
  --exclude='./node_modules' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./content/local' \
  --exclude='./local' \
  --exclude='*.pem' \
  --exclude='*.test.js' \
  -cf - . | tar -C "$build_dir" -xf -

printf '\n----> Replacing deployed startup files on %s\n' "$hostname"
ssh -i "$key" "ubuntu@$hostname" <<ENDSSH
rm -rf services/${service}
mkdir -p services/${service}
ENDSSH

scp -r -i "$key" "$build_dir"/. "ubuntu@$hostname:services/$service/"

printf '\n----> Installing server dependencies and restarting PM2\n'
ssh -i "$key" "ubuntu@$hostname" <<ENDSSH
bash -ic 'set -e; cd services/${service}; npm install --omit=dev; NODE_ENV=production pm2 restart ${service} --update-env'
ENDSSH

printf '\n----> Deployment complete: https://startup.%s\n' "$hostname"
