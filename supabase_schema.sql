-- Create the recipes table
create table public.recipes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  category text not null, -- 'Want to Cook', 'Mains', 'Soup', 'Snacks', 'Breakfast', 'Sweets'
  link text,
  image_url text
);

-- Set up Row Level Security (RLS)
-- For now, we allow public read access, but restrict write to authenticated users or just public if it's a private shared link app.
-- Since Max said "Input Form to POST", we'll allow public insert for MVP simplicity if they don't want auth yet.
-- Ideally, we'd add auth. For MVP PWA for 2 people, maybe just open it or add a simple pin code later.
-- Let's enable RLS but allow anon key to select and insert for now to keep it frictionless for their private use.

alter table public.recipes enable row level security;

create policy "Enable read access for all users"
on public.recipes for select
using (true);

create policy "Enable insert access for all users"
on public.recipes for insert
with check (true);

create policy "Enable delete access for all users"
on public.recipes for delete
using (true);

create policy "Enable update access for all users"
on public.recipes for update
using (true);

-- Optional: Storage bucket for images if needed later
-- insert into storage.buckets (id, name) values ('images', 'images');
-- create policy "Public Access" on storage.objects for select using ( bucket_id = 'images' );
-- create policy "Public Insert" on storage.objects for insert with check ( bucket_id = 'images' );
