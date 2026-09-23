const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { name: true, phone: true }
  });

  const rows = await prisma.organizationSetting.findMany({
    where: {
      key: {
        in: [
          'whatsapp.phone_number_id',
          'whatsapp.access_token',
          'whatsapp.api_version',
          'whatsapp.owner_phone'
        ]
      }
    }
  });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

  const phoneId = map['whatsapp.phone_number_id'] || '1330061263522700';
  const token = map['whatsapp.access_token'];
  const version = map['whatsapp.api_version'] || 'v19.0';
  const rawTarget = map['whatsapp.owner_phone'] || org?.phone || '919392974781';
  const target = rawTarget.replace(/^\+/, '').replace(/[\s\-().]/g, '');

  console.log('Sending live EOD WhatsApp message to:', target);

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  const sampleReport = `📊 *${org?.name || 'PharmaCare'} — Daily Report*
📅 ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}

━━━━━━━━━━━━━━━━━━━━━━━━
💰 *REVENUE & PROFIT*
━━━━━━━━━━━━━━━━━━━━━━━━
🟢 Total Revenue:         *₹18,450.00*
📦 Cost of Goods:         ₹12,300.00
✅ Gross Profit:          *₹6,150.00*  _(33.3%)_

━━━━━━━━━━━━━━━━━━━━━━━━
🧾 *SALES BREAKDOWN*
━━━━━━━━━━━━━━━━━━━━━━━━
🔢 Total Bills:           *47*
💵 Cash:                  ₹11,200.00
💳 Card / UPI:            ₹5,250.00
📒 Credit:                ₹2,000.00

━━━━━━━━━━━━━━━━━━━━━━━━
🏆 *TOP PRODUCTS*
━━━━━━━━━━━━━━━━━━━━━━━━
1. Paracetamol 500mg       — *120 qty*
2. Azithromycin 500mg      — *80 qty*
3. Metformin 500mg         — *65 qty*

━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *ALERTS*
━━━━━━━━━━━━━━━━━━━━━━━━
📉 Low Stock Items:       *5* products
⏰ Expiring ≤ 30d:        *3* batches
💳 Pending Dues:          None ✅

━━━━━━━━━━━━━━━━━━━━━━━━
_Sent automatically by PharmaCare_ 🚀`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: target,
    type: 'text',
    text: {
      preview_url: false,
      body: sampleReport
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  console.log('\nResponse status:', res.status);
  console.log('Meta API response:', JSON.stringify(json, null, 2));

  if (res.ok) {
    console.log('\n🎉 SUCCESS! Message was accepted by Meta and sent to your phone!');
  } else {
    console.error('\n❌ FAILED to send message:', json);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
