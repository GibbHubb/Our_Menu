-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS meal_plans (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz DEFAULT now(),
    plan_json    jsonb NOT NULL,
    preferences  jsonb
);
