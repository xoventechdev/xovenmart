/**
 * PM2 ecosystem — XovenMart production
 *
 * Lives on the VPS at /var/www/xovenmart/ecosystem.config.js and is loaded by
 * `pm2 start|reload|restart` as the `deploy` user. The workflow symlinks each
 * release's code into `api/current` and `web/current`; PM2 reads from those.
 *
 * Notes:
 *   - For 4 GB VPS, single instance each is plenty. After load testing, bump
 *     `instances: 'max'` on xovenmart-api (NestJS handles requests async)
 *     and leave Next.js at 1 (single-process, Node cluster is finicky).
 *   - `env_file` reads .env files from disk — pm2 injects every KEY=value into
 *     process.env. Avoid putting comments inline in those files.
 *   - `max_memory_restart` causes PM2 to recycle a worker if it leaks memory.
 *     500 MB for API, 400 MB for web is generous for typical usage.
 *   - Logs go to /var/log/xovenmart/. PM2 rotates them via the `pm2-logrotate`
 *     module (installed by bootstrap.sh).
 */
module.exports = {
  apps: [
    {
      name: 'xovenmart-api',
      cwd: '/var/www/xovenmart/api/current',
      script: 'apps/api/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_file: '/var/www/xovenmart/api/shared/.env',
      out_file: '/var/log/xovenmart/api-out.log',
      error_file: '/var/log/xovenmart/api-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'xovenmart-web',
      cwd: '/var/www/xovenmart/web/current',
      // `next start -p 3000` reads .next/ that was produced by `next build`.
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
      },
      env_file: '/var/www/xovenmart/web/shared/.env.production',
      out_file: '/var/log/xovenmart/web-out.log',
      error_file: '/var/log/xovenmart/web-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
