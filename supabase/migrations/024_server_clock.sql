-- ═══════════════════════════════════════════════════════════════════════
-- 024 — OM49: make OM46's "server clock" real
-- ═══════════════════════════════════════════════════════════════════════
--
-- OM46 added an inactivity timeout that ends a shopping trip, and was careful
-- to measure it on the server's clock rather than the phone's — two handsets
-- share this list, and a handset an hour fast would end the other one's shop.
--
-- It read that clock out of the `Date` HTTP response header. **A browser cannot
-- see that header.** `Date` is not on the CORS-safelist (Cache-Control,
-- Content-Language, Content-Length, Content-Type, Expires, Last-Modified,
-- Pragma), so `res.headers.get('date')` is null in the app and the code took
-- its "network failed" branch: skew 0, device clock, silently. The protection
-- has never once been in effect. It looked like it was, because the fallback is
-- the behaviour it was replacing.
--
-- Two halves, so that neither end of the comparison comes from a phone:
--
--   server_now()   an RPC the client CAN read, to measure its own skew
--   the trigger    `shopping_ticks.updated_at` is stamped by Postgres, not
--                  sent by whoever ticked. The client used to write its own
--                  timestamp into it, so "when was this list last touched"
--                  was already a device's opinion before anything compared it.

CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$ SELECT now() $$;

COMMENT ON FUNCTION public.server_now() IS
  'OM49 the clock the shopping-trip timeout runs off; the Date response header is invisible to a browser';

GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated;

-- Postgres stamps the tick, whoever sent it.
CREATE OR REPLACE FUNCTION public.stamp_tick_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_tick_updated_at ON shopping_ticks;
CREATE TRIGGER trg_stamp_tick_updated_at
  BEFORE INSERT OR UPDATE ON shopping_ticks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tick_updated_at();
