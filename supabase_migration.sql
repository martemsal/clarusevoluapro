-- ============================================================
--  CLARUS EVOLUA® — SUPABASE DATABASE MIGRATION & SECURITY
--  Projeto: https://eiozmfbyfoaogszypkbg.supabase.co
--  Instruções: Execute este script completo no SQL Editor do Supabase.
-- ============================================================

-- Habilita a extensão pgcrypto para criptografia e hashes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. TABELA DE EMPRESAS (efo_companies)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS efo_companies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    config      JSONB DEFAULT '{}',
    parametros  JSONB DEFAULT '{}',
    lancamentos JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed de empresa padrão (comp_demo)
INSERT INTO efo_companies (id, name, config, parametros)
VALUES (
    'comp_demo', 
    'Clarus Indústria e Comércio Ltda', 
    '{"package":"executive","segment":"Indústria"}', 
    '{"impostos":10,"metaLucro":15}'
)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name;

-- ------------------------------------------------------------
-- 2. TABELA DE USUÁRIOS (efo_users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS efo_users (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL, -- SHA-256 hash da senha
    name        TEXT NOT NULL,
    role        TEXT DEFAULT 'client', -- 'admin' ou 'client'
    company_id  TEXT REFERENCES efo_companies(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed dos usuários essenciais
-- admin@clarus.com.br (senha: admin)
-- teste@clarus.com.br (senha: teste) -> Saldanha (Vendas)
-- cliente@clarus.com.br (senha: cliente) -> Saldanha (Cliente)
INSERT INTO efo_users (email, password, name, role, company_id)
VALUES 
  ('admin@clarus.com.br', 'e4ad7e0fe6b5bf949f7c67f2381ca4bf8d152f6a3e471fa65779cc4a7f83831e', 'Administrador', 'admin', NULL),
  ('teste@clarus.com.br', 'ae22816fbe794fbf09055c386592fa69d745d9b62dcedb5f4a7e9d4df55f3148', 'Saldanha (Vendas)', 'client', 'comp_demo'),
  ('cliente@clarus.com.br', '33e182a6b1c4796f6ff57edfd41af4f69e9e017122da7ef7180465f243ed6c1d', 'Saldanha (Cliente)', 'client', 'comp_demo')
ON CONFLICT (email) DO UPDATE 
SET password = EXCLUDED.password, name = EXCLUDED.name, role = EXCLUDED.role, company_id = EXCLUDED.company_id;

-- ------------------------------------------------------------
-- 3. EXTRATOS BANCÁRIOS LEGADOS / TRANSAÇÕES (efo_ofx_raw)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. ARQUIVOS DO CLIENTE / EFO DRIVE (efo_client_files)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS efo_client_files (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id      TEXT REFERENCES efo_companies(id) ON DELETE CASCADE,
    client_name     TEXT NOT NULL,
    client_email    TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    file_type       TEXT,
    file_size       BIGINT,
    file_data       TEXT NOT NULL, -- Dados em Base64 Data URL
    folder_path     TEXT NOT NULL, -- Ex: "Cliente Saldanha, Outubro de 2026"
    reference_month TEXT NOT NULL, -- Ex: "Outubro de 2026"
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 5. MÓDULO CANÔNICO: LOTES DE IMPORTAÇÃO EM STAGING (efo_import_batches)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS efo_import_batches (
    id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id              TEXT UNIQUE NOT NULL,
    company_id           TEXT REFERENCES efo_companies(id) ON DELETE CASCADE,
    year                  INTEGER NOT NULL,
    month                 INTEGER NOT NULL,
    batch_type            TEXT NOT NULL DEFAULT 'MOVIMENTACAO_BANCARIA',
    file_name             TEXT NOT NULL,
    file_size             BIGINT,
    file_type             TEXT,
    sheet_name            TEXT,
    sha256                TEXT NOT NULL,
    imported_by           TEXT,
    status                TEXT NOT NULL DEFAULT 'STAGING_SALVO',
    records_count         INTEGER DEFAULT 0,
    valid_count           INTEGER DEFAULT 0,
    invalid_count         INTEGER DEFAULT 0,
    net_balance           NUMERIC DEFAULT 0,
    mapping_used          JSONB,
    reconciliation_report JSONB,
    imported_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. MÓDULO CANÔNICO: REGISTROS AUDITADOS EM STAGING (efo_import_records)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS efo_import_records (
    id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id           TEXT REFERENCES efo_import_batches(batch_id) ON DELETE CASCADE,
    company_id         TEXT REFERENCES efo_companies(id) ON DELETE CASCADE,
    line_number        INTEGER,
    date               DATE,
    description        TEXT,
    amount             NUMERIC,
    category           TEXT,
    document_number    TEXT,
    fitid              TEXT,
    status             TEXT NOT NULL DEFAULT 'CONCILIADO',
    divergence_reasons TEXT[],
    raw_data           JSONB DEFAULT '{}',
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. ÍNDICES DE DESEMPENHO
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_efo_users_email            ON efo_users(email);
CREATE INDEX IF NOT EXISTS idx_efo_ofx_company            ON efo_ofx_raw(company_id);
CREATE INDEX IF NOT EXISTS idx_efo_client_files_company   ON efo_client_files(company_id);
CREATE INDEX IF NOT EXISTS idx_efo_client_files_month     ON efo_client_files(reference_month);
CREATE INDEX IF NOT EXISTS idx_efo_batches_company        ON efo_import_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_efo_batches_sha256         ON efo_import_batches(sha256);
CREATE INDEX IF NOT EXISTS idx_efo_records_batch          ON efo_import_records(batch_id);

-- ------------------------------------------------------------
-- 8. FUNÇÕES DE AUTORIZAÇÃO & LGPD (SECURITY DEFINER)
-- ------------------------------------------------------------

-- Extrai cabeçalhos da requisição REST (x-efo-email e x-efo-password)
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

-- Verifica se a requisição pertence a um Administrador autenticado
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

-- Valida acesso estrito por empresa (Admin ou Cliente vinculado à própria empresa)
CREATE OR REPLACE FUNCTION efo_has_company_access(comp_id TEXT)
RETURNS boolean AS $$
BEGIN
    -- 1. Administrador possui acesso irrestrito
    IF efo_is_admin() THEN
        RETURN TRUE;
    END IF;

    -- 2. Cliente possui acesso EXCLUSIVO à empresa dele
    RETURN EXISTS (
        SELECT 1 FROM efo_users
        WHERE email = nullif(efo_get_header('x-efo-email'), '')
          AND password = nullif(efo_get_header('x-efo-password'), '')
          AND company_id = comp_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC de Login Seguro com validação de hash e migração automática
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
    SELECT u.id, u.password, u.role, u.name, u.company_id
    INTO v_id, v_stored_pass, v_role, v_name, v_company_id
    FROM efo_users u
    WHERE u.email = p_email;

    IF FOUND THEN
        IF v_stored_pass = p_password_hash THEN
            v_authenticated := TRUE;
        ELSIF encode(digest(p_email || ':' || v_stored_pass, 'sha256'), 'hex') = p_password_hash THEN
            v_authenticated := TRUE;
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

-- ------------------------------------------------------------
-- 9. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS) & POLÍTICAS
-- ------------------------------------------------------------

ALTER TABLE efo_companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_ofx_raw        ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_client_files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE efo_import_records ENABLE ROW LEVEL SECURITY;

-- Políticas de Empresas
DROP POLICY IF EXISTS company_access_policy ON efo_companies;
CREATE POLICY company_access_policy ON efo_companies
    FOR ALL USING (efo_has_company_access(id));

-- Políticas de OFX
DROP POLICY IF EXISTS ofx_access_policy ON efo_ofx_raw;
CREATE POLICY ofx_access_policy ON efo_ofx_raw
    FOR ALL USING (efo_has_company_access(company_id));

-- Políticas de Usuários
DROP POLICY IF EXISTS user_read_policy ON efo_users;
CREATE POLICY user_read_policy ON efo_users
    FOR SELECT USING (
        efo_is_admin() OR email = nullif(efo_get_header('x-efo-email'), '')
    );

DROP POLICY IF EXISTS user_write_policy ON efo_users;
CREATE POLICY user_write_policy ON efo_users
    FOR ALL USING (efo_is_admin());

-- Políticas de Arquivos do Cliente (EFO Drive)
DROP POLICY IF EXISTS client_files_policy ON efo_client_files;
CREATE POLICY client_files_policy ON efo_client_files
    FOR ALL USING (efo_has_company_access(company_id));

-- Políticas de Lotes de Importação Canônica
DROP POLICY IF EXISTS import_batches_policy ON efo_import_batches;
CREATE POLICY import_batches_policy ON efo_import_batches
    FOR ALL USING (efo_has_company_access(company_id));

-- Políticas de Registros de Importação
DROP POLICY IF EXISTS import_records_policy ON efo_import_records;
CREATE POLICY import_records_policy ON efo_import_records
    FOR ALL USING (efo_has_company_access(company_id));
