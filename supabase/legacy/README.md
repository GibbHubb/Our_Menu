# supabase/legacy: historical SQL, do not run

These four files sat in the repo root until OM63 (2026-11-17). They are kept, not deleted, because they are the only
record of how the `recipes` table was created: no file in `supabase/migrations/` creates it. None of them is part of
the migration sequence, and **none should ever be run** against the shared production project.

| File | What it did | Live state | Why it must not run |
|---|---|---|---|
| `supabase_schema.sql` | Feb 2026 base DDL: `recipes` (`category text[]`) plus four open "for all users" RLS policies | the table exists with many more columns; the open policies were replaced by `010_auth_scoping.sql` | `create table` without `IF NOT EXISTS` fails; the policies would reopen the table to anyone |
| `add_shopping_list_migration.sql` | added `recipes.shopping_list text` | column is live | redundant; not related to `020_shopping_list.sql` |
| `migration_multiple_categories.sql` | converted `recipes.category` from `text` to `text[]` | already `text[]` | re-running nests every array (`{a,b}` becomes `{{a,b}}`) |
| `repair_database.sql` | "MASTER REPAIR SCRIPT": create `recipes` if missing, add four columns, then drop and re-create **public read/write/delete** policies | the columns exist | **dangerous**: permissive policies are OR'd, so it would let anyone with the public anon key read, change and delete every household's recipes. The app used to tell users to run it after a failed save; OM59 removed that message. |

The real history is `supabase/migrations/001`-`026`. To rebuild the schema from scratch you need the `recipes` base
table first; `docs/technical/data-model.md` (Drift section) says what that takes and what else differs from
production.
