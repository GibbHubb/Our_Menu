-- rls_audit.sql — OM56
--
-- Read-only. Run against the live database (Supabase SQL editor, or
-- `python sbq.py <project-ref> scripts/rls_audit.sql` from backlog_bandit).
-- Three result sets:
--   1. One row per `public` table: rowsecurity + policy count.
--   2. Summary: count of tables with RLS off, and count of tables with RLS
--      on but zero policies (both should be 0 after 025_rls_gaps.sql).
--   3. `public`-schema, non-extension functions with no pinned search_path
--      (pgvector's own functions are excluded — they are not app code, and
--      pinning them is not this project's call to make).

-- 1. Per-table RLS + policy count
SELECT
  c.relname                          AS table_name,
  c.relrowsecurity                   AS rls_on,
  count(p.policyname)                AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- 2. Summary: should both be 0 after the migration
SELECT
  count(*) FILTER (WHERE NOT rls_on)                         AS tables_rls_off,
  count(*) FILTER (WHERE rls_on AND policy_count = 0)         AS tables_rls_on_zero_policies
FROM (
  SELECT
    c.relname,
    c.relrowsecurity AS rls_on,
    count(p.policyname) AS policy_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policies p
    ON p.schemaname = 'public' AND p.tablename = c.relname
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
) t;

-- 3. Unpinned functions, excluding pgvector's own (extension-owned) functions
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef                               AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proconfig IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.objid = p.oid
      AND d.deptype = 'e'
  )
ORDER BY p.proname;
