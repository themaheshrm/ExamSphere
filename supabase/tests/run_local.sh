#!/usr/bin/env bash
# Replays every migration into a DISPOSABLE local PostgreSQL (>= 15) and runs the
# end-to-end security tests. NEVER point this at a Supabase project: it creates
# roles, an auth schema shim and test users.
#
# Requirements: a local cluster where the "postgres" superuser and the
# "authenticator" role (created by the shim) can connect with trust auth.
# Usage:  PGHOST=/path/to/socket PGPORT=5432 ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-examsphere_test}
P=(psql -U postgres -v ON_ERROR_STOP=1 -q)

"${P[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
for r in authenticator service_role authenticated anon; do
  "${P[@]}" -d postgres -c "DROP ROLE IF EXISTS $r" 2>/dev/null || true
done

for f in tests/000_supabase_shim.sql migrations/*.sql; do
  echo "== $f"; "${P[@]}" -d "$DB" -f "$f"
done
echo "== idempotency: re-applying 005-011"
for f in migrations/00[5-9]_*.sql migrations/01[0-9]_*.sql; do "${P[@]}" -d "$DB" -f "$f" >/dev/null; done

"${P[@]}" -d "$DB" -f tests/100_e2e_security_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR|COMPLETE"
psql -U authenticator -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/110_api_session_immutability.sql 2>&1 | grep -E "PASS|FAIL|ERROR|COMPLETE"
"${P[@]}" -d "$DB" -f tests/120_subject_admin_scope_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR|COMPLETE"
"${P[@]}" -d "$DB" -f tests/130_temporary_password_gate_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR|COMPLETE"
