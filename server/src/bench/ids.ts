/**
 * Experiment 4: ULID vs UUIDv4 insert throughput into 1M rows, plus final
 * index size.
 *
 *   npm run bench:ids -w server
 *
 * The claim under test (§4): UUIDv4 is random, so every insert lands at a
 * random point in the B-tree, causing page splits and cache churn. ULIDs
 * embed a timestamp, so inserts append to the right edge of the index.
 * Two throwaway tables, identical except for how the primary key is minted.
 */
import { randomUUID } from 'node:crypto';
import { monotonicFactory } from 'ulidx';
import { pool } from '../db/client.js';

const TOTAL = Number(process.argv[2] ?? 1_000_000);
const BATCH = 1_000;

const nextUlid = monotonicFactory();

async function reset(table: string, idType: 'TEXT' | 'UUID') {
  await pool.query(`DROP TABLE IF EXISTS ${table}`);
  await pool.query(`CREATE TABLE ${table} (id ${idType} PRIMARY KEY, body TEXT NOT NULL)`);
}

async function insertAll(table: string, mintId: () => string) {
  const startedAt = performance.now();
  for (let offset = 0; offset < TOTAL; offset += BATCH) {
    const size = Math.min(BATCH, TOTAL - offset);
    const values: string[] = [];
    const params: string[] = [];
    for (let i = 0; i < size; i++) {
      values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
      params.push(mintId(), 'benchmark row');
    }
    await pool.query(`INSERT INTO ${table} (id, body) VALUES ${values.join(',')}`, params);
  }
  return performance.now() - startedAt;
}

async function indexSize(table: string) {
  const res = await pool.query<{ size: string; bytes: string }>(
    `SELECT pg_size_pretty(pg_relation_size(indexrelid)) AS size,
            pg_relation_size(indexrelid)::text AS bytes
     FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     WHERE i.indrelid = $1::regclass`,
    [table],
  );
  return res.rows[0]!;
}

// Three variants, so key *encoding* is separable from insert *locality*:
// ULID and UUID-as-text differ in both (26 vs 36 chars) - the native uuid
// column is 16 binary bytes, so comparing it against ULID-text isolates
// the B-tree page-split effect the §4 claim is actually about.
const VARIANTS = [
  { label: 'ULID (text)', table: 'bench_ulid', idType: 'TEXT' as const, mint: () => nextUlid() },
  { label: 'UUIDv4 (text)', table: 'bench_uuid_text', idType: 'TEXT' as const, mint: () => randomUUID() },
  { label: 'UUIDv4 (native uuid)', table: 'bench_uuid_native', idType: 'UUID' as const, mint: () => randomUUID() },
];

async function main() {
  console.log(`inserting ${TOTAL.toLocaleString()} rows per strategy (batch ${BATCH})\n`);

  const rows: { label: string; seconds: number; rps: number; size: string; bytes: number }[] = [];

  for (const v of VARIANTS) {
    await reset(v.table, v.idType);
    const ms = await insertAll(v.table, v.mint);
    const idx = await indexSize(v.table);
    rows.push({
      label: v.label,
      seconds: ms / 1000,
      rps: TOTAL / (ms / 1000),
      size: idx.size,
      bytes: Number(idx.bytes),
    });
    console.log(`${v.label.padEnd(22)} ${(ms / 1000).toFixed(2)}s  ${idx.size}`);
  }

  console.log('\n| Strategy | Insert time (s) | Throughput (rows/s) | PK index size |');
  console.log('|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.label} | ${r.seconds.toFixed(2)} | ${Math.round(r.rps).toLocaleString()} | ${r.size} |`);
  }

  const ulid = rows[0]!;
  for (const r of rows.slice(1)) {
    console.log(
      `\n${r.label} vs ULID: ${(ulid.rps / r.rps).toFixed(2)}x throughput ratio, ${(r.bytes / ulid.bytes).toFixed(2)}x index size`,
    );
  }

  for (const v of VARIANTS) await pool.query(`DROP TABLE IF EXISTS ${v.table}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
