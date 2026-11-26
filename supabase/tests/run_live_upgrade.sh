#!/usr/bin/env bash
# Rehearses the LIVE upgrade on a DISPOSABLE local PostgreSQL: a replica of the
# live legacy schema (fixtures/live_baseline_2026_11.sql), then exactly the
# owner's apply sequence: 002–013, optional institution adoption, seed, 013.
# NEVER point this at a Supabase project.
# Usage:  PGHOST=127.0.0.1 PGUSER=postgres ./supabase/tests/run_live_upgrade.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-examsphere_live_upgrade}
P=(psql -U postgres -X -v ON_ERROR_STOP=1 -q)

"${P[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
for d in $("${P[@]}" -d postgres -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'examsphere\_%' AND datname <> '$DB'"); do
  "${P[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)"
done
for r in authenticator service_role authenticated anon; do
  "${P[@]}" -d postgres -c "DROP ROLE IF EXISTS $r" 2>/dev/null || true
done
"${P[@]}" -d "$DB" -f tests/000_supabase_shim.sql
"${P[@]}" -d "$DB" -f tests/fixtures/live_baseline_2026_11.sql

echo "== 002 refuses when a legacy exam table has rows"
if "${P[@]}" -d "$DB" -1 -c "INSERT INTO public.exams (institution_id, created_by, title, exam_code, duration_minutes, start_time, end_time)
     SELECT id, 'aaaa0000-0000-0000-0000-0000000000f2', 'x', 'X1', 10, now(), now() + interval '1 hour' FROM public.institutions" \
     -f migrations/002_reconcile_legacy_schema.sql 2>/dev/null; then
  echo "FAIL  002 ran although legacy data exists"; exit 1
fi
echo "PASS  002 refused (transaction rolled back, nothing changed)"

for f in migrations/002_*.sql migrations/00[3-9]_*.sql migrations/01[0-9]_*.sql; do
  echo "== $f"; "${P[@]}" -d "$DB" -1 -f "$f"
done
echo "== idempotency: 002 again"; "${P[@]}" -d "$DB" -1 -f migrations/002_reconcile_legacy_schema.sql
echo "== seed/000 (optional adoption)"; "${P[@]}" -d "$DB" -f seed/000_adopt_live_institution_as_drait.sql
echo "== seed/001"; "${P[@]}" -d "$DB" -f seed/001_drait_catalogue.sql
echo "== 013 again"; "${P[@]}" -d "$DB" -1 -f migrations/013_examination_engine_integration.sql
"${P[@]}" -d "$DB" -f tests/150_live_upgrade_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR|COMPLETE"
