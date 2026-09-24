-- OM61 — "nothing tells us the app broke except Max noticing."
--
-- One new table. Write-only from the app's perspective: both `anon` and
-- `authenticated` can INSERT, nobody can SELECT, UPDATE or DELETE — reading
-- it back is a service-role job (the `/api/client-error` route never needs
-- to read, and no UI ever lists these rows). RLS defaults to deny, so
-- leaving SELECT/UPDATE/DELETE with no policy is what enforces that, not an
-- oversight.
--
-- `anon` gets INSERT too (code-review finding, not the original plan text,
-- which only said "insert-only for authenticated"): the app has real
-- pre-auth pages — /login, /auth/callback, /join/[code] — and a signed-out
-- visitor's browser can throw before there is ever a session. Restricting
-- INSERT to `authenticated` would silently drop exactly the errors from the
-- flows most likely to break unnoticed, which is the opposite of this
-- ticket's goal. `user_id` still can't be spoofed to someone else's uid
-- (WITH CHECK below), so nothing about the write-only design is weakened.
--
-- Blast radius (plan §8): one new table in `public`, nothing else touched —
-- no change to any existing table, policy, function or grant, no trigger on
-- auth.users. `user_id` is the same nullable-FK-with-ON DELETE SET NULL
-- pattern 010_auth_scoping.sql already uses five times; it adds a foreign key
-- INTO auth.users, same as every other user-data table here, and changes
-- nothing about auth.users itself.
--
-- Rollback: DROP TABLE public.client_errors;

CREATE TABLE IF NOT EXISTS client_errors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source       TEXT NOT NULL CHECK (char_length(source) <= 100),
  route        TEXT CHECK (route IS NULL OR char_length(route) <= 300),
  -- Caps mirror the app-side truncation in clientErrorReporter.ts (2000
  -- chars) with headroom; the CHECK is the enforced ceiling, the client-side
  -- cap is just what keeps a normal row small.
  message      TEXT NOT NULL CHECK (char_length(message) <= 2200),
  stack_head   TEXT CHECK (stack_head IS NULL OR char_length(stack_head) <= 2200),
  -- ErrorBoundary.tsx sends componentStack (which component broke) alongside
  -- message/stack_head — code-review finding: the route had nowhere to put
  -- it and was silently dropping it before this column existed.
  component_stack TEXT CHECK (component_stack IS NULL OR char_length(component_stack) <= 1000),
  ua           TEXT CHECK (ua IS NULL OR char_length(ua) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_client_errors_at ON client_errors(at DESC);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_errors_insert ON client_errors;
CREATE POLICY client_errors_insert ON client_errors FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Deliberately no SELECT/UPDATE/DELETE policy for anon or authenticated:
-- RLS denies by default, which is the point (§5 — "write-only from the app's
-- perspective"). Reading a row back (AC4, the service-role verification
-- step) uses the service-role key, which RLS never applies to.
