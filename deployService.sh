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
  --exclude='./.npmrc' \
  --exclude='./content/local' \
  --exclude='./local' \
  --exclude='*.pem' \
  --exclude='*.test.js' \
  -cf - . | tar -C "$build_dir" -xf -

# Never delete the running service before the replacement is uploaded and
# installed. Keep the prior release until PM2 successfully restarts the new one.
release_id=${build_dir##*/}
remote_stage="services/.${service}-stage-${release_id}"
remote_backup="services/.${service}-backup-${release_id}"

printf '\n----> Uploading staged startup release to %s\n' "$hostname"
ssh -i "$key" "ubuntu@$hostname" "mkdir -p '$remote_stage'"
scp -r -i "$key" "$build_dir"/. "ubuntu@$hostname:$remote_stage/"

# The deployable archive deliberately excludes secrets. Send the local backend
# .env separately over encrypted SSH, with umask 077 on the server so it is
# never briefly world-readable. If absent, the remote installer can reuse the
# existing deployed .env (but will fail clearly if neither file exists).
if [[ -f "$project_root/service/.env" ]]; then
  printf '\n----> Uploading service/.env securely (not included in the public build)\n'
  ssh -i "$key" "ubuntu@$hostname" \
    "umask 077; cat > '$remote_stage/.env'" < "$project_root/service/.env"
fi

printf '\n----> Installing dependencies and activating staged release\n'
ssh -i "$key" "ubuntu@$hostname" \
  "bash -se -- '$remote_stage' '$remote_backup' '$service'" < "$project_root/tools/deploy-remote-startup.sh"

printf '\n----> Deployment complete: https://startup.%s\n' "$hostname"
