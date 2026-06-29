-- verify_rls.sql
-- ⚠️  EJECUTAR SOLO EN ENTORNO DE PRUEBA.
-- En producción, el INSERT de prueba queda registrado permanentemente
-- en el audit log (no se puede borrar por las RLS).
-- Para testear en producción usar el rol 'postgres' en una DB de staging.
--
-- Run this script to verify that the Audit Log table correctly enforces immutability via Row Level Security (RLS).

-- 1. Insert a test record (Should succeed because INSERT is allowed)
INSERT INTO audit_log (action, actor_address, target, block_time) 
VALUES ('test_action', 'G_TEST_ACTOR', 'test_target', now());

-- 2. Try to update the record (Should FAIL / Return 0 rows updated)
UPDATE audit_log SET action = 'tampered_action' WHERE action = 'test_action';

-- 3. Try to delete the record (Should FAIL / Return 0 rows deleted)
DELETE FROM audit_log WHERE action = 'test_action';

-- 4. Select to verify the record is unchanged
SELECT * FROM audit_log WHERE action = 'test_action';

-- Expected behavior: 
-- The update and delete commands will silently affect 0 rows (because the policies evaluate to false and hide the rows from being mutated).
-- If executed as a superuser (postgres), it bypasses RLS. You must test this as an authenticated or anon user role.
