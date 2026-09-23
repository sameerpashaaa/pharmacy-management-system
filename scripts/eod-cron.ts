// ─────────────────────────────────────────────────────────────
// EOD Cron Runner — Local Scheduler
//
// Runs alongside the Next.js dev server.
// Fires POST /api/eod/send at 8:00 PM IST every day.
//
// Usage:
//   npm run cron:eod
//   (in a separate terminal while `npm run dev` is running)
//
// Timezone: Asia/Kolkata (IST = UTC+5:30)
// Schedule: 0 20 * * * = 8:00 PM every day
// ─────────────────────────────────────────────────────────────
/* eslint-disable no-console */
import cron from 'node-cron'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const EOD_SECRET = process.env.EOD_REPORT_SECRET

if (!EOD_SECRET) {
  console.error('[EOD Cron] ❌ EOD_REPORT_SECRET is not set in .env. Exiting.')
  process.exit(1)
}

console.log(`[EOD Cron] ✅ Scheduler started`)
console.log(`[EOD Cron] 📅 Will fire every day at 8:00 PM IST (Asia/Kolkata)`)
console.log(`[EOD Cron] 🌐 Target: POST ${APP_URL}/api/eod/send`)

async function triggerEodReport() {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  console.log(`\n[EOD Cron] ⏰ Firing at ${now}`)

  try {
    const response = await fetch(`${APP_URL}/api/eod/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${EOD_SECRET}`,
        'Content-Type': 'application/json',
      },
    })

    const json = (await response.json().catch(() => null)) as {
      success: boolean
      error?: string
      recipient?: string
      messageId?: string
      sentAt?: string
    } | null

    if (response.ok && json?.success) {
      console.log(`[EOD Cron] ✅ Report sent successfully!`)
      console.log(`[EOD Cron] 📱 Recipient: ${json.recipient ?? 'unknown'}`)
      console.log(`[EOD Cron] 🆔 Message ID: ${json.messageId ?? 'N/A'}`)
    } else {
      console.error(
        `[EOD Cron] ❌ Failed to send report:`,
        json?.error ?? `HTTP ${response.status}`
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[EOD Cron] ❌ Network error:`, msg)
  }
}

// Schedule: every day at 8:00 PM IST
// Cron: minute=0, hour=20, any day, any month, any weekday
cron.schedule(
  '0 20 * * *',
  () => {
    void triggerEodReport()
  },
  {
    timezone: 'Asia/Kolkata',
  }
)

console.log(`[EOD Cron] 💤 Waiting for 8:00 PM IST...`)
console.log(`[EOD Cron]    Press Ctrl+C to stop.\n`)

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\n[EOD Cron] 🛑 Stopped by user.')
  process.exit(0)
})
