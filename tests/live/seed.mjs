// حسابات الفريق للاختبارات الحية على Supabase المحلي: مالك، مبيعات، إنتاج (العطّار). آمن لإعادة التشغيل.
//   node --env-file=tests/live/.out/live.env tests/live/seed.mjs
import { execFileSync } from "node:child_process";

const API = process.env.API_URL || "http://127.0.0.1:54321";
const KEY = process.env.SERVICE_ROLE_KEY;
const DB = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!KEY) throw new Error("SERVICE_ROLE_KEY is not set (run tests/live/up.sh first)");
const PASSWORD = "Passw0rd!x";
const TEAM = [
  { email: "owner@live.test", role: "owner", first: "أحمد", last: "المالك" },
  { email: "sales@live.test", role: "sales", first: "فيصل", last: "المبيعات" },
  { email: "perfumer@live.test", role: "production", first: "ريم", last: "العطّارة" },
];
const sql = (q) => execFileSync("psql", [DB, "-tA", "-c", q]).toString().trim();

for (const u of TEAM) {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { first_name: u.first, last_name: u.last } }),
  });
  if (!r.ok && r.status !== 422) throw new Error(`${u.email}: ${r.status} ${await r.text()}`);
  // الدور من قاعدة البيانات مباشرة (بلا مستخدم في السياق = إعداد أولي مسموح)
  sql(`update public.profiles set role='${u.role}', active=true, first_name='${u.first}', last_name='${u.last}' where email='${u.email}'`);
}
console.log(sql("select string_agg(email || ':' || role, ' ') from public.profiles where email like '%@live.test' and role <> 'client'"));
