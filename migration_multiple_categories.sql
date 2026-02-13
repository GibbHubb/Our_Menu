-- Migration: Convert category to category[]
-- This script will convert the existing 'category' column from text to text[] (array of text).
-- It handles the conversion by wrapping existing single values in an array.

BEGIN;

-- 1. Alter the column type with a USING clause to handle the conversion
ALTER TABLE public.recipes 
ALTER COLUMN category TYPE text[] 
USING CASE 
    WHEN category IS NULL THEN ARRAY[]::text[]
    ELSE ARRAY[category]
END;

-- 2. Update the default value if any (optional, but good practice)
ALTER TABLE public.recipes ALTER COLUMN category SET DEFAULT ARRAY[]::text[];

COMMIT;
