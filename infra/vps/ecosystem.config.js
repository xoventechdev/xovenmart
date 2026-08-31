/**
 * PM2 ecosystem — XovenMart production
 *
 * Lives on the VPS at /var/www/xovenmart/api/ecosystem.config.js (installed by
 * bootstrap.sh) and is loaded by `pm2 start|reload|restart` as the `deploy`
 * user. Each release is symlinked into `api/current` / `web/current`; PM2 reads
 * from those.
 *
 * Why a wrapper script for API instead of `env_file`:
 *   pm2's `env_file` does inject KEY=VALUE into process.env, but it is brittle
 *   with our .env file because pm2 only reads the first N lines and ignores
 *   quoted values / inline comments in some versions. To be safe we have a
 *   small bash wrapper that `source`s the env file and execs node.
 *
 * Notes:
 *   - For 4 GB VPS, single instance each is plenty. After load testing, bump
 *     `instances: 'max'` on xovenmart-api (NestJS handles requests async)
 *     and leave Next.js at 1 (single-process, Node cluster is finicky).
 *   - `max_memory_restart` causes PM2 to recycle a worker if it leaks memory.
 *     500 MB for API, 400 MB for web is generous for typical usage.
 *   - Logs go to /var/log/xovenmart/. PM2 rotates them via the `pm2-logrotate`
 *     module (installed by bootstrap.sh).
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'xovenmart-api',
      cwd: '/var/www/xovenmart/api/current',
      // Wrapper script that sources /var/www/xovenmart/api/shared/.env then
      // execs the compiled NestJS entrypoint.
      script: '/var/www/xovenmart/api/shared/run-api.sh',
      // Tell pm2 to interpret the wrapper as a shell script, not Node.
      exec_interpreter: '/bin/bash',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        API_PREFIX: 'api/v1',
      },
      out_file: '/var/log/xovenmart/api-out.log',
      error_file: '/var/log/xovenmart/api-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'xovenmart-web',
      cwd: '/var/www/xovenmart/web/current/apps/web',
      // pnpm hoists `next` into apps/web/node_modules — run the dist directly.
      // Path is relative to cwd (= apps/web).
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      out_file: '/var/log/xovenmart/web-out.log',
      error_file: '/var/log/xovenmart/web-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
