#!/bin/bash
set -e
echo "⚠️  This will DROP the xovenmart database and recreate it."
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi
docker exec xovenmart-postgres-dev psql -U xovenmart -c "DROP DATABASE IF EXISTS xovenmart;"
docker exec xovenmart-postgres-dev psql -U xovenmart -c "CREATE DATABASE xovenmart;"
pnpm db:migrate
pnpm db:seed
echo "✅ Database reset complete."
