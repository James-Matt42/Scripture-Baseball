#!/usr/bin/env bash
# Executed on Ubuntu by deployService.sh after staging the uploaded files.
set -euo pipefail

stage=$1
backup=$2
service=$3
target="services/$service"

# Always remove any unactivated staging release, including a partially uploaded
# credential file, if dependency installation or configuration validation fails.
cleanup_stage() {
  if [[ -d "$stage" ]]; then rm -rf -- "$stage"; fi
}
trap cleanup_stage EXIT

# Keep the existing private corpus/credentials if this build did not ship them.
# Neither belongs under public/ and neither may be overwritten with stale data.
if [[ -d "$target/private" ]]; then
  mkdir -p "$stage/private"
  cp -an "$target/private/." "$stage/private/"
fi
if [[ -f "$target/.env" && ! -e "$stage/.env" ]]; then
  install -m 600 "$target/.env" "$stage/.env"
fi
if [[ ! -f "$stage/.env" ]]; then
  echo 'Missing MongoDB configuration: create service/.env locally or provision the existing services/startup/.env on the server' >&2
  exit 1
fi
chmod 600 "$stage/.env"

# Install *before* switching from the running release. Failure leaves the
# existing deployment intact and saves nothing to the public web directory.
bash -ic "set -e; cd '$stage'; npm ci --omit=dev"

# The deployment owns the MongoDB environment: do not silently inherit stale
# credentials exported in the remote login shell. Node >=22 parses the .env
# file using its built-in --env-file support; no `source`/shell evaluation.
bash -ic "set -e; cd '$stage'; env -u MONGODB_URI -u MONGODB_DB_NAME -u MONGODB_REQUIRED node --env-file=.env -e '
  if (!process.env.MONGODB_URI) {
    console.error(\"Missing MONGODB_URI in service/.env\");
    process.exit(1);
  }
  const { existsSync } = require(\"node:fs\");
  const corpusPath = process.env.SCRIPTURE_SQLITE_PATH || \"private/scriptures-eng.sqlite\";
  if (!existsSync(corpusPath)) {
    console.error(\"Missing private scripture SQLite corpus (\" + corpusPath + \"), required by /api/practice/catalog. Build it before deploying or configure SCRIPTURE_SQLITE_PATH.\");
    process.exit(1);
  }
'"

# PM2 gets a *real* environment (not merely an .env file on disk). The
# temporary Node process reads the file, then spawns PM2 with those variables
# inherited. No secrets appear in shell arguments, stdout, or git-tracked files.
restart_pm2() {
  local release_path=$1
  if [[ -f "$release_path/.env" ]]; then
    bash -ic "set -e; cd '$release_path'; env -u MONGODB_URI -u MONGODB_DB_NAME -u MONGODB_REQUIRED NODE_ENV=production node --env-file=.env -e '
      const { spawnSync } = require(\"node:child_process\");
      const result = spawnSync(\"pm2\", [\"restart\", \"$service\", \"--update-env\"], { stdio: \"inherit\" });
      process.exit(result.status ?? 1);
    '"
  else
    # DB12 may be the first release to use service/.env. A failed deployment
    # must still be able to restart its older, pre-.env PM2 application.
    echo 'Previous release has no .env; restarting its legacy PM2 process without --env-file' >&2
    bash -ic "set -e; cd '$release_path'; NODE_ENV=production pm2 restart '$service'"
  fi
}

check_status() {
  local url=$1
  local status
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "$url" 2>/dev/null) || status=unreachable
  printf '%s: HTTP %s\n' "$url" "${status:-unreachable}" >&2
}

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
if restart_pm2 "$target"; then
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
  echo 'New startup release failed its restart/health check. Endpoint results before rollback:' >&2
  check_status 'http://127.0.0.1:4000/api/health'
  check_status 'http://127.0.0.1:4000/api/practice/catalog'
  echo 'Check PM2 logs for MongoDB connection errors; HTTP 503 from the catalog indicates a missing/unavailable scripture corpus.' >&2
  echo 'Restoring the previous release.' >&2
  rm -rf "$target"
  if [[ -d "$backup" ]]; then
    mv "$backup" "$target"
    restart_pm2 "$target" || true
  fi
  exit 1
fi
rm -rf "$backup"
