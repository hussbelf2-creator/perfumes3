#!/usr/bin/env bash
# يجهّز الاختبارات الحية على Supabase المحلي: يطبّق المخطط، يبني الموقع عليه، ويشغّل المعاينة وخادم التحقق الوهمي.
#   bash tests/live/up.sh          تجهيز كامل
#   LIVE_SKIP_BUILD=1 bash …       بلا إعادة بناء
# يتطلب: npx supabase start (Docker). المفاتيح مفاتيح Supabase المحلي فقط.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE="${LIVE_ENV_FILE:-tests/live/.out/live.env}"
mkdir -p tests/live/.out
npx supabase status -o env 2>/dev/null > "$ENV_FILE"
set -a; . "$ENV_FILE"; set +a
PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
if [ -z "${LIVE_SKIP_BUILD:-}" ]; then
  VITE_SUPABASE_URL="http://localhost:54321" VITE_SUPABASE_ANON_KEY="$ANON_KEY" VITE_MOYASAR_PUBLISHABLE_KEY=pk_test_live VITE_TURNSTILE_SITE_KEY= \
    npx vite build --outDir tests/live/.out/site --emptyOutDir --logLevel error
fi
pkill -f "preview --outDir tests/live/.out/site" 2>/dev/null || true
pkill -f "tests/live/verify-server.ts" 2>/dev/null || true
nohup npx vite preview --outDir tests/live/.out/site --port 4178 --strictPort > tests/live/.out/preview.log 2>&1 &
LIVE_SERVICE_KEY="$SERVICE_ROLE_KEY" nohup node --import ./tests/unit/setup.mjs --import jiti/register tests/live/verify-server.ts > tests/live/.out/verify.log 2>&1 &
for i in $(seq 1 50); do curl -fsS -o /dev/null http://localhost:4178/ && break; sleep 0.3; done
echo "live: site :4178 · verify :8788 · supabase :54321"
