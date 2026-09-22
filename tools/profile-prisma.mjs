import { PrismaClient } from '/app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client/default.js';
const p = new PrismaClient();
for (let i = 0; i < 5; i++) {
  const t = Date.now();
  const r = await p.appSetting.findMany();
  console.log(`call${i} rows=${r.length} ms=${Date.now() - t}`);
}
await p.$disconnect();
