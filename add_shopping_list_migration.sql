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
