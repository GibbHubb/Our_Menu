-- OM25 — Recipe photos storage bucket (per-USER v1).
--
-- Plan §4: per-household scoping is BLOCKED BY OM14b (not built);
-- this v1 scopes by auth.uid() in the path prefix and can be upgraded
-- to per-household when households exist (path prefix swap).
--
-- Layout: bucket "recipe-images", objects at "<uid>/<recipe-or-uuid>.<ext>".
-- Public read so the Supabase image-transform URL works without a
-- signed-URL dance on every render; writes/deletes scoped to owner.

INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can READ (image renders + transforms work).
DROP POLICY IF EXISTS "recipe-images public read" ON storage.objects;
CREATE POLICY "recipe-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-images');

-- Authenticated users can INSERT into their own prefix only.
DROP POLICY IF EXISTS "recipe-images owner insert" ON storage.objects;
CREATE POLICY "recipe-images owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can UPDATE / DELETE only their own files.
DROP POLICY IF EXISTS "recipe-images owner update" ON storage.objects;
CREATE POLICY "recipe-images owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "recipe-images owner delete" ON storage.objects;
CREATE POLICY "recipe-images owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
