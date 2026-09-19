-- ============================================================================
-- Separate Postgres database for n8n
--
-- Runs ONCE at first Postgres container init (after 01-extensions.sql, only
-- when /docker-entrypoint-initdb.d runs because $PGDATA is empty — i.e., the
-- very first boot of a fresh `postgres_data` volume).
--
-- Threat model: an n8n RCE (credential-stealer, malicious workflow node,
-- compromised admin session) MUST NOT be able to read or write the
-- `xovenmart` product/order/user tables. We achieve that by:
--   1. A physically separate database (`xovenmart_n8n`).
--   2. A dedicated role (`n8n_user`) that has NO grants on `xovenmart`.
--   3. The application role (`xovenmart`) has NO grants on `xovenmart_n8n`.
--
-- n8n manages its own tables (workflowentity, credentialsentity, etc.) and
-- only needs CREATE on schema `public` for its first-boot migrations.
-- ============================================================================

-- The password is baked in here because this runs from a bind-mounted
-- /docker-entrypoint-initdb.d/*.sql, BEFORE any other service can read it.
-- It MUST be replaced by the operator with a real password before first boot.
-- To rotate: see infra/ENV_N8N.md.
CREATE DATABASE xovenmart_n8n;
CREATE USER n8n_user WITH PASSWORD 'CHANGE_ME_N8N_DB_PASSWORD';

-- n8n needs to connect + run its DDL migrations on first boot.
GRANT CONNECT, TEMPORARY ON DATABASE xovenmart_n8n TO n8n_user;

-- Connect into the new DB to grant schema-level perms. (Postgres init
-- scripts run in the default DB, so we have to switch contexts.)
\connect xovenmart_n8n
GRANT USAGE, CREATE ON SCHEMA public TO n8n_user;

-- Explicitly revoke from the public role so n8n_user can't accidentally
-- escalate via the default PUBLIC grants. (Postgres 15+ defaults to REVOKE
-- on PUBLIC for some privs, but we belt-and-braces this for older deploys.)
REVOKE ALL ON DATABASE xovenmart_n8n FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;