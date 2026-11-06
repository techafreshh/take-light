-- take-light 0001: unforgeable leaderboard foundation.
-- Anonymous clients may read scores; all direct writes are denied by
-- default-deny (no write policies exist). Future inserts go through a
-- privileged Edge Function using the service_role key, which bypasses RLS.
-- Applied once via Supabase CLI migration ordering or the dashboard SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  wave integer NOT NULL CHECK (wave >= 1),
  duration_s integer NOT NULL CHECK (duration_s >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON runs TO anon;

CREATE POLICY "runs_anon_select" ON runs FOR SELECT TO anon USING (true);
