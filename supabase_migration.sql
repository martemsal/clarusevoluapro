-- ============================================================
--  EFO Clarus — Supabase Database Setup
--  Run this entire script in the Supabase SQL Editor
--  Project: https://eiozmfbyfoaogszypkbg.supabase.co
-- ============================================================

-- 1. COMPANIES
CREATE TABLE IF NOT EXISTS efo_companies (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    config      JSONB  DEFAULT '{}',
    parametros  JSONB  DEFAULT '{}',
    lancamentos JSONB  DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USERS  (custom auth — not Supabase Auth)
CREATE TABLE IF NOT EXISTS efo_users (
    id          UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT  UNIQUE NOT NULL,
    password    TEXT  NOT NULL,
    name        TEXT,
    role        TEXT  DEFAULT 'client',
    company_id  TEXT  REFERENCES efo_companies(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. OFX TRANSACTIONS
CREATE TABLE IF NOT EXISTS efo_ofx_raw (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id       TEXT REFERENCES efo_companies(id) ON DELETE CASCADE,
    transaction_id   TEXT,
    date             DATE,
    description      TEXT,
    amount           NUMERIC,
    status           TEXT DEFAULT 'Pendente',
    assigned_account TEXT,
    flag_reason      TEXT,
    raw_data         JSONB DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_efo_ofx_company ON efo_ofx_raw(company_id);
CREATE INDEX IF NOT EXISTS idx_efo_users_email  ON efo_users(email);

-- 5. DISABLE RLS (using custom auth — re-enable and add policies later)
ALTER TABLE efo_companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE efo_users     DISABLE ROW LEVEL SECURITY;
ALTER TABLE efo_ofx_raw   DISABLE ROW LEVEL SECURITY;
