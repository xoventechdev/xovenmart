import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const tables = [
  'adminUser','user','customerUser','category','product','productImage','inventory',
  'banner','deliveryZone','order','orderItem','payment','coupon','rider','supplier',
  'purchaseOrder','address','translation','i18nKey','auditLog','notification',
  'setting','expense','staff','payroll','template','marketingCampaign',
  'supportTicket','mediaAsset','cartItem','wishlistItem','productReview',
  'deliverySlot','orderStatusHistory','stockMovement','productTag','tag',
  'brand','unit','tax','currency','country','division','district','area',
  'shippingMethod','paymentMethod','page','menu','menuItem','redirect',
  'webhook','emailTemplate','smsTemplate','pushTemplate','role','permission',
  'rolePermission','session','loginAttempt','apiKey','webhookEvent',
  'invoice','refund','payout','payoutItem','attendance','leave','holiday',
  'salarySlip','loan','loanRepayment','asset','assetMaintenance','task',
  'taskAssignment','project','timeLog','ticketReply','knowledgeArticle',
];

async function main() {
  let total = 0;
  for (const t of tables) {
    try {
      const n = await (p as any)[t].count();
      if (n > 0) {
        console.log(`${t.padEnd(24)} ${n}`);
        total += n;
      }
    } catch (e: any) {
      // Model doesn't exist — silently skip
    }
  }
  console.log('---');
  console.log(`Total rows in local DB: ${total}`);
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
