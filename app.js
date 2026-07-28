// --- DATA SCHEMA ---
const DEFAULT_PARAMETROS = { impostos: 10, comissoes: 5, meta_lucro_desejada: 15 };
const DEFAULT_EMPRESA = { cnpj: "", cnae_principal: "", regime_tributario: "Simples Nacional", tipo_atividade: "Serviço", package: "performance" };

const DEFAULT_LANCAMENTOS = {
    dre: {
        receita_bruta: { produtos: 0, servicos: 0, outras: 0 },
        deducoes: { impostos: 0, devolucoes: 0, descontos: 0 },
        custos: { mercadorias: 0, producao: 0, servicos: 0, operacionais: 0 },
        despesas_comercial: { marketing: 0, trafego: 0, comissao: 0, viagens: 0, transporte_logistica: 0, outras: 0 },
        despesas_administrativas: { pro_labore: 0, salarios: 0, encargos: 0, aluguel: 0, honorarios: 0, outras: 0 },
        despesas_pessoal: { salarios: 0, inss: 0, fgts: 0, beneficios: 0, rescisoes: 0 },
        despesas_estrutura: { manutencao: 0, reparos: 0, limpeza: 0 },
        despesas_veiculos: { combustivel: 0, manutencao: 0, seguro: 0, ipva: 0 },
        despesas_financeiras: { juros: 0, tarifas: 0, iof: 0 },
        receitas_financeiras: { rendimentos: 0, juros_recebidos: 0 },
        nao_operacional: { resultado: 0 },
        depreciacao: { valor: 0 },
        impostos_lucro: { irpj_csll: 0 }
    },
    balanco: {
        ativo_circulante: { caixa_bancos: 0, aplicacoes: 0, clientes_receber: 0, estoques: 0, adiantamentos: 0, tributos_recuperar: 0 },
        ativo_nao_circulante: { imobilizado: 0, intangivel: 0 },
        passivo_circulante: { fornecedores: 0, emprestimos_cp: 0, obrigacoes_trab: 0, obrigacoes_trib: 0, outras: 0 },
        passivo_nao_circulante: { emprestimos_lp: 0, parcelamentos: 0 },
        patrimonio_liquido: { capital_social: 0, reservas: 0, lucros_acumulados: 0 }
    }
};

// --- MULTI-TENANT STATE & UTILS ---
let EFO_Companies = JSON.parse(localStorage.getItem('EFO_Companies')) || {};
let EFO_Users = JSON.parse(localStorage.getItem('EFO_Users')) || [];
let EFO_Active_Company_Id = localStorage.getItem('EFO_Active_Company_Id') || '';
let EFO_Session = JSON.parse(sessionStorage.getItem('EFO_Session')) || null;

// Guarantee demo user exists at startup (self-healing even with stale localStorage)
(function _ensureDemoUser() {
    const DEMO_EMAIL = 'teste@clarus.com.br';
    const DEMO_HASH  = 'ae22816fbe794fbf09055c386592fa69d745d9b62dcedb5f4a7e9d4df55f3148';
    if (!EFO_Users.some(u => u.email.toLowerCase() === DEMO_EMAIL)) {
        EFO_Users.push({
            email: DEMO_EMAIL,
            password: DEMO_HASH,
            role: 'client',
            name: 'Saldanha (Vendas)',
            companyId: 'comp_demo'
        });
        localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
    }
})();


// Pure JS SHA-256 fallback for non-secure contexts (HTTP)
function sha256_fallback(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;

    var result = '';
    var words = [];
    var asciiLength = ascii[lengthProperty] * 8;
    
    var hash = sha256_fallback.h = sha256_fallback.h || [];
    var k = sha256_fallback.k = sha256_fallback.k || [];
    var primeCounter = k[lengthProperty];

    var isPrime = {};
    for (var factor = 2; primeCounter < 64; factor++) {
        if (!isPrime[factor]) {
            for (i = 0; i < 313; i += factor) {
                isPrime[i] = 1;
            }
            hash[primeCounter] = (mathPow(factor, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(factor, 1/3) * maxWord) | 0;
        }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return ''; // keep it simple
        words[i >> 2] |= j << (24 - (i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiLength | 0);
    
    for (j = 0; j < words[lengthProperty];) {
        var w = words.slice(j, j += 16);
        var oldHash = hash.slice(0);
        
        hash = hash.slice(0);
        for (i = 0; i < 64; i++) {
            var w16 = w[i - 16], w15 = w[i - 15], w7 = w[i - 7], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            
            var temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ (~e & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                        w16
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + w7
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0
                );
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        
        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }
    
    for (i = 0; i < 8; i++) {
        var byteVal = hash[i];
        if (byteVal < 0) byteVal += maxWord;
        result += byteVal.toString(16).padStart(8, '0');
    }
    
    return result;
}

// Hashing function for passwords (SHA-256 + Email Salting)
async function hashPassword(email, password) {
    const saltInput = email.toLowerCase().trim() + ":" + password;
    
    // Check if crypto.subtle is available (requires HTTPS or localhost)
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(saltInput);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('[Crypto] Native subtle digest failed, falling back to pure JS SHA-256:', e);
        }
    }
    
    // Fallback for non-secure contexts (HTTP)
    return sha256_fallback(saltInput);
}

let EFO_Parametros = DEFAULT_PARAMETROS;
let Config_Empresa = DEFAULT_EMPRESA;
let EFO_Lancamentos = JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
let OFX_Raw_Import = [];
let EFO_Active_DRE_Year = new Date().getFullYear();
let EFO_Active_DRE_Divisor = 12;
let EFO_Active_Parecer_Month = new Date().getMonth();

function migrateAndInitializeData() {
    if (Object.keys(EFO_Companies).length === 0) {
        const legacyConfig = JSON.parse(localStorage.getItem('Config_Empresa')) || DEFAULT_EMPRESA;
        if (!legacyConfig.package) {
            legacyConfig.package = 'performance';
        }
        const legacyParams = JSON.parse(localStorage.getItem('EFO_Parametros')) || DEFAULT_PARAMETROS;
        const legacyLancamentos = JSON.parse(localStorage.getItem('EFO_Lancamentos_V3')) || JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
        const legacyOfx = JSON.parse(localStorage.getItem('OFX_Raw_Import_V2')) || [];
        
        const defaultCompanyId = 'comp_' + Math.random().toString(36).substring(2, 9);
        const defaultCompany = {
            id: defaultCompanyId,
            name: legacyConfig.cnpj ? `Empresa - ${legacyConfig.cnpj}` : 'Empresa Principal',
            config: legacyConfig,
            parametros: legacyParams,
            lancamentos: legacyLancamentos,
            ofx: legacyOfx
        };
        
        EFO_Companies[defaultCompanyId] = defaultCompany;
        localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
        
        EFO_Active_Company_Id = defaultCompanyId;
        localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
    }
    
    // Ensure all companies have a package property
    Object.keys(EFO_Companies).forEach(id => {
        const comp = EFO_Companies[id];
        if (comp && comp.config) {
            if (!comp.config.package) {
                comp.config.package = 'performance';
            }
        }
    });
    
    if (!EFO_Active_Company_Id && Object.keys(EFO_Companies).length > 0) {
        EFO_Active_Company_Id = Object.keys(EFO_Companies)[0];
        localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
    }

    if (EFO_Users.length === 0) {
        EFO_Users = [
            { email: 'admin@clarus.com.br', password: 'e4ad7e0fe6b5bf949f7c67f2381ca4bf8d152f6a3e471fa65779cc4a7f83831e', role: 'admin', name: 'Administrador' },
            { email: 'cliente@clarus.com.br', password: '33e182a6b1c4796f6ff57edfd41af4f69e9e017122da7ef7180465f243ed6c1d', role: 'client', name: 'Saldanha (Cliente)', companyId: EFO_Active_Company_Id }
        ];
        localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
    }

    // Ensure our demo user is present in EFO_Users
    const hasDemoUser = EFO_Users.some(u => u.email.toLowerCase() === 'teste@clarus.com.br');
    if (!hasDemoUser) {
        EFO_Users.push({
            email: 'teste@clarus.com.br',
            password: 'ae22816fbe794fbf09055c386592fa69d745d9b62dcedb5f4a7e9d4df55f3148',
            role: 'client',
            name: 'Saldanha (Vendas)',
            companyId: 'comp_demo'
        });
        localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
    }
}

function loadActiveCompanyData() {
    if (!EFO_Session) return;
    
    // Auto-fallback if the active company ID is invalid or empty for admins (resolves deleted/stale company ID states)
    if (EFO_Session.role === 'admin') {
        if (!EFO_Active_Company_Id || !EFO_Companies[EFO_Active_Company_Id]) {
            if (Object.keys(EFO_Companies).length > 0) {
                EFO_Active_Company_Id = Object.keys(EFO_Companies)[0];
                localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
            }
        }
    }
    
    const compId = EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId;
    let company = EFO_Companies[compId];
    
    if (!company) {
        let baseCompany = null;
        if (compId === 'comp_demo') {
            const otherCompIds = Object.keys(EFO_Companies).filter(id => id !== 'comp_demo');
            if (otherCompIds.length > 0) {
                baseCompany = EFO_Companies[otherCompIds[0]];
            }
        }
        company = {
            id: compId || 'comp_default',
            name: compId === 'comp_demo' ? 'Clarus Executive Demo' : 'Nova Empresa',
            config: baseCompany ? JSON.parse(JSON.stringify(baseCompany.config)) : JSON.parse(JSON.stringify(DEFAULT_EMPRESA)),
            parametros: baseCompany ? JSON.parse(JSON.stringify(baseCompany.parametros)) : JSON.parse(JSON.stringify(DEFAULT_PARAMETROS)),
            lancamentos: baseCompany ? JSON.parse(JSON.stringify(baseCompany.lancamentos)) : JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS)),
            ofx: baseCompany ? JSON.parse(JSON.stringify(baseCompany.ofx)) : []
        };
        if (compId === 'comp_demo') {
            company.config.package = 'executive';
        }
        if (compId) {
            EFO_Companies[compId] = company;
            localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
        }
    } else if (compId === 'comp_demo') {
        if (!company.config) company.config = {};
        if (company.config.package !== 'executive') {
            company.config.package = 'executive';
            localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
        }
    }
    
    EFO_Parametros = company.parametros || DEFAULT_PARAMETROS;
    Config_Empresa = company.config || DEFAULT_EMPRESA;
    EFO_Lancamentos = company.lancamentos || JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
    OFX_Raw_Import = company.ofx || [];
    
    const availableYears = getDREYears();
    if (availableYears.length > 0) {
        EFO_Active_DRE_Year = availableYears[0];
    } else {
        EFO_Active_DRE_Year = new Date().getFullYear();
    }

    // Background fetch latest OFX from Supabase if online
    if (typeof DB_ONLINE !== 'undefined' && DB_ONLINE && compId) {
        db_loadOFX(compId).then(ofx => {
            if (ofx !== null) {
                OFX_Raw_Import = ofx;
                localStorage.setItem('OFX_Raw_Import_V2', JSON.stringify(OFX_Raw_Import));
                if (EFO_Companies[compId]) {
                    EFO_Companies[compId].ofx = OFX_Raw_Import;
                    localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
                }
                updateAllViews();
            }
        }).catch(e => console.warn('[Supabase] Error loading OFX in background:', e));
    }
}

function saveActiveCompanyData() {
    if (!EFO_Session) return;
    
    const compId = EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId;
    if (EFO_Companies[compId]) {
        EFO_Companies[compId].parametros = EFO_Parametros;
        EFO_Companies[compId].config = Config_Empresa;
        EFO_Companies[compId].lancamentos = EFO_Lancamentos;
        EFO_Companies[compId].ofx = OFX_Raw_Import;
        
        if (Config_Empresa.cnpj) {
            EFO_Companies[compId].name = `Empresa - ${Config_Empresa.cnpj}`;
        } else {
            EFO_Companies[compId].name = EFO_Companies[compId].name || 'Empresa Sem Nome';
        }
        
        localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
    }
    
    // Legacy sync
    localStorage.setItem('EFO_Parametros', JSON.stringify(EFO_Parametros));
    localStorage.setItem('Config_Empresa', JSON.stringify(Config_Empresa));
    localStorage.setItem('EFO_Lancamentos_V3', JSON.stringify(EFO_Lancamentos));
    localStorage.setItem('OFX_Raw_Import_V2', JSON.stringify(OFX_Raw_Import));
}

function saveState() {
    saveActiveCompanyData();
    // Background sync to Supabase with status bar integration
    updateCloudStatus('syncing');
    db_syncActiveCompany()
        .then(() => {
            updateCloudStatus('online');
        })
        .catch(err => {
            console.warn('[Supabase] Sync failed:', err);
            updateCloudStatus('offline');
        });
}

migrateAndInitializeData();
loadActiveCompanyData();

let gaugeChartInst = null;
let pieChartInst = null;
let currentDrillDownPath = null;
let currentDrillDownTitle = null;
let currentDrillDownMonth = null;

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    renderParametros();
    
    // Theme toggle
    const themeToggle = document.getElementById('btnThemeToggle');
    const savedTheme = localStorage.getItem('EFO_Theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.textContent = '☀️';
    }
    themeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-mode');
        themeToggle.textContent = isLight ? '☀️' : '🌙';
        localStorage.setItem('EFO_Theme', isLight ? 'light' : 'dark');
    });

    // OFX
    document.getElementById('ofxUpload').addEventListener('change', handleOFXUpload);
    
    // Params Modal
    document.getElementById('btnEditParams').addEventListener('click', () => document.getElementById('paramsModal').style.display = 'block');
    document.querySelector('.close-modal').addEventListener('click', () => document.getElementById('paramsModal').style.display = 'none');
    document.getElementById('formParams').addEventListener('submit', saveParams);
    
    // Config Empresa Modal
    document.getElementById('btnConfigEmpresa').addEventListener('click', openEmpresaModal);
    document.querySelector('.close-empresa').addEventListener('click', () => document.getElementById('empresaModal').style.display = 'none');
    document.getElementById('formEmpresa').addEventListener('submit', saveEmpresa);

    // DrillDown Modal
    document.querySelector('.close-drilldown').addEventListener('click', () => document.getElementById('drillDownModal').style.display = 'none');
    
    // CNAE Auto-detect
    document.getElementById('config_cnae').addEventListener('input', (e) => {
        const val = e.target.value;
        if(val.startsWith('62') || val.startsWith('63') || val.startsWith('69')) document.getElementById('config_atividade').value = 'Serviço';
        else if(val.startsWith('45') || val.startsWith('46') || val.startsWith('47')) document.getElementById('config_atividade').value = 'Comércio';
        else if(val.startsWith('1') || val.startsWith('2') || val.startsWith('3')) document.getElementById('config_atividade').value = 'Indústria';
        else document.getElementById('config_atividade').value = 'Serviço'; // Default
    });

    // Submenu Parecer Estratégico Toggle
    const navParecerBtn = document.getElementById('navParecerBtn');
    const parecerSubmenu = document.getElementById('parecerSubmenu');
    const parecerSubarrow = document.getElementById('parecerSubarrow');
    if (navParecerBtn && parecerSubmenu) {
        navParecerBtn.addEventListener('click', () => {
            const isVisible = parecerSubmenu.style.display === 'flex';
            parecerSubmenu.style.display = isVisible ? 'none' : 'flex';
            if (parecerSubarrow) {
                parecerSubarrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            }
            if (!isVisible) {
                const mensalBtn = document.getElementById('navParecerMensalBtn');
                if (mensalBtn) mensalBtn.click();
            }
        });
    }

    // Manual Import Modal
    const btnManualImport = document.getElementById('btnManualImport');
    if (btnManualImport) {
        btnManualImport.addEventListener('click', () => {
            if (!EFO_Session || EFO_Session.role !== 'admin') {
                showToast('Erro', 'Apenas administradores podem realizar importação manual.', 'danger');
                return;
            }
            const accountSelect = document.getElementById('manual_account');
            if (accountSelect) {
                accountSelect.innerHTML = getOptGroupsHTML();
            }
            document.getElementById('formManualImport').reset();
            document.getElementById('manual_date').value = new Date().toISOString().split('T')[0];
            document.getElementById('manualImportModal').style.display = 'block';
        });
    }

    const closeManualImport = document.querySelector('.close-manual-import');
    if (closeManualImport) {
        closeManualImport.addEventListener('click', () => {
            document.getElementById('manualImportModal').style.display = 'none';
        });
    }

    // Mask for manual amount (currency formatting pt-BR)
    const manualAmountInput = document.getElementById('manual_amount');
    if (manualAmountInput) {
        manualAmountInput.addEventListener('input', (e) => {
            let value = e.target.value;
            let digits = value.replace(/\D/g, '');
            // Remove leading zeros to allow deleting down to empty
            digits = digits.replace(/^0+/, '');
            
            if (digits === '') {
                e.target.value = '';
                return;
            }
            
            // Pad digits if necessary
            if (digits.length === 1) {
                digits = '00' + digits;
            } else if (digits.length === 2) {
                digits = '0' + digits;
            }
            
            const integerPart = digits.slice(0, -2);
            const decimalPart = digits.slice(-2);
            
            const formattedInt = new Intl.NumberFormat('pt-BR').format(parseInt(integerPart, 10));
            e.target.value = 'R$ ' + formattedInt + ',' + decimalPart;
        });
    }

    const formManualImport = document.getElementById('formManualImport');
    if (formManualImport) {
        formManualImport.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!EFO_Session || EFO_Session.role !== 'admin') return;
            
            const dateVal = document.getElementById('manual_date').value;
            const descVal = document.getElementById('manual_desc').value.trim();
            
            // Parse formatted currency amount back to float
            let rawAmount = document.getElementById('manual_amount').value;
            rawAmount = rawAmount.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.');
            const amountVal = parseFloat(rawAmount);
            
            const typeVal = document.getElementById('manual_type').value;
            const statusVal = document.getElementById('manual_status').value;
            const accountVal = document.getElementById('manual_account').value;
            
            if (!dateVal || !descVal || isNaN(amountVal) || amountVal <= 0) {
                showToast('Erro', 'Preencha todos os campos obrigatórios com valores válidos.', 'danger');
                return;
            }
            
            if (statusVal === 'Categorizado' && !accountVal) {
                showToast('Erro', 'Selecione a conta de destino para lançamentos categorizados.', 'danger');
                return;
            }
            
            const finalAmount = typeVal === 'saida' ? -Math.abs(amountVal) : Math.abs(amountVal);
            
            const newTxn = {
                transaction_id: 'manual_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
                date: dateVal,
                description: descVal,
                amount: finalAmount,
                status: statusVal,
                assigned_account: accountVal || null,
                flag_reason: '',
                raw_data: { import_type: 'manual', type: typeVal }
            };
            
            OFX_Raw_Import.push(newTxn);
            
            if (statusVal === 'Categorizado' && accountVal && accountVal !== 'ignore') {
                const path = accountVal.split('.');
                if (EFO_Lancamentos[path[0]] && EFO_Lancamentos[path[0]][path[1]] && EFO_Lancamentos[path[0]][path[1]][path[2]] !== undefined) {
                    EFO_Lancamentos[path[0]][path[1]][path[2]] += Math.abs(finalAmount);
                }
            }
            
            saveState();
            updateAllViews();
            
            document.getElementById('manualImportModal').style.display = 'none';
            showToast('Sucesso', 'Lançamento manual registrado.', 'success');
        });
    }

    document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
    
    // Backup & Sync
    document.getElementById('btnExportBackup').addEventListener('click', exportToJSON);
    document.getElementById('btnImportBackup').addEventListener('click', triggerImportJSON);
    document.getElementById('importBackupFile').addEventListener('change', handleImportJSON);
    document.getElementById('btnShareLink').addEventListener('click', copyShareLink);
    
    // Reset Active Company Data
    document.getElementById('btnResetData').addEventListener('click', () => {
        if (!EFO_Session || EFO_Session.role !== 'admin') {
            showToast('Erro', 'Apenas administradores podem zerar os dados.', 'danger');
            return;
        }
        if(confirm("Tem certeza que deseja zerar todos os dados da empresa ativa?")) {
            EFO_Lancamentos = JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
            OFX_Raw_Import = [];
            saveState();
            updateAllViews();
            showToast('Sucesso', 'Dados da empresa ativa foram zerados.', 'success');
        }
    });

    // Login & User management
    document.getElementById('formLogin').addEventListener('submit', handleLogin);
    document.getElementById('btnLogout').addEventListener('click', handleLogout);
    document.getElementById('activeCompanySelect').addEventListener('change', (e) => {
        EFO_Active_Company_Id = e.target.value;
        localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
        loadActiveCompanyData();
        updateAllViews();
        renderParametros();
        showToast('Troca de Empresa', 'Visualizando dados da empresa selecionada.', 'success');
    });
    
    document.getElementById('btnNewClient').addEventListener('click', () => {
        document.getElementById('clientModal').style.display = 'block';
    });
    document.querySelector('.close-client').addEventListener('click', () => {
        document.getElementById('clientModal').style.display = 'none';
    });
    document.getElementById('formClient').addEventListener('submit', handleCreateClient);

    // Edit Client Modal
    document.querySelector('.close-edit-client').addEventListener('click', () => {
        document.getElementById('editClientModal').style.display = 'none';
    });
    document.getElementById('formEditClient').addEventListener('submit', saveEditClient);


    // Cloud sync status + migration
    document.getElementById('btnMigrateCloud').addEventListener('click', () => {
        document.getElementById('migrateModal').style.display = 'block';
    });
    document.getElementById('btnConfirmMigrate').addEventListener('click', runMigration);

    // Apply active UI state
    applyRoleUI();

    // Bootstrap: try Supabase first, then render
    updateCloudStatus('checking');
    db_bootstrap().then(online => {
        updateCloudStatus(online ? 'online' : 'offline');
        if (EFO_Session) {
            applyRoleUI(); // Re-evaluate and re-render dropdowns/elements with synced data
            loadActiveCompanyData();
            updateAllViews();
            renderParametros();
            if (online) showToast('Nuvem', 'Dados sincronizados com o Supabase.', 'success');
        }
    }).catch(() => {
        updateCloudStatus('offline');
        if (EFO_Session) { updateAllViews(); }
    });

    // Check share links (which can bypass/login as guest)
    checkShareHash();
});

// --- TABS ---
function checkTabLocked(tabId, packageCode) {
    if (packageCode === 'executive') return false;
    
    if (packageCode === 'performance') {
        return tabId === 'tab-reuniao';
    }
    
    if (packageCode === 'essential') {
        const lockedTabs = ['tab-dashboard', 'tab-parecer-mensal', 'tab-parecer-anual', 'tab-reuniao'];
        return lockedTabs.includes(tabId);
    }
    
    return false;
}

function initTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            let target = btn.getAttribute('data-target');
            if (!target) return;
            
            // Check package permissions for client
            if (EFO_Session && EFO_Session.role === 'client') {
                const company = EFO_Companies[EFO_Session.companyId] || {};
                const pkg = company.config?.package || 'performance';
                
                if (checkTabLocked(target, pkg)) {
                    const moduleName = btn.textContent.trim();
                    document.getElementById('lockedTabTitle').textContent = `Módulo "${moduleName}" Bloqueado no seu Plano`;
                    target = 'tab-upgrade';
                }
            }
            
            navBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
            
            let title = "Indicadores EFO";
            if (target === 'tab-upgrade') title = "Upgrade de Plano Necessário";
            if (target === 'tab-dashboard') title = "Indicadores EFO";
            if (target === 'tab-dre') title = "Demonstrativo de Resultado (DRE)";
            if (target === 'tab-balanco') title = "Balanço Gerencial";
            if (target === 'tab-parecer-mensal') {
                title = "Parecer Estratégico Mensal";
                renderParecerMensal();
            }
            if (target === 'tab-parecer-anual') {
                title = "Parecer Estratégico Anual";
                renderParecerAnual();
            }
            if (target === 'tab-reuniao') title = "Alinhamento estratégico";
            if (target === 'tab-conciliation') title = "Conciliação Bancária";
            if (target === 'tab-clients') {
                title = "Clientes & Empresas";
                renderClientsTable();
            }
            if (target === 'tab-client-files') {
                title = "Envio de Documentos";
                initClientFilesView();
            }
            if (target === 'tab-admin-files') {
                title = "Arquivos dos Clientes";
                initAdminFilesView();
            }
            if (target === 'tab-planos') {
                title = "Nossos Planos";
            }
            document.getElementById('pageTitle').textContent = title;
        });
    });
}

// --- UTILS ---
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const formatPercent = (val) => val.toFixed(1) + '%';
const sumObj = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// --- OFX ENGINE & COMPLIANCE ---
function handleOFXUpload(e) {
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem fazer upload de arquivos OFX.', 'danger');
        e.target.value = '';
        return;
    }
    const files = e.target.files;
    if (!files.length) return;

    let processedCount = 0;
    let totalNewTransactions = 0;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(event) {
            totalNewTransactions += parseOFXContent(event.target.result);
            processedCount++;

            if (processedCount === files.length) {
                if (totalNewTransactions > 0) {
                    saveState();
                    categorizeTransactions();
                    showToast('Importação Lote', `${totalNewTransactions} transações lidas de ${files.length} arquivo(s).`, 'success');
                } else {
                    showToast('Aviso', 'Nenhuma transação nova nos arquivos selecionados.', 'warning');
                }
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    });
}

function parseOFXContent(content) {
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
    let match;
    let newTransactions = 0;

    while ((match = trnRegex.exec(content)) !== null) {
        const trnData = match[1];
        const nameMatch = trnData.match(/<NAME>([^<]+)/);
        const dateMatch = trnData.match(/<DTPOSTED>([^<]+)/);
        const amountMatch = trnData.match(/<TRNAMT>([^<]+)/);
        const fitidMatch = trnData.match(/<FITID>([^<]+)/);
        const memoMatch = trnData.match(/<MEMO>([^<]+)/);
        const checknumMatch = trnData.match(/<CHECKNUM>([^<]+)/);
        
        if (!fitidMatch || !amountMatch) continue;

        const fitid = fitidMatch[1].trim();
        const amount = parseFloat(amountMatch[1]);
        let dateStr = dateMatch ? dateMatch[1].trim().substring(0, 8) : '';
        let formattedDate = dateStr ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : new Date().toISOString().split('T')[0];
        
        const name = nameMatch ? nameMatch[1].trim() : '';
        const memo = memoMatch ? memoMatch[1].trim() : '';
        
        let descParts = [];
        if (name) descParts.push(name);
        if (memo && memo !== name) descParts.push(memo);
        
        let rawDesc = descParts.length > 0 ? descParts.join(' ') : 'Transação';
        
        // Sanitize rules: keep text intact, only remove hashes
        rawDesc = rawDesc.replace(/[a-zA-Z0-9]{25,}/g, ''); // Remove PIX hashes (>25 chars)
        rawDesc = rawDesc.replace(/\s+/g, ' ').trim(); // Clean double spaces

        if (!OFX_Raw_Import.find(t => t.transaction_id === fitid)) {
            OFX_Raw_Import.push({ 
                transaction_id: fitid, 
                date: formattedDate, 
                amount: amount, 
                description: rawDesc, 
                status: 'Pendente', 
                flag_reason: '',
                assigned_account: null
            });
            newTransactions++;
        }
    }
    return newTransactions;
}

function categorizeTransactions() {
    let changed = false;
    OFX_Raw_Import.forEach(txn => {
        if (txn.status !== 'Pendente') return;

        const rawDesc = txn.description || '';
        const desc = rawDesc.toUpperCase();
        const amt = txn.amount;
        const absAmt = Math.abs(amt);
        let cat = null;

        // Compliance Trigger
        if (desc.includes("RESTAURANTE") && amt < -500 && Config_Empresa.tipo_atividade === "Indústria") {
            txn.status = 'Flagged';
            txn.flag_reason = "Possível despesa não dedutível / Retirada de sócio";
            changed = true;
            return;
        }

        // Nova Regra de Receitas Financeiras
        if (amt > 0 && ['RENDIMENTO', 'APLICACAO', 'JUROS RECEBIDOS', 'RESGATE'].some(k => desc.includes(k))) {
            cat = 'dre.receitas_financeiras.rendimentos';
        }
        // Categorização Balanço
        else if (amt < 0 && (desc.includes("APLICACAO") || desc.includes("RESGATE") || desc.includes("TRANSF"))) {
            cat = 'balanco.ativo_circulante.aplicacoes'; // Saída de caixa para aplicação
        }
        else if (['AMORTIZACAO', 'PARCELA EMPRESTIMO', 'IOF', 'PARC', 'EMPRESTIMO', 'FINANC', 'BNDES'].some(k => desc.includes(k))) {
            cat = 'balanco.passivo_circulante.emprestimos_cp';
        }
        else if (amt < -2000 && ['MAQUINA', 'VEICULO', 'MOVEIS', 'APPLE', 'DELL', 'SAMSUNG', 'FERRAMENTA'].some(k => desc.includes(k))) {
            cat = 'balanco.ativo_nao_circulante.imobilizado';
        }
        // Categorização DRE
        else if (amt > 0 && ['CREDITO', 'PIX', 'TED', 'DOC', 'VENDA'].some(k => desc.includes(k))) {
            cat = Config_Empresa.tipo_atividade === 'Serviço' ? 'dre.receita_bruta.servicos' : 'dre.receita_bruta.produtos';
        }
        else if (['DAS', 'SIMPLES', 'PIS', 'COFINS', 'ISS'].some(k => desc.includes(k))) {
            cat = 'dre.deducoes.impostos';
        }
        else if (['TARIFA', 'TAXA'].some(k => desc.includes(k))) {
            cat = 'dre.despesas_financeiras.tarifas';
        }
        else if (Config_Empresa.tipo_atividade === "Serviço" && (desc.includes("MAO DE OBRA"))) {
            cat = 'dre.custos.servicos';
        }
        else if (['FORNECEDOR', 'NF', 'NFE', 'FRETE', 'DISTRIBUIDORA', 'ATACADO'].some(k => desc.includes(k))) {
            cat = 'dre.custos.mercadorias';
        }
        else if (['FRETE', 'TRANSPORTADORA', 'CORREIOS', 'LOGISTICA', 'LOG ', 'PEDAGIO', 'POSTO'].some(k => desc.includes(k))) {
            cat = 'dre.despesas_comercial.transporte_logistica';
        }
        else if (['COMISSAO', 'PREMIACAO', 'BONUS VENDAS', 'ARTHUR GERMANO KRIEGER'].some(k => desc.includes(k))) {
            cat = 'dre.despesas_comercial.comissao';
        }
        else if (['GOOGLE', 'FACEBOOK', 'META', 'ADS', 'INSTAGRAM'].some(k => desc.includes(k))) {
            cat = 'dre.despesas_comercial.trafego';
        }
        else if (['ALUGUEL', 'CELESC', 'CONDOMINIO', 'INTERNET', 'CLARO', 'VIVO'].some(k => desc.includes(k))) {
            cat = 'dre.despesas_administrativas.aluguel';
        }
        else if (desc.includes("ENERGIA") || desc.includes("SANEAMENTO") || desc.includes("FOLHA") || desc.includes("SALARIO")) {
            cat = desc.includes("FOLHA") || desc.includes("SALARIO") ? 'dre.despesas_pessoal.salarios' : 'dre.despesas_administrativas.outras';
        }

        if (cat) {
            const path = cat.split('.');
            EFO_Lancamentos[path[0]][path[1]][path[2]] += absAmt;
            txn.status = 'Categorizado';
            txn.assigned_account = cat;
            changed = true;
        }
    });

    if (changed) {
        saveState();
        updateAllViews();
    }
    renderConciliationTable();
}

function manualCategorize(fitid, categoryPath) {
    if (!EFO_Session || EFO_Session.role !== 'admin') return;
    const txn = OFX_Raw_Import.find(t => t.transaction_id === fitid);
    if (!txn || (txn.status !== 'Pendente' && txn.status !== 'Flagged')) return;

    if (categoryPath && categoryPath !== 'ignore') {
        const targetDesc = txn.description;
        let matchedCount = 0;

        // Anti-Disaster Rule: Do not bulk match generic banking terms (common in Caixa OFX)
        const genericTerms = ['DEB PIX CHAVE', 'ENVIO PIX', 'PIX', 'TED', 'DOC', 'DEBITO', 'TRANSF', 'PAGTO', 'FOL PAGTO', 'PIX ENVIADO', 'COMPROVANTE'];
        const isGeneric = genericTerms.some(g => targetDesc.toUpperCase().trim() === g);

        OFX_Raw_Import.forEach(t => {
            // Apply to the specific transaction OR apply bulk match if not generic
            if (t.transaction_id === fitid || (!isGeneric && (t.status === 'Pendente' || t.status === 'Flagged') && t.description === targetDesc)) {
                if (t.status === 'Pendente' || t.status === 'Flagged') {
                    const path = categoryPath.split('.');
                    EFO_Lancamentos[path[0]][path[1]][path[2]] += Math.abs(t.amount);
                    t.status = 'Categorizado';
                    t.assigned_account = categoryPath;
                    t.flag_reason = '';
                    matchedCount++;
                }
            }
        });
        
        if (matchedCount > 1) {
            showToast('Auto-Match', `${matchedCount} transações processadas automaticamente.`, 'success');
        } else {
            showToast('Sucesso', 'Transação categorizada.', 'success');
        }
    } else {
        txn.status = 'Ignorado';
        txn.assigned_account = null;
        txn.flag_reason = '';
        showToast('Sucesso', `Transação ignorada.`, 'success');
    }
    
    saveState();
    updateAllViews();
}

window.applyManualCategorization = (fitid) => {
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Acesso Negado', 'Apenas administradores podem categorizar transações.', 'danger');
        return;
    }
    const sel = document.getElementById(`sel_${fitid}`);
    if (!sel.value) return showToast('Aviso', 'Selecione uma categoria.', 'warning');
    
    const dateInput = document.getElementById(`date_${fitid}`);
    if (dateInput && dateInput.value) {
        const txn = OFX_Raw_Import.find(t => t.transaction_id === fitid);
        if (txn) {
            // Update the transaction's date with the user-selected/modified date
            txn.date = dateInput.value;
        }
    }
    
    manualCategorize(fitid, sel.value);
};

// --- DRILL-DOWN & RECLASSIFICATION ---
window.openDrillDown = (categoryPath, title, monthIndex = null) => {
    currentDrillDownPath = categoryPath;
    currentDrillDownTitle = title;
    currentDrillDownMonth = monthIndex;
    
    let monthLabel = '';
    if (monthIndex !== null) {
        const monthsNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        monthLabel = ` - ${monthsNames[monthIndex]}`;
    }
    document.getElementById('drillDownTitle').textContent = `Detalhamento: ${title}${monthLabel}`;
    renderDrillDownTable();
    
    document.getElementById('drillDownModal').style.display = 'block';
};

function renderDrillDownTable() {
    const tbody = document.getElementById('drillDownTbody');
    tbody.innerHTML = '';
    
    const relatedTxns = OFX_Raw_Import.filter(t => {
        if (t.status !== 'Categorizado' || !t.assigned_account) return false;
        const isMatch = t.assigned_account === currentDrillDownPath || t.assigned_account.startsWith(currentDrillDownPath + '.');
        if (!isMatch) return false;
        
        const dateObj = new Date(t.date);
        const yearMatch = dateObj.getFullYear() === EFO_Active_DRE_Year;
        if (!yearMatch) return false;
        
        if (currentDrillDownMonth !== null) {
            return dateObj.getMonth() === currentDrillDownMonth;
        }
        return true;
    });
    
    if(relatedTxns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center">Nenhum lançamento vinculado via OFX para esta conta.</td></tr>`;
        return;
    }

    const optgroups = getOptGroupsHTML();
    const isClient = EFO_Session && EFO_Session.role !== 'admin';
    const disabledAttr = isClient ? 'disabled style="cursor: not-allowed; opacity: 0.75;"' : '';

    relatedTxns.forEach(txn => {
        const tr = document.createElement('tr');
        const dateObj = new Date(txn.date);
        const dateStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td class="desc-cell"><strong>${txn.description}</strong></td>
            <td style="color: ${txn.amount > 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(txn.amount)}</td>
            <td>
                <select class="efo-select w-100" id="reclass_${txn.transaction_id}" onchange="reclassifyTransaction('${txn.transaction_id}')" ${disabledAttr}>
                    ${optgroups.replace(`value="${txn.assigned_account}"`, `value="${txn.assigned_account}" selected`)}
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.reclassifyTransaction = (fitid) => {
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Acesso Negado', 'Apenas administradores podem reclassificar transações.', 'danger');
        return;
    }
    const txn = OFX_Raw_Import.find(t => t.transaction_id === fitid);
    const newCategoryPath = document.getElementById(`reclass_${fitid}`).value;
    
    if(!txn || !newCategoryPath || txn.assigned_account === newCategoryPath) return;

    if(newCategoryPath === 'ignore') {
        const oldPath = txn.assigned_account.split('.');
        EFO_Lancamentos[oldPath[0]][oldPath[1]][oldPath[2]] -= Math.abs(txn.amount);
        txn.status = 'Ignorado';
        txn.assigned_account = null;
    } else {
        // Reverter da antiga
        const oldPath = txn.assigned_account.split('.');
        EFO_Lancamentos[oldPath[0]][oldPath[1]][oldPath[2]] -= Math.abs(txn.amount);
        
        // Adicionar na nova
        const newPath = newCategoryPath.split('.');
        EFO_Lancamentos[newPath[0]][newPath[1]][newPath[2]] += Math.abs(txn.amount);
        
        txn.assigned_account = newCategoryPath;
    }

    saveState();
    showToast('Reclassificação', `O lançamento foi transferido e o DRE foi recalculado.`, 'success');
    
    // Atualiza a tabela modal atual para sumir a linha e atualiza os dashboards
    updateAllViews();
    renderDrillDownTable();
};

function getOptGroupsHTML() {
    return `
        <option value="">Selecione a Conta...</option>
        <optgroup label="Receitas DRE">
            <option value="dre.receita_bruta.produtos">Venda de Produtos</option>
            <option value="dre.receita_bruta.servicos">Prestação de Serviços</option>
            <option value="dre.receitas_financeiras.rendimentos">Receitas Financeiras / Rendimentos</option>
        </optgroup>
        <optgroup label="Deduções e Custos DRE">
            <option value="dre.deducoes.impostos">Impostos S/ Faturamento</option>
            <option value="dre.custos.mercadorias">CMV (Compra de Mercadorias)</option>
        </optgroup>
        <optgroup label="Despesas Operacionais DRE">
            <option value="dre.despesas_comercial.trafego">Marketing/Tráfego</option>
            <option value="dre.despesas_comercial.transporte_logistica">Transporte/Logística</option>
            <option value="dre.despesas_comercial.comissao">Comissão s/ Vendas</option>
            <option value="dre.despesas_administrativas.aluguel">Aluguel ADM</option>
            <option value="dre.despesas_administrativas.outras">Outras ADM</option>
            <option value="dre.despesas_pessoal.salarios">Salários/Pró-Labore</option>
            <option value="dre.despesas_estrutura.manutencao">Manutenção/Limpeza</option>
            <option value="dre.despesas_veiculos.combustivel">Combustível/Veículos</option>
            <option value="dre.despesas_financeiras.tarifas">Tarifas/Juros Bancários</option>
        </optgroup>
        <optgroup label="Balanço: Ativo Circulante">
            <option value="balanco.ativo_circulante.caixa_bancos">Caixa e Bancos</option>
            <option value="balanco.ativo_circulante.aplicacoes">Aplicações Financeiras</option>
            <option value="balanco.ativo_circulante.clientes_receber">Clientes a Receber</option>
            <option value="balanco.ativo_circulante.estoques">Estoques</option>
            <option value="balanco.ativo_circulante.adiantamentos">Adiantamentos</option>
            <option value="balanco.ativo_circulante.tributos_recuperar">Tributos a Recuperar</option>
        </optgroup>
        <optgroup label="Balanço: Ativo Não Circulante">
            <option value="balanco.ativo_nao_circulante.imobilizado">Imobilizado</option>
            <option value="balanco.ativo_nao_circulante.intangivel">Intangível</option>
        </optgroup>
        <optgroup label="Balanço: Passivo Circulante">
            <option value="balanco.passivo_circulante.fornecedores">Fornecedores</option>
            <option value="balanco.passivo_circulante.emprestimos_cp">Empréstimos Curto Prazo</option>
            <option value="balanco.passivo_circulante.obrigacoes_trab">Obrigações Trabalhistas</option>
            <option value="balanco.passivo_circulante.obrigacoes_trib">Obrigações Tributárias</option>
            <option value="balanco.passivo_circulante.outras">Outras Obrigações</option>
        </optgroup>
        <optgroup label="Balanço: Passivo Não Circulante">
            <option value="balanco.passivo_nao_circulante.emprestimos_lp">Empréstimos Longo Prazo</option>
            <option value="balanco.passivo_nao_circulante.parcelamentos">Parcelamentos</option>
        </optgroup>
        <optgroup label="Balanço: Patrimônio Líquido">
            <option value="balanco.patrimonio_liquido.capital_social">Capital Social</option>
            <option value="balanco.patrimonio_liquido.reservas">Reservas</option>
            <option value="balanco.patrimonio_liquido.lucros_acumulados">Lucros Acumulados</option>
        </optgroup>
        <option value="ignore">Ignorar/Não Contabilizar</option>
    `;
}

// --- VIEWS RENDERERS ---
function updateAllViews() {
    renderIndicadores();
    renderDRE();
    renderBalanco();
    renderConciliationTable();
    renderManualConciliationTable();
    if (document.getElementById('tab-parecer-mensal') && document.getElementById('tab-parecer-mensal').classList.contains('active')) {
        renderParecerMensal();
    }
    if (document.getElementById('tab-parecer-anual') && document.getElementById('tab-parecer-anual').classList.contains('active')) {
        renderParecerAnual();
    }
    if (document.getElementById('tab-client-files') && document.getElementById('tab-client-files').classList.contains('active')) {
        if (typeof renderClientUploadedFiles === 'function') renderClientUploadedFiles();
    }
    if (document.getElementById('tab-admin-files') && document.getElementById('tab-admin-files').classList.contains('active')) {
        if (typeof renderAdminUploadedFiles === 'function') renderAdminUploadedFiles();
    }
}

function renderIndicadores() {
    const yearSelect = document.getElementById('indYearSelect');
    if (yearSelect) {
        const years = getDREYears();
        let optionsHtml = '';
        years.forEach(y => {
            optionsHtml += `<option value="${y}" ${y === EFO_Active_DRE_Year ? 'selected' : ''}>${y}</option>`;
        });
        yearSelect.innerHTML = optionsHtml;
        yearSelect.onchange = (e) => {
            EFO_Active_DRE_Year = parseInt(e.target.value);
            updateAllViews();
        };
    }

    const theadRow = document.getElementById('indTheadRow');
    const tbody = document.getElementById('indTbody');
    if (!theadRow || !tbody) return;

    const mShort = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const yr = EFO_Active_DRE_Year;

    // Build header
    let hdr = `<th style="text-align:left; min-width:200px;">Indicador</th>`;
    for (let m = 0; m < 12; m++) hdr += `<th class="text-right">${mShort[m]}/${yr}</th>`;
    hdr += `<th class="text-right" style="background:rgba(241,196,15,0.12);color:#f1c40f;">MÉDIA</th>`;
    theadRow.innerHTML = hdr;

    // Get DRE data
    const d = calculateDREData(yr);
    const divisor = EFO_Active_DRE_Divisor || 12;

    const R_BRUTA = sumArrays(
        d['dre.receita_bruta.produtos'],
        d['dre.receita_bruta.servicos'],
        d['dre.receita_bruta.outras']
    );
    const DEDUCOES = sumArrays(
        d['dre.deducoes.impostos'],
        d['dre.deducoes.devolucoes'],
        d['dre.deducoes.descontos']
    );
    const R_LIQUIDA = R_BRUTA.map((v, i) => v - DEDUCOES[i]);
    const CUSTOS = sumArrays(
        d['dre.custos.mercadorias'],
        d['dre.custos.producao'],
        d['dre.custos.servicos'],
        d['dre.custos.operacionais']
    );
    const L_BRUTO = R_LIQUIDA.map((v, i) => v - CUSTOS[i]);
    const D_COM = sumArrays(
        d['dre.despesas_comercial.comissao'],
        d['dre.despesas_comercial.trafego'],
        d['dre.despesas_comercial.marketing'],
        d['dre.despesas_comercial.viagens'],
        d['dre.despesas_comercial.transporte_logistica'],
        d['dre.despesas_comercial.outras']
    );
    const D_PES = sumArrays(
        d['dre.despesas_pessoal.salarios'],
        d['dre.despesas_pessoal.inss'],
        d['dre.despesas_pessoal.fgts'],
        d['dre.despesas_pessoal.beneficios'],
        d['dre.despesas_pessoal.rescisoes']
    );
    const D_ADM = sumArrays(
        d['dre.despesas_administrativas.pro_labore'],
        d['dre.despesas_administrativas.salarios'],
        d['dre.despesas_administrativas.encargos'],
        d['dre.despesas_administrativas.aluguel'],
        d['dre.despesas_administrativas.outras']
    );
    const D_EST = sumArrays(
        d['dre.despesas_estrutura.manutencao'],
        d['dre.despesas_estrutura.reparos'],
        d['dre.despesas_estrutura.limpeza']
    );
    const D_FIN = sumArrays(
        d['dre.despesas_financeiras.tarifas'],
        d['dre.despesas_financeiras.juros'],
        d['dre.despesas_financeiras.iof']
    );
    const R_FIN = sumArrays(
        d['dre.receitas_financeiras.rendimentos'],
        d['dre.receitas_financeiras.juros_recebidos']
    );
    const D_TOTAL = sumArrays(D_COM, D_PES, D_ADM, D_EST, D_FIN);
    const EBITDA = L_BRUTO.map((v, i) => v - D_TOTAL[i] + R_FIN[i]);
    const L_LIQ = EBITDA.map((v, i) => v - d['dre.impostos_lucro.irpj_csll'][i]);

    // Helper: render a percent or numeric row
    function indRow(label, valArr, isPercent = false, decimals = 2, colorize = false) {
        let html = `<tr class="ind-row"><td>${label}</td>`;
        let total = 0, count = 0;
        for (let m = 0; m < 12; m++) {
            const v = valArr[m];
            if (v !== 0) { total += v; count++; }
            let display = v === 0 ? '-' : (isPercent ? formatPercent(v) : formatCurrency(v));
            let cls = '';
            if (colorize && v !== 0) cls = v < 0 ? ' negative' : ' positive';
            html += `<td class="ind-val${cls}">${display}</td>`;
        }
        const avg = count > 0 ? total / count : 0;
        html += `<td class="ind-val" style="background:rgba(241,196,15,0.08);font-weight:bold;color:#f1c40f;">${avg === 0 ? '-' : (isPercent ? formatPercent(avg) : formatCurrency(avg))}</td>`;
        html += `</tr>`;
        return html;
    }
    function sectionHeader(label) {
        return `<tr class="indicadores-section-header"><td colspan="14">${label}</td></tr>`;
    }

    // ---- Derived monthly arrays ----
    const markup = R_LIQUIDA.map((v, i) => CUSTOS[i] > 0 ? v / CUSTOS[i] : 0);
    const margemContrib = R_BRUTA.map((v, i) => v > 0 ? (L_BRUTO[i] / v) * 100 : 0);
    const custoOp = R_BRUTA.map((v, i) => v > 0 ? (D_TOTAL[i] / v) * 100 : 0);
    const faturamento = R_BRUTA;
    const comissaoPerc = R_BRUTA.map((v, i) => v > 0 ? (D_COM[i] / v) * 100 : 0);
    const impostosPerc = R_BRUTA.map((v, i) => v > 0 ? (DEDUCOES[i] / v) * 100 : 0);
    const ticketMedio = R_BRUTA.map((v) => v); // placeholder until nVendas available
    const margemOp = R_BRUTA.map((v, i) => v > 0 ? (EBITDA[i] / v) * 100 : 0);
    const margemLiq = R_BRUTA.map((v, i) => v > 0 ? (L_LIQ[i] / v) * 100 : 0);
    // Liquidity placeholders (require Balanço data)
    const bData = calculateBalancoData(yr);
    const ATIVO_CIRC = sumArrays(
        bData['balanco.ativo_circulante.caixa_bancos'],
        bData['balanco.ativo_circulante.aplicacoes'],
        bData['balanco.ativo_circulante.clientes_receber'],
        bData['balanco.ativo_circulante.estoques'],
        bData['balanco.ativo_circulante.adiantamentos'],
        bData['balanco.ativo_circulante.tributos_recuperar']
    );
    const PASSIVO_CIRC = sumArrays(
        bData['balanco.passivo_circulante.fornecedores'],
        bData['balanco.passivo_circulante.emprestimos_cp'],
        bData['balanco.passivo_circulante.obrigacoes_trab'],
        bData['balanco.passivo_circulante.obrigacoes_trib'],
        bData['balanco.passivo_circulante.outras']
    );
    const PASSIVO_TOTAL = sumArrays(
        PASSIVO_CIRC,
        bData['balanco.passivo_nao_circulante.emprestimos_lp'],
        bData['balanco.passivo_nao_circulante.parcelamentos']
    );
    const PL = sumArrays(
        bData['balanco.patrimonio_liquido.capital_social'],
        bData['balanco.patrimonio_liquido.reservas'],
        bData['balanco.patrimonio_liquido.lucros_acumulados']
    );
    const liqGeral = PASSIVO_TOTAL.map((v, i) => v > 0 ? (ATIVO_CIRC[i] + (bData['balanco.ativo_nao_circulante.imobilizado'][i] || 0)) / v : 0);
    const liqCorrente = PASSIVO_CIRC.map((v, i) => v > 0 ? ATIVO_CIRC[i] / v : 0);
    const capTerceiros = PL.map((v, i) => v > 0 ? PASSIVO_TOTAL[i] / v : 0);
    const roi = ATIVO_CIRC.map((v, i) => v > 0 ? (EBITDA[i] / v) * 100 : 0);
    const roe = PL.map((v, i) => v > 0 ? (L_LIQ[i] / v) * 100 : 0);

    let html = '';
    // ---- ECONÔMICO E FINANCEIRO (first) ----
    html += sectionHeader('ECONÔMICO E FINANCEIRO');
    html += indRow('Liquidez Geral', liqGeral, false, 2);
    html += indRow('Liquidez Corrente', liqCorrente, false, 2);
    html += indRow('Capital de Terceiros (x PL)', capTerceiros, false, 2);
    html += indRow('Margem Operacional', margemOp, true, 2, true);
    html += indRow('Margem Líquida', margemLiq, true, 2, true);
    html += indRow('ROI – Retorno sobre Ativo', roi, true, 2, true);
    html += indRow('ROE – Retorno sobre Capital', roe, true, 2, true);

    // ---- OPERACIONAL (below) ----
    html += sectionHeader('OPERACIONAL');
    html += indRow('Markup (x)', markup, false, 2);
    html += indRow('Margem de Contribuição', margemContrib, true);
    html += indRow('Custo Operacional s/ Faturamento', custoOp, true);
    html += indRow('Faturamento Bruto', faturamento, false);
    html += indRow('% Comissão', comissaoPerc, true);
    html += indRow('% Impostos', impostosPerc, true);
    html += indRow('EBITDA Gerencial', EBITDA, false, 2, true);
    html += indRow('Margem EBITDA', margemOp, true, 2, true);
    html += indRow('Resultado Líquido', L_LIQ, false, 2, true);

    tbody.innerHTML = html;
}


function getDREYears() {
    const years = new Set([new Date().getFullYear()]);
    if (Array.isArray(OFX_Raw_Import)) {
        OFX_Raw_Import.forEach(txn => {
            if (txn.date) {
                const year = new Date(txn.date).getFullYear();
                if (!isNaN(year)) {
                    years.add(year);
                }
            }
        });
    }
    return Array.from(years).sort((a, b) => b - a);
}

function calculateDREData(year) {
    const dreKeys = {
        'dre.receita_bruta.produtos': new Array(12).fill(0),
        'dre.receita_bruta.servicos': new Array(12).fill(0),
        'dre.receita_bruta.outras': new Array(12).fill(0),
        'dre.deducoes.impostos': new Array(12).fill(0),
        'dre.deducoes.devolucoes': new Array(12).fill(0),
        'dre.deducoes.descontos': new Array(12).fill(0),
        'dre.custos.mercadorias': new Array(12).fill(0),
        'dre.custos.producao': new Array(12).fill(0),
        'dre.custos.servicos': new Array(12).fill(0),
        'dre.custos.operacionais': new Array(12).fill(0),
        'dre.despesas_comercial.marketing': new Array(12).fill(0),
        'dre.despesas_comercial.trafego': new Array(12).fill(0),
        'dre.despesas_comercial.comissao': new Array(12).fill(0),
        'dre.despesas_comercial.viagens': new Array(12).fill(0),
        'dre.despesas_comercial.transporte_logistica': new Array(12).fill(0),
        'dre.despesas_comercial.outras': new Array(12).fill(0),
        'dre.despesas_administrativas.pro_labore': new Array(12).fill(0),
        'dre.despesas_administrativas.salarios': new Array(12).fill(0),
        'dre.despesas_administrativas.encargos': new Array(12).fill(0),
        'dre.despesas_administrativas.aluguel': new Array(12).fill(0),
        'dre.despesas_administrativas.outras': new Array(12).fill(0),
        'dre.despesas_pessoal.salarios': new Array(12).fill(0),
        'dre.despesas_pessoal.inss': new Array(12).fill(0),
        'dre.despesas_pessoal.fgts': new Array(12).fill(0),
        'dre.despesas_pessoal.beneficios': new Array(12).fill(0),
        'dre.despesas_pessoal.rescisoes': new Array(12).fill(0),
        'dre.despesas_estrutura.manutencao': new Array(12).fill(0),
        'dre.despesas_estrutura.reparos': new Array(12).fill(0),
        'dre.despesas_estrutura.limpeza': new Array(12).fill(0),
        'dre.despesas_veiculos.combustivel': new Array(12).fill(0),
        'dre.despesas_veiculos.manutencao': new Array(12).fill(0),
        'dre.despesas_veiculos.seguro': new Array(12).fill(0),
        'dre.despesas_veiculos.ipva': new Array(12).fill(0),
        'dre.receitas_financeiras.rendimentos': new Array(12).fill(0),
        'dre.receitas_financeiras.juros_recebidos': new Array(12).fill(0),
        'dre.despesas_financeiras.tarifas': new Array(12).fill(0),
        'dre.despesas_financeiras.juros': new Array(12).fill(0),
        'dre.despesas_financeiras.iof': new Array(12).fill(0),
        'dre.nao_operacional.resultado': new Array(12).fill(0),
        'dre.depreciacao.valor': new Array(12).fill(0),
        'dre.impostos_lucro.irpj_csll': new Array(12).fill(0)
    };

    if (Array.isArray(OFX_Raw_Import)) {
        OFX_Raw_Import.forEach(txn => {
            if (txn.status === 'Categorizado' && txn.assigned_account) {
                const dateObj = new Date(txn.date);
                const txnYear = dateObj.getFullYear();
                if (txnYear === year) {
                    const txnMonth = dateObj.getMonth(); // 0-11
                    
                    let acc = txn.assigned_account;
                    if (acc === 'dre.despesas_veiculos') acc = 'dre.despesas_veiculos.manutencao';
                    if (acc === 'dre.despesas_estrutura') acc = 'dre.despesas_estrutura.manutencao';
                    if (acc === 'dre.receitas_financeiras') acc = 'dre.receitas_financeiras.rendimentos';
                    if (acc === 'dre.despesas_financeiras') acc = 'dre.despesas_financeiras.tarifas';
                    
                    if (dreKeys[acc]) {
                        dreKeys[acc][txnMonth] += Math.abs(txn.amount);
                    } else {
                        const matchedKey = Object.keys(dreKeys).find(k => k.startsWith(acc + '.'));
                        if (matchedKey) {
                            dreKeys[matchedKey][txnMonth] += Math.abs(txn.amount);
                        }
                    }
                }
            }
        });
    }

    return dreKeys;
}

function sumArrays(...arrays) {
    const result = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
        for (let j = 0; j < arrays.length; j++) {
            if (arrays[j] && arrays[j][i]) {
                result[i] += arrays[j][i];
            }
        }
    }
    return result;
}

function makeDreRowHTML(label, rowType, monthValues, isNegative = false, clickHandler = '', avBaseValues = null) {
    const divisor = EFO_Active_DRE_Divisor || 12;
    let total = 0;
    for (let i = 0; i < 12; i++) {
        total += monthValues[i];
    }
    const media = total / divisor;

    let rowClass = '';
    if (rowType === 'group') rowClass = 'row-group';
    if (rowType === 'sub') rowClass = 'row-sub';
    if (rowType === 'total') rowClass = 'row-total';
    if (isNegative && rowType === 'group') rowClass += ' text-danger';
    if (!isNegative && rowType === 'group' && label.includes('RECEITA')) rowClass += ' text-success';

    // Parse categoryPath and title from clickHandler if it contains openDrillDown
    let categoryPath = null;
    let title = null;
    if (clickHandler) {
        const match = clickHandler.match(/openDrillDown\('([^']*)',\s*'([^']*)'\)/);
        if (match) {
            categoryPath = match[1];
            title = match[2];
        }
    }

    const cellStyle = categoryPath ? 'cursor: pointer; transition: background 0.2s;' : '';
    const hoverBg = categoryPath ? 'onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'\'"' : '';

    let html = `<tr class="${rowClass}">`;
    
    // Label cell
    if (categoryPath) {
        html += `<td style="${cellStyle}" ${hoverBg} onclick="openDrillDown('${categoryPath}', '${title}', null)">${label}</td>`;
    } else {
        html += `<td>${label}</td>`;
    }

    // Months
    for (let i = 0; i < 12; i++) {
        let val = monthValues[i];
        if (categoryPath) {
            html += `<td class="text-right" style="${cellStyle}" ${hoverBg} onclick="openDrillDown('${categoryPath}', '${title}', ${i})">${val === 0 ? '-' : formatCurrency(val)}</td>`;
        } else {
            html += `<td class="text-right">${val === 0 ? '-' : formatCurrency(val)}</td>`;
        }
    }

    // Media
    let mediaAV = '';
    if (avBaseValues) {
        let baseTotal = avBaseValues.reduce((a,b) => a + b, 0);
        let baseMedia = baseTotal / divisor;
        if (baseMedia > 0) {
            mediaAV = ` <span style="font-size:10px; opacity:0.7;">(${formatPercent((media / baseMedia) * 100)})</span>`;
        } else {
            mediaAV = ` <span style="font-size:10px; opacity:0.7;">(0%)</span>`;
        }
    }
    html += `<td class="text-right" style="background: rgba(241, 196, 15, 0.08); font-weight: bold; color: #f1c40f;">${media === 0 ? '-' : formatCurrency(media)}${mediaAV}</td>`;

    // Total
    if (categoryPath) {
        html += `<td class="text-right" style="background: rgba(99, 102, 241, 0.08); font-weight: bold; color: var(--accent-primary); ${cellStyle}" ${hoverBg} onclick="openDrillDown('${categoryPath}', '${title}', null)">${total === 0 ? '-' : formatCurrency(total)}</td>`;
    } else {
        html += `<td class="text-right" style="background: rgba(99, 102, 241, 0.08); font-weight: bold; color: var(--accent-primary);">${total === 0 ? '-' : formatCurrency(total)}</td>`;
    }

    html += `</tr>`;
    return html;
}

function renderDRE() {
    const yearSelect = document.getElementById('dreYearSelect');
    if (yearSelect) {
        const years = getDREYears();
        let optionsHtml = '';
        years.forEach(y => {
            optionsHtml += `<option value="${y}" ${y === EFO_Active_DRE_Year ? 'selected' : ''}>${y}</option>`;
        });
        yearSelect.innerHTML = optionsHtml;
        
        yearSelect.onchange = (e) => {
            EFO_Active_DRE_Year = parseInt(e.target.value);
            updateAllViews();
        };
    }

    const theadRow = document.getElementById('dreTheadRow');
    const tbody = document.getElementById('dreTbody');
    if (!theadRow || !tbody) return;

    // Headers
    let headerHtml = `<th style="text-align: left;">Estrutura DRE</th>`;
    const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (let m = 0; m < 12; m++) {
        headerHtml += `<th class="text-right">${monthsShort[m]}/${EFO_Active_DRE_Year}</th>`;
    }
    headerHtml += `<th class="text-right" style="background: rgba(241, 196, 15, 0.12); color: #f1c40f;">MÉDIA</th>`;
    headerHtml += `<th class="text-right" style="background: rgba(99, 102, 241, 0.12); color: var(--accent-primary);">TOTAL</th>`;
    theadRow.innerHTML = headerHtml;

    // Divisor
    const activeMonths = [];
    for (let m = 0; m < 12; m++) {
        const hasData = OFX_Raw_Import.some(t => {
            if (t.status === 'Categorizado') {
                const dateObj = new Date(t.date);
                return dateObj.getFullYear() === EFO_Active_DRE_Year && dateObj.getMonth() === m;
            }
            return false;
        });
        if (hasData) {
            activeMonths.push(m);
        }
    }
    EFO_Active_DRE_Divisor = activeMonths.length > 0 ? activeMonths.length : 12;

    const dreKeys = calculateDREData(EFO_Active_DRE_Year);

    const rBrutaProd = dreKeys['dre.receita_bruta.produtos'];
    const rBrutaServ = dreKeys['dre.receita_bruta.servicos'];
    const rBrutaOutras = dreKeys['dre.receita_bruta.outras'];
    const R_BRUTA = sumArrays(rBrutaProd, rBrutaServ, rBrutaOutras);

    const dImpostos = dreKeys['dre.deducoes.impostos'];
    const dDevolucoes = dreKeys['dre.deducoes.devolucoes'];
    const dDescontos = dreKeys['dre.deducoes.descontos'];
    const DEDUCOES = sumArrays(dImpostos, dDevolucoes, dDescontos);

    const R_LIQUIDA = R_BRUTA.map((v, i) => v - DEDUCOES[i]);

    const cMercadorias = dreKeys['dre.custos.mercadorias'];
    const cProducao = dreKeys['dre.custos.producao'];
    const cServicos = dreKeys['dre.custos.servicos'];
    const cOperacionais = dreKeys['dre.custos.operacionais'];
    const CUSTOS = sumArrays(cMercadorias, cProducao, cServicos, cOperacionais);

    const L_BRUTO = R_LIQUIDA.map((v, i) => v - CUSTOS[i]);

    const dComTransporte = dreKeys['dre.despesas_comercial.transporte_logistica'];
    const dComComissao = dreKeys['dre.despesas_comercial.comissao'];
    const dComTrafego = dreKeys['dre.despesas_comercial.trafego'];
    const dComMkt = dreKeys['dre.despesas_comercial.marketing'];
    const dComViagens = dreKeys['dre.despesas_comercial.viagens'];
    const dComOutras = dreKeys['dre.despesas_comercial.outras'];
    const D_COM = sumArrays(dComTransporte, dComComissao, dComTrafego, dComMkt, dComViagens, dComOutras);

    const dAdmAluguel = dreKeys['dre.despesas_administrativas.aluguel'];
    const dAdmOutras = dreKeys['dre.despesas_administrativas.outras'];
    const dAdmProLabore = dreKeys['dre.despesas_administrativas.pro_labore'];
    const dAdmSalarios = dreKeys['dre.despesas_administrativas.salarios'];
    const dAdmEncargos = dreKeys['dre.despesas_administrativas.encargos'];
    const D_ADM = sumArrays(dAdmAluguel, dAdmOutras, dAdmProLabore, dAdmSalarios, dAdmEncargos);

    const dPesSalarios = dreKeys['dre.despesas_pessoal.salarios'];
    const dPesInss = dreKeys['dre.despesas_pessoal.inss'];
    const dPesFgts = dreKeys['dre.despesas_pessoal.fgts'];
    const dPesBeneficios = dreKeys['dre.despesas_pessoal.beneficios'];
    const dPesRescisoes = dreKeys['dre.despesas_pessoal.rescisoes'];
    const D_PES = sumArrays(dPesSalarios, dPesInss, dPesFgts, dPesBeneficios, dPesRescisoes);

    const dEstManutencao = dreKeys['dre.despesas_estrutura.manutencao'];
    const dEstReparos = dreKeys['dre.despesas_estrutura.reparos'];
    const dEstLimpeza = dreKeys['dre.despesas_estrutura.limpeza'];
    const D_EST = sumArrays(dEstManutencao, dEstReparos, dEstLimpeza);

    const dVeiCombustivel = dreKeys['dre.despesas_veiculos.combustivel'];
    const dVeiManutencao = dreKeys['dre.despesas_veiculos.manutencao'];
    const dVeiSeguro = dreKeys['dre.despesas_veiculos.seguro'];
    const dVeiIpva = dreKeys['dre.despesas_veiculos.ipva'];
    const D_VEI = sumArrays(dVeiCombustivel, dVeiManutencao, dVeiSeguro, dVeiIpva);

    const D_OPERACIONAIS = sumArrays(D_COM, D_ADM, D_PES, D_EST, D_VEI);

    const rFinRendimentos = dreKeys['dre.receitas_financeiras.rendimentos'];
    const rFinJuros = dreKeys['dre.receitas_financeiras.juros_recebidos'];
    const R_FIN = sumArrays(rFinRendimentos, rFinJuros);

    const dFinTarifas = dreKeys['dre.despesas_financeiras.tarifas'];
    const dFinJuros = dreKeys['dre.despesas_financeiras.juros'];
    const dFinIof = dreKeys['dre.despesas_financeiras.iof'];
    const D_FIN = sumArrays(dFinTarifas, dFinJuros, dFinIof);

    const nOpResultado = dreKeys['dre.nao_operacional.resultado'];

    const EBITDA = L_BRUTO.map((v, i) => v - D_OPERACIONAIS[i] + R_FIN[i] - D_FIN[i] + nOpResultado[i]);

    const depreciacaoVal = dreKeys['dre.depreciacao.valor'];
    const impostoLucroVal = dreKeys['dre.impostos_lucro.irpj_csll'];
    const L_LIQUIDO = EBITDA.map((v, i) => v - depreciacaoVal[i] - impostoLucroVal[i]);

    let bodyHtml = '';

    // Render Rows
    bodyHtml += makeDreRowHTML('1. RECEITA OPERACIONAL BRUTA', 'group', R_BRUTA, false, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('Receita de Produtos', 'sub', rBrutaProd, false, `onclick="openDrillDown('dre.receita_bruta.produtos', 'Receita de Produtos')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Receita de Serviços', 'sub', rBrutaServ, false, `onclick="openDrillDown('dre.receita_bruta.servicos', 'Receita de Serviços')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Outras Receitas', 'sub', rBrutaOutras, false, `onclick="openDrillDown('dre.receita_bruta.outras', 'Outras Receitas')"`, R_BRUTA);

    bodyHtml += makeDreRowHTML('(-) DEDUÇÕES DA RECEITA', 'group', DEDUCOES, true, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('Impostos S/ Faturamento', 'sub', dImpostos, true, `onclick="openDrillDown('dre.deducoes.impostos', 'Impostos S/ Faturamento')"`, R_BRUTA);

    bodyHtml += makeDreRowHTML('(=) RECEITA OPERACIONAL LÍQUIDA', 'total', R_LIQUIDA, false, '', R_BRUTA);

    bodyHtml += makeDreRowHTML('(-) CUSTOS DOS PRODUTOS/SERVIÇOS', 'group', CUSTOS, true, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('CMV', 'sub', cMercadorias, true, `onclick="openDrillDown('dre.custos.mercadorias', 'CMV')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Serviços Terceiros', 'sub', cServicos, true, `onclick="openDrillDown('dre.custos.servicos', 'Serviços Terceiros')"`, R_BRUTA);

    bodyHtml += makeDreRowHTML('(=) LUCRO BRUTO', 'total', L_BRUTO, false, '', R_BRUTA);

    bodyHtml += makeDreRowHTML('(-) DESPESAS OPERACIONAIS', 'group', D_OPERACIONAIS, true, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('Transporte e Logística', 'sub', dComTransporte, true, `onclick="openDrillDown('dre.despesas_comercial.transporte_logistica', 'Transporte e Logística')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Comissões s/ Vendas', 'sub', dComComissao, true, `onclick="openDrillDown('dre.despesas_comercial.comissao', 'Comissões s/ Vendas')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Marketing/Tráfego', 'sub', dComTrafego, true, `onclick="openDrillDown('dre.despesas_comercial.trafego', 'Despesas Comerciais/Mkt')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Despesas Administrativas (Outras)', 'sub', dAdmOutras, true, `onclick="openDrillDown('dre.despesas_administrativas.outras', 'Despesas Administrativas (Outras)')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Despesas Administrativas (Aluguel)', 'sub', dAdmAluguel, true, `onclick="openDrillDown('dre.despesas_administrativas.aluguel', 'Despesas Administrativas (Aluguel)')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Despesas de Pessoal', 'sub', D_PES, true, `onclick="openDrillDown('dre.despesas_pessoal.salarios', 'Despesas de Pessoal')"`, R_BRUTA);
    bodyHtml += makeDreRowHTML('Despesas Estrutura/Veículos', 'sub', sumArrays(D_EST, D_VEI), true, `onclick="openDrillDown('dre.despesas_estrutura.manutencao', 'Despesas Estrutura/Veículos')"`, R_BRUTA);

    bodyHtml += makeDreRowHTML('(+) RECEITAS FINANCEIRAS', 'group', R_FIN, false, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('Rendimentos/Juros', 'sub', rFinRendimentos, false, `onclick="openDrillDown('dre.receitas_financeiras.rendimentos', 'Rendimentos/Juros')"`, R_BRUTA);

    bodyHtml += makeDreRowHTML('(-) DESPESAS FINANCEIRAS', 'group', D_FIN, true, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('Tarifas e Juros', 'sub', dFinTarifas, true, `onclick="openDrillDown('dre.despesas_financeiras.tarifas', 'Tarifas e Juros')"`, R_BRUTA);

    bodyHtml += makeDreRowHTML('(=) EBITDA GERENCIAL', 'total', EBITDA, false, '', R_BRUTA);
    bodyHtml += makeDreRowHTML('(=) RESULTADO LÍQUIDO', 'total', L_LIQUIDO, false, '', R_BRUTA);

    tbody.innerHTML = bodyHtml;

    // Render the evolution line chart below the table
    renderDREChart(R_BRUTA, DEDUCOES, CUSTOS, D_OPERACIONAIS, R_FIN, L_LIQUIDO);
}

// Persistent Chart.js instance reference to allow clean re-render
let _dreLineChartInstance = null;

function renderDREChart(R_BRUTA, DEDUCOES, CUSTOS, D_OPERACIONAIS, R_FIN, L_LIQUIDO) {
    const canvas = document.getElementById('dreLineChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const isDark = !document.body.classList.contains('light-mode');

    const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    const labelColor = isDark ? '#94a3b8' : '#64748b';
    const tooltipBg  = isDark ? 'rgba(15,17,26,0.92)' : 'rgba(255,255,255,0.95)';
    const tooltipText = isDark ? '#f8fafc' : '#1e293b';

    // Destroy existing instance before re-render
    if (_dreLineChartInstance) {
        _dreLineChartInstance.destroy();
        _dreLineChartInstance = null;
    }

    const dreSeriesOrder = [
        "Receita Operacional Bruta",
        "Deduções da Receita",
        "Custo dos Produtos/Serviços",
        "Despesas Operacionais",
        "Receitas Operacionais",
        "Resultado Líquido"
    ];

    const datasets = [
        {
            key: 'Receita Operacional Bruta',
            label: '(+) Receita Operacional Bruta',
            data: R_BRUTA,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.75)',
            borderWidth: 1,
        },
        {
            key: 'Deduções da Receita',
            label: '(-) Deduções da Receita',
            data: DEDUCOES.map(v => -Math.abs(v)),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,0.75)',
            borderWidth: 1,
        },
        {
            key: 'Custo dos Produtos/Serviços',
            label: '(-) Custo dos Produtos/Serviços',
            data: CUSTOS.map(v => -Math.abs(v)),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.75)',
            borderWidth: 1,
        },
        {
            key: 'Despesas Operacionais',
            label: '(-) Despesas Operacionais',
            data: D_OPERACIONAIS.map(v => -Math.abs(v)),
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.75)',
            borderWidth: 1,
        },
        {
            key: 'Receitas Operacionais',
            label: '(-) Receitas Operacionais',
            data: R_FIN,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.75)',
            borderWidth: 1,
        },
        {
            key: 'Resultado Líquido',
            label: '(=) Resultado Líquido',
            data: L_LIQUIDO,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,0.75)',
            borderWidth: 1,
        },
    ];

    datasets.sort((a, b) => dreSeriesOrder.indexOf(a.key) - dreSeriesOrder.indexOf(b.key));

    _dreLineChartInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels: monthsShort, datasets },
        plugins: [{
            id: 'barLabels',
            afterDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
                ctx.font = "bold 9px 'Inter', sans-serif";

                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (meta.hidden) return;

                    meta.data.forEach((bar, index) => {
                        const val = dataset.data[index];
                        if (val === 0 || Math.abs(val) < 0.01) return;

                        const rb = R_BRUTA[index];
                        if (rb === 0) return;

                        const pct = (val / rb) * 100;
                        const formattedPct = pct.toFixed(1).replace('.', ',') + '%';

                        const isNegative = val < 0;
                        const padding = 8;
                        const x = bar.x;
                        const y = bar.y;

                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(-Math.PI / 2);
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
                        if (isNegative) {
                            ctx.textAlign = 'right';
                            ctx.fillText(formattedPct, -padding, 0);
                        } else {
                            ctx.textAlign = 'left';
                            ctx.fillText(formattedPct, padding, 0);
                        }
                        ctx.restore();
                    });
                });
                ctx.restore();
            }
        }],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: labelColor,
                        font: { family: "'Inter', sans-serif", size: 12 },
                        boxWidth: 14,
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle',
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipText,
                    bodyColor: tooltipText,
                    borderColor: 'rgba(99,102,241,0.3)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
                            return `  ${ctx.dataset.label}: ${formatted}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: {
                        color: labelColor,
                        font: { family: "'Inter', sans-serif", size: 12 },
                        padding: 15
                    }
                },
                y: {
                    grace: '45%',
                    grid: { color: gridColor },
                    ticks: {
                        color: labelColor,
                        font: { family: "'Inter', sans-serif", size: 11 },
                        callback: (val) => {
                            if (Math.abs(val) >= 1000) return 'R$ ' + (val / 1000).toFixed(0) + 'k';
                            return 'R$ ' + val.toFixed(0);
                        }
                    }
                }
            }
        }
    });
}


function calculateBalancoData(year) {

    const balancoKeys = {
        'balanco.ativo_circulante.caixa_bancos': new Array(12).fill(0),
        'balanco.ativo_circulante.aplicacoes': new Array(12).fill(0),
        'balanco.ativo_circulante.clientes_receber': new Array(12).fill(0),
        'balanco.ativo_circulante.estoques': new Array(12).fill(0),
        'balanco.ativo_circulante.adiantamentos': new Array(12).fill(0),
        'balanco.ativo_circulante.tributos_recuperar': new Array(12).fill(0),
        'balanco.ativo_nao_circulante.imobilizado': new Array(12).fill(0),
        'balanco.ativo_nao_circulante.intangivel': new Array(12).fill(0),
        'balanco.passivo_circulante.fornecedores': new Array(12).fill(0),
        'balanco.passivo_circulante.emprestimos_cp': new Array(12).fill(0),
        'balanco.passivo_circulante.obrigacoes_trab': new Array(12).fill(0),
        'balanco.passivo_circulante.obrigacoes_trib': new Array(12).fill(0),
        'balanco.passivo_circulante.outras': new Array(12).fill(0),
        'balanco.passivo_nao_circulante.emprestimos_lp': new Array(12).fill(0),
        'balanco.passivo_nao_circulante.parcelamentos': new Array(12).fill(0),
        'balanco.patrimonio_liquido.capital_social': new Array(12).fill(0),
        'balanco.patrimonio_liquido.reservas': new Array(12).fill(0),
        'balanco.patrimonio_liquido.lucros_acumulados': new Array(12).fill(0)
    };

    if (Array.isArray(OFX_Raw_Import)) {
        OFX_Raw_Import.forEach(txn => {
            if (txn.status === 'Categorizado' && txn.assigned_account) {
                const dateObj = new Date(txn.date);
                const txnYear = dateObj.getFullYear();
                if (txnYear === year) {
                    const txnMonth = dateObj.getMonth(); // 0-11
                    
                    let acc = txn.assigned_account;
                    
                    // Remap legacy general classifications if any
                    if (acc === 'balanco.ativo_circulante') acc = 'balanco.ativo_circulante.caixa_bancos';
                    if (acc === 'balanco.ativo_nao_circulante') acc = 'balanco.ativo_nao_circulante.imobilizado';
                    if (acc === 'balanco.passivo_circulante') acc = 'balanco.passivo_circulante.emprestimos_cp';
                    
                    if (balancoKeys[acc]) {
                        balancoKeys[acc][txnMonth] += Math.abs(txn.amount);
                    } else {
                        const matchedKey = Object.keys(balancoKeys).find(k => k.startsWith(acc + '.'));
                        if (matchedKey) {
                            balancoKeys[matchedKey][txnMonth] += Math.abs(txn.amount);
                        }
                    }
                }
            }
        });
    }

    return balancoKeys;
}

function renderBalanco() {
    const yearSelect = document.getElementById('balancoYearSelect');
    if (yearSelect) {
        const years = getDREYears();
        let optionsHtml = '';
        years.forEach(y => {
            optionsHtml += `<option value="${y}" ${y === EFO_Active_DRE_Year ? 'selected' : ''}>${y}</option>`;
        });
        yearSelect.innerHTML = optionsHtml;
        
        yearSelect.onchange = (e) => {
            EFO_Active_DRE_Year = parseInt(e.target.value);
            updateAllViews();
        };
    }

    const ativoTheadRow = document.getElementById('ativoTheadRow');
    const passivoTheadRow = document.getElementById('passivoTheadRow');
    const ativoTbody = document.getElementById('ativoTbody');
    const passivoTbody = document.getElementById('passivoTbody');
    
    if (!ativoTbody || !passivoTbody) return;

    // Headers
    let headerHtml = `<th style="text-align: left;">Estrutura Balanço</th>`;
    const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (let m = 0; m < 12; m++) {
        headerHtml += `<th class="text-right">${monthsShort[m]}/${EFO_Active_DRE_Year}</th>`;
    }
    headerHtml += `<th class="text-right" style="background: rgba(241, 196, 15, 0.12); color: #f1c40f;">MÉDIA</th>`;
    headerHtml += `<th class="text-right" style="background: rgba(99, 102, 241, 0.12); color: var(--accent-primary);">TOTAL</th>`;
    
    if (ativoTheadRow) ativoTheadRow.innerHTML = headerHtml;
    if (passivoTheadRow) passivoTheadRow.innerHTML = headerHtml;

    const b = calculateBalancoData(EFO_Active_DRE_Year);

    // ATIVO
    const caixaBancos = b['balanco.ativo_circulante.caixa_bancos'];
    const aplicacoes = b['balanco.ativo_circulante.aplicacoes'];
    const clientesReceber = b['balanco.ativo_circulante.clientes_receber'];
    const estoques = b['balanco.ativo_circulante.estoques'];
    const adiantamentos = b['balanco.ativo_circulante.adiantamentos'];
    const tributosRecuperar = b['balanco.ativo_circulante.tributos_recuperar'];
    const ATIVO_CIRCULANTE = sumArrays(caixaBancos, aplicacoes, clientesReceber, estoques, adiantamentos, tributosRecuperar);

    const imobilizado = b['balanco.ativo_nao_circulante.imobilizado'];
    const intangivel = b['balanco.ativo_nao_circulante.intangivel'];
    const ATIVO_NAO_CIRCULANTE = sumArrays(imobilizado, intangivel);

    const TOTAL_ATIVO = sumArrays(ATIVO_CIRCULANTE, ATIVO_NAO_CIRCULANTE);

    let ativoHtml = '';
    ativoHtml += makeDreRowHTML('ATIVO CIRCULANTE', 'group', ATIVO_CIRCULANTE, false, '', null);
    ativoHtml += makeDreRowHTML('Caixa e Bancos', 'sub', caixaBancos, false, `onclick="openDrillDown('balanco.ativo_circulante.caixa_bancos', 'Caixa e Bancos')"`, null);
    ativoHtml += makeDreRowHTML('Aplicações Financeiras', 'sub', aplicacoes, false, `onclick="openDrillDown('balanco.ativo_circulante.aplicacoes', 'Aplicações Financeiras')"`, null);
    ativoHtml += makeDreRowHTML('Clientes a Receber', 'sub', clientesReceber, false, `onclick="openDrillDown('balanco.ativo_circulante.clientes_receber', 'Clientes a Receber')"`, null);
    ativoHtml += makeDreRowHTML('Estoques', 'sub', estoques, false, `onclick="openDrillDown('balanco.ativo_circulante.estoques', 'Estoques')"`, null);
    ativoHtml += makeDreRowHTML('Adiantamentos', 'sub', adiantamentos, false, `onclick="openDrillDown('balanco.ativo_circulante.adiantamentos', 'Adiantamentos')"`, null);
    ativoHtml += makeDreRowHTML('Tributos a Recuperar', 'sub', tributosRecuperar, false, `onclick="openDrillDown('balanco.ativo_circulante.tributos_recuperar', 'Tributos a Recuperar')"`, null);

    ativoHtml += makeDreRowHTML('ATIVO NÃO CIRCULANTE', 'group', ATIVO_NAO_CIRCULANTE, false, '', null);
    ativoHtml += makeDreRowHTML('Imobilizado', 'sub', imobilizado, false, `onclick="openDrillDown('balanco.ativo_nao_circulante.imobilizado', 'Imobilizado')"`, null);
    ativoHtml += makeDreRowHTML('Intangível', 'sub', intangivel, false, `onclick="openDrillDown('balanco.ativo_nao_circulante.intangivel', 'Intangível')"`, null);

    ativoHtml += makeDreRowHTML('TOTAL DO ATIVO', 'total', TOTAL_ATIVO, false, '', null);
    ativoTbody.innerHTML = ativoHtml;

    // PASSIVO & PL
    const fornecedores = b['balanco.passivo_circulante.fornecedores'];
    const emprestimosCp = b['balanco.passivo_circulante.emprestimos_cp'];
    const obrigacoesTrab = b['balanco.passivo_circulante.obrigacoes_trab'];
    const obrigacoesTrib = b['balanco.passivo_circulante.obrigacoes_trib'];
    const passivoCircOutras = b['balanco.passivo_circulante.outras'];
    const PASSIVO_CIRCULANTE = sumArrays(fornecedores, emprestimosCp, obrigacoesTrab, obrigacoesTrib, passivoCircOutras);

    const emprestimosLp = b['balanco.passivo_nao_circulante.emprestimos_lp'];
    const parcelamentos = b['balanco.passivo_nao_circulante.parcelamentos'];
    const PASSIVO_NAO_CIRCULANTE = sumArrays(emprestimosLp, parcelamentos);

    const capitalSocial = b['balanco.patrimonio_liquido.capital_social'];
    const reservas = b['balanco.patrimonio_liquido.reservas'];
    const lucrosAcumulados = b['balanco.patrimonio_liquido.lucros_acumulados'];
    const PATRIMONIO_LIQUIDO = sumArrays(capitalSocial, reservas, lucrosAcumulados);

    const TOTAL_PASSIVO_PL = sumArrays(PASSIVO_CIRCULANTE, PASSIVO_NAO_CIRCULANTE, PATRIMONIO_LIQUIDO);

    let passivoHtml = '';
    passivoHtml += makeDreRowHTML('PASSIVO CIRCULANTE', 'group', PASSIVO_CIRCULANTE, false, '', null);
    passivoHtml += makeDreRowHTML('Fornecedores', 'sub', fornecedores, false, `onclick="openDrillDown('balanco.passivo_circulante.fornecedores', 'Fornecedores')"`, null);
    passivoHtml += makeDreRowHTML('Empréstimos Curto Prazo', 'sub', emprestimosCp, false, `onclick="openDrillDown('balanco.passivo_circulante.emprestimos_cp', 'Empréstimos Curto Prazo')"`, null);
    passivoHtml += makeDreRowHTML('Obrigações Trabalhistas', 'sub', obrigacoesTrab, false, `onclick="openDrillDown('balanco.passivo_circulante.obrigacoes_trab', 'Obrigações Trabalhistas')"`, null);
    passivoHtml += makeDreRowHTML('Obrigações Tributárias', 'sub', obrigacoesTrib, false, `onclick="openDrillDown('balanco.passivo_circulante.obrigacoes_trib', 'Obrigações Tributárias')"`, null);
    passivoHtml += makeDreRowHTML('Outras Obrigações', 'sub', passivoCircOutras, false, `onclick="openDrillDown('balanco.passivo_circulante.outras', 'Outras Obrigações')"`, null);

    passivoHtml += makeDreRowHTML('PASSIVO NÃO CIRCULANTE', 'group', PASSIVO_NAO_CIRCULANTE, false, '', null);
    passivoHtml += makeDreRowHTML('Empréstimos Longo Prazo', 'sub', emprestimosLp, false, `onclick="openDrillDown('balanco.passivo_nao_circulante.emprestimos_lp', 'Empréstimos Longo Prazo')"`, null);
    passivoHtml += makeDreRowHTML('Parcelamentos', 'sub', parcelamentos, false, `onclick="openDrillDown('balanco.passivo_nao_circulante.parcelamentos', 'Parcelamentos')"`, null);

    passivoHtml += makeDreRowHTML('PATRIMÔNIO LÍQUIDO', 'group', PATRIMONIO_LIQUIDO, false, '', null);
    passivoHtml += makeDreRowHTML('Capital Social', 'sub', capitalSocial, false, `onclick="openDrillDown('balanco.patrimonio_liquido.capital_social', 'Capital Social')"`, null);
    passivoHtml += makeDreRowHTML('Reservas', 'sub', reservas, false, `onclick="openDrillDown('balanco.patrimonio_liquido.reservas', 'Reservas')"`, null);
    passivoHtml += makeDreRowHTML('Lucros Acumulados', 'sub', lucrosAcumulados, false, `onclick="openDrillDown('balanco.patrimonio_liquido.lucros_acumulados', 'Lucros Acumulados')"`, null);

    passivoHtml += makeDreRowHTML('TOTAL PASSIVO E PL', 'total', TOTAL_PASSIVO_PL, false, '', null);
    passivoTbody.innerHTML = passivoHtml;
}

function getStrategicCards(compId, yr, m, metrics) {
    const key = `EFO_Strategic_Cards_${compId}_${yr}_${m !== null ? m : 'anual'}`;
    let cards = [];
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            cards = JSON.parse(cached);
        }
    } catch(e) {
        console.error(e);
    }
    
    const defaultActions = [];
    
    // Check debt
    if (metrics.emprestimosCp > 50000) {
        defaultActions.push({
            id: 'action-debt',
            title: 'Alongamento de Dívida de CP',
            description: 'Negociação com bancos para alongar os empréstimos de curto prazo para longo prazo, reduzindo a pressão no caixa imediato.',
            objective: 'Reduzir o serviço da dívida mensal e melhorar a liquidez corrente.',
            priority: '🔴 Crítico',
            priorityClass: 'danger',
            prazo: '30 dias',
            responsible: 'Diretor Financeiro (CFO)',
            category: 'Financeiro',
            indicators: 'Liquidez Corrente, Fluxo de Caixa',
            status: 'Não iniciado'
        });
    }
    
    // Check working capital
    if (metrics.workingCapital < 0) {
        defaultActions.push({
            id: 'action-working-capital',
            title: 'Equacionamento do Capital de Giro',
            description: 'Redução do prazo médio de recebimento de clientes e renegociação de prazos maiores com fornecedores.',
            objective: 'Reverter o saldo negativo do capital de giro circulante líquido.',
            priority: '🔴 Crítico',
            priorityClass: 'danger',
            prazo: '45 dias',
            responsible: 'Gestor de Contas / Comercial',
            category: 'Capital de Giro',
            indicators: 'Capital de Giro, Liquidez Corrente',
            status: 'Não iniciado'
        });
    }
    
    // Check costs / margin
    if (metrics.ebitdaMargin < 15) {
        defaultActions.push({
            id: 'action-margin',
            title: 'Revisão da Margem de Contribuição',
            description: 'Auditar a precificação de produtos/serviços e renegociar contratos de fornecedores críticos de CMV.',
            objective: 'Elevar a margem EBITDA para a meta saudável de no mínimo 15%.',
            priority: '🟠 Alto',
            priorityClass: 'warning',
            prazo: '60 dias',
            responsible: 'Controladoria',
            category: 'Custos',
            indicators: 'Margem EBITDA, Margem Líquida',
            status: 'Não iniciado'
        });
    }
    
    // Check tax
    if (metrics.taxRate > 10) {
        defaultActions.push({
            id: 'action-tax',
            title: 'Estudo de Planejamento Tributário',
            description: 'Avaliar enquadramento no Lucro Presumido vs Simples Nacional frente ao faturamento projetado.',
            objective: 'Otimizar recolhimento de tributos federais e municipais.',
            priority: '🟡 Médio',
            priorityClass: 'info',
            prazo: '90 dias',
            responsible: 'Contabilidade Parceira',
            category: 'Tributário',
            indicators: 'Deduções, Lucratividade',
            status: 'Não iniciado'
        });
    }
    
    // Overhead
    if (metrics.despesas > metrics.revenue * 0.3) {
        defaultActions.push({
            id: 'action-overhead',
            title: 'Otimização de Despesas Fixas',
            description: 'Revisão de contratos fixos administrativos (softwares, aluguel, infraestrutura) e redução de overhead.',
            objective: 'Reduzir despesas administrativas em 15% sem afetar a entrega operacional.',
            priority: '🟠 Alto',
            priorityClass: 'warning',
            prazo: '30 dias',
            responsible: 'Gerente Administrativo',
            category: 'Custos',
            indicators: 'Despesas Administrativas',
            status: 'Não iniciado'
        });
    }
    
    // Growth
    if (metrics.trend === 'Regressão') {
        defaultActions.push({
            id: 'action-growth',
            title: 'Aceleração de Vendas (Crescimento)',
            description: 'Reavaliar funil comercial, campanhas de tráfego pago e comissão de vendedores para reverter queda de receita.',
            objective: 'Reverter tendência de queda de faturamento.',
            priority: '🟡 Médio',
            priorityClass: 'info',
            prazo: '30 dias',
            responsible: 'Diretor Comercial',
            category: 'Comercial',
            indicators: 'Receita Bruta, Crescimento',
            status: 'Não iniciado'
        });
    } else {
        defaultActions.push({
            id: 'action-growth-ok',
            title: 'Sustentação de Canal de Vendas',
            description: 'Investir 10% adicionais em marketing/comercial nas frentes mais rentáveis demonstradas no período.',
            objective: 'Manter a taxa de crescimento da receita bruta.',
            priority: '🟢 Baixo',
            priorityClass: 'success',
            prazo: '60 dias',
            responsible: 'Marketing',
            category: 'Comercial',
            indicators: 'Receita Bruta, EBITDA',
            status: 'Não iniciado'
        });
    }

    if (cards.length === 0) {
        cards = defaultActions;
        localStorage.setItem(key, JSON.stringify(cards));
    } else {
        defaultActions.forEach(dAct => {
            const found = cards.find(c => c.id === dAct.id);
            if (!found) {
                cards.push(dAct);
            } else {
                found.title = dAct.title;
                found.description = dAct.description;
                found.objective = dAct.objective;
                found.priority = dAct.priority;
                found.prazo = dAct.prazo;
                found.responsible = dAct.responsible;
                found.category = dAct.category;
                found.indicators = dAct.indicators;
            }
        });
        localStorage.setItem(key, JSON.stringify(cards));
    }
    return cards;
}

window.updateStrategicCardStatus = function(compId, yr, m, cardId, newStatus) {
    const key = `EFO_Strategic_Cards_${compId}_${yr}_${m !== null ? m : 'anual'}`;
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const cards = JSON.parse(cached);
            const card = cards.find(c => c.id === cardId);
            if (card) {
                card.status = newStatus;
                localStorage.setItem(key, JSON.stringify(cards));
                showToast('Card Atualizado', `O status do card "${card.title}" foi alterado para "${newStatus}".`, 'success');
                if (m !== null) {
                    renderParecerMensal();
                } else {
                    renderParecerAnual();
                }
            }
        }
    } catch(e) {
        console.error(e);
    }
};

function initParecerRadarChart(canvasId, scores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    new Chart(canvas, {
        type: 'radar',
        data: {
            labels: ['Financeiro', 'Comercial', 'Operacional', 'Tributário', 'Custos', 'Governança', 'Capital de Giro', 'Lucratividade', 'Fluxo de Caixa', 'Crescimento'],
            datasets: [{
                label: 'Score Estratégico (0-10)',
                data: scores,
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                borderColor: 'rgb(99, 102, 241)',
                pointBackgroundColor: 'rgb(99, 102, 241)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(99, 102, 241)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    pointLabels: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: { family: 'Outfit', size: 10, weight: '500' }
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        backdropColor: 'transparent',
                        beginAtZero: true,
                        max: 10,
                        stepSize: 2
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function calculateStrategicHealth(metrics, m) {
    let scoreLucro = metrics.ebitdaMargin >= 20 ? 25 : (metrics.ebitdaMargin >= 10 ? 18 : (metrics.ebitdaMargin >= 0 ? 10 : 2));
    let scoreLiq = metrics.liquidezCorrente >= 1.5 ? 25 : (metrics.liquidezCorrente >= 1.1 ? 18 : (metrics.liquidezCorrente >= 0.9 ? 10 : 2));
    let scoreGiro = metrics.workingCapital > 0 ? 25 : 5;
    let scoreEndiv = metrics.emprestimosCp === 0 ? 25 : (metrics.emprestimosCp < (metrics.revenue * (m === null ? 0.1 : 1.0)) ? 18 : 8);
    return scoreLucro + scoreLiq + scoreGiro + scoreEndiv;
}

function buildStrategicReport(compId, yr, m) {
    const company = EFO_Companies[compId];
    const d = calculateDREData(yr);
    const bData = calculateBalancoData(yr);
    
    const monthsFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Core DRE aggregates
    const R_BRUTA = sumArrays(d['dre.receita_bruta.produtos'], d['dre.receita_bruta.servicos'], d['dre.receita_bruta.outras']);
    const DEDUCOES = sumArrays(d['dre.deducoes.impostos'], d['dre.deducoes.devolucoes'], d['dre.deducoes.descontos']);
    const R_LIQUIDA = R_BRUTA.map((v, i) => v - DEDUCOES[i]);
    const CUSTOS = sumArrays(d['dre.custos.mercadorias'], d['dre.custos.producao'], d['dre.custos.servicos'], d['dre.custos.operacionais']);
    const L_BRUTO = R_LIQUIDA.map((v, i) => v - CUSTOS[i]);
    
    const D_COM = sumArrays(d['dre.despesas_comercial.comissao'], d['dre.despesas_comercial.trafego'], d['dre.despesas_comercial.marketing'], d['dre.despesas_comercial.viagens'], d['dre.despesas_comercial.transporte_logistica'], d['dre.despesas_comercial.outras']);
    const D_PES = sumArrays(d['dre.despesas_pessoal.salarios'], d['dre.despesas_pessoal.inss'], d['dre.despesas_pessoal.fgts'], d['dre.despesas_pessoal.beneficios'], d['dre.despesas_pessoal.rescisoes']);
    const D_ADM = sumArrays(d['dre.despesas_administrativas.pro_labore'], d['dre.despesas_administrativas.salarios'], d['dre.despesas_administrativas.encargos'], d['dre.despesas_administrativas.aluguel'], d['dre.despesas_administrativas.outras']);
    const D_EST = sumArrays(d['dre.despesas_estrutura.manutencao'], d['dre.despesas_estrutura.reparos'], d['dre.despesas_estrutura.limpeza']);
    const D_VEI = sumArrays(d['dre.despesas_veiculos.combustivel'], d['dre.despesas_veiculos.manutencao'], d['dre.despesas_veiculos.seguro'], d['dre.despesas_veiculos.ipva']);
    const D_FIN = sumArrays(d['dre.despesas_financeiras.tarifas'], d['dre.despesas_financeiras.juros'], d['dre.despesas_financeiras.iof']);
    const R_FIN = sumArrays(d['dre.receitas_financeiras.rendimentos'], d['dre.receitas_financeiras.juros_recebidos']);
    const D_TOTAL = sumArrays(D_COM, D_PES, D_ADM, D_EST, D_VEI, D_FIN);
    const EBITDA = L_BRUTO.map((v, i) => v - D_TOTAL[i] + R_FIN[i]);

    const sum = (arr) => arr.reduce((a, b) => a + b, 0);

    let metrics = {};
    if (m !== null) {
        metrics.periodName = `${monthsFull[m]} de ${yr}`;
        metrics.revenue = R_BRUTA[m];
        metrics.deducoes = DEDUCOES[m];
        metrics.receitaLiquida = R_LIQUIDA[m];
        metrics.custos = CUSTOS[m];
        metrics.lucroBruto = L_BRUTO[m];
        metrics.despesas = D_TOTAL[m];
        metrics.ebitda = EBITDA[m];
        metrics.rFin = R_FIN[m];
        metrics.lucroLiquido = EBITDA[m];
        
        metrics.caixaBancos = bData['balanco.ativo_circulante.caixa_bancos'][m] || 0;
        metrics.aplicacoes = bData['balanco.ativo_circulante.aplicacoes'][m] || 0;
        metrics.clientesReceber = bData['balanco.ativo_circulante.clientes_receber'][m] || 0;
        metrics.estoques = bData['balanco.ativo_circulante.estoques'][m] || 0;
        metrics.adiantamentos = bData['balanco.ativo_circulante.adiantamentos'][m] || 0;
        metrics.tributosRecuperar = bData['balanco.ativo_circulante.tributos_recuperar'][m] || 0;
        
        metrics.fornecedores = bData['balanco.passivo_circulante.fornecedores'][m] || 0;
        metrics.emprestimosCp = bData['balanco.passivo_circulante.emprestimos_cp'][m] || 0;
        metrics.obrigacoesTrab = bData['balanco.passivo_circulante.obrigacoes_trab'][m] || 0;
        metrics.obrigacoesTrib = bData['balanco.passivo_circulante.obrigacoes_trib'][m] || 0;
        metrics.passivoCircOutras = bData['balanco.passivo_circulante.outras'][m] || 0;
    } else {
        metrics.periodName = `Exercício Anual de ${yr}`;
        metrics.revenue = sum(R_BRUTA);
        metrics.deducoes = sum(DEDUCOES);
        metrics.receitaLiquida = sum(R_LIQUIDA);
        metrics.custos = sum(CUSTOS);
        metrics.lucroBruto = sum(L_BRUTO);
        metrics.despesas = sum(D_TOTAL);
        metrics.ebitda = sum(EBITDA);
        metrics.rFin = sum(R_FIN);
        metrics.lucroLiquido = metrics.ebitda;

        const activeMonthIndices = [];
        for (let idx = 0; idx < 12; idx++) { if (R_BRUTA[idx] > 0) activeMonthIndices.push(idx); }
        const lastActiveMonth = activeMonthIndices.length > 0 ? activeMonthIndices[activeMonthIndices.length - 1] : 11;

        metrics.caixaBancos = bData['balanco.ativo_circulante.caixa_bancos'][lastActiveMonth] || 0;
        metrics.aplicacoes = bData['balanco.ativo_circulante.aplicacoes'][lastActiveMonth] || 0;
        metrics.clientesReceber = bData['balanco.ativo_circulante.clientes_receber'][lastActiveMonth] || 0;
        metrics.estoques = bData['balanco.ativo_circulante.estoques'][lastActiveMonth] || 0;
        metrics.adiantamentos = bData['balanco.ativo_circulante.adiantamentos'][lastActiveMonth] || 0;
        metrics.tributosRecuperar = bData['balanco.ativo_circulante.tributos_recuperar'][lastActiveMonth] || 0;

        metrics.fornecedores = bData['balanco.passivo_circulante.fornecedores'][lastActiveMonth] || 0;
        metrics.emprestimosCp = bData['balanco.passivo_circulante.emprestimos_cp'][lastActiveMonth] || 0;
        metrics.obrigacoesTrab = bData['balanco.passivo_circulante.obrigacoes_trab'][lastActiveMonth] || 0;
        metrics.obrigacoesTrib = bData['balanco.passivo_circulante.obrigacoes_trib'][lastActiveMonth] || 0;
        metrics.passivoCircOutras = bData['balanco.passivo_circulante.outras'][lastActiveMonth] || 0;
    }

    metrics.ATIVO_CIRC = metrics.caixaBancos + metrics.aplicacoes + metrics.clientesReceber + metrics.estoques + metrics.adiantamentos + metrics.tributosRecuperar;
    metrics.PASSIVO_CIRC = metrics.fornecedores + metrics.emprestimosCp + metrics.obrigacoesTrab + metrics.obrigacoesTrib + metrics.passivoCircOutras;
    metrics.liquidezCorrente = metrics.PASSIVO_CIRC > 0 ? metrics.ATIVO_CIRC / metrics.PASSIVO_CIRC : 1.5;
    metrics.ebitdaMargin = metrics.revenue > 0 ? (metrics.ebitda / metrics.revenue) * 100 : 0;
    metrics.netMargin = metrics.revenue > 0 ? (metrics.lucroLiquido / metrics.revenue) * 100 : 0;
    metrics.workingCapital = metrics.ATIVO_CIRC - metrics.PASSIVO_CIRC;
    metrics.cmvRate = metrics.revenue > 0 ? (metrics.custos / metrics.revenue) * 100 : 0;
    metrics.taxRate = metrics.revenue > 0 ? (metrics.deducoes / metrics.revenue) * 100 : 0;

    // Trend
    metrics.trend = 'Estabilidade';
    if (m !== null && m > 0) {
        const prevRev = R_BRUTA[m - 1];
        if (prevRev > 0) {
            const growth = ((metrics.revenue - prevRev) / prevRev) * 100;
            if (growth > 2) metrics.trend = 'Crescimento';
            else if (growth < -2) metrics.trend = 'Regressão';
        }
    } else if (m === null) {
        const h1 = R_BRUTA.slice(0, 6).reduce((a, b) => a + b, 0);
        const h2 = R_BRUTA.slice(6, 12).reduce((a, b) => a + b, 0);
        if (h1 > 0 && h2 > 0) {
            const growth = ((h2 - h1) / h1) * 100;
            if (growth > 2) metrics.trend = 'Crescimento';
            else if (growth < -2) metrics.trend = 'Regressão';
        }
    }

    // Health Score
    const healthScore = calculateStrategicHealth(metrics, m);
    
    let healthClass = 'Saudável';
    let healthColor = '#10b981';
    let healthBadgeBg = 'rgba(16, 185, 129, 0.15)';
    if (healthScore >= 80) {
        healthClass = 'Excelente';
        healthColor = '#10b981';
        healthBadgeBg = 'rgba(16, 185, 129, 0.25)';
    } else if (healthScore >= 60) {
        healthClass = 'Saudável';
        healthColor = '#6366f1';
        healthBadgeBg = 'rgba(99, 102, 241, 0.2)';
    } else if (healthScore >= 45) {
        healthClass = 'Atenção';
        healthColor = '#f59e0b';
        healthBadgeBg = 'rgba(245, 158, 11, 0.2)';
    } else if (healthScore >= 30) {
        healthClass = 'Crítica';
        healthColor = '#ef4444';
        healthBadgeBg = 'rgba(239, 68, 68, 0.2)';
    } else {
        healthClass = 'Emergencial';
        healthColor = '#ef4444';
        healthBadgeBg = 'rgba(239, 68, 68, 0.35)';
    }

    // Risk level
    let riskLevel = 'Médio';
    let riskColor = '#f59e0b';
    if (metrics.liquidezCorrente >= 1.5 && metrics.emprestimosCp === 0) {
        riskLevel = 'Muito Baixo';
        riskColor = '#10b981';
    } else if (metrics.liquidezCorrente >= 1.2 && metrics.emprestimosCp < metrics.caixaBancos + metrics.aplicacoes) {
        riskLevel = 'Baixo';
        riskColor = '#10b981';
    } else if (metrics.liquidezCorrente >= 1.0) {
        riskLevel = 'Médio';
        riskColor = '#f59e0b';
    } else if (metrics.liquidezCorrente >= 0.7) {
        riskLevel = 'Alto';
        riskColor = '#ef4444';
    } else {
        riskLevel = 'Muito Alto';
        riskColor = '#ef4444';
    }

    // 1. DIAGNÓSTICO EXECUTIVO variables
    const capCaixa = metrics.ebitda > 0 ? 'Forte Geração Operacional' : 'Insuficiente / Déficit de Caixa';
    const sitGiro = metrics.workingCapital > 0 ? 'Positiva (Superavitária)' : 'Crítica (Necessidade de Giro)';
    const sitEndiv = metrics.emprestimosCp > 0 ? 'Exposta (Alavancado)' : 'Sob Controle';
    const sitLucro = metrics.ebitdaMargin >= 15 ? 'Excelente' : (metrics.ebitdaMargin >= 5 ? 'Moderada' : 'Insuficiente');
    const sitOp = metrics.ebitda > metrics.despesas ? 'Eficiente' : 'Necessita Ajustes / Otimização';

    // 2. RESUMO EXECUTIVO TEXT
    const userName = EFO_Session.name.split(' ')[0];
    const trendText = metrics.trend === 'Crescimento' ? 'apresentando uma trajetória ascendente e expansão de receitas' : (metrics.trend === 'Regressão' ? 'passando por uma contração nas receitas com sinais de compressão gerencial' : 'mantendo estabilidade no fluxo operacional');
    const leverageWarning = metrics.emprestimosCp > 0 ? `A exposição ao passivo bancário de curto prazo de ${formatCurrency(metrics.emprestimosCp)} exige atenção rigorosa para evitar desgastes de liquidez imediata.` : 'A estrutura de capital está saudável, livre de dívidas de curto prazo de natureza bancária.';
    const giroWarning = metrics.workingCapital < 0 ? `O capital de giro líquido encontra-se deficitário em ${formatCurrency(Math.abs(metrics.workingCapital))}, demandando alongamento de prazos com fornecedores.` : 'O saldo do capital de giro líquido mantém-se superavitário, garantindo segurança na continuidade operacional.';
    
    const summaryText = `Prezado(a) **${userName}**, o relatório estratégico aponta que no período de **${metrics.periodName}**, a empresa operou com classificação **${healthClass}** (${healthScore}/100 no Índice de Saúde Empresarial). A operação está ${trendText}. ${leverageWarning} ${giroWarning} A principal prioridade recomendada para o próximo período é a consolidação do contas a receber e otimização das despesas fixas para maximizar o fluxo de caixa livre.`;

    // 3. PRINCIPAIS ALERTAS
    const alerts = [];
    if (metrics.emprestimosCp > 0) {
        alerts.push({
            icon: '🔴',
            priority: 'Crítico',
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.1)',
            title: 'Exposição Bancária de Curto Prazo',
            desc: `Contratação de financiamentos de curto prazo atinge o montante de ${formatCurrency(metrics.emprestimosCp)}.`,
            impact: 'Geração de despesas com juros e tarifas financeiras, comprometendo o fluxo de caixa.',
            risk: 'Incapacidade de honrar vencimentos imediatos caso ocorra oscilação de faturamento.',
            urgency: 'Imediata',
            probabilidade: 'Alta',
            consequencias: 'Aumento do custo da dívida, juros de mora e risco de execução judicial ou restrições cadastrais.',
            indicator: 'Empréstimos CP / Liquidez'
        });
    }
    if (metrics.workingCapital < 0) {
        alerts.push({
            icon: '🔴',
            priority: 'Crítico',
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.1)',
            title: 'Capital de Giro Líquido Negativo',
            desc: `O ativo circulante líquido é insuficiente para cobrir as obrigações imediatas em ${formatCurrency(Math.abs(metrics.workingCapital))}.`,
            impact: 'Necessidade de novos empréstimos ou aporte de capital dos sócios para manter a operação rodando.',
            risk: 'Paralisação operacional ou dependência contínua de recursos externos de custo elevado.',
            urgency: 'Imediata',
            probabilidade: 'Altíssima',
            consequencias: 'Dependência de factoring ou antecipação de recebíveis, diminuindo drasticamente as margens futuras.',
            indicator: 'Capital de Giro'
        });
    }
    if (metrics.ebitdaMargin < 15) {
        alerts.push({
            icon: '🟠',
            priority: 'Alto',
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.1)',
            title: 'Margem EBITDA abaixo da referência de mercado',
            desc: `A margem operacional EBITDA está em ${metrics.ebitdaMargin.toFixed(1)}%, abaixo do patamar recomendado de 15%.`,
            impact: 'Baixa eficiência na conversão de vendas em lucro operacional real.',
            risk: 'Falta de fôlego para investimento em expansão ou constituição de reservas.',
            urgency: 'Alta',
            probabilidade: 'Média-Alta',
            consequencias: 'Erosão lenta do caixa operacional e obsolescência da capacidade de reinvestimento.',
            indicator: 'Margem EBITDA'
        });
    }
    if (metrics.cmvRate > 50) {
        alerts.push({
            icon: '🟠',
            priority: 'Alto',
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.1)',
            title: 'Custo de Mercadorias e Serviços Elevado',
            desc: `O custo direto de vendas (CMV/CSP) consome ${metrics.cmvRate.toFixed(1)}% do faturamento total.`,
            impact: 'Redução drástica do lucro bruto, espremendo as despesas de estrutura.',
            risk: 'Qualquer aumento inflacionário de fornecedores gerará prejuízo imediato.',
            urgency: 'Média',
            probabilidade: 'Média',
            consequencias: 'Perda de competitividade por preço ou necessidade constante de repasse aos clientes finais.',
            indicator: 'Custo de Mercadorias / Produção'
        });
    }
    if (metrics.taxRate > 12) {
        alerts.push({
            icon: '🟡',
            priority: 'Médio',
            color: '#3b82f6',
            bg: 'rgba(59, 130, 246, 0.1)',
            title: 'Alíquota Efetiva de Tributos Elevada',
            desc: `Impostos e deduções representam ${metrics.taxRate.toFixed(1)}% do faturamento bruto.`,
            impact: 'Saída relevante de caixa antes do cômputo dos custos operacionais.',
            risk: 'Carga tributária incompatível com o regime simplificado em caso de desenquadramento.',
            urgency: 'Média',
            probabilidade: 'Baixa-Média',
            consequencias: 'Redução da rentabilidade líquida distribuível aos sócios.',
            indicator: 'Deduções Tributárias'
        });
    }
    if (alerts.length === 0) {
        alerts.push({
            icon: '🟢',
            priority: 'Baixo',
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.1)',
            title: 'Nenhum alerta crítico detectado',
            desc: 'A operação financeira no período não apresenta distorções severas ou pontos de risco estrutural imediatos.',
            impact: 'Garante estabilidade para tomada de decisões com segurança.',
            risk: 'Muito Baixo.',
            urgency: 'Baixa',
            probabilidade: 'Baixa',
            consequencias: 'Estabilidade operacional e crescimento sustentável.',
            indicator: 'Geral'
        });
    }

    // 4. PRINCIPAIS OPORTUNIDADES
    const opportunities = [];
    if (metrics.emprestimosCp > 0) {
        opportunities.push({
            title: 'Renegociação de Dívidas de Curto Prazo',
            desc: 'Substituição de empréstimos com taxas elevadas e curto prazo por linhas de longo prazo estruturadas (como capital de giro subsidiado ou refinanciamento).',
            benefits: 'Redução imediata do fluxo de saídas mensais de amortização, reestabelecendo a saúde de caixa da empresa.',
            impact: 'Melhoria direta no indicador de Liquidez Corrente e na folga financeira diária.',
            priority: '🔴 Alta Prioridade',
            area: 'Financeira / Relacionamento Bancário'
        });
    }
    if (metrics.workingCapital < 0) {
        opportunities.push({
            title: 'Otimização dos Ciclos Financeiros (Capital de Giro)',
            desc: 'Implantar política comercial rigorosa com prazo médio de faturamento a no máximo 15 dias, aliada à extensão de pagamentos a fornecedores de insumos chaves para no mínimo 45 dias.',
            benefits: 'Geração de caixa próprio por meio da redução da necessidade de capital de giro (NCG).',
            impact: 'Equilíbrio da liquidez operacional sem custos financeiros adicionais.',
            priority: '🔴 Alta Prioridade',
            area: 'Comercial / Compras'
        });
    }
    if (metrics.cmvRate > 40) {
        opportunities.push({
            title: 'Compras Estratégicas e Homologação de Fornecedores',
            desc: 'Agrupar pedidos de compra com fornecedores homologados para ganhar escala de desconto e obter opções alternativas de insumos.',
            benefits: 'Aumento na margem bruta do negócio sem necessidade de reajustar o preço final ao consumidor.',
            impact: 'Redução de até 5% no CMV no curto-médio prazo.',
            priority: '🟠 Média-Alta',
            area: 'Compras / Suprimentos'
        });
    }
    if (metrics.despesas > 15000) {
        opportunities.push({
            title: 'Redução de Despesas Administrativas (Overhead)',
            desc: 'Auditoria de sistemas em nuvem, assinaturas de software subutilizados, contas de consumo fixas e serviços de terceiros sem contrato ativo.',
            benefits: 'Corte de despesas recorrentes inúteis, vertendo esse valor direto no lucro líquido.',
            impact: 'Aumento direto de margem operacional.',
            priority: '🟡 Média',
            area: 'Administrativa'
        });
    }
    opportunities.push({
        title: 'Estudo para Revisão Tributária Anual',
        desc: 'Consultoria contábil para simular a tributação da empresa em diferentes regimes fiscais (Simples Nacional vs. Lucro Presumido).',
        benefits: 'Redução de alíquota efetiva de tributação com base no Custo de Pessoal/Fator R ou regime setorial.',
        impact: 'Economia financeira substancial anualizada.',
        priority: '🟢 Baixa-Média',
        area: 'Diretoria / Contabilidade'
    });

    // 5. ANÁLISE GERENCIAL
    const gerencialData = [
        {
            name: 'Liquidez Corrente',
            value: metrics.liquidezCorrente.toFixed(2),
            meaning: 'Mede a capacidade da empresa de pagar suas obrigações de curto prazo utilizando seus ativos circulantes.',
            status: metrics.liquidezCorrente >= 1.5 ? 'Bom (Suficiente)' : (metrics.liquidezCorrente >= 1.0 ? 'Atenção (Apertado)' : 'Crítico (Deficitário)'),
            statusClass: metrics.liquidezCorrente >= 1.5 ? 'success' : (metrics.liquidezCorrente >= 1.0 ? 'warning' : 'danger'),
            reference: 'Acima de 1.50 para o setor de atuação.',
            risks: 'Se menor que 1.00, a empresa necessita de caixa externo para pagar as contas básicas do dia a dia, gerando endividamento sistemático.',
            action: 'Renegociar prazos com credores de curto prazo e vender ativos ociosos se necessário, além de acelerar cobrança de inadimplentes.'
        },
        {
            name: 'Margem EBITDA',
            value: metrics.ebitdaMargin.toFixed(1) + '%',
            meaning: 'Indica a percentagem de receita que se converte em lucro puramente operacional (sem juros, impostos, depreciação).',
            status: metrics.ebitdaMargin >= 15 ? 'Bom (Operação Eficiente)' : (metrics.ebitdaMargin >= 5 ? 'Atenção (Margem Estreita)' : 'Ruim (Sem Valor Gerado)'),
            statusClass: metrics.ebitdaMargin >= 15 ? 'success' : (metrics.ebitdaMargin >= 5 ? 'warning' : 'danger'),
            reference: 'Entre 15% e 25% para empresas eficientes.',
            risks: 'Uma margem operacional muito baixa mostra que a empresa trabalha muito (fatura alto) mas gasta quase tudo na própria operação.',
            action: 'Revisar estrutura de custos diretos (CMV) e gastos comerciais com marketing de baixa performance.'
        },
        {
            name: 'Margem Líquida',
            value: metrics.netMargin.toFixed(1) + '%',
            meaning: 'É o percentual de lucro que realmente sobra para os sócios após todas as deduções, despesas e impostos do período.',
            status: metrics.netMargin >= 10 ? 'Bom (Retorno Saudável)' : (metrics.netMargin >= 3 ? 'Atenção (Retorno Limítrofe)' : 'Ruim (Sem Retorno Real)'),
            statusClass: metrics.netMargin >= 10 ? 'success' : (metrics.netMargin >= 3 ? 'warning' : 'danger'),
            reference: 'Entre 10% e 18% para o segmento.',
            risks: 'Margem líquida comprimida indica vulnerabilidade a qualquer alteração de mercado, tributos ou custos de fornecedores.',
            action: 'Trabalhar na otimização tributária e na redução de taxas de intermediação financeira e tarifas bancárias.'
        },
        {
            name: 'Capital de Giro Líquido',
            value: formatCurrency(metrics.workingCapital),
            meaning: 'Representa a folga ou suficiência financeira de curto prazo para manter a operação rodando.',
            status: metrics.workingCapital > 0 ? 'Bom (Superavitário)' : 'Crítico (Necessitado de Capital)',
            statusClass: metrics.workingCapital > 0 ? 'success' : 'danger',
            reference: 'Sempre deve ser positivo e superior a 10% do faturamento.',
            risks: 'Capital de giro negativo força a empresa a recorrer a bancos e antecipação de recebíveis, corroendo a lucratividade.',
            action: 'Apertar as regras de parcelamento de clientes e renegociar contratos de longo prazo de fornecimento.'
        }
    ];

    // 6. PERGUNTAS QUE TODO EMPRESÁRIO FARIA
    const faqs = [
        {
            q: 'Estou realmente lucrando?',
            a: metrics.lucroLiquido > 0 
                ? `Sim! A empresa registrou um resultado líquido positivo de **${formatCurrency(metrics.lucroLiquido)}** no período, representando uma margem real de **${metrics.netMargin.toFixed(1)}%** após todas as despesas e impostos.`
                : `Não. No momento, a empresa opera em déficit com resultado líquido de **${formatCurrency(metrics.lucroLiquido)}**. É urgente auditar os custos e reavaliar a estrutura de overhead.`
        },
        {
            q: 'Minha empresa está crescendo de forma saudável?',
            a: metrics.trend === 'Crescimento' 
                ? `Sim, a empresa apresenta tendência de crescimento. O faturamento bruto somou **${formatCurrency(metrics.revenue)}** com avanço em relação aos períodos anteriores.`
                : `A empresa apresenta estabilidade ou regressão de receita. O crescimento requer investimentos em escala de canais ou diversificação de portfólio comercial.`
        },
        {
            q: 'Tenho caixa suficiente?',
            a: metrics.caixaBancos + metrics.aplicacoes > metrics.despesas 
                ? `Sim, a empresa conta com **${formatCurrency(metrics.caixaBancos + metrics.aplicacoes)}** em caixa e aplicações financeiras, o que cobre com segurança o fluxo fixo operacional.`
                : `O saldo líquido em caixa está apertado. É recomendado manter uma reserva de emergência mínima de 3 meses de despesas fixas para mitigar riscos.`
        },
        {
            q: 'Estou pagando impostos acima do esperado?',
            a: `Sua alíquota efetiva de tributação consolidada é de **${metrics.taxRate.toFixed(1)}%** sobre o faturamento. Se este índice for superior a 12% em atividades de serviços, recomenda-se realizar um planejamento tributário.`
        },
        {
            q: 'Posso investir?',
            a: metrics.workingCapital > 0 && metrics.liquidezCorrente > 1.2
                ? `Sim, com a liquidez e capital de giro sob controle, existem margens para investimentos programados em tecnologia ou capacidade operacional.`
                : `Não é recomendado investir em ativos fixos ou expansão pesada no momento. O foco principal deve ser recompor as reservas e sanar o endividamento bancário.`
        },
        {
            q: 'Posso contratar novos colaboradores?',
            a: metrics.ebitdaMargin > 12
                ? `Sim, o fôlego operacional atual permite expansão moderada de quadro, preferencialmente focada em áreas que gerem receita direta (vendas ou entrega técnica).`
                : `Recomenda-se cautela. Novas contratações fixas agora podem elevar o ponto de equilíbrio financeiro e pressionar ainda mais as margens.`
        },
        {
            q: 'Meu endividamento preocupa?',
            a: metrics.emprestimosCp > 0
                ? `Sim, o montante de **${formatCurrency(metrics.emprestimosCp)}** alocado em passivos circulantes gera pressão contínua de caixa e despesa financeira. Deve ser alongado ou quitado.`
                : `Não, a empresa opera livre de dívidas de curto prazo de natureza bancária, apresentando excelente saúde financeira.`
        },
        {
            q: 'Estou precificando corretamente?',
            a: metrics.cmvRate > 0 && metrics.cmvRate <= 45
                ? `Aparentemente sim. O seu Custo Direto (CMV/CSP) consome **${metrics.cmvRate.toFixed(1)}%** da receita, mantendo-se na margem ideal de até 45%.`
                : `Alerta na precificação. O custo de mercadorias consome **${metrics.cmvRate.toFixed(1)}%** do faturamento, espremendo a margem de contribuição. Avalie os custos operacionais de insumos.`
        },
        {
            q: 'Meu negócio está gerando valor?',
            a: metrics.ebitda > 0
                ? `Sim! O EBITDA de **${formatCurrency(metrics.ebitda)}** comprova que a operação principal é intrinsecamente rentável e gera valor econômico real.`
                : `A operação atual não está gerando valor líquido. É imperativo reestruturar a eficiência produtiva ou renegociar contratos de CMV.`
        },
        {
            q: 'Existe risco de falta de caixa?',
            a: metrics.liquidezCorrente < 1.0 || metrics.workingCapital < 0
                ? `Sim, o risco é classificado como **${riskLevel}** devido à liquidez de **${metrics.liquidezCorrente.toFixed(2)}** e capital de giro negativo. Priorize fluxo de caixa.`
                : `Risco muito baixo. A folga operacional garante fluxo de caixa estável e cobertura de obrigações sem sobressaltos.`
        }
    ];

    // 7. PLANO DE AÇÃO ESTRATÉGICO & 8. CARDS
    const cards = getStrategicCards(compId, yr, m, metrics);

    // 9. EVOLUÇÃO HISTÓRICA LOOP
    let evolutionRowsHtml = '';
    const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    let lastHS = null;
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
        const mRev = R_BRUTA[monthIdx];
        if (mRev === 0) continue; // Skip months with no data
        
        const mDed = DEDUCOES[monthIdx];
        const mLiq = R_LIQUIDA[monthIdx];
        const mCustos = CUSTOS[monthIdx];
        const mLBruto = L_BRUTO[monthIdx];
        const mDesp = D_TOTAL[monthIdx];
        const mEbitda = EBITDA[monthIdx];
        const mRFin = R_FIN[monthIdx];
        
        const mCaixaBancos = bData['balanco.ativo_circulante.caixa_bancos'][monthIdx] || 0;
        const mAplic = bData['balanco.ativo_circulante.aplicacoes'][monthIdx] || 0;
        const mClientes = bData['balanco.ativo_circulante.clientes_receber'][monthIdx] || 0;
        const mEstoque = bData['balanco.ativo_circulante.estoques'][monthIdx] || 0;
        const mAdiant = bData['balanco.ativo_circulante.adiantamentos'][monthIdx] || 0;
        const mTributos = bData['balanco.ativo_circulante.tributos_recuperar'][monthIdx] || 0;
        
        const mFornec = bData['balanco.passivo_circulante.fornecedores'][monthIdx] || 0;
        const mEmp = bData['balanco.passivo_circulante.emprestimos_cp'][monthIdx] || 0;
        const mTrab = bData['balanco.passivo_circulante.obrigacoes_trab'][monthIdx] || 0;
        const mTrib = bData['balanco.passivo_circulante.obrigacoes_trib'][monthIdx] || 0;
        const mOutr = bData['balanco.passivo_circulante.outras'][monthIdx] || 0;
        
        const mAtCirc = mCaixaBancos + mAplic + mClientes + mEstoque + mAdiant + mTributos;
        const mPassCirc = mFornec + mEmp + mTrab + mTrib + mOutr;
        
        const mMetrics = {
            revenue: mRev,
            deducoes: mDed,
            workingCapital: mAtCirc - mPassCirc,
            liquidezCorrente: mPassCirc > 0 ? mAtCirc / mPassCirc : 1.5,
            ebitdaMargin: mRev > 0 ? (mEbitda / mRev) * 100 : 0,
            emprestimosCp: mEmp
        };
        const mHS = calculateStrategicHealth(mMetrics, monthIdx);
        const mEbitdaMargin = mRev > 0 ? (mEbitda / mRev) * 100 : 0;
        
        let hsTrendIcon = '➡️';
        if (lastHS !== null) {
            if (mHS > lastHS) hsTrendIcon = '🔺';
            else if (mHS < lastHS) hsTrendIcon = '🔻';
        }
        lastHS = mHS;

        evolutionRowsHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-secondary);">
                <td style="padding: 10px; font-weight: 500; color: var(--text-primary);">${monthsShort[monthIdx]}</td>
                <td style="padding: 10px;">${formatCurrency(mRev)}</td>
                <td style="padding: 10px;">${formatCurrency(mEbitda)}</td>
                <td style="padding: 10px;">${mEbitdaMargin.toFixed(1)}%</td>
                <td style="padding: 10px;">${formatCurrency(mAtCirc - mPassCirc)}</td>
                <td style="padding: 10px;">${formatCurrency(mEmp)}</td>
                <td style="padding: 10px; font-weight: 600; color: ${mHS >= 60 ? 'var(--success)' : (mHS >= 40 ? 'var(--warning)' : 'var(--danger)')};">${mHS} ${hsTrendIcon}</td>
            </tr>
        `;
    }

    // 10. RADAR ESTRATÉGICO notes
    const scoreFinanceiro = Math.min(10, Math.max(0, Math.round(metrics.liquidezCorrente * 5)));
    const scoreComercial = Math.min(10, Math.max(0, Math.round(Math.min(metrics.revenue, 200000) / 20000)));
    const scoreOperacional = Math.min(10, Math.max(0, Math.round(metrics.ebitdaMargin > 0 ? (metrics.ebitdaMargin / 3) + 2 : 2)));
    const scoreTributario = Math.min(10, Math.max(0, Math.round(metrics.taxRate > 0 ? 12 - metrics.taxRate : 8)));
    const scoreCustos = Math.min(10, Math.max(0, Math.round(metrics.cmvRate > 0 ? (100 - metrics.cmvRate) / 10 : 8)));
    const scoreGovernanca = 10 - Math.min(6, Math.round(OFX_Raw_Import.filter(t => t.status === 'Pendente').length / 5));
    const scoreGiro = Math.min(10, Math.max(0, Math.round(metrics.workingCapital > 0 ? (metrics.workingCapital / (metrics.revenue * 0.5)) * 5 + 5 : 3)));
    const scoreLucratividade = Math.min(10, Math.max(0, Math.round(metrics.netMargin > 0 ? (metrics.netMargin / 3) + 2 : 2)));
    const scoreFluxo = Math.min(10, Math.max(0, Math.round(metrics.caixaBancos + metrics.aplicacoes > metrics.emprestimosCp ? 9 : 3)));
    const scoreCrescimento = metrics.trend === 'Crescimento' ? 9 : (metrics.trend === 'Estabilidade' ? 6 : 3);

    const radarScores = [scoreFinanceiro, scoreComercial, scoreOperacional, scoreTributario, scoreCustos, scoreGovernanca, scoreGiro, scoreLucratividade, scoreFluxo, scoreCrescimento];

    const radarJustifications = [
        { name: 'Financeiro', score: scoreFinanceiro, note: `Liquidez Corrente de ${metrics.liquidezCorrente.toFixed(2)}. ${metrics.liquidezCorrente >= 1.5 ? 'Excelente folga para honrar passivos.' : 'Falta folga operacional de curto prazo.'}` },
        { name: 'Comercial', score: scoreComercial, note: `Faturamento bruto de ${formatCurrency(metrics.revenue)}. Tração operacional comercial ${metrics.revenue > 100000 ? 'elevada.' : 'moderada.'}` },
        { name: 'Operacional', score: scoreOperacional, note: `Margem EBITDA de ${metrics.ebitdaMargin.toFixed(1)}%. Eficiência operacional ${metrics.ebitdaMargin >= 15 ? 'sólida.' : 'comprimida.'}` },
        { name: 'Tributário', score: scoreTributario, note: `Encargo fiscal consome ${metrics.taxRate.toFixed(1)}% do faturamento. ${metrics.taxRate < 10 ? 'Tributação controlada.' : 'Alíquota efetiva elevada.'}` },
        { name: 'Custos', score: scoreCustos, note: `Custo direto (CMV/CSP) em ${metrics.cmvRate.toFixed(1)}% da receita. ${metrics.cmvRate < 45 ? 'Eficiência ótima.' : 'Insumos elevados comprimem a margem.'}` },
        { name: 'Governança', score: scoreGovernanca, note: `Controle contábil de lançamentos. ${scoreGovernanca >= 8 ? 'Excelente nível de conciliação.' : 'Existem transações sem classificação pendentes.'}` },
        { name: 'Capital de Giro', score: scoreGiro, note: `Capital de giro líquido de ${formatCurrency(metrics.workingCapital)}. ${metrics.workingCapital > 0 ? 'Giro superavitário.' : 'Giro deficitário.'}` },
        { name: 'Lucratividade', score: scoreLucratividade, note: `Retorno líquido efetivo de ${metrics.netMargin.toFixed(1)}% sobre as vendas. ${metrics.netMargin >= 10 ? 'Margem saudável.' : 'Margem reduzida.'}` },
        { name: 'Fluxo de Caixa', score: scoreFluxo, note: `Disponibilidade de caixa vs dívidas imediatas. ${metrics.caixaBancos + metrics.aplicacoes > metrics.emprestimosCp ? 'Seguro.' : 'Exposto.'}` },
        { name: 'Crescimento', score: scoreCrescimento, note: `A tendência atual de receita é de ${metrics.trend}.` }
    ];

    // 11. PARECER FINAL DO CONSULTOR TEXTS
    const parecerRiscosText = metrics.workingCapital < 0 || metrics.emprestimosCp > 0
        ? 'A estrutura financeira apresenta vulnerabilidade acentuada pelo capital de giro negativo e pelo endividamento concentrado no curto prazo. Qualquer atraso nas cobranças comprometerá o fluxo de caixa.'
        : 'Os riscos estão mapeados e sob controle, com liquidez e capital de giro apresentando solidez gerencial.';
    
    const parecerOportText = 'A grande oportunidade reside no aumento de eficiência de margem por meio da renegociação dos insumos de CMV e na consolidação do prazo médio de pagamento com fornecedores chave.';
    
    const parecerRecomendText = metrics.emprestimosCp > 0
        ? 'Reestruturar a carteira de dívida bancária de curto prazo para obter carência e taxas reduzidas de longo prazo.'
        : 'Investir na consolidação comercial e implantação de um orçamento base zero para controle absoluto dos custos fixos.';

    const parecerConclusaoText = 'Com ações corretivas imediatas na área de capital de giro e custos operacionais diretos, a empresa tem todas as condições de consolidar seu crescimento e expandir de forma altamente lucrativa.';

    // Construct full HTML
    let html = `
        <div class="glass-panel p-24" style="max-width: 1100px; margin: 0 auto; text-align: left; background: var(--glass-bg); border: 1px solid var(--glass-border); box-shadow: var(--shadow-lg); border-radius: 12px; font-family: 'Outfit', sans-serif;">
            
            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 20px; margin-bottom: 28px; flex-wrap: wrap; gap: 16px;">
                <div>
                    <span class="badge" style="background: rgba(99, 102, 241, 0.2); color: var(--accent-primary); font-weight: 600; padding: 6px 12px; border-radius: 6px; font-size: 11px; letter-spacing: 0.5px;">PARECER ESTRATÉGICO EXECUTIVO CLARUS EVOLUA</span>
                    <h2 style="font-size: 26px; font-weight: 700; margin-top: 8px; margin-bottom: 6px; color: var(--text-primary); font-family: 'Outfit', sans-serif;">Parecer de Inteligência Financeira — ${company.name}</h2>
                    <div style="font-size: 13px; color: var(--text-secondary);">CNPJ: ${company.config?.cnpj || 'Não Informado'} | Regime: ${company.config?.regime_tributario || 'Simples Nacional'} | Período: ${metrics.periodName}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px;">Atividade Setorial</div>
                    <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: var(--success); font-weight: 600; padding: 6px 12px; border-radius: 6px; display: inline-block; margin-top: 4px; font-size: 12px;">${company.config?.tipo_atividade || 'Serviço'}</span>
                </div>
            </div>

            <!-- 1. DIAGNÓSTICO EXECUTIVO -->
            <div style="margin-bottom: 40px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: 10px; padding: 24px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">1. Diagnóstico Executivo</h3>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 24px;">
                    <!-- HEALTH SCORE CARD -->
                    <div class="glass-panel" style="padding: 20px; text-align: center; background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.05); display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <div style="font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Saúde Empresarial</div>
                        <div style="width: 80px; height: 80px; border-radius: 50%; border: 4px solid ${healthColor}; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: var(--text-primary); background: ${healthBadgeBg};">${healthScore}</div>
                        <div style="font-weight: 600; font-size: 14px; margin-top: 8px; color: ${healthColor};">${healthClass}</div>
                    </div>
                    
                    <!-- TREND & RISK CARD -->
                    <div class="glass-panel" style="padding: 20px; background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.05); display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase;">Tendência Operacional</div>
                            <div style="font-size: 16px; font-weight: 600; color: ${metrics.trend === 'Regressão' ? '#ef4444' : (metrics.trend === 'Crescimento' ? '#10b981' : 'var(--text-secondary)')}; margin-top: 4px;">
                                ${metrics.trend === 'Crescimento' ? '📈 Crescimento' : (metrics.trend === 'Regressão' ? '📉 Regressão' : '➡️ Estabilidade')}
                            </div>
                        </div>
                        <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                            <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase;">Risco Financeiro</div>
                            <div style="font-size: 16px; font-weight: 600; color: ${riskColor}; margin-top: 4px;">⚠️ Risco ${riskLevel}</div>
                        </div>
                    </div>

                    <!-- DETAILED DIAGNOSTICS CARD -->
                    <div class="glass-panel" style="padding: 20px; grid-column: span 2; background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.05); font-size: 13px; line-height: 1.5; color: var(--text-secondary);">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>🔌 **Geração de Caixa:** <span style="font-weight: 600; color: var(--text-primary);">${capCaixa}</span></div>
                            <div>💼 **Capital de Giro:** <span style="font-weight: 600; color: var(--text-primary);">${sitGiro}</span></div>
                            <div>🏦 **Endividamento:** <span style="font-weight: 600; color: var(--text-primary);">${sitEndiv}</span></div>
                            <div>📊 **Lucratividade:** <span style="font-weight: 600; color: var(--text-primary);">${sitLucro}</span></div>
                            <div>⚙️ **Situação Operacional:** <span style="font-weight: 600; color: var(--text-primary);">${sitOp}</span></div>
                        </div>
                    </div>
                </div>

                <div style="font-size: 14px; color: var(--text-primary); line-height: 1.6; border-left: 3px solid var(--accent-primary); padding-left: 12px;">
                    <strong>Resumo do Diagnóstico:</strong> ${summaryText}
                </div>
            </div>

            <!-- 2. RESUMO EXECUTIVO -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">2. Análise Comportamental e Desempenho</h3>
                <p style="color: var(--text-primary); line-height: 1.7; font-size: 14px;">
                    O volume de receitas brutas faturadas atingiu o montante de **${formatCurrency(metrics.revenue)}** no período. Sob a perspectiva da competência contábil, a empresa apresenta indicadores operacionais estáveis. Entretanto, quando confrontamos a receita com o custo de captação de recursos e obrigações fixas, identificamos gargalos de eficiência.
                </p>
                <p style="color: var(--text-secondary); line-height: 1.7; font-size: 13.5px; margin-top: 8px;">
                    A maior pressão no fluxo líquido gerencial provém das taxas financeiras decorrentes da manutenção de passivos de giro bancário de curto prazo e da inadimplência marginal das contas a receber. A otimização desses dois indicadores alavancará a margem de contribuição direta, restaurando o caixa livre.
                </p>
            </div>

            <!-- 3. PRINCIPAIS ALERTAS -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">3. Principais Alertas Gerenciais</h3>
                <div style="display: grid; grid-template-columns: 1fr; gap: 16px;">
                    ${alerts.map(a => `
                        <div style="background: ${a.bg}; border: 1px solid rgba(255,255,255,0.03); border-left: 4px solid ${a.color}; padding: 18px; border-radius: 8px; transition: transform 0.2s;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <h4 style="color: var(--text-primary); font-size: 15px; font-weight: 600; margin: 0;">${a.icon} ${a.title}</h4>
                                <span class="badge" style="background: ${a.color}; color: #fff; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 4px; text-transform: uppercase;">Prioridade: ${a.priority}</span>
                            </div>
                            <p style="font-size: 13.5px; color: var(--text-secondary); margin: 0 0 10px 0; line-height: 1.5;">${a.desc}</p>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 12px; color: var(--text-secondary); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                                <div>💥 **Impacto:** <span style="color: var(--text-primary);">${a.impact}</span></div>
                                <div>🔥 **Risco:** <span style="color: var(--text-primary);">${a.risk}</span></div>
                                <div>⏳ **Urgência:** <span style="color: var(--text-primary);">${a.urgency}</span></div>
                                <div>💡 **Indicador:** <span style="color: var(--text-primary);">${a.indicator}</span></div>
                                <div style="grid-column: span 2;">⚠️ **Consequências:** <span style="color: var(--text-primary);">${a.consequencias}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 4. PRINCIPAIS OPORTUNIDADES -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">4. Matriz de Oportunidades</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${opportunities.map(o => `
                        <div class="glass-panel" style="padding: 18px; border-color: rgba(255,255,255,0.05); display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <h4 style="font-size: 14.5px; font-weight: 600; color: var(--accent-primary); margin-top: 0; margin-bottom: 8px;">💡 ${o.title}</h4>
                                <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px;">${o.desc}</p>
                            </div>
                            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                                <div style="margin-bottom: 4px;">🎯 **Benefícios:** <span style="color: var(--text-primary);">${o.benefits}</span></div>
                                <div style="margin-bottom: 4px;">📈 **Impacto Esperado:** <span style="color: var(--text-primary);">${o.impact}</span></div>
                                <div style="margin-bottom: 4px;">⚡ **Prioridade:** <span style="color: var(--text-primary);">${o.priority}</span></div>
                                <div>🏢 **Área:** <span style="color: var(--text-primary);">${o.area}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 5. ANÁLISE GERENCIAL -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">5. Análise Gerencial e Interpretação de KPIs</h3>
                <div style="display: grid; grid-template-columns: 1fr; gap: 20px;">
                    ${gerencialData.map(g => `
                        <div class="glass-panel" style="padding: 20px; border-color: rgba(255,255,255,0.05); background: rgba(0,0,0,0.15);">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 10px; margin-bottom: 12px;">
                                <strong style="font-size: 15px; color: var(--text-primary);">${g.name}</strong>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 18px; font-weight: 700; color: var(--accent-primary);">${g.value}</span>
                                    <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); font-size: 10px; padding: 4px 8px; border-radius: 4px;">Status: <span style="font-weight: 600; color: var(--${g.statusClass});">${g.status}</span></span>
                                </div>
                            </div>
                            <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                                <div>
                                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">🔍 O que significa?</div>
                                    <div>${g.meaning}</div>
                                    <div style="font-weight: 600; color: var(--text-primary); margin-top: 8px; margin-bottom: 4px;">📊 Referência de Mercado:</div>
                                    <div>${g.reference}</div>
                                </div>
                                <div>
                                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">⚠️ Riscos Associados:</div>
                                    <div>${g.risks}</div>
                                    <div style="font-weight: 600; color: var(--accent-primary); margin-top: 8px; margin-bottom: 4px;">🛠️ O que fazer?</div>
                                    <div style="color: var(--text-primary);">${g.action}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 6. PERGUNTAS QUE TODO EMPRESÁRIO FARIA -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">6. Perguntas que Todo Empresário Faria (Respondidas pela IA)</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${faqs.map((f, idx) => `
                        <div class="glass-panel" style="padding: 16px; border-color: rgba(255,255,255,0.04); background: rgba(0,0,0,0.15);">
                            <div style="font-weight: 600; color: var(--text-primary); font-size: 14px; margin-bottom: 6px; display: flex; gap: 8px; align-items: center;">
                                <span style="background: var(--accent-primary); color: #fff; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">Q</span>
                                ${f.q}
                            </div>
                            <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; padding-left: 28px;">
                                ${f.a}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 7. PLANO DE AÇÃO ESTRATÉGICO -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">7. Plano de Ação Estratégico</h3>
                <div style="overflow-x: auto; background: rgba(0,0,0,0.15); border: 1px solid var(--glass-border); border-radius: 8px;">
                    <table class="report-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: rgba(99,102,241,0.15); color: var(--text-primary); text-align: left;">
                                <th style="padding: 12px 10px; border: 1px solid var(--glass-border);">Prioridade / Prazo</th>
                                <th style="padding: 12px 10px; border: 1px solid var(--glass-border);">Ação e Escopo</th>
                                <th style="padding: 12px 10px; border: 1px solid var(--glass-border);">Responsável</th>
                                <th style="padding: 12px 10px; border: 1px solid var(--glass-border);">Impacto em KPI</th>
                                <th style="padding: 12px 10px; border: 1px solid var(--glass-border);">Resultado Esperado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cards.map(c => `
                                <tr style="border-bottom: 1px solid var(--glass-border); color: var(--text-secondary);">
                                    <td style="padding: 12px 10px; border: 1px solid var(--glass-border); font-weight: 600; color: var(--text-primary);">
                                        <div>${c.priority}</div>
                                        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px;">📅 ${c.prazo}</div>
                                    </td>
                                    <td style="padding: 12px 10px; border: 1px solid var(--glass-border);">
                                        <strong style="color: var(--text-primary);">${c.title}</strong>
                                        <div style="font-size: 11px; margin-top: 4px;">${c.description}</div>
                                    </td>
                                    <td style="padding: 12px 10px; border: 1px solid var(--glass-border);">${c.responsible}</td>
                                    <td style="padding: 12px 10px; border: 1px solid var(--glass-border); font-weight: 500; color: var(--accent-primary);">${c.indicators}</td>
                                    <td style="padding: 12px 10px; border: 1px solid var(--glass-border);">${c.objective}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 8. GERAÇÃO AUTOMÁTICA DOS CARDS (ACOMPANHAMENTO) -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">8. Cards de Ações Integradas (Acompanhamento Interativo)</h3>
                <p style="font-size: 13.5px; color: var(--text-secondary); margin-bottom: 16px;">Toda ação recomendada gerou um **Card Estratégico** interativo. Você pode atualizar o status do card diretamente na plataforma para acompanhar sua governança e execução.</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    ${cards.map(c => `
                        <div class="glass-panel" style="padding: 18px; border-color: rgba(255,255,255,0.05); background: rgba(15, 23, 42, 0.4); display: flex; flex-direction: column; justify-content: space-between; border-top: 4px solid ${c.priority.includes('Crítico') ? '#ef4444' : (c.priority.includes('Alto') ? '#f59e0b' : '#3b82f6')};">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; color: var(--accent-primary);">${c.category}</span>
                                    <span style="font-size: 10px; font-weight: 600; color: var(--text-secondary);">${c.prazo}</span>
                                </div>
                                <h4 style="font-size: 14.5px; font-weight: 600; color: var(--text-primary); margin: 0 0 6px 0;">${c.title}</h4>
                                <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin: 0 0 10px 0;">${c.description}</p>
                                <div style="font-size: 11px; color: var(--text-secondary); background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px; margin-bottom: 12px;">
                                    🎯 **Objetivo:** ${c.objective}
                                </div>
                            </div>
                            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                <div style="font-size: 11px; color: var(--text-secondary);">
                                    👤 **Resp:** ${c.responsible.split(' ')[0]}
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <label style="font-size: 11px; color: var(--text-secondary); margin-bottom: 0;">Status:</label>
                                    <select onchange="updateStrategicCardStatus('${compId}', ${yr}, ${m !== null ? m : 'null'}, '${c.id}', this.value)" style="padding: 4px 8px; font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 4px; color: var(--text-primary);">
                                        <option value="Não iniciado" ${c.status === 'Não iniciado' ? 'selected' : ''}>Não iniciado</option>
                                        <option value="Em andamento" ${c.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
                                        <option value="Concluído" ${c.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                                        <option value="Cancelado" ${c.status === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 9. EVOLUÇÃO HISTÓRICA -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">9. Evolução Histórica Comparativa</h3>
                <div style="overflow-x: auto; background: rgba(0,0,0,0.15); border: 1px solid var(--glass-border); border-radius: 8px;">
                    <table class="report-table" style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.03); color: var(--text-primary);">
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">Mês</th>
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">Receita Bruta</th>
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">EBITDA</th>
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">Margem EBITDA</th>
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">Capital de Giro</th>
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">Endividamento</th>
                                <th style="padding: 10px; border: 1px solid var(--glass-border);">Saúde Geral</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${evolutionRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 10. RADAR ESTRATÉGICO -->
            <div style="margin-bottom: 40px;">
                <h3 style="font-size: 18px; font-weight: 600; color: var(--accent-primary); border-bottom: 2px solid rgba(99,102,241,0.1); padding-bottom: 8px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">10. Radar de Maturidade Estratégica</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px; flex-wrap: wrap;">
                    <!-- RADAR CANVAS -->
                    <div class="glass-panel" style="padding: 16px; border-color: rgba(255,255,255,0.04); background: rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; height: 350px;">
                        <canvas id="parecerRadarChart_${m !== null ? 'mensal' : 'anual'}" style="max-height: 320px;"></canvas>
                    </div>

                    <!-- JUSTIFICATIONS -->
                    <div style="max-height: 350px; overflow-y: auto; background: rgba(0,0,0,0.15); border: 1px solid var(--glass-border); border-radius: 8px; padding: 12px 16px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); color: var(--text-primary); font-weight: 600;">
                                    <th style="padding: 8px 4px;">Dimensão</th>
                                    <th style="padding: 8px 4px; text-align: center;">Nota</th>
                                    <th style="padding: 8px 4px;">Justificativa Operacional</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${radarJustifications.map(j => `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: var(--text-secondary);">
                                        <td style="padding: 8px 4px; font-weight: 600; color: var(--text-primary);">${j.name}</td>
                                        <td style="padding: 8px 4px; text-align: center; font-weight: 700; color: var(--accent-primary);">${j.score}/10</td>
                                        <td style="padding: 8px 4px; line-height: 1.4;">${j.note}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 11. PARECER FINAL DO CONSULTOR -->
            <div style="background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; padding: 24px;">
                <h3 style="font-size: 16px; font-weight: 600; color: var(--accent-primary); margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">✒️ Parecer Final do Consultor</h3>
                
                <div style="font-size: 13.5px; color: var(--text-primary); line-height: 1.6;">
                    <p style="margin-bottom: 12px;">Prezado conselho de administração e diretoria executiva,</p>
                    <p style="margin-bottom: 12px;">Com base na auditoria consolidada dos dados do período, a empresa demonstra excelente resiliência comercial. No entanto, o **risco de liquidez** associado ao capital de giro negativo exige intervenção cirúrgica imediata da gerência para alongar prazos de curto prazo.</p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 0;">
                        <div>
                            <strong>Principais Ameaças:</strong><br>
                            <span style="color: var(--text-secondary); font-size: 12.5px;">${parecerRiscosText}</span>
                        </div>
                        <div>
                            <strong>Oportunidades de Escala:</strong><br>
                            <span style="color: var(--text-secondary); font-size: 12.5px;">${parecerOportText}</span>
                        </div>
                    </div>
                    
                    <p style="margin-bottom: 12px;">**Recomendação prioritária:** ${parecerRecomendText}</p>
                    <p style="margin-bottom: 12px;">**Visão para o próximo período:** Com a implantação e acompanhamento diário dos Cards de Ação Estratégicos propostos, a diretoria reequilibrará as contas de fornecedores e a necessidade de capital de giro circulante líquido. ${parecerConclusaoText}</p>
                </div>
                
                <div style="margin-top: 24px; text-align: right; font-size: 12px; color: var(--text-secondary); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                    ✒️ <strong>Clarus Consultoria Estratégica</strong> &bull; Gestão & Finanças Empresariais Premium
                </div>
            </div>
            
        </div>
    `;

    return { html, scores: radarScores };
}

function renderParecerMensal() {
    const container = document.getElementById('parecerMensalContainer');
    if (!container) return;

    if (!EFO_Session) {
        container.innerHTML = `
            <div class="glass-panel p-24" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🔒</div>
                <h3 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">Acesso Restrito</h3>
                <p style="color: var(--text-secondary); line-height: 1.5;">Efetue o login para visualizar o Parecer Estratégico.</p>
            </div>`;
        return;
    }

    const compId = EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId;
    const company = EFO_Companies[compId];
    if (!company) {
        container.innerHTML = `
            <div class="glass-panel p-24" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px;">
                <div style="font-size: 50px; margin-bottom: 20px;">⚠️</div>
                <h3 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">Nenhuma Empresa Selecionada</h3>
                <p style="color: var(--text-secondary); line-height: 1.5;">Selecione ou cadastre uma empresa ativa.</p>
            </div>`;
        return;
    }

    const yearSelect = document.getElementById('parecerMensalYearSelect');
    if (yearSelect) {
        const years = getDREYears();
        let optionsHtml = '';
        years.forEach(y => {
            optionsHtml += `<option value="${y}" ${y === EFO_Active_DRE_Year ? 'selected' : ''}>${y}</option>`;
        });
        yearSelect.innerHTML = optionsHtml;
        yearSelect.onchange = (e) => {
            EFO_Active_DRE_Year = parseInt(e.target.value);
            updateAllViews();
        };
    }

    const monthSelect = document.getElementById('parecerMensalMonthSelect');
    if (monthSelect) {
        monthSelect.value = EFO_Active_Parecer_Month;
        monthSelect.onchange = (e) => {
            EFO_Active_Parecer_Month = parseInt(e.target.value);
            updateAllViews();
        };
    }

    const yr = EFO_Active_DRE_Year;
    const m = EFO_Active_Parecer_Month;
    const d = calculateDREData(yr);

    const R_BRUTA = sumArrays(d['dre.receita_bruta.produtos'], d['dre.receita_bruta.servicos'], d['dre.receita_bruta.outras']);
    const monthRevenue = R_BRUTA[m];
    const monthsFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = monthsFull[m];

    if (monthRevenue === 0) {
        container.innerHTML = `
            <div class="glass-panel p-24" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px;">
                <div style="font-size: 50px; margin-bottom: 20px;">📈</div>
                <h3 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">Dados Insuficientes</h3>
                <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 20px;">A empresa ativa não possui transações categorizadas no mês de ${monthName} de ${yr}.</p>
                <p style="font-size: 13px; color: var(--text-secondary);">Por favor, importe arquivos .OFX e categorize as transações na aba <strong>Conciliação Bancária</strong>.</p>
            </div>`;
        return;
    }

    const report = buildStrategicReport(compId, yr, m);
    container.innerHTML = report.html;
    
    // Defer chart rendering to make sure canvas is in DOM
    setTimeout(() => {
        initParecerRadarChart(`parecerRadarChart_mensal`, report.scores);
    }, 100);
}

function renderParecerAnual() {
    const container = document.getElementById('parecerAnualContainer');
    if (!container) return;

    if (!EFO_Session) {
        container.innerHTML = `
            <div class="glass-panel p-24" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🔒</div>
                <h3 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">Acesso Restrito</h3>
                <p style="color: var(--text-secondary); line-height: 1.5;">Efetue o login para visualizar o Parecer Estratégico.</p>
            </div>`;
        return;
    }

    const compId = EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId;
    const company = EFO_Companies[compId];
    if (!company) {
        container.innerHTML = `
            <div class="glass-panel p-24" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px;">
                <div style="font-size: 50px; margin-bottom: 20px;">⚠️</div>
                <h3 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">Nenhuma Empresa Selecionada</h3>
                <p style="color: var(--text-secondary); line-height: 1.5;">Selecione ou cadastre uma empresa ativa.</p>
            </div>`;
        return;
    }

    const yearSelect = document.getElementById('parecerAnualYearSelect');
    if (yearSelect) {
        const years = getDREYears();
        let optionsHtml = '';
        years.forEach(y => {
            optionsHtml += `<option value="${y}" ${y === EFO_Active_DRE_Year ? 'selected' : ''}>${y}</option>`;
        });
        yearSelect.innerHTML = optionsHtml;
        yearSelect.onchange = (e) => {
            EFO_Active_DRE_Year = parseInt(e.target.value);
            updateAllViews();
        };
    }

    const yr = EFO_Active_DRE_Year;
    const d = calculateDREData(yr);

    const R_BRUTA = sumArrays(d['dre.receita_bruta.produtos'], d['dre.receita_bruta.servicos'], d['dre.receita_bruta.outras']);
    const totalRevenue = R_BRUTA.reduce((a, b) => a + b, 0);

    if (totalRevenue === 0) {
        container.innerHTML = `
            <div class="glass-panel p-24" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px;">
                <div style="font-size: 50px; margin-bottom: 20px;">📈</div>
                <h3 style="font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;">Dados Insuficientes</h3>
                <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 20px;">A empresa ativa não possui transações categorizadas no ano de ${yr}.</p>
                <p style="font-size: 13px; color: var(--text-secondary);">Por favor, importe arquivos .OFX e categorize as transações na aba <strong>Conciliação Bancária</strong>.</p>
            </div>`;
        return;
    }

    const report = buildStrategicReport(compId, yr, null);
    container.innerHTML = report.html;
    
    // Defer chart rendering to make sure canvas is in DOM
    setTimeout(() => {
        initParecerRadarChart(`parecerRadarChart_anual`, report.scores);
    }, 100);
}
function renderConciliationTable() {
    const tbody = document.getElementById('conciliationTbody');
    const badge = document.getElementById('pendingCount');
    const navBadge = document.getElementById('navPendingCount');
    tbody.innerHTML = '';

    const pendentes = OFX_Raw_Import.filter(t => (t.status === 'Pendente' || t.status === 'Flagged') && (!t.transaction_id || !t.transaction_id.startsWith('manual_')));
    badge.textContent = `${pendentes.length} Ações`;
    navBadge.textContent = pendentes.length;
    if(pendentes.length > 0) {
        navBadge.style.display = 'inline-block';
    } else {
        navBadge.style.display = 'none';
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">Nenhuma transação pendente no momento.</td></tr>`;
        return;
    }

    const optgroups = getOptGroupsHTML();

    pendentes.forEach(txn => {
        const tr = document.createElement('tr');
        if (txn.status === 'Flagged') tr.classList.add('row-flagged');
        const formattedDate = txn.date ? txn.date.substring(0, 10) : '';
        
        // Find suggested account from history (excluding generic banking terms)
        let suggestedAccount = null;
        const rawDesc = txn.description || '';
        const genericTerms = ['DEB PIX CHAVE', 'ENVIO PIX', 'PIX', 'TED', 'DOC', 'DEBITO', 'TRANSF', 'PAGTO', 'FOL PAGTO', 'PIX ENVIADO', 'COMPROVANTE'];
        const isGeneric = genericTerms.some(g => rawDesc.toUpperCase().trim() === g);

        if (!isGeneric) {
            const getNormalizedSupplier = (d) => {
                if (!d) return '';
                return d.toUpperCase()
                    .replace(/[0-9]/g, '') // Remove numbers
                    .replace(/[^A-Z ]/g, '') // Remove special characters
                    .replace(/\s+/g, ' ') // Clean spaces
                    .trim();
            };

            const normalizedPending = getNormalizedSupplier(rawDesc);
            
            if (normalizedPending.length >= 3) {
                const histMatch = OFX_Raw_Import.find(t => {
                    if (t.status !== 'Categorizado' || !t.assigned_account || !t.description) return false;
                    const normalizedHist = getNormalizedSupplier(t.description);
                    return normalizedHist === normalizedPending;
                });
                
                if (histMatch) {
                    suggestedAccount = histMatch.assigned_account;
                }
            }
        }

        let statusHtml = txn.status === 'Flagged' ? `<span class="status-badge flagged">⚠️ Conformidade</span>` : `<span class="status-badge pendente">Pendente</span>`;
        if (suggestedAccount) {
            statusHtml += ` <span class="status-badge" style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.4); margin-left: 6px;">💡 Sugerido</span>`;
        }

        let reasonHtml = txn.flag_reason ? `<div style="font-size:11px; color:var(--danger); margin-top:4px;">${txn.flag_reason}</div>` : '';

        tr.innerHTML = `
            <td>
                <input type="date" id="date_${txn.transaction_id}" value="${formattedDate}" 
                       style="background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-primary); padding: 6px; font-size: 12px; width: 120px;">
            </td>
            <td class="desc-cell"><strong>${txn.description}</strong>${reasonHtml}</td>
            <td style="color: ${txn.amount > 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(txn.amount)}</td>
            <td>${statusHtml}</td>
            <td style="display: flex; gap: 8px;">
                <select class="efo-select" id="sel_${txn.transaction_id}">${optgroups}</select>
                <button class="action-btn" onclick="applyManualCategorization('${txn.transaction_id}')">Aprovar</button>
            </td>
        `;
        tbody.appendChild(tr);

        if (suggestedAccount) {
            const selectEl = document.getElementById(`sel_${txn.transaction_id}`);
            if (selectEl) {
                selectEl.value = suggestedAccount;
            }
        }
    });
}

// --- CHARTS & UI ---
function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    const ctxGauge = document.getElementById('gaugeChart').getContext('2d');
    gaugeChartInst = new Chart(ctxGauge, { type: 'doughnut', data: { labels: ['Realizado', 'Faltante'], datasets: [{ data: [0, 100], backgroundColor: ['#6366f1', 'rgba(255,255,255,0.05)'], borderWidth: 0, circumference: 180, rotation: 270 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '80%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    pieChartInst = new Chart(ctxPie, { type: 'pie', data: { labels: ["Custos", "Desp. Fixas", "Comercial", "Deduções"], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#ef4444', '#f59e0b', '#6366f1', '#10b981'], borderWidth: 1, borderColor: '#1a1d2d' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
}

function updateGaugeChart(real, meta) {
    document.getElementById('valLucratividade').textContent = formatPercent(real);
    document.getElementById('valMetaLucratividade').textContent = formatPercent(meta);
    let color = '#6366f1';
    if (real < 0) color = '#ef4444'; else if (real >= meta) color = '#10b981';
    let visualReal = Math.max(0, real); let remaining = Math.max(0, meta - visualReal);
    if (visualReal >= meta) { remaining = 0; visualReal = 100; }
    gaugeChartInst.data.datasets[0].data = [visualReal, remaining]; gaugeChartInst.data.datasets[0].backgroundColor[0] = color; gaugeChartInst.update();
}

function updatePieChart(dataArr) {
    pieChartInst.data.datasets[0].data = dataArr;
    pieChartInst.update();
}

function renderParametros() {
    document.getElementById('paramList').innerHTML = `
        <li><span>Impostos:</span> <strong>${EFO_Parametros.impostos}%</strong></li>
        <li><span>Meta Lucro:</span> <strong>${EFO_Parametros.meta_lucro_desejada}%</strong></li>
        <li style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
            <span>Atividade:</span> <strong style="color:var(--accent-primary)">${Config_Empresa.tipo_atividade}</strong>
        </li>
    `;
}

function openEmpresaModal() {
    document.getElementById('config_cnpj').value = Config_Empresa.cnpj;
    document.getElementById('config_cnae').value = Config_Empresa.cnae_principal;
    document.getElementById('config_regime').value = Config_Empresa.regime_tributario;
    document.getElementById('config_atividade').value = Config_Empresa.tipo_atividade;
    document.getElementById('empresaModal').style.display = 'block';
}

function saveEmpresa(e) {
    e.preventDefault();
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem configurar a empresa.', 'danger');
        return;
    }
    Config_Empresa = {
        cnpj: document.getElementById('config_cnpj').value,
        cnae_principal: document.getElementById('config_cnae').value,
        regime_tributario: document.getElementById('config_regime').value,
        tipo_atividade: document.getElementById('config_atividade').value
    };
    saveState();
    document.getElementById('empresaModal').style.display = 'none';
    renderParametros();
    showToast('Sucesso', 'Configurações da empresa salvas.', 'success');
}

function saveParams(e) {
    e.preventDefault();
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem alterar os parâmetros.', 'danger');
        return;
    }
    EFO_Parametros = { impostos: parseFloat(document.getElementById('param_impostos').value), comissoes: parseFloat(document.getElementById('param_comissoes').value), meta_lucro_desejada: parseFloat(document.getElementById('param_meta_lucro').value) };
    saveState();
    renderParametros(); document.getElementById('paramsModal').style.display = 'none';
    updateAllViews(); showToast('Sucesso', 'Parâmetros atualizados.', 'success');
}

function exportPDF() {
    showToast('Gerando Relatório', 'Aguarde um instante...', 'success');
    const element = document.getElementById('exportableArea');
    const opt = {
      margin:       0.5,
      filename:     'Fechamento_Mensal_EFO.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    
    // Temporarily show all tabs for PDF
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'block');
    
    html2pdf().set(opt).from(element).save().then(() => {
        // Restore tab logic
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = '');
    });
}

function showToast(title, message, type = 'warning') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon">${type === 'danger' ? '🚨' : type === 'warning' ? '⚠️' : '✅'}</div><div class="toast-content"><h4>${title}</h4><p>${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

// --- COMPRESSION, BACKUP & SHARING CODES ---

// Compress JSON to Base64 (gzip)
async function compressToHash(dataObj) {
    const jsonString = JSON.stringify(dataObj);
    if (typeof CompressionStream !== 'undefined') {
        try {
            const stream = new Blob([jsonString]).stream().pipeThrough(new CompressionStream('gzip'));
            const response = new Response(stream);
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        } catch (e) {
            console.error("CompressionStream error, falling back", e);
            return window.btoa(unescape(encodeURIComponent(jsonString)));
        }
    } else {
        return window.btoa(unescape(encodeURIComponent(jsonString)));
    }
}

// Decompress Base64 to JSON (gzip)
async function decompressFromHash(base64Str) {
    try {
        const binaryString = window.atob(base64Str);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        if (typeof DecompressionStream !== 'undefined') {
            try {
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
                const response = new Response(stream);
                const text = await response.text();
                return JSON.parse(text);
            } catch (e) {
                console.error("DecompressionStream error, trying fallback", e);
                return JSON.parse(decodeURIComponent(escape(binaryString)));
            }
        } else {
            return JSON.parse(decodeURIComponent(escape(binaryString)));
        }
    } catch (e) {
        console.error("Failed to decompress base64 string", e);
        throw e;
    }
}

// Check URL Hash for shared data (auto-logs in as guest client)
async function checkShareHash() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#share=')) {
        const base64Str = hash.substring(7);
        try {
            const importedData = await decompressFromHash(base64Str);
            if (importedData && (importedData.EFO_Lancamentos || importedData.OFX_Raw_Import)) {
                if (confirm("Deseja carregar os dados compartilhados deste link no painel?")) {
                    const tempCompId = 'temp_share_' + Math.random().toString(36).substring(2, 9);
                    const sharedCompany = {
                        id: tempCompId,
                        name: importedData.Config_Empresa?.cnpj ? `Empresa - ${importedData.Config_Empresa.cnpj}` : 'Empresa Compartilhada',
                        config: importedData.Config_Empresa || DEFAULT_EMPRESA,
                        parametros: importedData.EFO_Parametros || DEFAULT_PARAMETROS,
                        lancamentos: importedData.EFO_Lancamentos || JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS)),
                        ofx: importedData.OFX_Raw_Import || []
                    };
                    
                    // Store temporarily in memory and session
                    EFO_Companies[tempCompId] = sharedCompany;
                    EFO_Session = {
                        email: 'guest@clarus.com.br',
                        name: sharedCompany.name,
                        role: 'client',
                        companyId: tempCompId
                    };
                    
                    sessionStorage.setItem('EFO_Session', JSON.stringify(EFO_Session));
                    
                    // Clear hash to prevent double prompt on reload
                    history.replaceState(null, null, ' ');
                    
                    loadActiveCompanyData();
                    applyRoleUI();
                    updateAllViews();
                    renderParametros();
                    
                    showToast('Sucesso', 'Painel de dados compartilhado carregado!', 'success');
                } else {
                    history.replaceState(null, null, ' ');
                }
            }
        } catch (e) {
            console.error(e);
            showToast('Erro', 'Não foi possível ler os dados do link compartilhado.', 'danger');
            history.replaceState(null, null, ' ');
        }
    }
}

// Export state to JSON file
function exportToJSON() {
    const dataObj = {
        EFO_Parametros,
        Config_Empresa,
        EFO_Lancamentos,
        OFX_Raw_Import
    };
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EFO_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exportado', 'Arquivo de backup JSON gerado com sucesso!', 'success');
}

// Trigger input click for importing JSON file
function triggerImportJSON() {
    document.getElementById('importBackupFile').click();
}

// Handle JSON file import
function handleImportJSON(e) {
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem importar arquivos de backup.', 'danger');
        e.target.value = '';
        return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedData = JSON.parse(event.target.result);
            if (importedData && (importedData.EFO_Lancamentos || importedData.OFX_Raw_Import)) {
                if (confirm("Deseja importar este arquivo de backup? (Isso substituirá os dados atuais deste navegador)")) {
                    if (importedData.EFO_Parametros) {
                        localStorage.setItem('EFO_Parametros', JSON.stringify(importedData.EFO_Parametros));
                        EFO_Parametros = importedData.EFO_Parametros;
                    }
                    if (importedData.Config_Empresa) {
                        localStorage.setItem('Config_Empresa', JSON.stringify(importedData.Config_Empresa));
                        Config_Empresa = importedData.Config_Empresa;
                    }
                    if (importedData.EFO_Lancamentos) {
                        localStorage.setItem('EFO_Lancamentos_V3', JSON.stringify(importedData.EFO_Lancamentos));
                        EFO_Lancamentos = importedData.EFO_Lancamentos;
                    }
                    if (importedData.OFX_Raw_Import) {
                        localStorage.setItem('OFX_Raw_Import_V2', JSON.stringify(importedData.OFX_Raw_Import));
                        OFX_Raw_Import = importedData.OFX_Raw_Import;
                    }
                    showToast('Sucesso', 'Backup importado com sucesso!', 'success');
                    updateAllViews();
                    renderParametros();
                }
            } else {
                showToast('Erro', 'Arquivo JSON inválido ou incompatível.', 'danger');
            }
        } catch (err) {
            showToast('Erro', 'Erro ao ler arquivo JSON de backup.', 'danger');
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

// Copy Shareable Link (compressed base64 hash)
async function copyShareLink() {
    const dataObj = {
        EFO_Parametros,
        Config_Empresa,
        EFO_Lancamentos,
        OFX_Raw_Import
    };
    showToast('Gerando Link', 'Compactando dados para compartilhamento...', 'success');
    try {
        const compressed = await compressToHash(dataObj);
        const shareUrl = window.location.origin + window.location.pathname + '#share=' + compressed;
        
        // Use clipboard API
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link Copiado!', 'O link com todos os dados foi copiado para a área de transferência. Envie para o seu cliente!', 'success');
    } catch (e) {
        console.error(e);
        showToast('Erro', 'Erro ao gerar link de compartilhamento. Tente exportar como JSON.', 'danger');
    }
}

// --- USER ACCESS & ROLE CONTROL ---
function applyRoleUI() {
    const loginScreen = document.getElementById('loginScreen');
    const userProfile = document.getElementById('userProfile');
    const userProfileName = document.getElementById('userProfileName');
    const userProfileRole = document.getElementById('userProfileRole');
    
    const adminCompanySelectorSection = document.getElementById('adminCompanySelectorSection');
    const navClientsBtn = document.getElementById('navClientsBtn');
    const navConciliationBtn = document.getElementById('navConciliationBtn');
    const navManualConciliationBtn = document.getElementById('navManualConciliationBtn');
    const navDashboardBtn = document.getElementById('navDashboardBtn');
    const navAdminFilesBtn = document.getElementById('navAdminFilesBtn');
    const navClientFilesBtn = document.getElementById('navClientFilesBtn');
    
    const importSection = document.getElementById('importSection');
    const sharingSection = document.getElementById('sharingSection');
    
    const btnEditParams = document.getElementById('btnEditParams');
    const btnConfigEmpresa = document.getElementById('btnConfigEmpresa');
    const btnResetData = document.getElementById('btnResetData');
    
    if (!EFO_Session) {
        loginScreen.style.display = 'flex';
        return;
    }
    
    loginScreen.style.display = 'none';
    userProfileName.textContent = EFO_Session.name;
    
    const navReuniaoBtn = document.getElementById('navReuniaoBtn');
    
    if (EFO_Session.role === 'admin') {
        userProfileRole.textContent = 'Administrador';
        adminCompanySelectorSection.style.display = 'block';
        navClientsBtn.style.display = 'block';
        if (navAdminFilesBtn) navAdminFilesBtn.style.display = 'block';
        if (navClientFilesBtn) navClientFilesBtn.style.display = 'none';
        navConciliationBtn.style.display = 'flex';
        if (navManualConciliationBtn) navManualConciliationBtn.style.display = 'flex';
        if (importSection) importSection.style.display = 'block';
        if (sharingSection) sharingSection.style.display = 'block';
        if (navReuniaoBtn) navReuniaoBtn.style.display = 'none';
        
        btnEditParams.style.display = 'inline-block';
        btnConfigEmpresa.style.display = 'inline-block';
        btnResetData.style.display = 'block';
        
        navDashboardBtn.textContent = 'Indicadores EFO';
        
        // If admin is on a client-only tab, force select the DRE tab
        const activeNavAdmin = document.querySelector('.nav-btn.active');
        if (activeNavAdmin && (
            activeNavAdmin.getAttribute('data-target') === 'tab-client-files' || 
            activeNavAdmin.getAttribute('data-target') === 'tab-reuniao'
        )) {
            const dreBtn = document.querySelector('.nav-btn[data-target="tab-dre"]');
            if (dreBtn) dreBtn.click();
        }
        
        renderCompanySelect();
    } else {
        const company = EFO_Companies[EFO_Session.companyId] || {};
        const pkg = company.config?.package || 'performance';
        const pkgNames = { essential: 'Essential', performance: 'Performance', executive: 'Executive' };
        userProfileRole.textContent = `Cliente • ${pkgNames[pkg] || 'Performance'}`;

        adminCompanySelectorSection.style.display = 'none';
        navClientsBtn.style.display = 'none';
        if (navAdminFilesBtn) navAdminFilesBtn.style.display = 'none';
        if (navClientFilesBtn) navClientFilesBtn.style.display = 'block';
        navConciliationBtn.style.display = 'none';
        if (navManualConciliationBtn) navManualConciliationBtn.style.display = 'none';
        if (importSection) importSection.style.display = 'none';
        if (sharingSection) sharingSection.style.display = 'none';
        if (navReuniaoBtn) navReuniaoBtn.style.display = 'block';
        
        btnEditParams.style.display = 'none';
        btnConfigEmpresa.style.display = 'none';
        btnResetData.style.display = 'none';
        
        navDashboardBtn.textContent = 'Indicadores EFO';
        
        // If they are on a hidden tab, force select the DRE tab (since Essential client hides dashboard)
        const activeNavClient = document.querySelector('.nav-btn.active');
        if (activeNavClient && (
            activeNavClient.getAttribute('data-target') === 'tab-conciliation' || 
            activeNavClient.getAttribute('data-target') === 'tab-clients' ||
            activeNavClient.getAttribute('data-target') === 'tab-admin-files' ||
            (pkg === 'essential' && activeNavClient.getAttribute('data-target') === 'tab-dashboard')
        )) {
            // Click DRE tab
            document.querySelector('.nav-btn[data-target="tab-dre"]').click();
        }
    }

    // Toggle Planos button visibility only for the demo user
    const DEMO_EMAIL = 'teste@clarus.com.br';
    const isDemo = EFO_Session && (
        (EFO_Session.email && EFO_Session.email.toLowerCase().trim() === DEMO_EMAIL) ||
        (EFO_Session.companyId && EFO_Session.companyId === 'comp_demo')
    );
    console.log('[applyRoleUI] session=', EFO_Session?.email, '| companyId=', EFO_Session?.companyId, '| isDemo=', isDemo);
    const navPlanosBtn = document.getElementById('navPlanosBtn');
    if (navPlanosBtn) {
        navPlanosBtn.style.display = isDemo ? 'flex' : 'none';
        console.log('[applyRoleUI] navPlanosBtn display set to:', navPlanosBtn.style.display);
    } else {
        console.warn('[applyRoleUI] navPlanosBtn element NOT FOUND in DOM');
    }
    
    // Safety check: if non-demo user lands on tab-planos, redirect to tab-dre
    const activeNavPlanos = document.querySelector('.nav-btn.active');
    if (activeNavPlanos && activeNavPlanos.getAttribute('data-target') === 'tab-planos' && !isDemo) {
        const dreBtn = document.querySelector('.nav-btn[data-target="tab-dre"]');
        if (dreBtn) dreBtn.click();
    }
}

function renderCompanySelect() {
    const select = document.getElementById('activeCompanySelect');
    if (!select) return;
    select.innerHTML = '';
    
    Object.keys(EFO_Companies).forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = EFO_Companies[id].name || id;
        if (id === EFO_Active_Company_Id) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

window.selectClientCompany = (compId) => {
    if (!compId) return;
    EFO_Active_Company_Id = compId;
    localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
    loadActiveCompanyData();
    updateAllViews();
    renderParametros();
    renderCompanySelect();
    showToast('Troca de Empresa', `Gerenciando dados de: ${EFO_Companies[compId]?.name || compId}`, 'success');
    
    // Auto-switch to DRE tab so the admin sees the updated company data immediately
    const dreBtn = document.querySelector('.nav-btn[data-target="tab-dre"]');
    if (dreBtn) dreBtn.click();
};

function renderClientsTable() {
    const tbody = document.getElementById('clientsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    EFO_Users.forEach((user, index) => {
        if (user.role === 'admin') return;
        
        const company = EFO_Companies[user.companyId] || {};
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${user.name || 'Sem Nome'}</strong></td>
            <td>${user.email}</td>
            <td><code>●●●●●●●●</code></td>
            <td>${company.config?.cnpj || '-'}</td>
            <td>${company.config?.cnae_principal || '-'}</td>
            <td><span class="badge" style="background: var(--accent-primary); color: white; font-size: 11px; padding: 4px 8px;">${company.config?.regime_tributario || '-'}</span></td>
            <td>
                <span class="badge" style="background: ${company.config?.package === 'executive' ? 'var(--accent-secondary)' : (company.config?.package === 'essential' ? 'rgba(255,255,255,0.1)' : 'var(--accent-primary)')}; color: white; font-size: 11px; padding: 4px 8px; text-transform: uppercase;">
                    ${company.config?.package || 'performance'}
                </span>
            </td>
            <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
                <button class="action-btn" onclick="selectClientCompany('${user.companyId}')" title="Gerenciar dados desta empresa"
                    style="background: rgba(16, 185, 129, 0.15); border-color: var(--success); color: var(--success);">
                    🏢 Acessar
                </button>
                <button class="action-btn" onclick="openEditClient(${index})" title="Editar cliente"
                    style="background: rgba(99,102,241,0.15); border-color: var(--accent-primary); color: var(--accent-primary);">
                    &#9999;&#65039; Editar
                </button>
                <button class="action-btn-danger" onclick="deleteClient(${index})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteClient = (index) => {
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem excluir clientes.', 'danger');
        return;
    }
    if (confirm("Tem certeza que deseja excluir este cliente?")) {
        const user = EFO_Users[index];
        if (user) {
            const otherUsersWithCompany = EFO_Users.filter((u, i) => i !== index && u.companyId === user.companyId);
            const companyToDelete = otherUsersWithCompany.length === 0 ? user.companyId : null;

            if (companyToDelete) {
                delete EFO_Companies[companyToDelete];
                localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
                // Delete from Supabase (OFX cascade-deletes via FK)
                db_deleteCompany(companyToDelete).catch(() => {});
            }

            EFO_Users.splice(index, 1);
            localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
            db_deleteUser(user.email).catch(() => {});
            
            showToast('Sucesso', 'Cliente e dados de empresa excluídos.', 'success');
            renderClientsTable();
            renderCompanySelect();
            
            // If the deleted company was the active company, switch to another
            if (user.companyId === EFO_Active_Company_Id) {
                EFO_Active_Company_Id = Object.keys(EFO_Companies)[0] || '';
                localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
                loadActiveCompanyData();
                updateAllViews();
                renderParametros();
            }
        }
    }
};


// ---- EDIT CLIENT ----
window.openEditClient = (index) => {
    const user = EFO_Users[index];
    if (!user) return;
    const company = EFO_Companies[user.companyId] || {};
    const cfg = company.config || {};

    document.getElementById('edit_client_index').value = index;
    document.getElementById('edit_client_name').value = user.name || '';
    document.getElementById('edit_client_email').value = user.email || '';
    document.getElementById('edit_client_password').value = '';   // blank = keep current
    document.getElementById('edit_client_cnpj').value = cfg.cnpj || '';
    document.getElementById('edit_client_cnae').value = cfg.cnae_principal || '';
    document.getElementById('edit_client_regime').value = cfg.regime_tributario || 'Simples Nacional';
    document.getElementById('edit_client_package').value = cfg.package || 'performance';

    document.getElementById('editClientModal').style.display = 'block';
};

async function saveEditClient(e) {
    e.preventDefault();
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem editar clientes.', 'danger');
        return;
    }
    const index = parseInt(document.getElementById('edit_client_index').value);
    const user = EFO_Users[index];
    if (!user) return;

    const name     = document.getElementById('edit_client_name').value.trim();
    const email    = document.getElementById('edit_client_email').value.trim();
    const newPass  = document.getElementById('edit_client_password').value;
    const cnpj     = document.getElementById('edit_client_cnpj').value.trim();
    const cnae     = document.getElementById('edit_client_cnae').value.trim();
    const regime   = document.getElementById('edit_client_regime').value;
    const packageVal = document.getElementById('edit_client_package').value;

    // Determine activity from CNAE
    let activity = 'Serviço';
    if (cnae.startsWith('45') || cnae.startsWith('46') || cnae.startsWith('47')) activity = 'Comércio';
    else if (cnae.startsWith('1') || cnae.startsWith('2') || cnae.startsWith('3')) activity = 'Indústria';

    // Update user record
    EFO_Users[index].name  = name;
    EFO_Users[index].email = email;
    if (newPass) {
        EFO_Users[index].password = await hashPassword(email, newPass);
    }
    localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));

    // Update company config
    const company = EFO_Companies[user.companyId];
    if (company) {
        company.name = name;
        company.config = { ...company.config, cnpj, cnae_principal: cnae, regime_tributario: regime, tipo_atividade: activity, package: packageVal };
        EFO_Companies[user.companyId] = company;
        localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
        db_upsertCompany(company).catch(() => {});
    }

    // Sync updated user to Supabase
    db_upsertUser(EFO_Users[index]).catch(() => {});

    document.getElementById('editClientModal').style.display = 'none';
    showToast('Salvo', `Dados de ${name} atualizados com sucesso.`, 'success');
    renderClientsTable();
    renderCompanySelect();
}



// Async login: tries Supabase first, falls back to in-memory EFO_Users
async function handleLogin(e) {
    e.preventDefault();
    try {
        const email = document.getElementById('loginEmail').value.trim();
        const pass  = document.getElementById('loginPassword').value;

        // Hash user password input using standard salting
        const passHash = await hashPassword(email, pass);

        // 1. Try Supabase (authoritative)
        let user = await db_loginUser(email, passHash);

        // 2. Fallback: check in-memory / localStorage users
        if (!user) {
            user = EFO_Users.find(u => {
                if (u.email.toLowerCase().trim() !== email.toLowerCase().trim()) return false;
                // Support both secure hash and legacy plain text for offline mode
                return u.password === passHash || u.password === pass;
            }) || null;

            // Auto-upgrade plain text cached credentials
            if (user && user.password === pass) {
                user.password = passHash;
                localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
                db_upsertUser(user).catch(() => {});
            }
        }

        if (user) {
            // LGPD Session hygiene: Remove password field from active session
            EFO_Session = { ...user };
            delete EFO_Session.password;
            sessionStorage.setItem('EFO_Session', JSON.stringify(EFO_Session));
            
            // Cache the hash temporarily in sessionStorage for DB integration headers injection
            sessionStorage.setItem('EFO_Session_Password_Hash', passHash);

            if (user.role === 'admin') {
                if (!EFO_Active_Company_Id && Object.keys(EFO_Companies).length > 0) {
                    EFO_Active_Company_Id = Object.keys(EFO_Companies)[0];
                    localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
                }
            }

            // Set client headers in database connector
            db_updateClientHeaders(user.email, passHash);

            // After successful Supabase login, refresh all data from cloud
            if (DB_ONLINE) {
                await db_bootstrap();
                // Re-apply UI after bootstrap so session data (companyId etc) is fully synced
                applyRoleUI();
            }

            loadActiveCompanyData();
            applyRoleUI();
            updateAllViews();
            renderParametros();
            showToast('Login Efetuado', `Bem-vindo, ${user.name}!`, 'success');
        } else {
            showToast('Erro de Acesso', 'E-mail ou senha incorretos.', 'danger');
        }
    } catch (err) {
        console.error('[EFO Login Error]', err);
        showToast('Erro no Acesso', 'Falha ao processar login: ' + err.message, 'danger');
    }
}

function handleLogout() {
    EFO_Session = null;
    sessionStorage.removeItem('EFO_Session');
    sessionStorage.removeItem('EFO_Session_Password_Hash');
    
    // LGPD Security: Clear local caches on disconnect to prevent data leaks on shared devices
    localStorage.removeItem('EFO_Companies');
    localStorage.removeItem('EFO_Users');
    localStorage.removeItem('OFX_Raw_Import_V2');
    localStorage.removeItem('EFO_Active_Company_Id');
    
    history.replaceState(null, null, ' ');
    
    EFO_Parametros = DEFAULT_PARAMETROS;
    Config_Empresa = DEFAULT_EMPRESA;
    EFO_Lancamentos = JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
    OFX_Raw_Import = [];
    
    // Clear credentials headers in DB layer
    db_updateClientHeaders('', '');
    
    applyRoleUI();
    showToast('Logout', 'Sua sessão foi encerrada.', 'success');
}

async function handleCreateClient(e) {
    e.preventDefault();
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem criar clientes.', 'danger');
        return;
    }
    const name = document.getElementById('client_name').value.trim();
    const email = document.getElementById('client_email').value.trim();
    const password = document.getElementById('client_password').value;
    const cnpj = document.getElementById('client_cnpj').value.trim();
    const cnae = document.getElementById('client_cnae').value.trim();
    const regime = document.getElementById('client_regime').value;
    const packageVal = document.getElementById('client_package').value;
    
    if (EFO_Users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        showToast('Erro', 'Este e-mail de acesso já está cadastrado.', 'danger');
        return;
    }
    
    const compId = 'comp_' + Math.random().toString(36).substring(2, 9);
    
    let activity = 'Serviço';
    if(cnae.startsWith('62') || cnae.startsWith('63') || cnae.startsWith('69')) activity = 'Serviço';
    else if(cnae.startsWith('45') || cnae.startsWith('46') || cnae.startsWith('47')) activity = 'Comércio';
    else if(cnae.startsWith('1') || cnae.startsWith('2') || cnae.startsWith('3')) activity = 'Indústria';
    
    const newCompany = {
        id: compId,
        name: name,
        config: {
            cnpj: cnpj,
            cnae_principal: cnae,
            regime_tributario: regime,
            tipo_atividade: activity,
            package: packageVal
        },
        parametros: JSON.parse(JSON.stringify(DEFAULT_PARAMETROS)),
        lancamentos: JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS)),
        ofx: []
    };
    
    EFO_Companies[compId] = newCompany;
    localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
    
    // Hash password before saving
    const passHash = await hashPassword(email, password);
    const newUser = {
        name: name,
        email: email,
        password: passHash,
        role: 'client',
        companyId: compId
    };
    
    EFO_Users.push(newUser);
    localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));

    // Sync new company + user to Supabase in background
    db_upsertCompany(newCompany).catch(() => {});
    db_upsertUser(newUser).catch(() => {});
    
    document.getElementById('formClient').reset();
    document.getElementById('clientModal').style.display = 'none';
    
    showToast('Sucesso', `Cliente ${name} e sua empresa foram cadastrados.`, 'success');
    
    renderClientsTable();
    renderCompanySelect();
}

// ──────────────────────────────────────────────────────────────
//  CLOUD STATUS HELPERS
// ──────────────────────────────────────────────────────────────

function updateCloudStatus(state) {
    const dot  = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    if (!dot || !text) return;
    const map = {
        checking: { color: '#f59e0b', label: 'Verificando nuvem...' },
        online:   { color: '#10b981', label: '✓ Nuvem conectada (Supabase)' },
        offline:  { color: '#ef4444', label: '✗ Sem nuvem — modo local' },
        syncing:  { color: '#6366f1', label: '↻ Sincronizando...' }
    };
    const s = map[state] || map.offline;
    dot.style.background  = s.color;
    text.textContent      = s.label;
}

async function runMigration() {
    if (!EFO_Session || EFO_Session.role !== 'admin') {
        showToast('Erro', 'Apenas administradores podem iniciar a migração de dados.', 'danger');
        return;
    }
    const progress = document.getElementById('migrateProgress');
    const bar      = document.getElementById('migrateProgressBar');
    const txt      = document.getElementById('migrateProgressText');
    const btns     = document.getElementById('migrateBtns');

    progress.style.display = 'block';
    btns.style.display     = 'none';
    updateCloudStatus('syncing');

    try {
        const done = await db_migrateLocalStorageToSupabase((current, total, label) => {
            const pct = Math.round((current / total) * 100);
            bar.style.width    = pct + '%';
            txt.textContent    = `${label} (${current}/${total})`;
        });

        bar.style.width  = '100%';
        txt.textContent  = `✓ Migração concluída — ${done} registros enviados para o Supabase.`;
        updateCloudStatus('online');
        showToast('Migração Concluída', `${done} registros enviados para a nuvem.`, 'success');

        setTimeout(() => {
            document.getElementById('migrateModal').style.display = 'none';
            progress.style.display = 'none';
            bar.style.width        = '0%';
            btns.style.display     = 'flex';
        }, 3000);

    } catch (err) {
        txt.textContent = '✗ Erro durante a migração: ' + err.message;
        updateCloudStatus('offline');
        btns.style.display = 'flex';
    }
}

function renderManualConciliationTable() {
    const tbody = document.getElementById('manualConciliationTbody');
    const badge = document.getElementById('manualPendingCount');
    const navBadge = document.getElementById('navManualPendingCount');
    if (!tbody || !badge || !navBadge) return;
    
    tbody.innerHTML = '';
    
    const manualPendentes = OFX_Raw_Import.filter(t => (t.status === 'Pendente' || t.status === 'Flagged') && t.transaction_id && t.transaction_id.startsWith('manual_'));
    
    badge.textContent = `${manualPendentes.length} Pendentes`;
    navBadge.textContent = manualPendentes.length;
    if (manualPendentes.length > 0) {
        navBadge.style.display = 'inline-block';
    } else {
        navBadge.style.display = 'none';
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">Nenhuma transação manual pendente no momento.</td></tr>`;
        return;
    }
    
    const optgroups = getOptGroupsHTML();
    
    manualPendentes.forEach(txn => {
        const tr = document.createElement('tr');
        if (txn.status === 'Flagged') tr.classList.add('row-flagged');
        const formattedDate = txn.date ? txn.date.substring(0, 10) : '';
        
        let statusHtml = txn.status === 'Flagged' ? `<span class="status-badge flagged">⚠️ Conformidade</span>` : `<span class="status-badge pendente">Pendente</span>`;
        
        tr.innerHTML = `
            <td>
                <input type="date" id="date_${txn.transaction_id}" value="${formattedDate}" 
                       style="background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-primary); padding: 6px; font-size: 12px; width: 120px;">
            </td>
            <td class="desc-cell"><strong>${txn.description}</strong></td>
            <td style="color: ${txn.amount > 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(txn.amount)}</td>
            <td>${statusHtml}</td>
            <td style="display: flex; gap: 8px;">
                <select class="efo-select" id="sel_${txn.transaction_id}">${optgroups}</select>
                <button class="action-btn" onclick="applyManualCategorization('${txn.transaction_id}')">Aprovar</button>
            </td>
        `;
        tbody.appendChild(tr);
        
        if (txn.assigned_account) {
            const selectEl = document.getElementById(`sel_${txn.transaction_id}`);
            if (selectEl) {
                selectEl.value = txn.assigned_account;
            }
        }
    });
}

// ──────────────────────────────────────────────────────────────
//  EFO DRIVE (CLIENT & ADMIN FILE SHARING)
// ──────────────────────────────────────────────────────────────

let clientSelectedFiles = [];
let EFO_Loaded_Files = [];

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

window.initClientFilesView = function() {
    clientSelectedFiles = [];
    const selectedSection = document.getElementById('clientSelectedFilesSection');
    if (selectedSection) selectedSection.style.display = 'none';
    const selectedList = document.getElementById('clientSelectedFilesList');
    if (selectedList) selectedList.innerHTML = '';
    
    // Fill Month Select
    const select = document.getElementById('clientFileMonthSelect');
    if (select) {
        select.innerHTML = '';
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const year = EFO_Active_DRE_Year;
        months.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = `${m} de ${year}`;
            opt.textContent = `${m} de ${year}`;
            select.appendChild(opt);
        });
        
        // Auto-select current month if available
        const currentMonthName = months[new Date().getMonth()];
        select.value = `${currentMonthName} de ${year}`;
        
        select.onchange = () => {
            renderClientUploadedFiles();
        };
    }
    
    // Setup Dropzone
    const dropzone = document.getElementById('clientFileDropzone');
    const fileInput = document.getElementById('clientFileInput');
    
    if (dropzone && fileInput) {
        // Drag over
        dropzone.ondragover = (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--accent-primary)';
            dropzone.style.background = 'rgba(255,255,255,0.06)';
        };
        
        // Drag leave
        dropzone.ondragleave = (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(255,255,255,0.2)';
            dropzone.style.background = 'rgba(255,255,255,0.02)';
        };
        
        // Drop
        dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(255,255,255,0.2)';
            dropzone.style.background = 'rgba(255,255,255,0.02)';
            handleSelectedFiles(e.dataTransfer.files);
        };
        
        // Click dropzone to open browser dialog
        dropzone.onclick = () => {
            fileInput.click();
        };
        
        fileInput.onchange = (e) => {
            handleSelectedFiles(e.target.files);
        };
    }
    
    const uploadBtn = document.getElementById('btnUploadClientFiles');
    if (uploadBtn) {
        uploadBtn.onclick = () => {
            uploadClientFiles();
        };
    }
    
    renderClientUploadedFiles();
};

function handleSelectedFiles(filesList) {
    if (!filesList || filesList.length === 0) return;
    
    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        
        // Limit file size to 10MB
        if (file.size > 10 * 1024 * 1024) {
            showToast('Erro', `O arquivo "${file.name}" ultrapassa o limite de 10MB.`, 'danger');
            continue;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target.result.split(',')[1];
            clientSelectedFiles.push({
                name: file.name,
                size: file.size,
                type: file.type || 'application/octet-stream',
                data: base64Data
            });
            renderSelectedFilesList();
        };
        reader.readAsDataURL(file);
    }
}

function renderSelectedFilesList() {
    const section = document.getElementById('clientSelectedFilesSection');
    const list = document.getElementById('clientSelectedFilesList');
    if (!section || !list) return;
    
    if (clientSelectedFiles.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    list.innerHTML = '';
    
    clientSelectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '8px 12px';
        item.style.background = 'rgba(255,255,255,0.03)';
        item.style.borderRadius = '6px';
        item.style.border = '1px solid rgba(255,255,255,0.05)';
        
        item.innerHTML = `
            <div>
                <span style="font-weight: 500; font-size: 13px;">${file.name}</span>
                <span style="color: var(--text-secondary); font-size: 11px; margin-left: 8px;">(${formatFileSize(file.size)})</span>
            </div>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="removeSelectedFile(${index})">Remover</button>
        `;
        list.appendChild(item);
    });
}

window.removeSelectedFile = (index) => {
    clientSelectedFiles.splice(index, 1);
    renderSelectedFilesList();
};

async function uploadClientFiles() {
    if (clientSelectedFiles.length === 0) return;
    if (!EFO_Session || !EFO_Session.companyId) {
        showToast('Erro', 'Sessão inválida ou sem empresa associada.', 'danger');
        return;
    }
    
    const company = EFO_Companies[EFO_Session.companyId] || { name: 'Cliente' };
    const clientName = company.name || EFO_Session.name || 'Cliente';
    const clientEmail = EFO_Session.email;
    const refMonth = document.getElementById('clientFileMonthSelect').value;
    
    // Naming folder: "Cliente [Nome do Cliente], [Mês] de [Ano]"
    const folderPath = `Cliente ${clientName}, ${refMonth}`;
    
    showToast('Aviso', `Iniciando upload de ${clientSelectedFiles.length} arquivos...`, 'info');
    
    let uploadedCount = 0;
    try {
        for (const file of clientSelectedFiles) {
            await db_uploadClientFile({
                companyId: EFO_Session.companyId,
                clientName: clientName,
                clientEmail: clientEmail,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: file.data,
                folderPath: folderPath,
                referenceMonth: refMonth
            });
            uploadedCount++;
        }
        
        showToast('Sucesso', `${uploadedCount} arquivos enviados com sucesso para a pasta "${folderPath}"!`, 'success');
        clientSelectedFiles = [];
        renderSelectedFilesList();
        renderClientUploadedFiles();
    } catch (e) {
        console.error(e);
        showToast('Erro', `Erro durante o upload. Enviados: ${uploadedCount}/${clientSelectedFiles.length}.`, 'danger');
    }
}

async function renderClientUploadedFiles() {
    const tbody = document.getElementById('clientUploadedFilesTbody');
    if (!tbody) return;
    
    const refMonth = document.getElementById('clientFileMonthSelect').value;
    if (!EFO_Session || !EFO_Session.companyId) return;
    
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Carregando arquivos...</td></tr>`;
    
    const files = await db_loadClientFiles(EFO_Session.companyId, refMonth);
    
    if (!files) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Erro ao carregar arquivos da nuvem.</td></tr>`;
        return;
    }
    
    EFO_Loaded_Files = files;
    
    if (files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Nenhum arquivo enviado para este mês.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    files.forEach(file => {
        const tr = document.createElement('tr');
        const uploadDate = new Date(file.createdAt).toLocaleString('pt-BR');
        
        tr.innerHTML = `
            <td><strong>${file.fileName}</strong></td>
            <td>${formatFileSize(file.fileSize)}</td>
            <td>${uploadDate}</td>
            <td style="text-align: center; display: flex; gap: 8px; justify-content: center;">
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="viewFilePreview('${file.id}')">Visualizar</button>
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="downloadFile('${file.id}')">Download</button>
                <button class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="deleteClientFile('${file.id}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteClientFile = async (fileId) => {
    if (!confirm('Deseja realmente excluir este arquivo da nuvem?')) return;
    try {
        await db_deleteClientFile(fileId);
        showToast('Sucesso', 'Arquivo excluído com sucesso.', 'success');
        renderClientUploadedFiles();
    } catch (e) {
        showToast('Erro', 'Falha ao excluir arquivo.', 'danger');
    }
};

window.initAdminFilesView = async function() {
    // Fill Month Select
    const select = document.getElementById('adminFileMonthSelect');
    if (select) {
        select.innerHTML = '';
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const year = EFO_Active_DRE_Year;
        months.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = `${m} de ${year}`;
            opt.textContent = `${m} de ${year}`;
            select.appendChild(opt);
        });
        
        const currentMonthName = months[new Date().getMonth()];
        select.value = `${currentMonthName} de ${year}`;
        
        select.onchange = () => {
            renderAdminUploadedFiles();
        };
    }
    
    renderAdminUploadedFiles();
};

window.renderAdminUploadedFiles = async function() {
    const tbody = document.getElementById('adminUploadedFilesTbody');
    if (!tbody) return;
    
    const refMonth = document.getElementById('adminFileMonthSelect').value;
    const activeCompanyId = EFO_Active_Company_Id;
    
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Carregando arquivos...</td></tr>`;
    
    if (!activeCompanyId) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Selecione uma Empresa Ativa no menu lateral.</td></tr>`;
        return;
    }
    
    const files = await db_loadClientFiles(activeCompanyId, refMonth);
    
    if (!files) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Nenhum arquivo encontrado ou erro na nuvem.</td></tr>`;
        return;
    }
    
    EFO_Loaded_Files = files;
    
    if (files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Nenhum arquivo carregado no mês selecionado.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    files.forEach(file => {
        const tr = document.createElement('tr');
        const uploadDate = new Date(file.createdAt).toLocaleString('pt-BR');
        
        tr.innerHTML = `
            <td><strong>${file.clientName}</strong></td>
            <td><code>${file.folderPath}</code></td>
            <td><strong>${file.fileName}</strong></td>
            <td>${formatFileSize(file.fileSize)}</td>
            <td>${uploadDate}</td>
            <td style="text-align: center; display: flex; gap: 8px; justify-content: center;">
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="viewFilePreview('${file.id}')">Visualizar</button>
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="downloadFile('${file.id}')">Download</button>
                <button class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px; margin-bottom: 0;" onclick="deleteAdminFile('${file.id}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.deleteAdminFile = async (fileId) => {
    if (!confirm('Deseja realmente excluir este arquivo da nuvem?')) return;
    try {
        await db_deleteClientFile(fileId);
        showToast('Sucesso', 'Arquivo excluído com sucesso.', 'success');
        renderAdminUploadedFiles();
    } catch (e) {
        showToast('Erro', 'Falha ao excluir arquivo.', 'danger');
    }
};

window.downloadFile = (fileId) => {
    const file = EFO_Loaded_Files.find(f => f.id === fileId);
    if (!file) {
        showToast('Erro', 'Arquivo não encontrado.', 'danger');
        return;
    }
    
    try {
        const byteCharacters = atob(file.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: file.fileType });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        showToast('Erro', 'Falha ao baixar arquivo.', 'danger');
    }
};

window.viewFilePreview = (fileId) => {
    const file = EFO_Loaded_Files.find(f => f.id === fileId);
    if (!file) {
        showToast('Erro', 'Arquivo não encontrado.', 'danger');
        return;
    }
    
    const titleEl = document.getElementById('filePreviewTitle');
    const bodyEl = document.getElementById('filePreviewBody');
    const modal = document.getElementById('filePreviewModal');
    
    if (!titleEl || !bodyEl || !modal) return;
    
    titleEl.textContent = `Visualizar: ${file.fileName}`;
    bodyEl.innerHTML = '';
    
    const type = file.fileType ? file.fileType.toLowerCase() : '';
    const name = file.fileName.toLowerCase();
    
    if (type.startsWith('image/')) {
        bodyEl.style.alignItems = 'center';
        bodyEl.style.justifyContent = 'center';
        const img = document.createElement('img');
        img.src = `data:${file.fileType};base64,${file.fileData}`;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '8px';
        bodyEl.appendChild(img);
    } 
    else if (type === 'application/pdf') {
        bodyEl.style.alignItems = 'stretch';
        bodyEl.style.justifyContent = 'stretch';
        const iframe = document.createElement('iframe');
        iframe.src = `data:${file.fileType};base64,${file.fileData}`;
        iframe.style.width = '100%';
        iframe.style.height = 'calc(94vh - 120px)';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        bodyEl.appendChild(iframe);
    } 
    else if (
        type.includes('text/') || 
        name.endsWith('.ofx') || 
        name.endsWith('.json') || 
        name.endsWith('.txt') || 
        name.endsWith('.csv')
    ) {
        bodyEl.style.alignItems = 'stretch';
        bodyEl.style.justifyContent = 'flex-start';
        try {
            const textContent = atob(file.fileData);
            const pre = document.createElement('pre');
            pre.textContent = textContent;
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.fontFamily = 'monospace';
            pre.style.color = 'var(--text-primary)';
            pre.style.width = '100%';
            pre.style.textAlign = 'left';
            pre.style.fontSize = '12px';
            pre.style.margin = '0';
            bodyEl.appendChild(pre);
        } catch (e) {
            bodyEl.innerHTML = `<p class="text-muted">Não foi possível decodificar o arquivo como texto.</p>`;
        }
    } 
    else {
        bodyEl.innerHTML = `
            <div class="text-center p-4">
                <div style="font-size: 48px; margin-bottom: 15px;">📦</div>
                <p style="color: var(--text-primary); font-weight: 500;">Visualização indisponível para este formato de arquivo (${file.fileType || 'Desconhecido'}).</p>
                <button class="btn-primary mt-2" onclick="downloadFile('${file.id}')">📥 Baixar Arquivo</button>
            </div>
        `;
    }
    
    modal.style.display = 'flex';
};

window.addEventListener('click', (e) => {
    const previewModal = document.getElementById('filePreviewModal');
    if (e.target === previewModal) {
        previewModal.style.display = 'none';
    }
});

// =============================================================
//  LIA — IA ASSISTENTE DE SUPORTE E SUCESSO
// =============================================================

let recognition = null;
let isRecording = false;

window.toggleLiaWidget = function() {
    const widget = document.getElementById('liaFloatingWidget');
    if (!widget) return;
    if (widget.style.display === 'none' || !widget.style.display) {
        widget.style.display = 'flex';
        const input = document.getElementById('liaChatInput');
        if (input) input.focus();
    } else {
        widget.style.display = 'none';
        if (isRecording && recognition) {
            recognition.stop();
        }
    }
};

window.toggleLiaVoice = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Suporte de Áudio', 'Seu navegador não suporta reconhecimento de fala nativo. Use o Google Chrome ou Edge!', 'warning');
        return;
    }

    const micBtn = document.getElementById('btnLiaVoice');
    if (!micBtn) return;

    if (!recognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isRecording = true;
            micBtn.innerHTML = '🛑';
            micBtn.style.background = 'var(--danger)';
            micBtn.style.color = '#ffffff';
            micBtn.title = 'Parar gravação';
            showToast('Microfone Ativo', 'Pode falar, estou te ouvindo...', 'info');
        };

        recognition.onresult = (event) => {
            const speechToText = event.results[0][0].transcript;
            const input = document.getElementById('liaChatInput');
            if (input) {
                input.value = speechToText;
                window.sendLiaMessage();
            }
        };

        recognition.onerror = (event) => {
            console.error('[Lia Voice Error]', event.error);
            showToast('Erro de Áudio', 'Não consegui entender a fala. Tente novamente!', 'error');
            stopRecordingState();
        };

        recognition.onend = () => {
            stopRecordingState();
        };
    }

    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }

    function stopRecordingState() {
        isRecording = false;
        micBtn.innerHTML = '🎙️';
        micBtn.style.background = 'rgba(99,102,241,0.05)';
        micBtn.style.color = '';
        micBtn.title = 'Falar por áudio';
    }
};

function getLiaFinancialSummary(monthIdx = null) {
    // Dynamically calculate DRE data for the active year
    const d = calculateDREData(EFO_Active_DRE_Year);
    if (!d) return null;
    
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const getValue = (keys) => {
        let total = 0;
        keys.forEach(k => {
            if (d[k]) {
                if (monthIdx !== null && monthIdx >= 0 && monthIdx < 12) {
                    total += d[k][monthIdx] || 0;
                } else {
                    total += sum(d[k]);
                }
            }
        });
        return total;
    };
    
    const rBruta = getValue(['dre.receita_bruta.produtos', 'dre.receita_bruta.servicos', 'dre.receita_bruta.outras']);
    const deducoes = getValue(['dre.deducoes.impostos', 'dre.deducoes.devolucoes', 'dre.deducoes.descontos']);
    const custos = getValue(['dre.custos.mercadorias', 'dre.custos.producao', 'dre.custos.servicos', 'dre.custos.operacionais']);
    
    const despesas = getValue([
        'dre.despesas_comercial.marketing', 'dre.despesas_comercial.trafego', 'dre.despesas_comercial.comissao', 'dre.despesas_comercial.viagens', 'dre.despesas_comercial.transporte_logistica', 'dre.despesas_comercial.outras',
        'dre.despesas_administrativas.pro_labore', 'dre.despesas_administrativas.salarios', 'dre.despesas_administrativas.encargos', 'dre.despesas_administrativas.aluguel', 'dre.despesas_administrativas.outras',
        'dre.despesas_pessoal.salarios', 'dre.despesas_pessoal.inss', 'dre.despesas_pessoal.fgts', 'dre.despesas_pessoal.beneficios', 'dre.despesas_pessoal.rescisoes',
        'dre.despesas_estrutura.manutencao', 'dre.despesas_estrutura.reparos', 'dre.despesas_estrutura.limpeza',
        'dre.despesas_veiculos.combustivel', 'dre.despesas_veiculos.manutencao', 'dre.despesas_veiculos.seguro', 'dre.despesas_veiculos.ipva',
        'dre.despesas_financeiras.tarifas', 'dre.despesas_financeiras.juros', 'dre.despesas_financeiras.iof'
    ]);
    
    const rFin = getValue(['dre.receitas_financeiras.rendimentos', 'dre.receitas_financeiras.juros_recebidos']);
    const rLiq = rBruta - deducoes;
    const lBruto = rLiq - custos;
    const lucroLiquido = lBruto - despesas + rFin;
    
    return {
        year: EFO_Active_DRE_Year,
        monthIdx: monthIdx,
        receitaBruta: rBruta,
        deducoes: deducoes,
        receitaLiquida: rLiq,
        custos: custos,
        lucroBruto: lBruto,
        despesas: despesas,
        receitasFinanceiras: rFin,
        lucroLiquido: lucroLiquido
    };
}

window.sendLiaQuickMessage = function(text) {
    const input = document.getElementById('liaChatInput');
    if (input) {
        input.value = text;
        window.sendLiaMessage();
    }
};

window.handleLiaKeyPress = function(e) {
    if (e.key === 'Enter') {
        window.sendLiaMessage();
    }
};

window.sendLiaMessage = function() {
    const input = document.getElementById('liaChatInput');
    const container = document.getElementById('liaChatMessages');
    if (!input || !container) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    // Add user message
    const userMsgHTML = `
        <div style="display: flex; gap: 12px; max-width: 85%; align-self: flex-end; justify-content: flex-end;">
            <div style="background: var(--accent-primary); border: 1px solid rgba(255,255,255,0.1); padding: 12px 16px; border-radius: 16px 16px 4px 16px; color: #ffffff; font-size: 14px; line-height: 1.5;">
                ${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
            </div>
            <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; font-weight: bold; color: var(--text-primary);">
                👤
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', userMsgHTML);
    input.value = '';
    container.scrollTop = container.scrollHeight;
    
    // Add typing indicator
    const typingId = 'lia-typing-indicator';
    const typingHTML = `
        <div id="${typingId}" style="display: flex; gap: 12px; max-width: 85%; align-self: flex-start;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #818cf8, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(99,102,241,0.3);">
                👩
            </div>
            <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); padding: 12px 16px; border-radius: 4px 16px 16px 16px; color: var(--text-secondary); font-size: 14px; font-style: italic; display: flex; align-items: center; gap: 6px;">
                Lia está digitando
                <span class="typing-dots" style="display: inline-flex; gap: 3px;">
                    <span style="width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary); animation: blink 1.4s infinite both;"></span>
                    <span style="width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary); animation: blink 1.4s infinite both 0.2s;"></span>
                    <span style="width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary); animation: blink 1.4s infinite both 0.4s;"></span>
                </span>
            </div>
        </div>
        <style>
            @keyframes blink {
                0% { opacity: .2; }
                20% { opacity: 1; }
                100% { opacity: .2; }
            }
        </style>
    `;
    container.insertAdjacentHTML('beforeend', typingHTML);
    container.scrollTop = container.scrollHeight;
    
    // Simulate typing delay
    const delay = 800 + Math.random() * 800;
    setTimeout(async () => {
        // Remove typing indicator
        const indicator = document.getElementById(typingId);
        if (indicator) indicator.remove();
        
        // Generate and render reply
        const reply = await generateLiaResponse(text);
        const botMsgHTML = `
            <div style="display: flex; gap: 12px; max-width: 85%; align-self: flex-start;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #818cf8, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(99,102,241,0.3);">
                    👩
                </div>
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); padding: 16px; border-radius: 4px 16px 16px 16px; color: var(--text-primary); font-size: 14px; line-height: 1.6; white-space: pre-line;">
                    ${reply}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', botMsgHTML);
        container.scrollTop = container.scrollHeight;
    }, delay);
};

async function analyzeLiaProfitDrop() {
    const d = calculateDREData(EFO_Active_DRE_Year);
    if (!d) return null;
    
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    
    // Arrays month-by-month
    const rBruta = new Array(12).fill(0);
    const deducoes = new Array(12).fill(0);
    const custos = new Array(12).fill(0);
    const despesas = new Array(12).fill(0);
    const rFin = new Array(12).fill(0);
    const lucroLiquido = new Array(12).fill(0);
    
    const rBrutaKeys = ['dre.receita_bruta.produtos', 'dre.receita_bruta.servicos', 'dre.receita_bruta.outras'];
    const deducoesKeys = ['dre.deducoes.impostos', 'dre.deducoes.devolucoes', 'dre.deducoes.descontos'];
    const custosKeys = ['dre.custos.mercadorias', 'dre.custos.producao', 'dre.custos.servicos', 'dre.custos.operacionais'];
    const despesasKeys = [
        'dre.despesas_comercial.marketing', 'dre.despesas_comercial.trafego', 'dre.despesas_comercial.comissao', 'dre.despesas_comercial.viagens', 'dre.despesas_comercial.transporte_logistica', 'dre.despesas_comercial.outras',
        'dre.despesas_administrativas.pro_labore', 'dre.despesas_administrativas.salarios', 'dre.despesas_administrativas.encargos', 'dre.despesas_administrativas.aluguel', 'dre.despesas_administrativas.outras',
        'dre.despesas_pessoal.salarios', 'dre.despesas_pessoal.inss', 'dre.despesas_pessoal.fgts', 'dre.despesas_pessoal.beneficios', 'dre.despesas_pessoal.rescisoes',
        'dre.despesas_estrutura.manutencao', 'dre.despesas_estrutura.reparos', 'dre.despesas_estrutura.limpeza',
        'dre.despesas_veiculos.combustivel', 'dre.despesas_veiculos.manutencao', 'dre.despesas_veiculos.seguro', 'dre.despesas_veiculos.ipva',
        'dre.despesas_financeiras.tarifas', 'dre.despesas_financeiras.juros', 'dre.despesas_financeiras.iof'
    ];
    
    for (let m = 0; m < 12; m++) {
        let rb = 0, ded = 0, cst = 0, desp = 0, rf = 0;
        rBrutaKeys.forEach(k => rb += d[k] ? d[k][m] : 0);
        deducoesKeys.forEach(k => ded += d[k] ? d[k][m] : 0);
        custosKeys.forEach(k => cst += d[k] ? d[k][m] : 0);
        despesasKeys.forEach(k => desp += d[k] ? d[k][m] : 0);
        ['dre.receitas_financeiras.rendimentos', 'dre.receitas_financeiras.juros_recebidos'].forEach(k => rf += d[k] ? d[k][m] : 0);
        
        rBruta[m] = rb;
        deducoes[m] = ded;
        custos[m] = cst;
        despesas[m] = desp;
        rFin[m] = rf;
        lucroLiquido[m] = (rb - ded) - cst - desp + rf;
    }
    
    // Find biggest MoM drop
    let biggestDropIdx = -1;
    let biggestDropVal = 0;
    
    for (let m = 1; m < 12; m++) {
        if (rBruta[m-1] === 0 && rBruta[m] === 0) continue;
        
        const diff = lucroLiquido[m-1] - lucroLiquido[m];
        if (diff > biggestDropVal) {
            biggestDropVal = diff;
            biggestDropIdx = m;
        }
    }
    
    if (biggestDropIdx === -1 || biggestDropVal <= 0.01) {
        return `Analisando seu Painel de Resultados (${EFO_Active_DRE_Year}), não identifiquei nenhuma queda expressiva de lucro de um mês para o outro! Aparentemente, seu resultado líquido está estável ou em crescimento no período analisado. 🎉`;
    }
    
    const m = biggestDropIdx;
    const prevMonthName = months[m-1];
    const currMonthName = months[m];
    const prevProfit = lucroLiquido[m-1];
    const currProfit = lucroLiquido[m];
    
    const rbDiff = rBruta[m] - rBruta[m-1];
    const custosDiff = custos[m] - custos[m-1];
    const despesasDiff = despesas[m] - despesas[m-1];
    
    const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    
    let analysisText = `Identifiquei que no ano de **${EFO_Active_DRE_Year}**, o mês com a maior queda de lucro foi **${currMonthName}** (em comparação a **${prevMonthName}**). 
    
    O seu Lucro Líquido caiu de **${fmt(prevProfit)}** para **${fmt(currProfit)}** (uma redução de **${fmt(biggestDropVal)}**).
    
    Deixa eu te explicar onde ocorreu a diferença:
    `;
    
    if (rbDiff < 0) {
        analysisText += `- 📉 **Queda de Faturamento:** Suas receitas brutas caíram em **${fmt(Math.abs(rbDiff))}** no período. Isso reduziu o fôlego de entrada da empresa.
        `;
    } else if (rbDiff > 0) {
        analysisText += `- 📈 **Alta de Faturamento:** Suas receitas brutas subiram em **${fmt(rbDiff)}**, o que significa que o problema não foi venda.
        `;
    }
    
    if (custosDiff > 0) {
        analysisText += `- 🛠️ **Aumento de Custos:** Seus custos diretos (CMV/serviços) subiram em **${fmt(custosDiff)}**. Talvez custos com fornecedores ou CMV tenham pressionado o lucro.
        `;
    } else if (custosDiff < 0) {
        analysisText += `- ✂️ **Redução de Custos:** Seus custos diretos caíram em **${fmt(Math.abs(custosDiff))}**, ajudando a amortecer a queda.
        `;
    }
    
    if (despesasDiff > 0) {
        analysisText += `- 🏢 **Aumento de Despesas:** Suas despesas operacionais (pessoal, administrativas, marketing) subiram em **${fmt(despesasDiff)}** nesse mês.
        `;
    } else if (despesasDiff < 0) {
        analysisText += `- 📉 **Redução de Despesas:** Suas despesas operacionais caíram em **${fmt(Math.abs(despesasDiff))}**, o que foi positivo.
        `;
    }
    
    analysisText += `
    💡 **Dica da Lia:** Para reverter essa situação, que tal focarmos em renegociar despesas ou revisar a precificação no mês de **${currMonthName}**? Se quiser, podemos agendar um bate-papo de alinhamento com seu consultor para traçar uma meta de equilíbrio de gastos!`;
    
    return analysisText;
}

async function generateLiaResponse(input) {
    // Normalize input string (lowercase & remove accents/diacritics for robust matching)
    const query = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Safety check: absolute isolation & authenticated session validation
    if (!EFO_Session || !EFO_Session.companyId) {
        return `Olá! Por questões estritas de segurança, privacidade e isolamento de dados da Clarus Evolua, eu preciso que você esteja logado e autenticado para que eu possa exibir ou analisar qualquer informação financeira.
        
        Se você já realizou o login e esta mensagem persistir, por favor, entre em contato imediatamente com o suporte técnico para validarmos suas credenciais de segurança.`;
    }

    let userName = EFO_Session.name.split(' ')[0];
    if (userName === 'Usuário' || userName === 'Cliente' || userName === 'Usuario' || userName === 'teste' || userName === 'cliente') {
        userName = 'Saldanha';
    }
    const company = EFO_Companies[EFO_Session.companyId] || {};
    const pkg = company.config?.package || 'essential';
    const planName = pkg.charAt(0).toUpperCase() + pkg.slice(1);

    // 1. PROFIT DROP ANALYSIS
    if (query.includes('caiu') || query.includes('queda') || query.includes('reducao') || query.includes('diminuiu') || query.includes('menor lucro') || query.includes('perda de lucro')) {
        if (query.includes('lucro') || query.includes('resultado') || query.includes('margem') || query.includes('dinheiro')) {
            return await analyzeLiaProfitDrop();
        }
    }

    // 2. CONCILIATION & PENDING TRANSACTIONS
    if (query.includes('pendente') || query.includes('concilia') || query.includes('transacao') || query.includes('lancamento') || query.includes('travada') || query.includes('travado') || query.includes('pix')) {
        const pendentes = OFX_Raw_Import.filter(t => (t.status === 'Pendente' || t.status === 'Flagged') && (!t.transaction_id || !t.transaction_id.startsWith('manual_')));
        const manualPendentes = OFX_Raw_Import.filter(t => (t.status === 'Pendente' || t.status === 'Flagged') && t.transaction_id && t.transaction_id.startsWith('manual_'));
        const total = pendentes.length + manualPendentes.length;
        
        let reply = `Com certeza, **${userName}**! Olhei no sistema e verifiquei o status de classificação das suas transações:

`;
        if (total === 0) {
            reply += `🎉 **Excelente notícia!** Você não tem nenhuma transação pendente no momento. Suas conciliações bancárias e lançamentos manuais estão 100% em dia!`;
        } else {
            reply += `Temos atualmente **${total} transações pendentes** de classificação no seu painel:
- 💳 **Conciliação Bancária (OFX/Extrato):** **${pendentes.length}** transações de extrato aguardando classificação.
- ✍️ **Conciliação Manual:** **${manualPendentes.length}** lançamentos manuais pendentes de ajuste.

Para regularizar, basta acessar as abas **Conciliação Bancária** ou **Conciliação Manual** no menu lateral e apontar a categoria correta para cada uma. Isso atualizará seus relatórios DRE e Balanço na mesma hora!`;
        }
        return reply;
    }

    // 3. EFO DRIVE & UPLOAD STATUS
    if (query.includes('drive') || query.includes('enviado') || query.includes('documento') || query.includes('comprovante') || query.includes('enviar') || query.includes('ofx') || query.includes('extrato') || query.includes('arquivo')) {
        const refMonth = document.getElementById('clientFileMonthSelect')?.value || (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
        const files = await db_loadClientFiles(EFO_Session.companyId, refMonth) || [];
        
        const [yearStr, monthStr] = refMonth.split('-');
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const refMonthFormatted = `${monthNames[parseInt(monthStr) - 1]} de ${yearStr}`;
        
        let reply = `Claro, **${userName}**! Dei uma olhadinha no seu **EFO Drive** para o mês de **${refMonthFormatted}**:

`;
        if (files.length === 0) {
            reply += `⚠️ **Ainda não recebemos documentos:** Notei que ainda não foi enviado nenhum extrato bancário (como arquivo \`.OFX\`) ou comprovante de despesa para este período. 

Para que nosso time possa validar suas contas e gerar o parecer estratégico com precisão, lembre-se de arrastar e soltar seus comprovantes na aba de **Envio de Documentos** no menu lateral.`;
        } else {
            const listStr = files.map(f => `- 📄 \`${f.fileName}\` (enviado em ${new Date(f.uploadedAt).toLocaleDateString('pt-BR')})`).join('\n');
            reply += `🎉 **Tudo certo!** Já identificamos **${files.length} arquivo(s)** enviados por você neste mês:

${listStr}

Caso tenha novos comprovantes, notas fiscais ou extratos adicionais, você pode enviá-los a qualquer momento pelo EFO Drive!`;
        }
        return reply;
    }

    // 4. FINANCIAL ANALYSIS (ACCENTS NORMALIZED & MONTH DETECTED)
    if (query.includes('financa') || query.includes('analis') || query.includes('como esta') || query.includes('meu negocio') || query.includes('saude') || query.includes('resultado') || query.includes('lucro')) {
        // Check if a specific month was requested
        const monthNamesList = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
        const monthNamesDisplay = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        
        let detectedMonthIdx = null;
        monthNamesList.forEach((mName, idx) => {
            if (query.includes(mName) || (mName === "marco" && query.includes("março"))) {
                detectedMonthIdx = idx;
            }
        });

        const summary = getLiaFinancialSummary(detectedMonthIdx);
        if (summary && summary.receitaBruta > 0) {
            const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
            const marginVal = ((summary.lucroLiquido / summary.receitaBruta) * 100).toFixed(1);
            const margin = marginVal + '%';
            
            const periodText = detectedMonthIdx !== null ? `mês de **${monthNamesDisplay[detectedMonthIdx]} de ${summary.year}**` : `ano de **${summary.year}**`;
            
            let msg = `Com certeza, **${userName}**! Olhando com muito carinho para o raio-x financeiro da sua empresa no ${periodText}, preparei essa análise simplificada pra você:

`;
            msg += `1. 📈 **O que entrou (Faturamento):** Você teve uma Receita Operacional Bruta de **${fmt(summary.receitaBruta)}**.
`;
            msg += `2. 💸 **Impostos e Deduções:** Tivemos **${fmt(summary.deducoes)}** em impostos e devoluções, gerando uma Receita Líquida de **${fmt(summary.receitaLiquida)}**.
`;
            msg += `3. 🛠️ **Custo de Operação:** Para rodar seus produtos ou serviços, foram investidos **${fmt(summary.custos)}** (CMV, fornecedores, etc.), gerando um Lucro Bruto de **${fmt(summary.lucroBruto)}**.
`;
            msg += `4. 🏢 **Despesas Administrativas e Comerciais:** As despesas administrativas, de pessoal e de vendas somaram **${fmt(summary.despesas)}**.

`;
            msg += `👉 **O resultado final (Lucro Real):** O seu **Resultado Líquido** foi de **${fmt(summary.lucroLiquido)}**, o que representa uma margem líquida real de **${margin}** sobre o seu faturamento bruto.

`;
            
            if (summary.lucroLiquido < 0) {
                msg += `⚠️ **Atenção carinhosa:** Como o resultado líquido está negativo no período, isso significa que a empresa operou no prejuízo. Vamos dar uma olhada juntos na lista de despesas operacionais ou nos custos diretos para ver onde podemos cortar desperdícios e trazer a empresa de volta para o azul?`;
            } else if (parseFloat(marginVal) < 10) {
                msg += `💡 **Dica da Lia:** A empresa está gerando lucro, mas a margem de lucro de **${margin}** está um pouquinho apertada (o ideal para a maioria dos setores gerenciais é ficar acima de 10% a 15%). Pode ser interessante analisar se as despesas comerciais ou taxas financeiras estão altas demais.`;
            } else {
                msg += `🎉 **Que excelente notícia!** Sua margem de lucro está em **${margin}** (excelente performance comercial e gerencial!). A operação da sua empresa está gerando um ótimo lucro líquido. Continue de olho na eficiência para manter esse crescimento sustentável!`;
            }
            return msg;
        } else {
            const periodError = detectedMonthIdx !== null ? `no mês de ${monthNamesDisplay[detectedMonthIdx]}` : `deste ano`;
            return `Oi, **${userName}**! Tentei rodar uma análise rápida das suas finanças ${periodError}, mas parece que ainda não temos transações classificadas ou dados suficientes no nosso Painel de Resultados.

Que tal subir um arquivo de extrato bancário \`.OFX\` no **EFO Drive** ou fazer algumas classificações na **Área de Transações** para eu poder analisar tudinho pra você?`;
        }
    }

    // 5. ONBOARDING
    if (query.includes('comecar') || query.includes('comeco') || query.includes('onboarding') || query.includes('como usar') || query.includes('primeiros passos') || query.includes('passo') || query.includes('inicio')) {
        return `Dar os primeiros passos no painel da **Clarus Evolua** é super simples, **${userName}**! O segredo é seguir esse fluxo natural:

1. 📂 **Alimente o Sistema:** Vá até o menu lateral e faça o upload dos seus arquivos de extrato bancário (formato \`.OFX\`) no **EFO Drive (Envio de Documentos)**. É o nosso cantinho seguro para guardar sua papelada financeira.
2. 🏷️ **Classifique suas Transações:** Na **Área de Transações (Conciliação Bancária)**, você verá todas as entradas e saídas que vieram do extrato. Basta clicar em cada uma e escolher a categoria correta (como "Vendas", "Aluguel", "Salários", etc.).
3. 📊 **Acompanhe o Resultado:** Pronto! Assim que classificar, o **Painel de Resultados (DRE)** e o **Balanço da Empresa** serão gerados automaticamente para você acompanhar os lucros mês a mês.

Se precisar de ajuda para classificar ou subir arquivos, é só me chamar! Quer tentar subir um arquivo OFX agora?`;
    }

    // 6. DRE & BALANÇO
    if (query.includes('dre') || query.includes('demonstrativo') || query.includes('resultado') || query.includes('lucro') || query.includes('balanco') || query.includes('ativo') || query.includes('passivo')) {
        return `Ah! O **Painel de Resultados (DRE)** e o **Balanço da Empresa** são as duas lentes mais importantes para enxergar seu negócio. Deixa eu te explicar a diferença sem nenhuma complicação técnica:

- 📈 **Painel de Resultados (DRE):** Funciona como o "filme" ou o raio-x da saúde financeira e do lucro da sua empresa em um período. Ele responde à pergunta: *"Eu ganhei ou perdi dinheiro este mês?"*, mostrando todas as suas receitas brutas, descontando impostos, custos, despesas, até chegar no Lucro Líquido Real.
- 📸 **Balanço da Empresa:** Funciona como uma "foto instantânea" do patrimônio da sua empresa hoje. Ele responde à pergunta: *"O que a empresa tem e o que ela deve?"*. Ele é dividido em **Ativos** (tudo o que é seu por direito: saldo em conta, estoque, máquinas) e **Passivos** (tudo o que você deve a terceiros: fornecedores, salários a pagar, empréstimos).

Ambos se complementam! O DRE te diz se a operação dá lucro, e o Balanço te mostra a solidez e a estrutura de capital acumulada. Ficou claro? 😊`;
    }

    // 7. INDICADORES EFO
    if (query.includes('indicador') || query.includes('indicadores') || query.includes('efo') || query.includes('metrica')) {
        return `Os **Indicadores EFO** são as nossas métricas exclusivas de eficiência! Elas mostram de forma bem visual se o seu negócio está navegando no caminho certo. 

Eles analisam:
- **Crescimento e Escala:** Se o seu faturamento comercial está subindo com saúde.
- **Eficiência de Margem:** O quanto de cada venda realmente vira caixa livre.
- **Retorno sobre Capital:** Se a sua empresa está gerando mais retorno do que outros investimentos de mercado.

Lembrando que o painel detalhado de Indicadores EFO e o Parecer do consultor estão disponíveis a partir do plano **Performance**. Se você estiver no plano Essential e quiser liberar esse acompanhamento avançado para impulsionar seu crescimento, basta falar comigo para providenciarmos seu upgrade!`;
    }

    // 8. PLANS & UPGRADE
    if (query.includes('plano') || query.includes('planos') || query.includes('preco') || query.includes('precos') || query.includes('upgrade') || query.includes('mensalidade') || query.includes('valores') || query.includes('essential') || query.includes('performance') || query.includes('executive')) {
        return `Com certeza, **${userName}**! Nós estruturamos nossos planos para apoiar cada momento da jornada da sua empresa. Veja qual faz mais sentido para você:

1. 🟢 **Essential (R$ 1.697/mês):** Acesso completo ao Painel de Resultados (DRE) Gerencial, Balanço Gerencial e importação de múltiplos arquivos OFX no EFO Drive. Perfeito para manter a base organizada!
2. 🔵 **Performance (R$ 2.997/mês):** Tudo do Essential + os Indicadores EFO de eficiência e crescimento + um Parecer Estratégico mensal escrito pelo seu consultor dedicado para te dar insights preciosos.
3. 🟣 **Executive (R$ 4.697/mês):** O pacote completo para acelerar o crescimento. Inclui tudo do Performance + o Alinhamento Estratégico Mensal (uma conversa ao vivo de 60 minutos com o seu consultor para traçar e revisar metas).

Atualmente o seu plano ativo é o **${planName}**. Se você sentir que precisa de encontros ao vivo com o nosso time, clique na aba **Upgrade de Plano** no menu lateral ou me peça por aqui que eu peço para um especialista do suporte entrar em contato com você via WhatsApp! Quer que eu peça?`;
    }

    // 9. DEFAULT FALLBACK
    return `Puxa, **${userName}**, entendi sua dúvida! 😊 Como eu sou uma assistente focada em te apoiar com o suporte, onboarding e sucesso do cliente, o meu papel é descomplicar conceitos financeiros e o funcionamento da nossa plataforma para você.

Você pode me perguntar algo como:
- *"Como começar a usar o painel da Clarus Evolua?"*
- *"O que é o DRE e o Balanço?"*
- *"Como estão as finanças da minha empresa este ano?"* (vou rodar um diagnóstico real dos seus dados!)
- *"Por que meu lucro caiu?"* (vou analisar seus custos e despesas MoM!)
- *"Quantas transações tenho pendentes?"* (vou puxar o status de conciliação bancária!)
- *"Quais são as diferenças e preços dos planos?"*

O que você prefere que a gente veja primeiro?`;
}
