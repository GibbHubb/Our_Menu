-- ⛔ HISTORICAL. DO NOT RUN. Archived from the repo root by OM63 (2026-11-17).
-- Added recipes.shopping_list (text), which is live. Not in the numbered sequence. Unrelated to
-- 020_shopping_list.sql, which is the household shopping list. See supabase/legacy/README.md.

-- Add shopping_list column to recipes table if it doesn't exist
-- Run this in your Supabase SQL Editor

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='recipes' 
        AND column_name='shopping_list'
    ) THEN
        ALTER TABLE public.recipes ADD COLUMN shopping_list text;
    END IF;
END $$;
