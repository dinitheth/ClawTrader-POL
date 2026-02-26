-- ════════════════════════════════════════════════════════════════
-- ClawTrader — Polygon Amoy Database Reset (SAFE VERSION)
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- This safely handles tables that may or may not exist
-- ════════════════════════════════════════════════════════════════

-- ─── Step 1: Truncate all data (safest order, child → parent) ───
-- Using CASCADE so FK constraints don't block truncation

TRUNCATE TABLE public.governance_votes CASCADE;
TRUNCATE TABLE public.governance_proposals CASCADE;
TRUNCATE TABLE public.revenue_distributions CASCADE;
TRUNCATE TABLE public.access_grants CASCADE;
TRUNCATE TABLE public.agent_token_holders CASCADE;
TRUNCATE TABLE public.alliances CASCADE;
TRUNCATE TABLE public.evolution_log CASCADE;
TRUNCATE TABLE public.bets CASCADE;
TRUNCATE TABLE public.market_scenarios CASCADE;
TRUNCATE TABLE public.matches CASCADE;
TRUNCATE TABLE public.agents CASCADE;
TRUNCATE TABLE public.profiles CASCADE;

-- ─── Step 2: Drop stale nad.fun tables ──────────────────────────

DROP TABLE IF EXISTS public.governance_votes CASCADE;
DROP TABLE IF EXISTS public.governance_proposals CASCADE;
DROP TABLE IF EXISTS public.revenue_distributions CASCADE;
DROP TABLE IF EXISTS public.access_grants CASCADE;
DROP TABLE IF EXISTS public.agent_token_holders CASCADE;

-- ─── Step 3: Drop stale nad.fun columns from agents ─────────────

ALTER TABLE public.agents
  DROP COLUMN IF EXISTS token_address,
  DROP COLUMN IF EXISTS token_name,
  DROP COLUMN IF EXISTS token_symbol,
  DROP COLUMN IF EXISTS token_launched_at,
  DROP COLUMN IF EXISTS token_market_cap,
  DROP COLUMN IF EXISTS token_holders,
  DROP COLUMN IF EXISTS revenue_share_enabled,
  DROP COLUMN IF EXISTS revenue_share_percentage,
  DROP COLUMN IF EXISTS governance_enabled,
  DROP COLUMN IF EXISTS access_tier;

-- ─── Step 4: Add Polygon Amoy identity columns to agents ────────

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS onchain_tx_hash TEXT;

-- ─── Step 5: Add network column to matches ──────────────────────

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'polygon_amoy';

-- ─── Step 6: Indexes ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agents_wallet_address ON public.agents (wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON public.profiles (wallet_address);

-- ─── Verify ─────────────────────────────────────────────────────
-- Run these to confirm it worked:
-- SELECT COUNT(*) FROM public.agents;    -- should be 0
-- SELECT COUNT(*) FROM public.profiles;  -- should be 0
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' ORDER BY column_name;
