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
    initCharts();
    renderParametros();
    
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

    // Apply active UI state
    applyRoleUI();
    
    if (EFO_Session) {
        updateAllViews();
    }
    
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
    
    const relatedTxns = OFX_Raw_Import.filter(t => t.status === 'Categorizado' && t.assigned_account === currentDrillDownPath);
    
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
    renderDashboard();
    renderDRE();
    renderBalanco();
    renderConciliationTable();
}

function renderDashboard() {
    const dre = EFO_Lancamentos.dre;
    
    const faturamento_bruto = sumObj(dre.receita_bruta);
    const custos_diretos = sumObj(dre.custos);
    const deducoes = sumObj(dre.deducoes);
    const receita_liquida = faturamento_bruto - deducoes;
    
    const desp_comerciais = sumObj(dre.despesas_comercial);
    const desp_admin = sumObj(dre.despesas_administrativas);
    const desp_pessoal = sumObj(dre.despesas_pessoal);
    const desp_estrutura = sumObj(dre.despesas_estrutura);
    const desp_veiculos = sumObj(dre.despesas_veiculos);
    
    const despesas_fixas = desp_admin + desp_pessoal + desp_estrutura + desp_veiculos;
    const outras_variaveis = desp_comerciais; 
    
    const margem_contribuicao_valor = receita_liquida - custos_diretos;
    const margem_contribuicao_perc = faturamento_bruto > 0 ? (margem_contribuicao_valor / faturamento_bruto) * 100 : 0;
    const ponto_equilibrio = margem_contribuicao_perc > 0 ? despesas_fixas / (margem_contribuicao_perc / 100) : 0;
    
    const ebitda = margem_contribuicao_valor - despesas_fixas - outras_variaveis + sumObj(dre.receitas_financeiras) - sumObj(dre.despesas_financeiras) + sumObj(dre.nao_operacional);
    const lucratividade_perc = faturamento_bruto > 0 ? (ebitda / faturamento_bruto) * 100 : 0;

    document.getElementById('valFaturamento').textContent = formatCurrency(faturamento_bruto);
    document.getElementById('valBreakEven').textContent = formatCurrency(ponto_equilibrio);
    document.getElementById('valMargemPerc').textContent = formatPercent(margem_contribuicao_perc);
    document.getElementById('valEbitda').textContent = formatCurrency(ebitda);

    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    if (faturamento_bruto > ponto_equilibrio) {
        statusDot.className = 'status-dot positive';
        statusText.textContent = 'Positivo';
        statusText.style.color = 'var(--success)';
    } else if (faturamento_bruto > 0) {
        statusDot.className = 'status-dot critical';
        statusText.textContent = 'Crítico';
        statusText.style.color = 'var(--danger)';
    }

    updateGaugeChart(lucratividade_perc, EFO_Parametros.meta_lucro_desejada);
    updatePieChart([custos_diretos, despesas_fixas, desp_comerciais, deducoes]);
}

function renderDRE() {
    const tbody = document.getElementById('dreTbody');
    const dre = EFO_Lancamentos.dre;

    const rBruta = sumObj(dre.receita_bruta);
    const deducoes = sumObj(dre.deducoes);
    const rLiquida = rBruta - deducoes;
    const custos = sumObj(dre.custos);
    const lBruto = rLiquida - custos;
    
    const dCom = sumObj(dre.despesas_comercial);
    const dAdm = sumObj(dre.despesas_administrativas);
    const dPes = sumObj(dre.despesas_pessoal);
    const dEst = sumObj(dre.despesas_estrutura);
    const dVei = sumObj(dre.despesas_veiculos);
    const dOperacionais = dCom + dAdm + dPes + dEst + dVei;
    
    const rFin = sumObj(dre.receitas_financeiras);
    const dFin = sumObj(dre.despesas_financeiras);
    const nOp = sumObj(dre.nao_operacional);
    
    const ebitda = lBruto - dOperacionais + rFin - dFin + nOp;
    const lOp = ebitda - sumObj(dre.depreciacao);
    const lLiq = lOp - sumObj(dre.impostos_lucro);

    const av = (val) => rBruta > 0 ? formatPercent((val / rBruta) * 100) : '0%';

    tbody.innerHTML = `
        <tr class="row-group"><td>1. RECEITA OPERACIONAL BRUTA</td><td class="text-right">${formatCurrency(rBruta)}</td><td class="text-right">${av(rBruta)}</td></tr>
        <tr class="row-sub clickable-row" onclick="openDrillDown('dre.receita_bruta.produtos', 'Receita de Produtos')"><td>Receita de Produtos</td><td class="text-right">${formatCurrency(dre.receita_bruta.produtos)}</td><td class="text-right">${av(dre.receita_bruta.produtos)}</td></tr>
        <tr class="row-sub clickable-row" onclick="openDrillDown('dre.receita_bruta.servicos', 'Receita de Serviços')"><td>Receita de Serviços</td><td class="text-right">${formatCurrency(dre.receita_bruta.servicos)}</td><td class="text-right">${av(dre.receita_bruta.servicos)}</td></tr>
        <tr class="row-sub clickable-row" onclick="openDrillDown('dre.receita_bruta.outras', 'Outras Receitas')"><td>Outras Receitas</td><td class="text-right">${formatCurrency(dre.receita_bruta.outras)}</td><td class="text-right">${av(dre.receita_bruta.outras)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) DEDUÇÕES DA RECEITA</td><td class="text-right">${formatCurrency(deducoes)}</td><td class="text-right">${av(deducoes)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.deducoes.impostos', 'Impostos S/ Faturamento')"><td>Impostos S/ Faturamento</td><td class="text-right">${formatCurrency(dre.deducoes.impostos)}</td><td class="text-right">${av(dre.deducoes.impostos)}</td></tr>
        <tr class="row-total"><td>(=) RECEITA OPERACIONAL LÍQUIDA</td><td class="text-right">${formatCurrency(rLiquida)}</td><td class="text-right">${av(rLiquida)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) CUSTOS DOS PRODUTOS/SERVIÇOS</td><td class="text-right">${formatCurrency(custos)}</td><td class="text-right">${av(custos)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.custos.mercadorias', 'CMV')"><td>CMV</td><td class="text-right">${formatCurrency(dre.custos.mercadorias)}</td><td class="text-right">${av(dre.custos.mercadorias)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.custos.servicos', 'Serviços Terceiros')"><td>Serviços Terceiros</td><td class="text-right">${formatCurrency(dre.custos.servicos)}</td><td class="text-right">${av(dre.custos.servicos)}</td></tr>
        
        <tr class="row-total"><td>(=) LUCRO BRUTO</td><td class="text-right">${formatCurrency(lBruto)}</td><td class="text-right">${av(lBruto)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) DESPESAS OPERACIONAIS</td><td class="text-right">${formatCurrency(dOperacionais)}</td><td class="text-right">${av(dOperacionais)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_comercial.transporte_logistica', 'Transporte e Logística')"><td>Transporte e Logística</td><td class="text-right">${formatCurrency(dre.despesas_comercial.transporte_logistica)}</td><td class="text-right">${av(dre.despesas_comercial.transporte_logistica)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_comercial.comissao', 'Comissões s/ Vendas')"><td>Comissões s/ Vendas</td><td class="text-right">${formatCurrency(dre.despesas_comercial.comissao)}</td><td class="text-right">${av(dre.despesas_comercial.comissao)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_comercial.trafego', 'Despesas Comerciais/Mkt')"><td>Marketing/Tráfego</td><td class="text-right">${formatCurrency(dre.despesas_comercial.trafego)}</td><td class="text-right">${av(dre.despesas_comercial.trafego)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_administrativas.outras', 'Despesas Administrativas (Outras)')"><td>Despesas Administrativas (Outras)</td><td class="text-right">${formatCurrency(dre.despesas_administrativas.outras)}</td><td class="text-right">${av(dre.despesas_administrativas.outras)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_administrativas.aluguel', 'Despesas Administrativas (Aluguel)')"><td>Despesas Administrativas (Aluguel)</td><td class="text-right">${formatCurrency(dre.despesas_administrativas.aluguel)}</td><td class="text-right">${av(dre.despesas_administrativas.aluguel)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_pessoal.salarios', 'Despesas de Pessoal')"><td>Despesas de Pessoal</td><td class="text-right">${formatCurrency(dPes)}</td><td class="text-right">${av(dPes)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_estrutura.manutencao', 'Despesas Estrutura/Veículos')"><td>Despesas Estrutura/Veículos</td><td class="text-right">${formatCurrency(dEst + dVei)}</td><td class="text-right">${av(dEst + dVei)}</td></tr>

        <tr class="row-group text-success"><td>(+) RECEITAS FINANCEIRAS</td><td class="text-right">${formatCurrency(rFin)}</td><td class="text-right">${av(rFin)}</td></tr>
        <tr class="row-sub clickable-row text-success" onclick="openDrillDown('dre.receitas_financeiras.rendimentos', 'Rendimentos/Juros')"><td>Rendimentos/Juros</td><td class="text-right">${formatCurrency(dre.receitas_financeiras.rendimentos)}</td><td class="text-right">${av(dre.receitas_financeiras.rendimentos)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) DESPESAS FINANCEIRAS</td><td class="text-right">${formatCurrency(dFin)}</td><td class="text-right">${av(dFin)}</td></tr>
        <tr class="row-sub clickable-row text-danger" onclick="openDrillDown('dre.despesas_financeiras.tarifas', 'Tarifas e Juros')"><td>Tarifas e Juros</td><td class="text-right">${formatCurrency(dre.despesas_financeiras.tarifas)}</td><td class="text-right">${av(dre.despesas_financeiras.tarifas)}</td></tr>
        
        <tr class="row-total"><td>(=) EBITDA GERENCIAL</td><td class="text-right">${formatCurrency(ebitda)}</td><td class="text-right">${av(ebitda)}</td></tr>
        <tr class="row-total ${lLiq < 0 ? 'danger-txt' : ''}"><td>(=) LUCRO LÍQUIDO</td><td class="text-right">${formatCurrency(lLiq)}</td><td class="text-right">${av(lLiq)}</td></tr>
    `;
}

function renderBalanco() {
    const ativoTbody = document.getElementById('ativoTbody');
    const passivoTbody = document.getElementById('passivoTbody');
    const b = EFO_Lancamentos.balanco;

    const totAc = sumObj(b.ativo_circulante);
    const totAnc = sumObj(b.ativo_nao_circulante);
    const totalAtivo = totAc + totAnc;

    ativoTbody.innerHTML = `
        <tr class="row-group"><td>ATIVO CIRCULANTE</td><td class="text-right">${formatCurrency(totAc)}</td></tr>
        <tr class="row-sub"><td>Caixa e Bancos</td><td class="text-right">${formatCurrency(b.ativo_circulante.caixa_bancos)}</td></tr>
        <tr class="row-sub clickable-row" onclick="openDrillDown('balanco.ativo_circulante.aplicacoes', 'Aplicações Financeiras')"><td>Aplicações Financeiras</td><td class="text-right">${formatCurrency(b.ativo_circulante.aplicacoes)}</td></tr>
        <tr class="row-sub"><td>Clientes a Receber</td><td class="text-right">${formatCurrency(b.ativo_circulante.clientes_receber)}</td></tr>
        <tr class="row-sub"><td>Estoques</td><td class="text-right">${formatCurrency(b.ativo_circulante.estoques)}</td></tr>
        <tr class="row-group"><td>ATIVO NÃO CIRCULANTE</td><td class="text-right">${formatCurrency(totAnc)}</td></tr>
        <tr class="row-sub clickable-row" onclick="openDrillDown('balanco.ativo_nao_circulante.imobilizado', 'Imobilizado')"><td>Imobilizado</td><td class="text-right">${formatCurrency(b.ativo_nao_circulante.imobilizado)}</td></tr>
        <tr class="row-total"><td>TOTAL DO ATIVO</td><td class="text-right">${formatCurrency(totalAtivo)}</td></tr>
    `;

    const totPc = sumObj(b.passivo_circulante);
    const totPnc = sumObj(b.passivo_nao_circulante);
    const totPl = sumObj(b.patrimonio_liquido);
    const totalPassivo = totPc + totPnc + totPl;

    passivoTbody.innerHTML = `
        <tr class="row-group"><td>PASSIVO CIRCULANTE</td><td class="text-right">${formatCurrency(totPc)}</td></tr>
        <tr class="row-sub"><td>Fornecedores</td><td class="text-right">${formatCurrency(b.passivo_circulante.fornecedores)}</td></tr>
        <tr class="row-sub clickable-row" onclick="openDrillDown('balanco.passivo_circulante.emprestimos_cp', 'Empréstimos Curto Prazo')"><td>Empréstimos Curto Prazo</td><td class="text-right">${formatCurrency(b.passivo_circulante.emprestimos_cp)}</td></tr>
        <tr class="row-sub"><td>Obrigações Trabalhistas</td><td class="text-right">${formatCurrency(b.passivo_circulante.obrigacoes_trab)}</td></tr>
        <tr class="row-group"><td>PASSIVO NÃO CIRCULANTE</td><td class="text-right">${formatCurrency(totPnc)}</td></tr>
        <tr class="row-sub"><td>Empréstimos Longo Prazo</td><td class="text-right">${formatCurrency(b.passivo_nao_circulante.emprestimos_lp)}</td></tr>
        <tr class="row-group"><td>PATRIMÔNIO LÍQUIDO</td><td class="text-right">${formatCurrency(totPl)}</td></tr>
        <tr class="row-sub"><td>Capital Social</td><td class="text-right">${formatCurrency(b.patrimonio_liquido.capital_social)}</td></tr>
        <tr class="row-total"><td>TOTAL PASSIVO E PL</td><td class="text-right">${formatCurrency(totalPassivo)}</td></tr>
    `;
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
        const dateObj = new Date(txn.date);
        const dateStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        
        let statusHtml = txn.status === 'Flagged' ? `<span class="status-badge flagged">⚠️ Conformidade</span>` : `<span class="status-badge pendente">Pendente</span>`;
        let reasonHtml = txn.flag_reason ? `<div style="font-size:11px; color:var(--danger); margin-top:4px;">${txn.flag_reason}</div>` : '';

        tr.innerHTML = `
            <td>${dateStr}</td>
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
            <td style="text-align:center;">
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
            if (otherUsersWithCompany.length === 0) {
                delete EFO_Companies[user.companyId];
                localStorage.setItem('EFO_Companies', JSON.stringify(EFO_Companies));
            }
            
            EFO_Users.splice(index, 1);
            localStorage.setItem('EFO_Users', JSON.stringify(EFO_Users));
            
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

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    
    const user = EFO_Users.find(u => u.email === email && u.password === pass);
    if (user) {
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
    
    document.getElementById('formClient').reset();
    document.getElementById('clientModal').style.display = 'none';
    
    showToast('Sucesso', `Cliente ${name} e sua empresa foram cadastrados.`, 'success');
    
    renderClientsTable();
    renderCompanySelect();
}
