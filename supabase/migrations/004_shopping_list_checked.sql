-- OM6: Real-time shared shopping list checked state
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS shopping_list_checked JSONB DEFAULT '{}';

-- Required for Supabase Realtime Postgres Changes to broadcast old/new values
ALTER TABLE recipes REPLICA IDENTITY FULL;
