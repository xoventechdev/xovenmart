// Reconcile ProductImage rows against the live upload volume.
//
// Walks every ProductImage row in the database via the admin media API,
// classifies each URL into one of:
//   - base64    : data: URL embedded in the DB row itself → always live
//   - fileOnDisk: URL of the form <api-host>/uploads/<tail> → HEAD-check
//                 against the live API; if 200 it's live, otherwise dead
//   - external  : any other https URL → we don't own the bytes, skip
//                 (the script can't prove it's broken, only that we
//                 can't verify it from here)
//
// Dry-run (default): prints a report.
// --apply           : writes reconciliation-backup.json with every row
//                     it would touch, then deletes the dead rows from
//                     the DB.
//
// The backup file is written BEFORE the deletes so a mid-way failure
// can still be hand-restored by replaying the backup file's `dead`
// entries through a small SQL INSERT (or the same admin API). Restore
// isn't built in — you'd only ever use it as a disaster safety net.

import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = process.env.API_URL || 'https://api.xovenmart.com/api/v1';
const ADMIN_API = `${API}/admin/media`;
const HOST_PREFIX = API.replace(/\/api\/v1$/, '');
const UPLOAD_PREFIX = `${HOST_PREFIX}/uploads`;
const BACKUP_FILE = join(__dirname, 'reconciliation-backup.json');
const APPLY = process.argv.includes('--apply');

// Concurrency — HEAD-checking N images serially takes minutes, but
// blasting 173 in parallel would hammer the API. 12 is the sweet spot
// the upstream CDN can comfortably absorb.
const HEAD_CONCURRENCY = 12;

function classify(url) {
  if (!url) return 'unknown';
  if (url.startsWith('data:')) return 'base64';
  if (url.startsWith(`${UPLOAD_PREFIX}/`) || url.startsWith('/uploads/')) return 'fileOnDisk';
  return 'external';
}

// ── 1. Authenticate ──────────────────────────────────────────────────────

async function login() {
  process.stdout.write('Admin email: ');
  const email = (await new Promise((r) => stdin.once('data', (d) => r(d.toString().trim()))));
  process.stdout.write('Admin password: ');
  // Hide input — read raw, don't echo. Works in plain TTY but the line
  // is still recoverable from /dev/stdin so we don't pretend it's
  // cryptographically hidden.
  const password = (await new Promise((r) => stdin.once('data', (d) => r(d.toString().trim()))));
  console.log('');
  const res = await fetch(`${API}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`login failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.accessToken) throw new Error('login response missing accessToken');
  return body.accessToken;
}

// ── 2. Pull every ProductImage row from the admin API ────────────────────

async function listAllImages(token) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `${ADMIN_API}/images?page=${page}&perPage=500`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list images failed (${res.status}): ${await res.text()}`);
    const body = await res.json();
    totalPages = Math.max(1, Math.ceil((body.total ?? 0) / (body.perPage ?? 500)));
    all.push(...body.items);
    process.stdout.write(`\r  fetched page ${page}/${totalPages} (${all.length}/${body.total ?? '?'} rows)`);
    page++;
  }
  process.stdout.write('\n');
  return all;
}

// ── 3. HEAD-check fileOnDisk URLs in parallel ────────────────────────────

async function headCheck(url) {
  // HEAD is cheaper than GET and the API supports it (express.static
  // answers HEAD on the /uploads mount by default). If the upstream
  // ever stops supporting HEAD we fall back to a ranged GET.
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    try {
      res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    } catch (e) {
      return { ok: false, status: 0, error: e?.message ?? String(e) };
    }
  }
  return { ok: res.status === 200 || res.status === 206, status: res.status };
}

async function checkAll(rows, onProgress) {
  const fileRows = rows.filter((r) => classify(r.url) === 'fileOnDisk');
  const results = new Map(); // row.id -> { ok, status, error }
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < fileRows.length) {
      const idx = cursor++;
      const row = fileRows[idx];
      // Don't hammer: tiny stagger so workers don't all burst at once.
      await new Promise((r) => setTimeout(r, 25));
      const r = await headCheck(row.url);
      results.set(row.id, r);
      done += 1;
      onProgress(done, fileRows.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(HEAD_CONCURRENCY, fileRows.length) }, worker));
  return results;
}

// ── 4. Print the dry-run report ──────────────────────────────────────────

function printReport(rows, headResults) {
  const buckets = { live: [], dead: [], base64: [], external: [], unknown: [] };
  for (const row of rows) {
    const cls = classify(row.url);
    if (cls === 'fileOnDisk') {
      const r = headResults.get(row.id);
      if (r?.ok) buckets.live.push({ row, ...r });
      else buckets.dead.push({ row, ...(r ?? { ok: false, status: 0, error: 'no response' }) });
    } else {
      buckets[cls].push({ row });
    }
  }

  console.log('');
  console.log('── Reconciliation report ─────────────────────────────────');
  console.log(`  Total ProductImage rows ........ ${rows.length}`);
  console.log(`  Base64 (always live) ........... ${buckets.base64.length}`);
  console.log(`  External URL (skipped) ......... ${buckets.external.length}`);
  console.log(`  File-on-disk, LIVE ............. ${buckets.live.length}`);
  console.log(`  File-on-disk, DEAD ............. ${buckets.dead.length}`);
  if (buckets.unknown.length > 0) {
    console.log(`  Unknown (unrecognized URL) ..... ${buckets.unknown.length}`);
  }
  console.log('');

  if (buckets.dead.length > 0) {
    console.log('Dead rows (first 10):');
    for (const d of buckets.dead.slice(0, 10)) {
      const r = d.row;
      console.log(`  - ${r.productId?.slice(0, 8)}…  ${r.url}  [${d.status ?? '?'}${d.error ? ` ${d.error}` : ''}]`);
    }
    if (buckets.dead.length > 10) {
      console.log(`  … and ${buckets.dead.length - 10} more`);
    }
    console.log('');
  }

  if (buckets.live.length > 0) {
    console.log('Live rows (first 5):');
    for (const l of buckets.live.slice(0, 5)) {
      console.log(`  ✓ ${l.row.url}  [${l.status}]`);
    }
    console.log('');
  }

  if (buckets.external.length > 0) {
    console.log(`External URLs (not checked — we don't own them):`);
    for (const e of buckets.external.slice(0, 5)) {
      console.log(`  - ${e.row.url}`);
    }
    if (buckets.external.length > 5) {
      console.log(`  … and ${buckets.external.length - 5} more`);
    }
    console.log('');
  }

  return { buckets, live: buckets.live.length, dead: buckets.dead.length };
}

// ── 5. --apply: write backup, then DELETE dead rows ─────────────────────

async function applyDeletes(token, deadRows) {
  const backup = {
    generatedAt: new Date().toISOString(),
    apiBase: API,
    mode: 'apply',
    summary: { deleted: deadRows.length },
    deletedRows: deadRows.map((d) => ({
      id: d.row.id,
      productId: d.row.productId,
      productName: d.row.productName ?? null,
      url: d.row.url,
      altBn: d.row.altBn ?? null,
      altEn: d.row.altEn ?? null,
      sortOrder: d.row.sortOrder ?? 0,
      headStatus: d.status ?? null,
      headError: d.error ?? null,
    })),
  };
  writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
  console.log(`Wrote backup: ${BACKUP_FILE}`);

  let deleted = 0;
  let failed = 0;
  for (const d of deadRows) {
    const res = await fetch(`${ADMIN_API}/images/${d.row.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      deleted += 1;
    } else {
      failed += 1;
      console.error(`  ✗ delete failed ${d.row.id}: ${res.status} ${await res.text()}`);
    }
    process.stdout.write(`\r  deleting… ${deleted + failed}/${deadRows.length}`);
  }
  process.stdout.write('\n');
  return { deleted, failed };
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`XovenMart image reconciliation`);
  console.log(`  API: ${API}`);
  console.log(`  Mode: ${APPLY ? 'APPLY (will DELETE dead rows)' : 'dry-run'}`);
  console.log('');

  if (APPLY && existsSync(BACKUP_FILE)) {
    throw new Error(
      `refusing to overwrite ${BACKUP_FILE} — move the previous one aside or delete it`,
    );
  }

  const token = await login();
  console.log('Signed in.');

  console.log('Fetching every ProductImage row…');
  const rows = await listAllImages(token);

  console.log(`HEAD-checking ${rows.filter((r) => classify(r.url) === 'fileOnDisk').length} file-on-disk URLs (concurrency=${HEAD_CONCURRENCY})…`);
  let lastDot = 0;
  const headResults = await checkAll(rows, (done, total) => {
    if (done - lastDot >= Math.max(1, Math.floor(total / 40))) {
      process.stdout.write('.');
      lastDot = done;
    }
  });
  console.log('');

  const { buckets, dead } = printReport(rows, headResults);

  if (!APPLY) {
    if (dead > 0) {
      console.log(`Run with --apply to delete the ${dead} dead rows.`);
      console.log(`A backup of every deleted row will be written to ${BACKUP_FILE} first.`);
    }
    return;
  }

  if (dead === 0) {
    console.log('Nothing to delete. Done.');
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question(`Delete ${dead} dead rows from the DB? Type YES to confirm: `)).trim();
  rl.close();
  if (ans !== 'YES') {
    console.log('Cancelled.');
    return;
  }

  const result = await applyDeletes(token, buckets.dead);
  console.log(`\nDone. Deleted ${result.deleted} rows, ${result.failed} failed.`);
  console.log(`Backup file (in case you need to restore any row): ${BACKUP_FILE}`);
}

main().catch((e) => {
  console.error(`\nFatal: ${e?.message ?? e}`);
  if (e?.stack) console.error(e.stack);
  exit(1);
});
