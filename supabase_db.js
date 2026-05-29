// =============================================================
//  EFO — Supabase Integration Layer
//  Centralizes all DB operations. Keeps localStorage as cache.
//  Strategy: Supabase is source of truth; localStorage = cache.
// =============================================================

const SUPABASE_URL  = 'https://eiozmfbyfoaogszypkbg.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpb3ptZmJ5Zm9hb2dzenlwa2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODE1NzYsImV4cCI6MjA5NTE1NzU3Nn0.50kHcrOVeLS8jKIp4rHiZuSV7rnghLf4AsLwfkwD80Q';

// Create client using the global `supabase` object injected by CDN
// Initialize with empty headers (or cached credentials if page is refreshed)
let _supa = null;
let DB_ONLINE = false; // set to true after first successful query

if (typeof supabase !== 'undefined') {
    try {
        _supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
            global: {
                headers: {
                    'x-efo-email': (typeof sessionStorage !== 'undefined' && JSON.parse(sessionStorage.getItem('EFO_Session'))?.email) || '',
                    'x-efo-password': (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('EFO_Session_Password_Hash')) || ''
                }
            }
        });
    } catch (e) {
        console.error('[Supabase] Falha ao instanciar o cliente:', e);
    }
} else {
    console.warn('[Supabase] CDN SDK não carregado. Operando em modo offline / localStorage.');
}

// Update headers dynamically for REST requests
function db_updateClientHeaders(email, passwordHash) {
    if (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON) {
        try {
            _supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
                global: {
                    headers: {
                        'x-efo-email': email || '',
                        'x-efo-password': passwordHash || ''
                    }
                }
            });
        } catch (e) {
            console.error('[Supabase] Falha ao atualizar headers:', e);
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  USERS
// ──────────────────────────────────────────────────────────────

async function db_loadUsers() {
    try {
        const { data, error } = await _supa.from('efo_users').select('*');
        if (error) throw error;
        DB_ONLINE = true;
        return data.map(u => ({
            name:      u.name,
            email:     u.email,
            password:  u.password, // Safe to return from cache/admin query, RLS handles visibility
            role:      u.role,
            companyId: u.company_id
        }));
    } catch (e) {
        console.warn('[Supabase] db_loadUsers failed — using localStorage.', e.message);
        return null;
    }
}

async function db_upsertUser(user) {
    try {
        const { error } = await _supa.from('efo_users').upsert({
            email:      user.email,
            password:   user.password, // Pre-hashed password
            name:       user.name,
            role:       user.role,
            company_id: user.companyId || null
        }, { onConflict: 'email' });
        if (error) throw error;
    } catch (e) {
        console.warn('[Supabase] db_upsertUser failed.', e.message);
        throw e;
    }
}

async function db_deleteUser(email) {
    try {
        const { error } = await _supa.from('efo_users').delete().eq('email', email);
        if (error) throw error;
    } catch (e) {
        console.warn('[Supabase] db_deleteUser failed.', e.message);
        throw e;
    }
}

// Custom Secure Login via RPC
async function db_loginUser(email, passwordHash) {
    try {
        // Explicitly set client headers to let RLS policies authorize the login function queries if needed
        db_updateClientHeaders(email, passwordHash);

        const { data, error } = await _supa.rpc('efo_login_user', {
            p_email: email,
            p_password_hash: passwordHash
        });
        if (error) throw error;
        if (!data || data.length === 0 || !data[0].authenticated) {
            // Revert headers on failed login
            db_updateClientHeaders('', '');
            return null;
        }

        const row = data[0];
        DB_ONLINE = true;
        return {
            name:      row.name,
            email:     row.email,
            role:      row.role,
            companyId: row.company_id
        };
    } catch (e) {
        console.warn('[Supabase] db_loginUser secure RPC failed — using cached credentials check.', e.message);
        return null;
    }
}

// ──────────────────────────────────────────────────────────────
//  COMPANIES
// ──────────────────────────────────────────────────────────────

async function db_loadCompanies() {
    try {
        const { data, error } = await _supa.from('efo_companies').select('*');
        if (error) throw error;
        DB_ONLINE = true;
        const obj = {};
        data.forEach(c => {
            obj[c.id] = {
                id:          c.id,
                name:        c.name,
                config:      c.config      || {},
                parametros:  c.parametros  || {},
                lancamentos: c.lancamentos || null,  // null → will use DEFAULT
                ofx:         []  // loaded separately
            };
        });
        return obj;
    } catch (e) {
        console.warn('[Supabase] db_loadCompanies failed — using localStorage.', e.message);
        return null;
    }
}

async function db_upsertCompany(company) {
    try {
        const { error } = await _supa.from('efo_companies').upsert({
            id:          company.id,
            name:        company.name,
            config:      company.config     || {},
            parametros:  company.parametros || {},
            lancamentos: company.lancamentos || {}
        });
        if (error) throw error;
    } catch (e) {
        console.warn('[Supabase] db_upsertCompany failed.', e.message);
        throw e;
    }
}

async function db_deleteCompany(companyId) {
    try {
        const { error } = await _supa.from('efo_companies').delete().eq('id', companyId);
        if (error) throw error;
    } catch (e) {
        console.warn('[Supabase] db_deleteCompany failed.', e.message);
        throw e;
    }
}

// ──────────────────────────────────────────────────────────────
//  OFX TRANSACTIONS
// ──────────────────────────────────────────────────────────────

async function db_loadOFX(companyId) {
    try {
        const { data, error } = await _supa
            .from('efo_ofx_raw')
            .select('raw_data')
            .eq('company_id', companyId);
        if (error) throw error;
        DB_ONLINE = true;
        return data.map(r => r.raw_data);
    } catch (e) {
        console.warn('[Supabase] db_loadOFX failed — using localStorage.', e.message);
        return null;
    }
}

async function db_saveOFX(companyId, transactions) {
    if (!companyId) return;
    try {
        // Delete then re-insert (simplest bulk upsert strategy)
        await _supa.from('efo_ofx_raw').delete().eq('company_id', companyId);
        if (!transactions || transactions.length === 0) return;

        const rows = transactions.map(txn => ({
            company_id:      companyId,
            transaction_id:  txn.transaction_id || '',
            date:            txn.date ? txn.date.substring(0, 10) : null,
            description:     txn.description || '',
            amount:          txn.amount || 0,
            status:          txn.status || 'Pendente',
            assigned_account: txn.assigned_account || null,
            flag_reason:     txn.flag_reason || null,
            raw_data:        txn
        }));

        // Batch in chunks of 500 to avoid payload limits
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const { error } = await _supa.from('efo_ofx_raw').insert(rows.slice(i, i + CHUNK));
            if (error) throw error;
        }
    } catch (e) {
        console.warn('[Supabase] db_saveOFX failed.', e.message);
        throw e;
    }
}

// ──────────────────────────────────────────────────────────────
//  FULL SYNC  (called in background on every saveState)
// ──────────────────────────────────────────────────────────────

async function db_syncActiveCompany() {
    const compId = (typeof EFO_Session !== 'undefined' && EFO_Session)
        ? (EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId)
        : null;
    if (!compId) return;

    const company = EFO_Companies[compId];
    if (!company) return;

    await db_upsertCompany(company);
    await db_saveOFX(compId, OFX_Raw_Import);
}

// ──────────────────────────────────────────────────────────────
//  BOOTSTRAP  (load authorized subset from Supabase into memory)
// ──────────────────────────────────────────────────────────────

async function db_bootstrap() {
    // LGPD Compliance: If no session exists, load absolutely nothing to prevent caching other clients' data
    if (typeof EFO_Session === 'undefined' || !EFO_Session) {
        console.log('[Supabase] No active session. Skipping data bootstrap.');
        return false;
    }

    // Set authorization headers from cached session credentials
    const sessionEmail = EFO_Session.email;
    const sessionHash = sessionStorage.getItem('EFO_Session_Password_Hash');
    if (sessionEmail && sessionHash) {
        db_updateClientHeaders(sessionEmail, sessionHash);
    }

    // 1. Load users (restricted by role) to sync company mapping
    const users = await db_loadUsers();
    if (users && users.length > 0) {
        if (EFO_Session.role === 'admin') {
            EFO_Users = users;
            localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
        } else {
            // Find current user profile
            const myProfile = users.find(u => u.email === EFO_Session.email);
            if (myProfile) {
                // Keep session and sessionStorage in sync with DB company mapping (resolves old cached session mappings)
                EFO_Session.companyId = myProfile.companyId;
                EFO_Session.name = myProfile.name;
                sessionStorage.setItem('EFO_Session', JSON.stringify(EFO_Session));
                
                EFO_Users = [myProfile];
                localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
            }
        }
    } else if (EFO_Session.role !== 'admin') {
        // Fallback to cache if offline
        EFO_Users = [
            {
                email: EFO_Session.email,
                name: EFO_Session.name,
                role: EFO_Session.role,
                companyId: EFO_Session.companyId
            }
        ];
        localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
    }

    // 2. Load companies
    const companies = await db_loadCompanies();
    if (companies && Object.keys(companies).length > 0) {
        // Merge: Supabase is authoritative, but keep lancamentos from memory if server returns null
        Object.keys(companies).forEach(id => {
            if (!companies[id].lancamentos || Object.keys(companies[id].lancamentos).length === 0) {
                companies[id].lancamentos = (typeof EFO_Companies !== 'undefined' && EFO_Companies && EFO_Companies[id] && EFO_Companies[id].lancamentos)
                    ? EFO_Companies[id].lancamentos
                    : JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
            }
            // Preserve local OFX cache if it exists
            if (typeof EFO_Companies !== 'undefined' && EFO_Companies && EFO_Companies[id] && EFO_Companies[id].ofx && EFO_Companies[id].ofx.length > 0) {
                companies[id].ofx = EFO_Companies[id].ofx;
            }
        });
        EFO_Companies = companies;
        localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
    }

    // 3. Load OFX for active company (using updated companyId)
    const compId = EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId;
    if (compId) {
        const ofx = await db_loadOFX(compId);
        if (ofx !== null) {
            OFX_Raw_Import = ofx;
            localStorage.setItem('OFX_Raw_Import_V2', JSON.stringify(OFX_Raw_Import));
            if (EFO_Companies[compId]) {
                EFO_Companies[compId].ofx = OFX_Raw_Import;
                localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
            }
        }
    }

    return DB_ONLINE;
}

// ──────────────────────────────────────────────────────────────
//  MIGRATION  (push existing localStorage data → Supabase)
// ──────────────────────────────────────────────────────────────

async function db_migrateLocalStorageToSupabase(onProgress) {
    const companies = EFO_Companies;
    const users     = EFO_Users;
    const total     = Object.keys(companies).length + users.length;
    let done = 0;

    // Push companies
    for (const id of Object.keys(companies)) {
        await db_upsertCompany(companies[id]);
        await db_saveOFX(id, companies[id].ofx || []);
        done++;
        if (onProgress) onProgress(done, total, `Empresa: ${companies[id].name}`);
    }

    // Push users
    for (const user of users) {
        await db_upsertUser(user);
        done++;
        if (onProgress) onProgress(done, total, `Usuário: ${user.email}`);
    }

    return done;
}
