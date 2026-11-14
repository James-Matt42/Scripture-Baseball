#!/usr/bin/env bash
# Executed on Ubuntu by deployService.sh after staging the uploaded files.
set -euo pipefail

stage=$1
backup=$2
service=$3
target="services/$service"

# Keep the existing private corpus/credentials if this build did not ship them.
# Neither belongs under public/ and neither may be overwritten with stale data.
if [[ -d "$target/private" ]]; then
  mkdir -p "$stage/private"
  cp -an "$target/private/." "$stage/private/"
fi
if [[ -f "$target/.env" && ! -e "$stage/.env" ]]; then
  cp -p "$target/.env" "$stage/.env"
fi

# Install *before* switching from the running release. Failure leaves the
# existing deployment intact and saves nothing to the public web directory.
bash -ic "set -e; cd '$stage'; npm ci --omit=dev"

if [[ -e "$backup" ]]; then
  echo 'Refusing deployment: stale backup path exists' >&2
  exit 1
fi
if [[ -d "$target" ]]; then
  mv "$target" "$backup"
fi
if ! mv "$stage" "$target"; then
  if [[ -d "$backup" ]]; then mv "$backup" "$target"; fi
  exit 1
fi

# A successful PM2 command does not prove its child stayed alive. Require an
# actual health response *and* a working scripture catalog on the service's
# documented local port before discarding the previous release. This catches
# a missing MongoDB config as well as a missing private SQLite corpus.
healthy=false
if bash -ic "set -e; cd '$target'; NODE_ENV=production pm2 restart '$service' --update-env"; then
  for _ in {1..10}; do
    if curl --silent --fail --max-time 2 http://127.0.0.1:4000/api/health >/dev/null &&
       curl --silent --fail --max-time 2 http://127.0.0.1:4000/api/practice/catalog >/dev/null; then
      healthy=true
      break
    fi
    sleep 1
  done
fi
if [[ "$healthy" != true ]]; then
  echo 'New startup release failed its restart/health check; restoring the previous release' >&2
  rm -rf "$target"
  if [[ -d "$backup" ]]; then
    mv "$backup" "$target"
    bash -ic "set -e; cd '$target'; NODE_ENV=production pm2 restart '$service' --update-env" || true
  fi
  exit 1
fi
rm -rf "$backup"
