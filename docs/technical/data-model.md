# Data model

What the database means. The DDL lives in `supabase/migrations/` (numbered, applied in order); this file explains it.
Verified against the live `public` schema on 2026-11-17 (OM63): **16 tables, 48 RLS policies, 7 triggers, 14 app
functions**.

## Where this database lives (read before touching a policy)

Our_Menu does **not** have its own Supabase project. It owns the `public` schema of a **shared free-tier project**
(`qzgrukdwukkcghacolua`) that also holds other apps' schemas:

| Schema | Owner |
|---|---|
| `public` | **Our_Menu** (this doc) |
| `cortana`, `poly`, `finly`, `ai_path` | other GibbHubb apps, each behind its own scoped role. Not documented here; never touch them from this repo. |
| `auth` | Supabase Auth. **`auth.users` is shared by every app in the project.** A trigger, policy or FK added against it affects all of them. |
| `storage` | the `recipe-images` bucket (011) |
| `extensions` | pgvector, used by `recipe_embeddings` |

Consequences:
- A statement with no schema qualifier, run from the SQL editor or the Management API, hits **`public`**: this app.
- The API role's `search_path` includes `cortana` (noted in 025 Part C). That is why 025 pins `search_path` on every
  app function.
- Every user-data FK into `auth.users` here is `ON DELETE SET NULL` (`CASCADE` only for membership), so deleting a user
  does not delete a household's recipes.

## Scoping model in one paragraph

Data belongs to a **household**, not a user (016). Every scoped table has a nullable `household_id`, stamped on INSERT
by the `trg_stamp_household` trigger from `get_active_household()`, so no client insert site needs to know about
households. Membership is `household_members`; `is_household_member(hid)` (SECURITY DEFINER) is the predicate every
policy uses. `household_id IS NULL` rows are a legacy anonymous fallback from 010: still **readable**, but since 018 no
anonymous INSERT is allowed and DELETE always requires membership. As of 2026-11-17 no `recipes` row has a NULL
household (0 of 96). `user_id` columns (010) record who created a row; they are not the access boundary.

The standard policy set, called "household shape" below:

| Command | Rule |
|---|---|
| SELECT | `household_id IS NULL OR is_household_member(household_id)` |
| INSERT | `auth.uid() IS NOT NULL AND (household_id IS NULL OR is_household_member(household_id))` (018) |
| UPDATE | USING as SELECT; WITH CHECK `is_household_member(household_id)` |
| DELETE | `is_household_member(household_id)` |

"Strict household shape" (the 020 tables) drops the `IS NULL` branch: member only, for all four commands.

## Entities

### recipes
The recipe box. 96 rows. **Not created by any numbered migration**: the table predates `supabase/migrations/` and its
original DDL is `supabase/legacy/supabase_schema.sql`, with `add_shopping_list_migration.sql` and
`migration_multiple_categories.sql` from the same folder.

| Field | Type | Notes | From |
|---|---|---|---|
| id | uuid PK | `gen_random_uuid()` | legacy |
| created_at | timestamptz NOT NULL | `timezone('utc', now())` | legacy |
| title | text NOT NULL | | legacy |
| category | text[] NOT NULL | default `{}`; tags such as Mains, Want to Cook. Was `text` until the legacy category script | legacy |
| link | text | source URL | legacy |
| image_url | text | external URL or a `recipe-images` storage URL | legacy, 011 |
| ingredients | text | free text, one per line | legacy |
| instructions | text | free text | legacy |
| notes | text | cook's notes | legacy, re-asserted by 003 |
| shopping_list | text | per-recipe list text (pre-OM49 list model) | legacy |
| rating | int | 1 to 5 (CHECK) | 003 |
| shopping_list_checked | jsonb | default `{}`; OM6 per-recipe tick state. 004 also set `REPLICA IDENTITY FULL` for Realtime | 004 |
| kcal_per_serving, protein_g, carbs_g, fat_g | numeric | cached LLM nutrition estimate per serving | 007 |
| ingredients_hash | text | lets the nutrition route skip a re-estimate | 007 |
| nutrition_generated_at | timestamptz | | 007 |
| seasons | text[] NOT NULL | default `{}` = year-round; GIN index | 009 |
| user_id | uuid → auth.users SET NULL | creator | 010 |
| is_public | bool NOT NULL | default false; opt-in share link `/r/[id]` and guest reviews | 012 |
| diet | text[] NOT NULL | default `{}` | 013 |
| household_id | uuid → households | stamped by trigger | 016 |
| servings | int | base yield for scaling; NULL = unknown, scales x1 | 020 |
| diet_auto | bool NOT NULL | default false; `diet` was inferred, not set by a human | 020 |

**RLS:** household shape (`recipes_select/insert/update/delete`) plus `recipes anon read public` (SELECT where
`is_public`). **Trigger:** `trg_stamp_household`.

### recipe_embeddings
pgvector embeddings for semantic search; `match_recipes(query_embedding, match_count)` returns cosine top-K.
Introduced by **001**; RLS added by **025**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| recipe_id | uuid NOT NULL → recipes CASCADE | unique |
| embedding | vector(1536) | |
| embedded_at | timestamptz | default now() |

**RLS:** parented on `recipes`. SELECT when the recipe is readable to the caller (so anon sees public recipes'
embeddings only); INSERT/UPDATE/DELETE need the recipe's household (or a NULL household), and INSERT a signed-in
caller.

### meal_plans
Saved AI meal plans. Introduced by **002**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| created_at | timestamptz | default now() |
| plan_json | jsonb NOT NULL | the generated plan |
| preferences | jsonb | the inputs that produced it |
| user_id | uuid → auth.users | 010 |
| household_id | uuid → households | 016 |

**RLS:** household shape. **Trigger:** `trg_stamp_household`.

### cook_log
One row per "we cooked this". Introduced by **005**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| recipe_id | uuid NOT NULL → recipes CASCADE | indexed |
| cooked_at | timestamptz NOT NULL | default now(), indexed DESC |
| user_id | uuid → auth.users | 010 |
| household_id | uuid → households | 016 |

**RLS:** household shape. **Trigger:** `trg_stamp_household`.

### recipe_collections
Named groups of recipes. Introduced by **006**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(100) NOT NULL UNIQUE | unique across **all** households, not per household |
| created_at | timestamptz NOT NULL | |
| user_id | uuid → auth.users | 010 |
| household_id | uuid → households | 016 |

**RLS:** household shape. **Trigger:** `trg_stamp_household`.

### recipe_collection_items
Many-to-many join between collections and recipes. Introduced by **006**.

| Field | Type | Notes |
|---|---|---|
| collection_id | uuid → recipe_collections CASCADE | PK part |
| recipe_id | uuid → recipes CASCADE | PK part |
| created_at | timestamptz NOT NULL | |

**RLS:** one policy, `rci_all` (ALL): allowed when the parent collection is NULL-household or in the caller's
household. No trigger; scope comes from the collection.

### pantry_items
What the household has in. Introduced by **008**; `category` by **022**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| canonical_key | varchar(100) NOT NULL UNIQUE | normalised name, e.g. `onion` |
| display_name | varchar(200) NOT NULL | what the user typed |
| added_at | timestamptz NOT NULL | |
| user_id | uuid → auth.users | 010 |
| household_id | uuid → households | 016 |
| category | text NOT NULL | `kitchen` (default) / `bathroom` / `household` (CHECK). Only `kitchen` counts toward "cookable now" |

The `needed` flag that 020 added was **dropped under OM50** (see Drift).
**RLS:** household shape. **Trigger:** `trg_stamp_household`.

### recipe_reviews
Guest reviews on public recipes (OM29). Introduced by **012**; moderation columns **014**; anon read narrowed by **015**.

| Field | Type | Notes |
|---|---|---|
| id | bigint PK | sequence |
| recipe_id | uuid NOT NULL → recipes | |
| guest_name | text | |
| comment | text NOT NULL | |
| rating | int | |
| created_at | timestamptz NOT NULL | |
| is_hidden | bool NOT NULL | default false; owner moderation |
| owner_reply | text | |
| owner_replied_at | timestamptz | |

**RLS (not household shape):** `reviews public read`: not hidden AND the recipe is public. `reviews public insert`
(anon allowed): only when the recipe is public. `reviews owner select/update/delete` (authenticated): when the caller
is the recipe's `user_id`.

### households
A shared kitchen. Introduced by **016**. 3 rows.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | default `My Kitchen` |
| created_by | uuid → auth.users SET NULL | |
| created_at | timestamptz NOT NULL | |

**RLS:** SELECT and UPDATE for members. No INSERT or DELETE policy: households are created by `ensure_household()`
(SECURITY DEFINER; race fixed in 017) and are never deleted by the client.

### household_members
Who belongs to which household. Introduced by **016**; `activated_at` by **019**.

| Field | Type | Notes |
|---|---|---|
| household_id | uuid → households CASCADE | PK part |
| user_id | uuid → auth.users CASCADE | PK part, indexed |
| role | text NOT NULL | `owner` / `member` (CHECK), default member |
| joined_at | timestamptz NOT NULL | |
| activated_at | timestamptz | most recently activated membership is the active household; NULL falls back to earliest joined |

**RLS:** SELECT for fellow members; DELETE only your own row (leaving). Joining goes through `accept_invite()`.

### household_invites
Share-code invites. Introduced by **016**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| household_id | uuid NOT NULL → households CASCADE | |
| code | text NOT NULL UNIQUE | the code in `/join/[code]` |
| created_by | uuid → auth.users | |
| created_at | timestamptz NOT NULL | |
| expires_at | timestamptz NOT NULL | default now() + 7 days |
| accepted_by | uuid → auth.users | |
| accepted_at | timestamptz | |

**RLS:** SELECT/DELETE for members. Minting and redeeming go through `create_invite()` / `accept_invite(code)`
(SECURITY DEFINER), so a stranger never needs read access. Since 019 accepting grants membership only; moving a
kitchen's data is the separate `preview_merge_household()` / `merge_household_into()` pair.

### shopping_extras
**The** shopping list. Introduced by **020** as the hand-typed half; since **023** (OM49) every line on the list is a
row here, copied from recipes when the user presses Add rather than derived live.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| household_id | uuid → households CASCADE | |
| label | text NOT NULL | non-blank (CHECK); what is shown |
| created_at | timestamptz NOT NULL | |
| item_key | text NOT NULL | default `''`; canonical merge key (023) |
| qty_base | numeric | amount in the family's base unit; NULL = no number, never 0 (023) |
| family | text | `mass` / `volume` / `count`; lines merge only within a family (023) |
| unit_hint | text | unit to render back in (023) |

The `checked` column 020 created was **dropped under OM50**; ticks live in `shopping_ticks`.
**RLS:** strict household shape. **Trigger:** `trg_stamp_household`.

### shopping_ticks
Tick state for list lines, keyed by line rather than row id. Introduced by **020**.

| Field | Type | Notes |
|---|---|---|
| household_id | uuid NOT NULL → households CASCADE | PK part; default `get_active_household()` |
| line_key | text NOT NULL | PK part |
| checked | bool NOT NULL | default true |
| updated_at | timestamptz NOT NULL | stamped by Postgres, not the client (024) |

**RLS:** strict household shape. **Trigger:** `trg_stamp_tick_updated_at` (BEFORE INSERT/UPDATE, 024), so the
shopping-trip inactivity timeout runs on the server clock; the client reads that clock through `server_now()`.

### client_errors
Browser errors reported through `/api/client-error` (OM61). Introduced by **026**.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| at | timestamptz NOT NULL | indexed DESC |
| user_id | uuid → auth.users SET NULL | |
| source | text NOT NULL | <= 100 chars |
| route | text | <= 300 |
| message | text NOT NULL | <= 2200 |
| stack_head | text | <= 2200 |
| component_stack | text | <= 1000 |
| ua | text | <= 500 |

**RLS:** write-only. One INSERT policy for `anon, authenticated` with `user_id = auth.uid() OR user_id IS NULL`; no
SELECT/UPDATE/DELETE policy, so only the service role can read rows back.

### recipes_backup_om40
**Hand-made backup, not in any migration.** All 96 recipes' `id, title, ingredients, instructions, shopping_list` as
they were before the OM40 ingredient rewrite (2026-08), plus `backed_up_at`. No app code reads it.
**RLS:** on, with a single `deny_all` policy (USING false); grants revoked. Both from **025**.

### recipes_orphan_backup_2026_08_26
**Hand-made backup, not in any migration.** Every column of the 82 orphaned recipes (Bron's) deleted on 2026-08-26,
plus `backed_up_at`. No app code reads it. **RLS:** `deny_all`, from **025**.

Both backup tables are candidates for removal once Max confirms nothing in them is wanted. That is a DDL decision for
Max; nothing in this repo drops them.

## Relationships

```
auth.users 1──N household_members N──1 households 1──N household_invites

households 1──N recipes ──┬── 1──N cook_log
           1──N pantry_items       ├── 1──1 recipe_embeddings
           1──N meal_plans         ├── 1──N recipe_reviews
           1──N recipe_collections ┴── N──N recipes  (via recipe_collection_items)
           1──N shopping_extras
           1──N shopping_ticks

auth.users 1──N client_errors  (nullable)
```

## Functions (public, app-owned)

| Function | Security | Purpose | From |
|---|---|---|---|
| `match_recipes(vector, int)` | invoker | semantic search top-K | 001 |
| `claim_orphan_data()` | invoker | assign NULL-owned rows to the caller on first sign-in | 010, 016 |
| `ensure_household(name)` | definer | create the caller's household if none | 016, 017 |
| `is_household_member(hid)` | definer | the predicate every policy uses | 016 |
| `get_active_household()` | definer | most recently activated membership, else earliest joined | 016, 019 |
| `set_active_household(hid)` | definer | switch the active kitchen | 019 |
| `stamp_household_id()` | definer | body of `trg_stamp_household` | 016 |
| `create_invite()`, `accept_invite(code)` | definer | share-code invites; accept = membership only | 016, 019 |
| `list_household_members()` | definer | member list for the households page | 016 |
| `preview_merge_household(hid)`, `merge_household_into(hid)` | definer | explicit kitchen merge | 019 |
| `server_now()` | invoker | server clock for skew measurement | 024 |
| `stamp_tick_updated_at()` | invoker | body of `trg_stamp_tick_updated_at` | 024 |

025 pins `search_path` on the invoker functions.

## Invariants

- A row a signed-in user creates in a scoped table gets a non-NULL `household_id` (the trigger); an anonymous caller
  can create none (018).
- A user can belong to several households; exactly one is active, and new rows land there.
- Accepting an invite never moves data (019). Only `merge_household_into()` does.
- `shopping_ticks.updated_at` and `client_errors.at` come from the database clock, never the client.
- Every `public` table has RLS on and at least one policy (`scripts/rls_audit.sql` measures this; true since 025).
- No user request uses the service role; `createAdminClient()` is for batch jobs only.

## Drift between the migration files and the live schema (found 2026-11-17)

Mechanical diff of `CREATE TABLE` in `supabase/migrations/` (14 tables) against live `information_schema.tables`
for `public` (16 tables):

| Difference | Why |
|---|---|
| `recipes` is live; no migration creates it | predates the numbered sequence; its DDL is in `supabase/legacy/` |
| `recipes_backup_om40`, `recipes_orphan_backup_2026_08_26` are live; no migration creates them | hand-made backups (above) |
| `meal_basket` is created by 020; absent live | **dropped by hand under OM50 (2026-09-22)**, together with `pantry_items.needed` and `shopping_extras.checked`. No migration file records that drop. |

So a database rebuilt from `001` to `026` alone would lack `recipes` (001 would fail on its FK) and would still have
the three OM50 objects. A rebuild needs `supabase/legacy/supabase_schema.sql` and the two legacy column scripts first,
and the OM50 drop at the end. Recording the OM50 drop as a numbered migration is an open follow-up.

## Migrations

- **Where:** `supabase/migrations/NNN_<what>.sql`, three digits, gapless. Each file's header says which ticket, why,
  and how to reverse it.
- **How they are applied:** by hand, in order, against production. There is no Supabase CLI link and no
  `supabase_migrations` history schema, so the done-log entry for the ticket is the record that a file ran. Run a file
  in the Supabase SQL editor, or through the Management API runner in backlog_bandit
  (`python scripts/supabase_query.py <project-ref> supabase/migrations/NNN_x.sql`). Either way it runs as `postgres`
  on the **shared** project: read the header and blast-radius note first.
- **Conventions:** idempotent (`IF NOT EXISTS`; `DROP POLICY IF EXISTS` then `CREATE`); anything destructive inside a
  transaction with a row-count guard that RAISEs; one ticket per file.
- **Never run** anything under `supabase/legacy/`. Those files are history. `repair_database.sql` in particular would
  replace the RLS policies on `recipes` with "anyone can do anything".
- After a migration, re-run `scripts/rls_audit.sql` and update this file in the same change.
