-- ═══════════════════════════════════════════════════════════════
-- SALES COPILOT — SUPABASE DATABASE SCHEMA
-- Paste this entire file into Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- TABLE 1: companies
-- Stores reusable company profiles so salespeople don't re-type
-- the same company details every time they run an analysis.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core company info (what the salesperson types in the form)
  name          TEXT NOT NULL,
  industry      TEXT,
  size          TEXT,
  location      TEXT,
  contact_role  TEXT,
  known_pain    TEXT,

  -- Metadata
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ───────────────────────────────────────────────────────────────
-- TABLE 2: analyses
-- Every single AI generation is saved here.
-- One row = one Generate button click.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,

  -- Which agent and tool was used
  agent         TEXT NOT NULL CHECK (agent IN ('aspire', 'thriving')),
  tool          TEXT NOT NULL CHECK (tool IN ('intelligence', 'icp', 'discovery', 'outreach', 'execution', 'proposal', 'opportunity-discovery')),

  -- The form values the salesperson entered (stored as JSON)
  input_values  JSONB NOT NULL DEFAULT '{}',

  -- The full AI output (stored as JSON — same structure as the output cards)
  output        JSONB NOT NULL DEFAULT '{}',

  -- Optional: salesperson's notes on this analysis
  notes         TEXT,

  -- Whether the salesperson marked this as a favourite
  is_starred    BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ───────────────────────────────────────────────────────────────
-- TABLE 3: outreach_saves
-- When a salesperson copies an outreach message, save it here
-- so they can track what was sent to which company.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_saves (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id   UUID REFERENCES analyses(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,

  -- Which message type was saved
  channel       TEXT NOT NULL, -- "LinkedIn DM", "Cold Email", "Follow-up (Day 3)", "WhatsApp Nudge"
  subject       TEXT,          -- email subject if applicable
  content       TEXT NOT NULL, -- the actual message text

  -- Track if it was actually sent (manually updated by salesperson)
  was_sent      BOOLEAN DEFAULT FALSE,
  sent_at       TIMESTAMPTZ,

  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: widen the `tool` CHECK constraint
-- The backend grew 3 more tools (execution, proposal,
-- opportunity-discovery) after this table was first created. If this
-- schema already ran against your project with the narrower constraint,
-- inserts for those tools were silently failing. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_tool_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_tool_check
  CHECK (tool IN ('intelligence', 'icp', 'discovery', 'outreach', 'execution', 'proposal', 'opportunity-discovery'));


-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- This ensures each user can only see THEIR OWN data.
-- Critical — without this anyone logged in could see everyone's data.
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_saves  ENABLE ROW LEVEL SECURITY;

-- companies: users can only read/write their own rows
CREATE POLICY "Users manage own companies"
  ON companies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- analyses: users can only read/write their own rows
CREATE POLICY "Users manage own analyses"
  ON analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- outreach_saves: users can only read/write their own rows
CREATE POLICY "Users manage own outreach"
  ON outreach_saves FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- Makes queries faster when filtering by user or company.
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_companies_user_id   ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id    ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_company_id ON analyses(company_id);
CREATE INDEX IF NOT EXISTS idx_analyses_agent      ON analyses(agent);
CREATE INDEX IF NOT EXISTS idx_analyses_tool       ON analyses(tool);
CREATE INDEX IF NOT EXISTS idx_outreach_user_id    ON outreach_saves(user_id);


-- ═══════════════════════════════════════════════════════════════
-- TABLE 4: company_research
-- Caches Perplexity web research and tool analysis outputs.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_research (
  company_name                  TEXT PRIMARY KEY,
  raw_perplexity_data           TEXT,
  linkedin_url                  TEXT,
  analysis_sales_intelligence   JSONB,
  analysis_opportunity_discovery JSONB,
  analysis_outreach_generator   JSONB,
  analysis_deal_execution       JSONB,
  analysis_proposal_intelligence JSONB,
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns are present if the table already exists
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS raw_perplexity_data TEXT;
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS analysis_sales_intelligence JSONB;
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS analysis_opportunity_discovery JSONB;
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS analysis_outreach_generator JSONB;
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS analysis_deal_execution JSONB;
ALTER TABLE company_research ADD COLUMN IF NOT EXISTS analysis_proposal_intelligence JSONB;


-- Ensure RPC helper function exists for normalized lookups
CREATE OR REPLACE FUNCTION get_company_by_normalized_name(input_name TEXT)
RETURNS SETOF company_research AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM company_research
  WHERE LOWER(REPLACE(company_name, ' ', '')) = LOWER(REPLACE(input_name, ' ', ''))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- DONE — your database is ready.
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Add user-tracking fields to analyses
-- These columns let the Recents / Shared Workspace panel show
-- who originally created each analysis, who last opened it,
-- and when it was last accessed.
-- Run this block if your analyses table already exists.
-- ═══════════════════════════════════════════════════════════════

-- ID of the row in the `login` table for the person who created this analysis
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS created_by_login_id TEXT;

-- Display name of the person who created this analysis
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Display name of the last person to open this analysis from Recents
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS last_accessed_by_name TEXT;

-- Timestamp of the last time someone opened this analysis from Recents
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- Index for fast lookup when filtering/sorting by creator or last access
CREATE INDEX IF NOT EXISTS idx_analyses_created_by ON analyses(created_by_name);
CREATE INDEX IF NOT EXISTS idx_analyses_last_accessed ON analyses(last_accessed_at DESC);


