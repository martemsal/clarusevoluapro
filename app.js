// --- DATA SCHEMA ---
const DEFAULT_PARAMETROS = { impostos: 10, comissoes: 5, meta_lucro_desejada: 15 };
const DEFAULT_EMPRESA = { cnpj: "", cnae_principal: "", regime_tributario: "Simples Nacional", tipo_atividade: "Serviço" };

const DEFAULT_LANCAMENTOS = {
    dre: {
        receita_bruta: { produtos: 0, servicos: 0, outras: 0 },
        deducoes: { impostos: 0, devolucoes: 0, descontos: 0 },
        custos: { mercadorias: 0, producao: 0, servicos: 0, operacionais: 0 },
        despesas_comercial: { marketing: 0, trafego: 0, comissao: 0, viagens: 0, outras: 0 },
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

let EFO_Parametros = JSON.parse(localStorage.getItem('EFO_Parametros')) || DEFAULT_PARAMETROS;
let Config_Empresa = JSON.parse(localStorage.getItem('Config_Empresa')) || DEFAULT_EMPRESA;
let EFO_Lancamentos = JSON.parse(localStorage.getItem('EFO_Lancamentos_V3')) || JSON.parse(JSON.stringify(DEFAULT_LANCAMENTOS));
let OFX_Raw_Import = JSON.parse(localStorage.getItem('OFX_Raw_Import')) || [];

let gaugeChartInst = null;
let pieChartInst = null;

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
    
    // CNAE Auto-detect
    document.getElementById('config_cnae').addEventListener('input', (e) => {
        const val = e.target.value;
        if(val.startsWith('62') || val.startsWith('63') || val.startsWith('69')) document.getElementById('config_atividade').value = 'Serviço';
        else if(val.startsWith('45') || val.startsWith('46') || val.startsWith('47')) document.getElementById('config_atividade').value = 'Comércio';
        else if(val.startsWith('1') || val.startsWith('2') || val.startsWith('3')) document.getElementById('config_atividade').value = 'Indústria';
        else document.getElementById('config_atividade').value = 'Serviço'; // Default
    });

    document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
    
    document.getElementById('btnResetData').addEventListener('click', () => {
        if(confirm("Tem certeza que deseja zerar todos os dados do EFO?")) {
            localStorage.removeItem('EFO_Lancamentos_V3');
            localStorage.removeItem('OFX_Raw_Import');
            location.reload();
        }
    });

    updateAllViews();
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
            
            let title = "Painel de Saúde Operacional";
            if(target === 'tab-dre') title = "Demonstrativo de Resultado (DRE)";
            if(target === 'tab-balanco') title = "Balanço Gerencial";
            if(target === 'tab-conciliation') title = "Conciliação Bancária";
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
                    localStorage.setItem('OFX_Raw_Import', JSON.stringify(OFX_Raw_Import));
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
        const dateMatch = trnData.match(/<DTPOSTED>([^<]+)/);
        const amountMatch = trnData.match(/<TRNAMT>([^<]+)/);
        const fitidMatch = trnData.match(/<FITID>([^<]+)/);
        const memoMatch = trnData.match(/<MEMO>([^<]+)/);

        if (!fitidMatch || !amountMatch) continue;

        const fitid = fitidMatch[1].trim();
        const amount = parseFloat(amountMatch[1]);
        let dateStr = dateMatch ? dateMatch[1].trim().substring(0, 8) : '';
        let formattedDate = dateStr ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : new Date().toISOString().split('T')[0];
        const memo = memoMatch ? memoMatch[1].trim() : 'Transação';

        if (!OFX_Raw_Import.find(t => t.transaction_id === fitid)) {
            OFX_Raw_Import.push({ transaction_id: fitid, date: formattedDate, amount: amount, description: memo.toUpperCase(), status: 'Pendente', flag_reason: '' });
            newTransactions++;
        }
    }
    return newTransactions;
}

function categorizeTransactions() {
    let changed = false;
    OFX_Raw_Import.forEach(txn => {
        if (txn.status !== 'Pendente') return;

        const desc = txn.description;
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

        // Categorização Balanço
        if (desc.includes("APLICACAO") || desc.includes("RESGATE") || desc.includes("TRANSF")) {
            cat = 'balanco.ativo_circulante.aplicacoes';
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
            changed = true;
        }
    });

    if (changed) {
        localStorage.setItem('OFX_Raw_Import', JSON.stringify(OFX_Raw_Import));
        localStorage.setItem('EFO_Lancamentos_V3', JSON.stringify(EFO_Lancamentos));
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

        OFX_Raw_Import.forEach(t => {
            if ((t.status === 'Pendente' || t.status === 'Flagged') && t.description === targetDesc) {
                const path = categoryPath.split('.');
                EFO_Lancamentos[path[0]][path[1]][path[2]] += Math.abs(t.amount);
                t.status = 'Categorizado';
                t.flag_reason = '';
                matchedCount++;
            }
        });
        
        showToast('Auto-Match', `${matchedCount} transações processadas automaticamente.`, 'success');
    } else {
        txn.status = 'Ignorado';
        txn.flag_reason = '';
        showToast('Sucesso', `Transação ignorada.`, 'success');
    }
    
    localStorage.setItem('OFX_Raw_Import', JSON.stringify(OFX_Raw_Import));
    localStorage.setItem('EFO_Lancamentos_V3', JSON.stringify(EFO_Lancamentos));
    
    updateAllViews();
}

window.applyManualCategorization = (fitid) => {
    const sel = document.getElementById(`sel_${fitid}`);
    if (!sel.value) return showToast('Aviso', 'Selecione uma categoria.', 'warning');
    manualCategorize(fitid, sel.value);
};

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
        <tr class="row-sub"><td>Receita de Produtos</td><td class="text-right">${formatCurrency(dre.receita_bruta.produtos)}</td><td class="text-right">${av(dre.receita_bruta.produtos)}</td></tr>
        <tr class="row-sub"><td>Receita de Serviços</td><td class="text-right">${formatCurrency(dre.receita_bruta.servicos)}</td><td class="text-right">${av(dre.receita_bruta.servicos)}</td></tr>
        <tr class="row-sub"><td>Outras Receitas</td><td class="text-right">${formatCurrency(dre.receita_bruta.outras)}</td><td class="text-right">${av(dre.receita_bruta.outras)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) DEDUÇÕES DA RECEITA</td><td class="text-right">${formatCurrency(deducoes)}</td><td class="text-right">${av(deducoes)}</td></tr>
        <tr class="row-total"><td>(=) RECEITA OPERACIONAL LÍQUIDA</td><td class="text-right">${formatCurrency(rLiquida)}</td><td class="text-right">${av(rLiquida)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) CUSTOS DOS PRODUTOS/SERVIÇOS</td><td class="text-right">${formatCurrency(custos)}</td><td class="text-right">${av(custos)}</td></tr>
        <tr class="row-sub"><td>CMV</td><td class="text-right">${formatCurrency(dre.custos.mercadorias)}</td><td class="text-right">${av(dre.custos.mercadorias)}</td></tr>
        <tr class="row-sub"><td>Serviços Terceiros</td><td class="text-right">${formatCurrency(dre.custos.servicos)}</td><td class="text-right">${av(dre.custos.servicos)}</td></tr>
        
        <tr class="row-total"><td>(=) LUCRO BRUTO</td><td class="text-right">${formatCurrency(lBruto)}</td><td class="text-right">${av(lBruto)}</td></tr>
        
        <tr class="row-group text-danger"><td>(-) DESPESAS OPERACIONAIS</td><td class="text-right">${formatCurrency(dOperacionais)}</td><td class="text-right">${av(dOperacionais)}</td></tr>
        <tr class="row-sub"><td>Despesas Comerciais/Mkt</td><td class="text-right">${formatCurrency(dCom)}</td><td class="text-right">${av(dCom)}</td></tr>
        <tr class="row-sub"><td>Despesas Administrativas</td><td class="text-right">${formatCurrency(dAdm)}</td><td class="text-right">${av(dAdm)}</td></tr>
        <tr class="row-sub"><td>Despesas de Pessoal</td><td class="text-right">${formatCurrency(dPes)}</td><td class="text-right">${av(dPes)}</td></tr>
        <tr class="row-sub"><td>Despesas Estrutura/Veículos</td><td class="text-right">${formatCurrency(dEst + dVei)}</td><td class="text-right">${av(dEst + dVei)}</td></tr>

        <tr class="row-group"><td>(+) RECEITAS FINANCEIRAS</td><td class="text-right">${formatCurrency(rFin)}</td><td class="text-right">${av(rFin)}</td></tr>
        <tr class="row-group text-danger"><td>(-) DESPESAS FINANCEIRAS</td><td class="text-right">${formatCurrency(dFin)}</td><td class="text-right">${av(dFin)}</td></tr>
        
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
        <tr class="row-sub"><td>Aplicações Financeiras</td><td class="text-right">${formatCurrency(b.ativo_circulante.aplicacoes)}</td></tr>
        <tr class="row-sub"><td>Clientes a Receber</td><td class="text-right">${formatCurrency(b.ativo_circulante.clientes_receber)}</td></tr>
        <tr class="row-sub"><td>Estoques</td><td class="text-right">${formatCurrency(b.ativo_circulante.estoques)}</td></tr>
        <tr class="row-group"><td>ATIVO NÃO CIRCULANTE</td><td class="text-right">${formatCurrency(totAnc)}</td></tr>
        <tr class="row-sub"><td>Imobilizado</td><td class="text-right">${formatCurrency(b.ativo_nao_circulante.imobilizado)}</td></tr>
        <tr class="row-total"><td>TOTAL DO ATIVO</td><td class="text-right">${formatCurrency(totalAtivo)}</td></tr>
    `;

    const totPc = sumObj(b.passivo_circulante);
    const totPnc = sumObj(b.passivo_nao_circulante);
    const totPl = sumObj(b.patrimonio_liquido);
    const totalPassivo = totPc + totPnc + totPl;

    passivoTbody.innerHTML = `
        <tr class="row-group"><td>PASSIVO CIRCULANTE</td><td class="text-right">${formatCurrency(totPc)}</td></tr>
        <tr class="row-sub"><td>Fornecedores</td><td class="text-right">${formatCurrency(b.passivo_circulante.fornecedores)}</td></tr>
        <tr class="row-sub"><td>Empréstimos Curto Prazo</td><td class="text-right">${formatCurrency(b.passivo_circulante.emprestimos_cp)}</td></tr>
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

    const optgroups = `
        <option value="">Selecione a Conta...</option>
        <optgroup label="Receitas DRE">
            <option value="dre.receita_bruta.produtos">Venda de Produtos</option>
            <option value="dre.receita_bruta.servicos">Prestação de Serviços</option>
        </optgroup>
        <optgroup label="Deduções e Custos DRE">
            <option value="dre.deducoes.impostos">Impostos S/ Faturamento</option>
            <option value="dre.custos.mercadorias">CMV (Compra de Mercadorias)</option>
        </optgroup>
        <optgroup label="Despesas Operacionais DRE">
            <option value="dre.despesas_comercial.trafego">Marketing/Tráfego</option>
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

    pendentes.forEach(txn => {
        const tr = document.createElement('tr');
        if (txn.status === 'Flagged') tr.classList.add('row-flagged');
        const dateObj = new Date(txn.date);
        const dateStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        
        let statusHtml = txn.status === 'Flagged' ? `<span class="status-badge flagged">⚠️ Conformidade</span>` : `<span class="status-badge pendente">Pendente</span>`;
        let reasonHtml = txn.flag_reason ? `<div style="font-size:11px; color:var(--danger); margin-top:4px;">${txn.flag_reason}</div>` : '';

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${txn.description}</strong>${reasonHtml}</td>
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
    localStorage.setItem('Config_Empresa', JSON.stringify(Config_Empresa));
    document.getElementById('empresaModal').style.display = 'none';
    renderParametros();
    showToast('Sucesso', 'Configurações da empresa salvas.', 'success');
}

function saveParams(e) {
    e.preventDefault();
    EFO_Parametros = { impostos: parseFloat(document.getElementById('param_impostos').value), comissoes: parseFloat(document.getElementById('param_comissoes').value), meta_lucro_desejada: parseFloat(document.getElementById('param_meta_lucro').value) };
    localStorage.setItem('EFO_Parametros', JSON.stringify(EFO_Parametros));
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
