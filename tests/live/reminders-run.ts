// يشغّل دالة التذكيرات كما على Vercel، على Supabase المحلي الحقيقي (بلا قناة بريد: نفحص الحجز والمهام في قاعدة البيانات).
//   node --env-file=tests/live/.out/live.env --import ./tests/unit/setup.mjs --import jiti/register tests/live/reminders-run.ts [dry]
import { GET } from "../../api/reminders";

const secret = "live-cron-secret-".padEnd(40, "x");
Object.assign(process.env, { CRON_SECRET: secret, SUPABASE_URL: process.env.API_URL || "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY, SITE_URL: "https://site.example" });
delete process.env.RESEND_API_KEY;
delete process.env.WHATSAPP_TOKEN;
const r = await GET(new Request(`http://x/api/reminders${process.argv[2] === "dry" ? "?dry=1" : ""}`, { headers: { authorization: `Bearer ${secret}` } }));
console.log(JSON.stringify({ status: r.status, ...(await r.json()) }));
