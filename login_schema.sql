-- ═══════════════════════════════════════════════════════════════
-- SALES COPILOT — AUTH MIGRATION (individual login accounts)
-- Paste this into Supabase → SQL Editor → Run
--
-- Run this IN ADDITION to schema.sql (which you've already run).
-- This adds a `login` table that stores real per-person accounts
-- (name, email, hashed password) used for signing in. It is
-- separate from the `companies` / `analyses` / `outreach_saves`
-- tables, which continue to store the shared team workspace data —
-- every signed-in person reads/writes the same workspace data,
-- only the login credentials are individual.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS login (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Case-insensitive unique emails (so "A@x.com" and "a@x.com" can't both sign up)
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_email_unique ON login (LOWER(email));

-- Defensive: enable RLS with no policies on this table. The backend always
-- uses the Supabase service-role key (which bypasses RLS), so this has no
-- effect on how the app works — it just blocks any accidental access to
-- this table if an anon/public key were ever used against it directly.
ALTER TABLE login ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: admin roles + join-approval workflow
--
-- Adds two columns to `login`:
--   role   — 'member' (default) or 'admin'.
--   status — 'pending'  (signed up, waiting on an admin to approve/reject —
--                         this row IS the "join request"),
--            'active'   (approved — can sign in and use the app), or
--            'rejected' (an admin declined the request).
--
-- New self-signups (no invite code) land as role='member', status='pending'.
-- Signups that redeem a valid invite code skip the pending step entirely —
-- they're activated immediately with whatever role the invite specifies.
--
-- Safe to re-run — every statement below is idempotent.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE login ADD COLUMN IF NOT EXISTS role TEXT;
UPDATE login SET role = 'member' WHERE role IS NULL;
ALTER TABLE login ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE login ALTER COLUMN role SET NOT NULL;
ALTER TABLE login DROP CONSTRAINT IF EXISTS login_role_check;
ALTER TABLE login ADD CONSTRAINT login_role_check CHECK (role IN ('admin', 'member'));

ALTER TABLE login ADD COLUMN IF NOT EXISTS status TEXT;
-- Grandfather in anyone who already had an account before this migration ran
-- so existing users aren't suddenly locked out — only NEW signups default
-- to 'pending' from here on.
UPDATE login SET status = 'active' WHERE status IS NULL;
ALTER TABLE login ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE login ALTER COLUMN status SET NOT NULL;
ALTER TABLE login DROP CONSTRAINT IF EXISTS login_status_check;
ALTER TABLE login ADD CONSTRAINT login_status_check CHECK (status IN ('pending', 'active', 'rejected'));

ALTER TABLE login ADD COLUMN IF NOT EXISTS invited_by  UUID REFERENCES login(id) ON DELETE SET NULL;
ALTER TABLE login ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES login(id) ON DELETE SET NULL;
ALTER TABLE login ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE login ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_login_role   ON login(role);
CREATE INDEX IF NOT EXISTS idx_login_status ON login(status);


-- ═══════════════════════════════════════════════════════════════
-- TABLE: invites
--
-- Admin-generated invite codes. An invite can be:
--   - targeted at one email (email IS NOT NULL — only that address can
--     redeem it), or
--   - an open link (email IS NULL — anyone who has the code can redeem it).
--
-- Redeeming a valid, unused, non-expired invite during signup skips the
-- pending-approval step and assigns whatever role the invite was created
-- with (member or admin).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT,
  code        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_by  UUID REFERENCES login(id) ON DELETE SET NULL,
  used_by     UUID REFERENCES login(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_code_unique ON invites (code);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(LOWER(email));

-- Same defensive posture as `login` — service-role key bypasses this.
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- BOOTSTRAP: make yourself the first admin
--
-- There's a chicken-and-egg problem the first time this runs: nobody is an
-- admin yet, so nobody can approve or invite anyone from inside the app.
--
--   1. Sign up normally in the app once (you'll land in a "pending
--      approval" screen — that's expected, ignore it for now).
--   2. Then run the statement below, with your real email, to promote
--      yourself straight to an active admin:
--
--      UPDATE login
--      SET role = 'admin', status = 'active', approved_at = NOW()
--      WHERE LOWER(email) = LOWER('sachin.k@spigroup.in');
--
-- After that, use the in-app Admin panel (Members → Admin tools) for every
-- future invite/approval — no more manual SQL needed for day-to-day use.
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- DONE — re-run anytime, all statements are idempotent (IF NOT EXISTS /
-- DROP CONSTRAINT IF EXISTS guards).
--
-- Handy queries:
--
--   See everyone and their role/status:
--     SELECT id, name, email, role, status, created_at, last_login_at
--     FROM login ORDER BY created_at DESC;
--
--   See outstanding invite codes:
--     SELECT id, email, code, role, expires_at, used_at, created_at
--     FROM invites ORDER BY created_at DESC;
-- ═══════════════════════════════════════════════════════════════
