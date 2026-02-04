-- MASTER REPAIR SCRIPT
-- Run this in your Supabase SQL Editor to fix EVERYTHING

-- 1. Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  category text not null,
  link text,
  image_url text,
  ingredients text,
  instructions text,
  notes text,
  shopping_list text
);

-- 2. Add missing columns (safely)
DO $$ 
BEGIN
    -- Add shopping_list if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='shopping_list') THEN
        ALTER TABLE public.recipes ADD COLUMN shopping_list text;
    END IF;
    -- Add notes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='notes') THEN
        ALTER TABLE public.recipes ADD COLUMN notes text;
    END IF;
    -- Add ingredients if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='ingredients') THEN
        ALTER TABLE public.recipes ADD COLUMN ingredients text;
    END IF;
    -- Add instructions if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='instructions') THEN
        ALTER TABLE public.recipes ADD COLUMN instructions text;
    END IF;
END $$;

-- 3. FIX PERMISSIONS (RLS)
-- First, enable RLS
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.recipes;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.recipes;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.recipes;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.recipes;

-- Re-create permissive policies (Public Read/Write)
CREATE POLICY "Enable read access for all users"
ON public.recipes FOR SELECT
USING (true);

CREATE POLICY "Enable insert access for all users"
ON public.recipes FOR INSERT
WITH CHECK (true);

CREATE POLICY "Enable update access for all users"
ON public.recipes FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete access for all users"
ON public.recipes FOR DELETE
USING (true);
