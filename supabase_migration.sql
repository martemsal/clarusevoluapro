-- ============================================================
--  EFO Clarus — Supabase Database Setup (Security & LGPD Edition)
--  Run this entire script in the Supabase SQL Editor
--  Project: https://eiozmfbyfoaogszypkbg.supabase.co
-- ============================================================

-- Enable pgcrypto extension for SHA-256 hashes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. COMPANIES
CREATE TABLE IF NOT EXISTS efo_companies (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    config      JSONB  DEFAULT '{}',
    parametros  JSONB  DEFAULT '{}',
    lancamentos JSONB  DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USERS  (custom auth — mapped to security definer policies)
CREATE TABLE IF NOT EXISTS efo_users (
    id          UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT  UNIQUE NOT NULL,
    password    TEXT  NOT NULL, -- Holds SHA-256 hash
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

-- 5. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE efo_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_ofx_raw   ENABLE ROW LEVEL SECURITY;

-- 6. SECURITY DEFINER FUNCTIONS (Prevents infinite recursion in RLS policies)

-- Helper function to extract headers safely (supporting PostgREST v9+ JSON format and legacy individual headers)
CREATE OR REPLACE FUNCTION efo_get_header(header_name text)
RETURNS text AS $$
BEGIN
    RETURN COALESCE(
        (nullif(current_setting('request.headers', true), '')::json)->>lower(header_name),
        current_setting('request.header.' || lower(header_name), true)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN current_setting('request.header.' || lower(header_name), true);
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if request is authenticated as Admin
CREATE OR REPLACE FUNCTION efo_is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM efo_users 
        WHERE email = nullif(efo_get_header('x-efo-email'), '')
          AND password = nullif(efo_get_header('x-efo-password'), '')
          AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if request has access to a specific company ID (Admin, or Client mapped to that company)
CREATE OR REPLACE FUNCTION efo_has_company_access(comp_id TEXT)
RETURNS boolean AS $$
BEGIN
    -- 1. Admins have access to everything
    IF efo_is_admin() THEN
        RETURN TRUE;
    END IF;

    -- 2. Client is authorized only for their own company
    RETURN EXISTS (
        SELECT 1 FROM efo_users
        WHERE email = nullif(efo_get_header('x-efo-email'), '')
          AND password = nullif(efo_get_header('x-efo-password'), '')
          AND company_id = comp_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Secure Login RPC Function (Checks password hash, auto-migrates plain text passwords)
CREATE OR REPLACE FUNCTION efo_login_user(p_email TEXT, p_password_hash TEXT)
RETURNS TABLE (
    name TEXT,
    email TEXT,
    role TEXT,
    company_id TEXT,
    authenticated BOOLEAN
) AS $$
#variable_conflict use_column
DECLARE
    v_id UUID;
    v_stored_pass TEXT;
    v_role TEXT;
    v_name TEXT;
    v_company_id TEXT;
    v_authenticated BOOLEAN := FALSE;
BEGIN
    -- Find user
    SELECT u.id, u.password, u.role, u.name, u.company_id
    INTO v_id, v_stored_pass, v_role, v_name, v_company_id
    FROM efo_users u
    WHERE u.email = p_email;

    IF FOUND THEN
        -- Case 1: Already hashed password matches
        IF v_stored_pass = p_password_hash THEN
            v_authenticated := TRUE;
        -- Case 2: Stored password is plain text, check if SHA-256 hash(email + ':' + plain_text) matches
        ELSIF encode(digest(p_email || ':' || v_stored_pass, 'sha256'), 'hex') = p_password_hash THEN
            v_authenticated := TRUE;
            -- Migrate plain text password to the hash dynamically
            UPDATE efo_users SET password = p_password_hash WHERE id = v_id;
        END IF;
    END IF;

    IF v_authenticated THEN
        RETURN QUERY SELECT v_name, p_email, v_role, v_company_id, TRUE;
    ELSE
        RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS POLICIES FOR ACCESS CONTROL

-- POLICY FOR COMPANIES
DROP POLICY IF EXISTS company_access_policy ON efo_companies;
CREATE POLICY company_access_policy ON efo_companies
    FOR ALL
    USING (efo_has_company_access(id));

-- POLICY FOR OFX TRANSACTIONS
DROP POLICY IF EXISTS ofx_access_policy ON efo_ofx_raw;
CREATE POLICY ofx_access_policy ON efo_ofx_raw
    FOR ALL
    USING (efo_has_company_access(company_id));

-- POLICY FOR USERS (Admin sees all; users see only themselves; no public access)
DROP POLICY IF EXISTS user_read_policy ON efo_users;
CREATE POLICY user_read_policy ON efo_users
    FOR SELECT
    USING (
        efo_is_admin()
        OR email = nullif(efo_get_header('x-efo-email'), '')
    );

DROP POLICY IF EXISTS user_write_policy ON efo_users;
CREATE POLICY user_write_policy ON efo_users
    FOR ALL
    USING (efo_is_admin());

-- 8. SEED DEFAULT USERS (Resolve o deadlock inicial de RLS)
INSERT INTO efo_users (email, password, name, role, company_id)
VALUES 
  ('admin@clarus.com.br', 'e4ad7e0fe6b5bf949f7c67f2381ca4bf8d152f6a3e471fa65779cc4a7f83831e', 'Administrador', 'admin', NULL),
  ('cliente@clarus.com.br', '33e182a6b1c4796f6ff57edfd41af4f69e9e017122da7ef7180465f243ed6c1d', 'Cliente Teste', 'client', NULL)
ON CONFLICT (email) DO UPDATE 
SET password = EXCLUDED.password, name = EXCLUDED.name, role = EXCLUDED.role;

