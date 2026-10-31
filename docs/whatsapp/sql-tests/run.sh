#!/usr/bin/env bash
# Runs the WhatsApp SQL tests on a THROWAWAY local PostgreSQL (synthetic data only, never Supabase).
#   as root:      bash docs/whatsapp/sql-tests/run.sh          (re-executes itself as the 'postgres' OS user)
#   as non-root:  bash docs/whatsapp/sql-tests/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
if [ "$(id -u)" = 0 ]; then
  chmod -R a+rX "$REPO/docs"; exec runuser -u postgres -- env PGBIN="$PGBIN" bash "$HERE/run.sh"
fi
D="$(mktemp -d)"; PORT=54331; trap '"$PGBIN/pg_ctl" -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PGBIN/initdb" -D "$D/data" -A trust -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$D/data" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h $D -p $PORT -U postgres"
$P -d postgres -c "create database wa" >/dev/null
$P -d wa -f "$HERE/schema.sql" >/dev/null
$P -d wa -f "$REPO/docs/sql/whatsapp-assistant.sql" >/dev/null
echo "migration applied (local throwaway DB)"
$P -d wa -f "$HERE/assertions.sql" 2>&1 | grep -E "NOTICE|ERROR|ASSERT|LINE|psql:" | sed "s/^psql:[^ ]* //" 
bash "$HERE/concurrency.sh" "$D" "$PORT" "$PGBIN"
# rollback must leave nothing behind, and re-applying must work
$P -d wa -f "$REPO/docs/sql/whatsapp-assistant-rollback.sql" >/dev/null
$P -d wa -tAc "select count(*) from pg_class where relname like 'wa\_%' and relnamespace='public'::regnamespace" | grep -qx 0 && echo "NOTICE:  rollback: clean (0 wa_* relations left)"
$P -d wa -f "$REPO/docs/sql/whatsapp-assistant.sql" >/dev/null && echo "NOTICE:  re-apply after rollback: ok"

# messenger-channels.sql on a second DB: original assertions must still pass after the upgrade, then the channel assertions, then rollback
$P -d postgres -c "create database wa2" >/dev/null
grep -v "^create role" "$HERE/schema.sql" | $P -d wa2 >/dev/null
$P -d wa2 -f "$REPO/docs/sql/whatsapp-assistant.sql" >/dev/null
$P -d wa2 -f "$REPO/docs/sql/messenger-channels.sql" >/dev/null && echo "NOTICE:  messenger-channels applied"
$P -d wa2 -f "$HERE/assertions.sql" 2>&1 | grep -E "ERROR|ASSERT|psql:" | sed "s/^psql:[^ ]* //" | sed "s/^/  [after messenger upgrade] /"
$P -d wa2 -f "$HERE/messenger-assertions.sql" 2>&1 | grep -E "NOTICE|ERROR|ASSERT|LINE|psql:" | sed "s/^psql:[^ ]* //"
$P -d wa2 -f "$REPO/docs/sql/messenger-channels-rollback.sql" >/dev/null && echo "NOTICE:  messenger rollback: ok"
$P -d wa2 -tAc "select count(*) from information_schema.columns where table_name='wa_contacts' and column_name='channel'" | grep -qx 0 && echo "NOTICE:  messenger rollback: clean"
$P -d wa2 -f "$REPO/docs/sql/messenger-channels.sql" >/dev/null && echo "NOTICE:  messenger re-apply after rollback: ok"
