-- LOCAL TEST ONLY. Run as the "authenticator" login (how PostgREST connects).
\set ON_ERROR_STOP 1
SET ROLE authenticated;
SELECT test.login('00000000-0000-0000-0000-0000000000a1');
SELECT test.fails($$SELECT private.finalize_expired_attempts()$$, 'sweeper not callable by API users');
SELECT test.fails($$SELECT private.evaluate_attempt(id) FROM public.exam_attempts LIMIT 1$$, 'evaluator not callable by API users');
SELECT test.fails($$SELECT private.attempt_payload(id) FROM public.exam_attempts LIMIT 1$$, 'paper builder not callable directly');
SELECT test.fails($$DELETE FROM public.audit_log$$, 'audit log cannot be deleted through the API');
RESET ROLE;
\echo API SESSION TEST COMPLETE
