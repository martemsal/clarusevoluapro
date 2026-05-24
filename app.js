// --- DATA SCHEMA ---
const DEFAULT_PARAMETROS = { impostos: 10, comissoes: 5, meta_lucro_desejada: 15 };
const DEFAULT_EMPRESA = { cnpj: "", cnae_principal: "", regime_tributario: "Simples Nacional", tipo_atividade: "Serviço" };

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

let EFO_Parametros = DEFAULT_PARAMETROS;
let Config_Empresa = DEFAULT_EMPRESA;
let EFO_Lancamentos = JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
let OFX_Raw_Import = [];
let EFO_Active_DRE_Year = new Date().getFullYear();
let EFO_Active_DRE_Divisor = 12;

function migrateAndInitializeData() {
    if (Object.keys(EFO_Companies).length === 0) {
        const legacyConfig = JSON.parse(localStorage.getItem('Config_Empresa')) || DEFAULT_EMPRESA;
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
    
    if (!EFO_Active_Company_Id && Object.keys(EFO_Companies).length > 0) {
        EFO_Active_Company_Id = Object.keys(EFO_Companies)[0];
        localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
    }

    if (EFO_Users.length === 0) {
        EFO_Users = [
            { email: 'admin@clarus.com.br', password: 'admin', role: 'admin', name: 'Administrador' },
            { email: 'cliente@clarus.com.br', password: '123', role: 'client', name: 'Cliente Teste', companyId: EFO_Active_Company_Id }
        ];
        localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
    }
}

function loadActiveCompanyData() {
    if (!EFO_Session) return;
    
    const compId = EFO_Session.role === 'admin' ? EFO_Active_Company_Id : EFO_Session.companyId;
    let company = EFO_Companies[compId];
    
    if (!company) {
        company = {
            id: compId,
            name: 'Nova Empresa',
            config: JSON.parse(JSON.stringify(DEFAULT_EMPRESA)),
            parametros: JSON.parse(JSON.stringify(DEFAULT_PARAMETROS)),
            lancamentos: JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS)),
            ofx: []
        };
        EFO_Companies[compId] = company;
        localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
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
    // Background sync to Supabase (non-blocking)
    db_syncActiveCompany().catch(e => console.warn('Supabase sync error:', e));
}

migrateAndInitializeData();
loadActiveCompanyData();

let gaugeChartInst = null;
let pieChartInst = null;
let currentDrillDownPath = null;
let currentDrillDownTitle = null;

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

    document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
    
    // Backup & Sync
    document.getElementById('btnExportBackup').addEventListener('click', exportToJSON);
    document.getElementById('btnImportBackup').addEventListener('click', triggerImportJSON);
    document.getElementById('importBackupFile').addEventListener('change', handleImportJSON);
    document.getElementById('btnShareLink').addEventListener('click', copyShareLink);
    
    // Reset Active Company Data
    document.getElementById('btnResetData').addEventListener('click', () => {
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
function initTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target).classList.add('active');
            
            let title = "Indicadores EFO";
            if (target === 'tab-dashboard') title = "Indicadores EFO";
            if (target === 'tab-dre') title = "Demonstrativo de Resultado (DRE)";
            if (target === 'tab-balanco') title = "Balanço Gerencial";
            if (target === 'tab-parecer') title = "Parecer Estratégico";
            if (target === 'tab-alinhamento') title = "Alinhamento Estratégico";
            if (target === 'tab-conciliation') title = "Conciliação Bancária";
            if (target === 'tab-clients') {
                title = "Clientes & Empresas";
                renderClientsTable();
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
window.openDrillDown = (categoryPath, title) => {
    currentDrillDownPath = categoryPath;
    currentDrillDownTitle = title;
    
    document.getElementById('drillDownTitle').textContent = `Detalhamento: ${title}`;
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
        return dateObj.getFullYear() === EFO_Active_DRE_Year;
    });
    
    if(relatedTxns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center">Nenhum lançamento vinculado via OFX para esta conta.</td></tr>`;
        return;
    }

    const optgroups = getOptGroupsHTML();

    relatedTxns.forEach(txn => {
        const tr = document.createElement('tr');
        const dateObj = new Date(txn.date);
        const dateStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td class="desc-cell"><strong>${txn.description}</strong></td>
            <td style="color: ${txn.amount > 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(txn.amount)}</td>
            <td>
                <select class="efo-select w-100" id="reclass_${txn.transaction_id}" onchange="reclassifyTransaction('${txn.transaction_id}')">
                    ${optgroups.replace(`value="${txn.assigned_account}"`, `value="${txn.assigned_account}" selected`)}
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.reclassifyTransaction = (fitid) => {
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
        <optgroup label="Contas de Balanço">
            <option value="balanco.ativo_circulante.caixa_bancos">Caixa/Banco (Aporte)</option>
            <option value="balanco.ativo_nao_circulante.imobilizado">Imobilizado (Máquinas/Veículos)</option>
            <option value="balanco.passivo_circulante.emprestimos_cp">Pagamento Empréstimo</option>
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
    html += indRow('Lucro Líquido', L_LIQ, false, 2, true);

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
    if (rowType === 'sub') rowClass = 'row-sub clickable-row';
    if (rowType === 'total') rowClass = 'row-total';
    if (isNegative && rowType === 'group') rowClass += ' text-danger';
    if (!isNegative && rowType === 'group' && label.includes('RECEITA')) rowClass += ' text-success';

    let html = `<tr class="${rowClass}" ${clickHandler}>`;
    html += `<td>${label}</td>`;

    // Months
    for (let i = 0; i < 12; i++) {
        let val = monthValues[i];
        html += `<td class="text-right">${val === 0 ? '-' : formatCurrency(val)}</td>`;
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
    html += `<td class="text-right" style="background: rgba(99, 102, 241, 0.08); font-weight: bold; color: var(--accent-primary);">${total === 0 ? '-' : formatCurrency(total)}</td>`;

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
    bodyHtml += makeDreRowHTML('(=) LUCRO LÍQUIDO', 'total', L_LIQUIDO, false, '', R_BRUTA);

    tbody.innerHTML = bodyHtml;
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

function renderConciliationTable() {
    const tbody = document.getElementById('conciliationTbody');
    const badge = document.getElementById('pendingCount');
    const navBadge = document.getElementById('navPendingCount');
    tbody.innerHTML = '';

    const pendentes = OFX_Raw_Import.filter(t => t.status === 'Pendente' || t.status === 'Flagged');
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
        let statusHtml = txn.status === 'Flagged' ? `<span class="status-badge flagged">⚠️ Conformidade</span>` : `<span class="status-badge pendente">Pendente</span>`;
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
    const navDashboardBtn = document.getElementById('navDashboardBtn');
    
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
    userProfileRole.textContent = EFO_Session.role === 'admin' ? 'Administrador' : 'Cliente';
    
    if (EFO_Session.role === 'admin') {
        adminCompanySelectorSection.style.display = 'block';
        navClientsBtn.style.display = 'block';
        navConciliationBtn.style.display = 'flex';
        if (importSection) importSection.style.display = 'block';
        if (sharingSection) sharingSection.style.display = 'block';
        
        btnEditParams.style.display = 'inline-block';
        btnConfigEmpresa.style.display = 'inline-block';
        btnResetData.style.display = 'block';
        
        navDashboardBtn.textContent = 'Indicadores EFO';
        renderCompanySelect();
    } else {
        adminCompanySelectorSection.style.display = 'none';
        navClientsBtn.style.display = 'none';
        navConciliationBtn.style.display = 'none';
        if (importSection) importSection.style.display = 'none';
        if (sharingSection) sharingSection.style.display = 'none';
        
        btnEditParams.style.display = 'none';
        btnConfigEmpresa.style.display = 'none';
        btnResetData.style.display = 'none';
        
        navDashboardBtn.textContent = 'Indicadores EFO';
        
        // If they are on a hidden tab, force select the dashboard
        const activeNav = document.querySelector('.nav-btn.active');
        if (activeNav && (activeNav.getAttribute('data-target') === 'tab-conciliation' || activeNav.getAttribute('data-target') === 'tab-clients')) {
            navDashboardBtn.click();
        }
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
            <td><code>${user.password}</code></td>
            <td>${company.config?.cnpj || '-'}</td>
            <td>${company.config?.cnae_principal || '-'}</td>
            <td><span class="badge" style="background: var(--accent-primary); color: white; font-size: 11px; padding: 4px 8px;">${company.config?.regime_tributario || '-'}</span></td>
            <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
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

    document.getElementById('editClientModal').style.display = 'block';
};

function saveEditClient(e) {
    e.preventDefault();
    const index = parseInt(document.getElementById('edit_client_index').value);
    const user = EFO_Users[index];
    if (!user) return;

    const name     = document.getElementById('edit_client_name').value.trim();
    const email    = document.getElementById('edit_client_email').value.trim();
    const newPass  = document.getElementById('edit_client_password').value;
    const cnpj     = document.getElementById('edit_client_cnpj').value.trim();
    const cnae     = document.getElementById('edit_client_cnae').value.trim();
    const regime   = document.getElementById('edit_client_regime').value;

    // Determine activity from CNAE
    let activity = 'Serviço';
    if (cnae.startsWith('45') || cnae.startsWith('46') || cnae.startsWith('47')) activity = 'Comércio';
    else if (cnae.startsWith('1') || cnae.startsWith('2') || cnae.startsWith('3')) activity = 'Indústria';

    // Update user record
    EFO_Users[index].name  = name;
    EFO_Users[index].email = email;
    if (newPass) EFO_Users[index].password = newPass;
    localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));

    // Update company config
    const company = EFO_Companies[user.companyId];
    if (company) {
        company.name = name;
        company.config = { ...company.config, cnpj, cnae_principal: cnae, regime_tributario: regime, tipo_atividade: activity };
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
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;

    // 1. Try Supabase (authoritative)
    let user = await db_loginUser(email, pass);

    // 2. Fallback: check in-memory / localStorage users
    if (!user) {
        user = EFO_Users.find(u => u.email === email && u.password === pass) || null;
    }

    if (user) {
        // After successful Supabase login, refresh all data from cloud
        if (DB_ONLINE) {
            await db_bootstrap();
        }

        EFO_Session = user;
        sessionStorage.setItem('EFO_Session', JSON.stringify(EFO_Session));

        if (user.role === 'admin') {
            if (!EFO_Active_Company_Id && Object.keys(EFO_Companies).length > 0) {
                EFO_Active_Company_Id = Object.keys(EFO_Companies)[0];
                localStorage.setItem('EFO_Active_Company_Id', EFO_Active_Company_Id);
            }
        }

        loadActiveCompanyData();
        applyRoleUI();
        updateAllViews();
        renderParametros();
        showToast('Login Efetuado', `Bem-vindo, ${user.name}!`, 'success');
    } else {
        showToast('Erro de Acesso', 'E-mail ou senha incorretos.', 'danger');
    }
}

function handleLogout() {
    EFO_Session = null;
    sessionStorage.removeItem('EFO_Session');
    history.replaceState(null, null, ' ');
    
    EFO_Parametros = DEFAULT_PARAMETROS;
    Config_Empresa = DEFAULT_EMPRESA;
    EFO_Lancamentos = JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
    OFX_Raw_Import = [];
    
    applyRoleUI();
    showToast('Logout', 'Sua sessão foi encerrada.', 'success');
}

function handleCreateClient(e) {
    e.preventDefault();
    const name = document.getElementById('client_name').value.trim();
    const email = document.getElementById('client_email').value.trim();
    const password = document.getElementById('client_password').value;
    const cnpj = document.getElementById('client_cnpj').value.trim();
    const cnae = document.getElementById('client_cnae').value.trim();
    const regime = document.getElementById('client_regime').value;
    
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
            tipo_atividade: activity
        },
        parametros: JSON.parse(JSON.stringify(DEFAULT_PARAMETROS)),
        lancamentos: JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS)),
        ofx: []
    };
    
    EFO_Companies[compId] = newCompany;
    localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
    
    const newUser = {
        name: name,
        email: email,
        password: password,
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
