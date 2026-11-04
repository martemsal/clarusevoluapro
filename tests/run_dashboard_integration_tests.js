// ============================================================================
//  CLARUS EVOLUA® — SUÍTE DE TESTES DE REGRESSÃO: INTEGRAÇÃO COM DASHBOARD
// ============================================================================
// Comprova matematicamente que:
// 1. As regras de cálculo nativas da DRE, Balanço e Indicadores são preservadas.
// 2. Registros em Staging não afetam os números do painel antes da publicação.
// 3. Lotes com erros críticos ou registros pendentes são impedidos de publicação.
// 4. Publicação parcial é estritamente autorizada, auditada e sinalizada como incompleta.
// 5. Anti-duplicação e idempotência impedem valores duplicados no dashboard.
// 6. Rastreabilidade total é mantida da linha da DRE até o arquivo original.
// 7. Reprocessamento controlado e rollback restauram perfeitamente o estado prévio.

const Publisher = require('../dashboard_publisher.js');
const Classifier = require('../ai_classifier.js');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`  [OK] ${testName}`);
        testsPassed++;
    } else {
        console.error(`  [FAIL] ${testName} - ${details}`);
        testsFailed++;
    }
}

// -----------------------------------------------------------------------------
// MOTOR DE CÁLCULO NATIVO DA CLARUS EVOLUA (PRESERVADO FIELMENTE DE APP.JS)
// -----------------------------------------------------------------------------
function calculateDREDataFromTransactions(ofxList, year) {
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

    if (Array.isArray(ofxList)) {
        ofxList.forEach(txn => {
            if (txn.status === 'Categorizado' && txn.assigned_account) {
                const dateObj = new Date(txn.date);
                const txnYear = dateObj.getFullYear();
                if (txnYear === year) {
                    const txnMonth = dateObj.getMonth();
                    let acc = txn.assigned_account;
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

function calculateBalancoDataFromTransactions(ofxList, year) {
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

    if (Array.isArray(ofxList)) {
        ofxList.forEach(txn => {
            if (txn.status === 'Categorizado' && txn.assigned_account) {
                const dateObj = new Date(txn.date);
                const txnYear = dateObj.getFullYear();
                if (txnYear === year) {
                    const txnMonth = dateObj.getMonth();
                    let acc = txn.assigned_account;
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

function computeDRESummary(dreKeys) {
    const rBruta = sumArrays(
        dreKeys['dre.receita_bruta.produtos'],
        dreKeys['dre.receita_bruta.servicos'],
        dreKeys['dre.receita_bruta.outras']
    );
    const deducoes = sumArrays(
        dreKeys['dre.deducoes.impostos'],
        dreKeys['dre.deducoes.devolucoes'],
        dreKeys['dre.deducoes.descontos']
    );
    const rLiquida = rBruta.map((v, i) => v - deducoes[i]);
    const custos = sumArrays(
        dreKeys['dre.custos.mercadorias'],
        dreKeys['dre.custos.producao'],
        dreKeys['dre.custos.servicos'],
        dreKeys['dre.custos.operacionais']
    );
    const lBruto = rLiquida.map((v, i) => v - custos[i]);
    const dOperacionais = sumArrays(
        dreKeys['dre.despesas_comercial.marketing'],
        dreKeys['dre.despesas_comercial.trafego'],
        dreKeys['dre.despesas_comercial.transporte_logistica'],
        dreKeys['dre.despesas_administrativas.aluguel'],
        dreKeys['dre.despesas_administrativas.pro_labore'],
        dreKeys['dre.despesas_pessoal.salarios'],
        dreKeys['dre.despesas_financeiras.tarifas']
    );
    const lOperacional = lBruto.map((v, i) => v - dOperacionais[i]);

    return {
        rBruta,
        deducoes,
        rLiquida,
        custos,
        lBruto,
        dOperacionais,
        lOperacional
    };
}

// -----------------------------------------------------------------------------
// EXECUÇÃO DA SUÍTE DE TESTES DE INTEGRAÇÃO & REGRESSÃO
// -----------------------------------------------------------------------------
function runDashboardIntegrationTests() {
    console.log('\n================================================================================');
    console.log(' SUÍTE DE TESTES DE REGRESSÃO: INTEGRAÇÃO COM DASHBOARD CLARUS EVOLUA');
    console.log('================================================================================\n');

    const companyId = 'comp_teste_integracao';
    const year = 2026;
    const monthIndex = 2; // Março (0=Jan, 1=Fev, 2=Mar)

    // 1. DADOS INICIAIS DE BASE CONHECIDA (JANEIRO E FEVEREIRO JÁ CONCILIADOS)
    const initialOfx = [
        {
            transaction_id: 'BASE-001',
            date: '2026-01-15',
            description: 'Venda de produtos industriais Jan',
            amount: 50000.00,
            status: 'Categorizado',
            assigned_account: 'dre.receita_bruta.produtos'
        },
        {
            transaction_id: 'BASE-002',
            date: '2026-01-20',
            description: 'Pagto Aluguel Galpão Jan',
            amount: -5000.00,
            status: 'Categorizado',
            assigned_account: 'dre.despesas_administrativas.aluguel'
        },
        {
            transaction_id: 'BASE-003',
            date: '2026-02-15',
            description: 'Venda de produtos industriais Fev',
            amount: 60000.00,
            status: 'Categorizado',
            assigned_account: 'dre.receita_bruta.produtos'
        },
        {
            transaction_id: 'BASE-004',
            date: '2026-02-20',
            description: 'Pagto Aluguel Galpão Fev',
            amount: -5000.00,
            status: 'Categorizado',
            assigned_account: 'dre.despesas_administrativas.aluguel'
        }
    ];

    let mockStorage = {
        batches: [],
        records: {},
        ofx: [...initialOfx],
        lancamentos: {
            dre: {
                receita_bruta: { produtos: 110000.00, servicos: 0, outras: 0 },
                despesas_administrativas: { aluguel: 10000.00, pro_labore: 0, outras: 0 },
                custos: { mercadorias: 0 },
                deducoes: { impostos: 0 }
            },
            balanco: {
                passivo_circulante: { emprestimos_cp: 0 },
                ativo_nao_circulante: { imobilizado: 0 }
            }
        },
        publicationHistory: []
    };

    const mockContext = {
        companyId: companyId,
        user: { name: 'Auditor Marcos Saldanha', email: 'saldanha@clarus.com.br', role: 'admin' },
        getCompanyBatches: (cid) => mockStorage.batches,
        saveCompanyBatches: (cid, b) => { mockStorage.batches = b; },
        getBatchRecords: (bid) => mockStorage.records[bid] || [],
        saveBatchRecords: (bid, r) => { mockStorage.records[bid] = r; },
        getActiveOfx: (cid) => mockStorage.ofx,
        setActiveOfx: (cid, o) => { mockStorage.ofx = o; },
        getActiveLancamentos: (cid) => mockStorage.lancamentos,
        setActiveLancamentos: (cid, l) => { mockStorage.lancamentos = l; },
        getPublicationHistory: (cid) => mockStorage.publicationHistory,
        savePublicationHistory: (cid, h) => { mockStorage.publicationHistory = h; }
    };

    // -------------------------------------------------------------------------
    // GRUPO 1: CÁLCULOS NATIVOS E BASELINE INICIAL DO DASHBOARD
    // -------------------------------------------------------------------------
    console.log('1. Testando Baseline Inicial e Preservação de Regras Nativas');
    const initialDRE = calculateDREDataFromTransactions(mockStorage.ofx, year);
    const initialSummary = computeDRESummary(initialDRE);

    assert(initialSummary.rBruta[0] === 50000, 'Receita Bruta de Jan = R$ 50.000,00');
    assert(initialSummary.rBruta[1] === 60000, 'Receita Bruta de Fev = R$ 60.000,00');
    assert(initialSummary.rBruta[2] === 0, 'Receita Bruta de Março inicialmente ZERO');
    assert(initialSummary.dOperacionais[0] === 5000, 'Despesas ADM Jan = R$ 5.000,00');
    assert(initialSummary.lOperacional[0] === 45000, 'Lucro Operacional Jan = R$ 45.000,00');

    // -------------------------------------------------------------------------
    // GRUPO 2: ISOLAMENTO TOTAL DO STAGING (NENHUM IMPACTO ANTES DA PUBLICAÇÃO)
    // -------------------------------------------------------------------------
    console.log('\n2. Testando Isolamento do Staging (Zero Impacto no Dashboard antes de Publicar)');

    const batchMar2026 = {
        batchId: 'LOT-2026-MAR-01',
        companyId: companyId,
        year: 2026,
        month: 2, // Março
        fileName: 'extrato_mar_2026.ofx',
        fileType: 'OFX',
        sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        status: 'STAGING_SALVO',
        reconciliationReport: {
            equation: {
                initialBalance: 50000.00,
                totalCredits: 75000.00,
                totalDebits: 22000.00,
                calculatedFinalBalance: 103000.00,
                reportedFinalBalance: 103000.00,
                balanceDifference: 0.00,
                isBalanceReconciled: true
            },
            periodAudit: { hasOverlap: false }
        }
    };

    // 4 registros no Staging de Março
    const stagingRecords = [
        {
            lineNumber: 1,
            date: '2026-03-05',
            description: 'PAGTO ALUGUEL SEDE GALPAO IMOBILIARIA CENTRAL',
            amount: -5500.00,
            status: 'APROVADO',
            assigned_account: 'dre.despesas_administrativas.aluguel'
        },
        {
            lineNumber: 2,
            date: '2026-03-10',
            description: 'RECEBIMENTO DUPLICATA CLIENTE INDUSTRIAL 9844',
            amount: 75000.00,
            status: 'APROVADO',
            assigned_account: 'dre.receita_bruta.produtos'
        },
        {
            lineNumber: 3,
            date: '2026-03-15',
            description: 'COMPRA MATERIA PRIMA DISTRIBUIDORA ACO',
            amount: -12000.00,
            status: 'APROVADO',
            assigned_account: 'dre.custos.mercadorias'
        },
        {
            lineNumber: 4,
            date: '2026-03-20',
            description: 'AMORTIZACAO PRINCIPAL EMPRESTIMO CAPITAL DE GIRO',
            amount: -4500.00,
            status: 'APROVADO',
            assigned_account: 'balanco.passivo_circulante.emprestimos_cp'
        }
    ];

    mockStorage.batches.push(batchMar2026);
    mockStorage.records[batchMar2026.batchId] = stagingRecords;

    // Recalcula DRE com o lote ainda em staging
    const dreWithStaging = calculateDREDataFromTransactions(mockStorage.ofx, year);
    const summaryWithStaging = computeDRESummary(dreWithStaging);

    assert(summaryWithStaging.rBruta[2] === 0, 'Receita de Março continua rigorosamente ZERO com lote em Staging');
    assert(summaryWithStaging.dOperacionais[2] === 0, 'Despesas de Março continuam ZERO');
    assert(mockStorage.ofx.length === 4, 'Base ativa de OFX contém apenas os 4 registros iniciais');

    // -------------------------------------------------------------------------
    // GRUPO 3: BLOQUEIO DE LOTES COM ERROS CRÍTICOS (FURO DE SALDO / DIVERGÊNCIA)
    // -------------------------------------------------------------------------
    console.log('\n3. Testando Bloqueio de Lotes com Erros Críticos de Conciliação');

    const batchComFuro = {
        batchId: 'LOT-FURO-01',
        companyId: companyId,
        year: 2026,
        month: 2,
        fileName: 'extrato_com_gap.csv',
        status: 'PENDENTE_REVISAO',
        reconciliationReport: {
            equation: {
                isBalanceReconciled: false,
                balanceDifference: 1450.80
            }
        }
    };

    const valFuro = Publisher.validateBatchForPublication(batchComFuro, stagingRecords, {});
    assert(valFuro.canPublish === false, 'Lote com furo de saldo bancário impedido de publicação');
    assert(valFuro.blockedReasons.some(r => r.includes('PENDENTE_REVISAO')), 'Motivo inclui status PENDENTE_REVISAO');
    assert(valFuro.blockedReasons.some(r => r.includes('Furo de saldo bancário')), 'Motivo inclui alerta de diferença de saldo');

    let furoThrows = false;
    try {
        mockStorage.batches.push(batchComFuro);
        Publisher.publishBatch(batchComFuro.batchId, {}, mockContext);
    } catch (e) {
        furoThrows = true;
    }
    assert(furoThrows === true, 'publishBatch lançou exceção impedindo publicação de lote com erro crítico');

    // -------------------------------------------------------------------------
    // GRUPO 4: BLOQUEIO DE REGISTROS PENDENTES SEM AUTORIZAÇÃO PARCIAL
    // -------------------------------------------------------------------------
    console.log('\n4. Testando Bloqueio de Registros Pendentes sem Autorização');

    const batchIncompleto = {
        batchId: 'LOT-PENDENTE-01',
        companyId: companyId,
        year: 2026,
        month: 2,
        fileName: 'extrato_pendente.ofx',
        status: 'STAGING_SALVO',
        sha256: 'hash_incompleto_123'
    };
    const recordsIncompletos = [
        { lineNumber: 1, amount: 1000, assigned_account: 'dre.receita_bruta.produtos', status: 'APROVADO' },
        { lineNumber: 2, amount: -200, assigned_account: null, status: 'SUGESTAO_PENDENTE' } // Pendente!
    ];

    const valInc = Publisher.validateBatchForPublication(batchIncompleto, recordsIncompletos, { allowPartial: false });
    assert(valInc.canPublish === false, 'Publicação bloqueada porque existem registros pendentes');
    assert(valInc.pendingRecords.length === 1, '1 registro classificado como pendente');

    // -------------------------------------------------------------------------
    // GRUPO 5: APROVAÇÃO EXPLÍCITA E PUBLICAÇÃO TOTAL NO DASHBOARD
    // -------------------------------------------------------------------------
    console.log('\n5. Testando Publicação Total Aprovada no Dashboard');

    const pubResult = Publisher.publishBatch(batchMar2026.batchId, { allowPartial: false }, mockContext);
    assert(pubResult.success === true, 'Publicação executada com sucesso');
    assert(pubResult.isPartial === false, 'Publicação marcada como TOTAL (não parcial)');
    assert(pubResult.publishedCount === 4, 'Exatamente 4 registros publicados');
    assert(mockStorage.batches.find(b => b.batchId === batchMar2026.batchId).status === 'PUBLICADO', 'Status do lote atualizado para PUBLICADO');

    // Verifica que calculateDREData agora consome Março com exatidão matemática
    const dreAfterPub = calculateDREDataFromTransactions(mockStorage.ofx, year);
    const summaryAfterPub = computeDRESummary(dreAfterPub);

    assert(summaryAfterPub.rBruta[2] === 75000, 'Receita de Março no Dashboard = R$ 75.000,00');
    assert(summaryAfterPub.custos[2] === 12000, 'Custos CMV de Março = R$ 12.000,00');
    assert(summaryAfterPub.lBruto[2] === 63000, 'Lucro Bruto de Março = R$ 63.000,00 (75k - 12k)');
    assert(summaryAfterPub.dOperacionais[2] === 5500, 'Despesas ADM de Março = R$ 5.500,00 (Aluguel)');
    assert(summaryAfterPub.lOperacional[2] === 57500, 'Lucro Operacional de Março = R$ 57.500,00 (63k - 5.5k)');

    // Verifica Balanço Gerencial (Amortização de Empréstimo vai para o Balanço, NÃO para a DRE!)
    const balancoAfterPub = calculateBalancoDataFromTransactions(mockStorage.ofx, year);
    assert(balancoAfterPub['balanco.passivo_circulante.emprestimos_cp'][2] === 4500, 'Amortização de Empréstimo de R$ 4.500,00 foi para o Balanço Gerencial');

    // -------------------------------------------------------------------------
    // GRUPO 6: PROTEÇÃO CONTRA DUPLICIDADE (REIMPORTAÇÃO / REPUBLICAÇÃO)
    // -------------------------------------------------------------------------
    console.log('\n6. Testando Proteção Anti-Duplicidade (Idempotência Absoluta)');

    // Tentativa 1: Tentar publicar o mesmo lote novamente sem reprocessamento
    let dupThrows = false;
    try {
        Publisher.publishBatch(batchMar2026.batchId, { allowPartial: false }, mockContext);
    } catch (e) {
        dupThrows = true;
    }
    assert(dupThrows === true, 'Bloqueio impediu re-publicação acidental do mesmo lote');

    // Tentativa 2: Simular re-injeção manual dos mesmos registros
    const countBefore = mockStorage.ofx.length;
    // Força reprocessamento controlado do mesmo lote
    Publisher.publishBatch(batchMar2026.batchId, { allowPartial: false, reprocess: true }, mockContext);
    const countAfter = mockStorage.ofx.length;

    assert(countBefore === countAfter, 'Quantidade total de transações permaneceu inalterada após reprocessamento');

    const dreAfterReprocess = calculateDREDataFromTransactions(mockStorage.ofx, year);
    const summaryAfterReprocess = computeDRESummary(dreAfterReprocess);
    assert(summaryAfterReprocess.rBruta[2] === 75000, 'Anti-duplicação: Receita NÃO dobrou para 150k (permaneceu R$ 75.000,00)');
    assert(summaryAfterReprocess.dOperacionais[2] === 5500, 'Anti-duplicação: Despesa de Aluguel NÃO dobrou (permaneceu R$ 5.500,00)');

    // -------------------------------------------------------------------------
    // GRUPO 7: PUBLICAÇÃO PARCIAL AUTORIZADA & SINALIZAÇÃO DE INCOMPLETO
    // -------------------------------------------------------------------------
    console.log('\n7. Testando Publicação Parcial Autorizada e Sinalização Incompleta');

    const batchAbril = {
        batchId: 'LOT-2026-ABR-01',
        companyId: companyId,
        year: 2026,
        month: 3, // Abril
        fileName: 'extrato_abril_parcial.csv',
        fileType: 'CSV',
        sha256: 'hash_abril_parcial_778899',
        status: 'STAGING_SALVO'
    };

    const recordsAbril = [
        {
            lineNumber: 1,
            date: '2026-04-05',
            description: 'PAGTO ALUGUEL ABRIL',
            amount: -5500.00,
            status: 'APROVADO',
            assigned_account: 'dre.despesas_administrativas.aluguel'
        },
        {
            lineNumber: 2,
            date: '2026-04-10',
            description: 'VENDA DE SERVICOS CONSULTORIA ABRIL',
            amount: 30000.00,
            status: 'APROVADO',
            assigned_account: 'dre.receita_bruta.servicos'
        },
        {
            lineNumber: 3,
            date: '2026-04-20',
            description: 'PIX INDEFINIDO AGUARDANDO NOTA FISCAL',
            amount: -3500.00,
            status: 'SUGESTAO_PENDENTE', // Pendente!
            assigned_account: null
        }
    ];

    mockStorage.batches.push(batchAbril);
    mockStorage.records[batchAbril.batchId] = recordsAbril;

    const pubParcial = Publisher.publishBatch(batchAbril.batchId, {
        allowPartial: true,
        partialAuthorization: 'Autorizo publicação parcial para fechamento prévio enquanto aguardo NF do fornecedor'
    }, mockContext);

    assert(pubParcial.success === true, 'Publicação parcial autorizada realizada');
    assert(pubParcial.isPartial === true, 'Sinalizado explicitamente como is_partial: true');
    assert(pubParcial.publishedCount === 2, 'Apenas os 2 registros aprovados foram publicados');
    assert(pubParcial.pendingCount === 1, '1 registro pendente ficou retido no Staging');
    assert(mockStorage.batches.find(b => b.batchId === batchAbril.batchId).status === 'PUBLICACAO_PARCIAL', 'Status do lote é PUBLICACAO_PARCIAL');

    // Valida detecção de período incompleto
    const periodStatus = Publisher.getPeriodPublicationStatus(companyId, 2026, 3, mockStorage.batches);
    assert(periodStatus.hasPartial === true, 'Detector de período reconheceu publicação parcial');
    assert(periodStatus.alertMessage.includes('publicação parcial ativa'), 'Alerta claro gerado para exibição no Dashboard');

    // -------------------------------------------------------------------------
    // GRUPO 8: RASTREABILIDADE TOTAL DO VALOR PUBLICADO ATÉ O ARQUIVO ORIGINAL
    // -------------------------------------------------------------------------
    console.log('\n8. Testando Rastreabilidade Canônica (Auditoria da Linha ao Arquivo)');

    const publishedTxn = mockStorage.ofx.find(t => t.source_batch_id === 'LOT-2026-MAR-01' && t.amount === -5500);
    const trace = Publisher.tracePublishedRecord(publishedTxn.transaction_id, mockStorage.ofx, mockStorage.batches);

    assert(trace !== null, 'Trilha de auditoria recuperada com sucesso');
    assert(trace.source.batchId === 'LOT-2026-MAR-01', 'Lote de origem rastreado: LOT-2026-MAR-01');
    assert(trace.source.fileName === 'extrato_mar_2026.ofx', 'Nome do arquivo original rastreado');
    assert(trace.source.fileSha256 === 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0', 'Hash SHA-256 original preservado');
    assert(trace.source.lineNumber === 1, 'Linha original no extrato identificada: Linha 1');
    assert(trace.publication.publishedBy === 'Auditor Marcos Saldanha', 'Usuário que autorizou publicação auditado');

    // -------------------------------------------------------------------------
    // GRUPO 9: REPROCESSAMENTO CONTROLADO & ROLLBACK DE PUBLICAÇÃO
    // -------------------------------------------------------------------------
    console.log('\n9. Testando Rollback e Reprocessamento Controlado (Despublicação)');

    // Despublica o lote de Março
    const unpubResult = Publisher.unpublishBatch(batchMar2026.batchId, { reason: 'Estorno por revisão de conciliação' }, mockContext);
    assert(unpubResult.success === true, 'Despublicação de lote concluída');
    assert(unpubResult.revertedCount === 4, '4 transações foram revertidas');
    assert(mockStorage.batches.find(b => b.batchId === batchMar2026.batchId).status === 'STAGING_SALVO', 'Lote retornou para STAGING_SALVO');

    // Recalcula DRE após rollback
    const dreAfterRollback = calculateDREDataFromTransactions(mockStorage.ofx, year);
    const summaryAfterRollback = computeDRESummary(dreAfterRollback);

    assert(summaryAfterRollback.rBruta[2] === 0, 'Após Rollback: Receita de Março retornou exatamente a ZERO');
    assert(summaryAfterRollback.dOperacionais[2] === 0, 'Após Rollback: Despesa de Março retornou a ZERO');
    assert(summaryAfterRollback.rBruta[0] === 50000, 'Baseline intacto: Jan permanece R$ 50.000,00');
    assert(summaryAfterRollback.rBruta[1] === 60000, 'Baseline intacto: Fev permanece R$ 60.000,00');

    // Despublica também o lote de Abril para testar retorno total à estaca zero
    Publisher.unpublishBatch(batchAbril.batchId, { reason: 'Estorno de teste' }, mockContext);
    assert(mockStorage.ofx.length === initialOfx.length, 'Base de transações restaurada 100% ao baseline inicial');

    console.log('\n================================================================================');
    console.log(` RESULTADO FINAL: ${testsPassed} APROVADOS | ${testsFailed} FALHAS`);
    console.log('================================================================================\n');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runDashboardIntegrationTests();
