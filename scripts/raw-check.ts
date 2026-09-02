import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  // Try raw SQL to see ACTUAL table names
  const tables: any = await p.$queryRaw`
    SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as cnt
    FROM (
      SELECT table_name, query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '') as xml_count
      FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
    ) t
  `;
  tables.sort((a: any, b: any) => b.cnt - a.cnt);
  console.log(`Found ${tables.length} tables. Non-empty:`);
  for (const t of tables) {
    if (t.cnt !== '0') console.log(`  ${String(t.table_name).padEnd(30)} ${t.cnt}`);
  }
  console.log('---all tables---');
  for (const t of tables) console.log(`  ${String(t.table_name).padEnd(30)} ${t.cnt}`);
  await p.$disconnect();
}
main().catch(console.error);
