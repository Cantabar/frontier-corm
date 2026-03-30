#!/bin/sh
# Construct DATABASE_URL from individual secret fields injected by ECS.
# Falls through to the original CMD if DATABASE_URL is already set (e.g. local dev).

if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-frontier_corm}?sslmode=no-verify"
fi

exec "$@"
