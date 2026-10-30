// ============================================================================
//  CLARUS EVOLUA® — SUÍTE DE TESTES: CLASSIFICAÇÃO GERENCIAL ASSISTIDA POR IA
// ============================================================================
// Executa validações exaustivas das regras financeiras, anti-alucinação,
// isolamento contábil e ciclo de aprendizado contínuo da Lia Financeira.

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

function runClassifierTests() {
    console.log('\n================================================================================');
    console.log(' SUÍTE DE TESTES: CLASSIFICAÇÃO GERENCIAL ASSISTIDA POR IA & AUDITORIA');
    console.log('================================================================================\n');

    const contextIndustria = {
        company: { id: 'comp_ind', name: 'Metalúrgica Alvorada', tipo_atividade: 'Indústria', segment: 'Metalmecânico' },
        approvedHistory: []
    };

    const contextServico = {
        company: { id: 'comp_srv', name: 'Tech Solutions Consultoria', tipo_atividade: 'Serviço', segment: 'Tecnologia' },
        approvedHistory: []
    };

    // -------------------------------------------------------------------------
    // 1. TESTES DE DESPESAS OPERACIONAIS
    // -------------------------------------------------------------------------
    console.log('1. Testando Classificação de Despesas Operacionais (DRE)');
    
    // Aluguel
    const rAluguel = Classifier.classifyTransaction({
        transaction_id: 'TX-001',
        description: 'PAGTO ALUGUEL SEDE GALPAO IMOBILIARIA CENTRAL',
        amount: -4500.00,
        date: '2026-03-05'
    }, contextIndustria);
    assert(rAluguel.suggested_category === 'dre.despesas_administrativas.aluguel', 'Aluguel classificado em dre.despesas_administrativas.aluguel');
    assert(rAluguel.financial_nature === 'DESPESA_ADMINISTRATIVA_OCUPACAO', 'Natureza identificada como Ocupação');
    assert(rAluguel.supplier_client === 'IMOBILIARIA CENTRAL', 'Fornecedor extraído fielmente: "IMOBILIARIA CENTRAL"');
    assert(rAluguel.confidence_score >= 0.90, 'Confiança alta >= 90%');

    // Marketing / Tráfego
    const rTrafego = Classifier.classifyTransaction({
        transaction_id: 'TX-002',
        description: 'PAGTO GOOGLE ADS CAMPANHA VENDAS MARCO',
        amount: -1850.20,
        date: '2026-03-10'
    }, contextServico);
    assert(rTrafego.suggested_category === 'dre.despesas_comercial.trafego', 'Marketing classificado em dre.despesas_comercial.trafego');
    assert(rTrafego.supplier_client === 'Google Brasil', 'Fornecedor identificado como Google Brasil');

    // Fretes / Logística
    const rFrete = Classifier.classifyTransaction({
        transaction_id: 'TX-003',
        description: 'PAGAMENTO TRANSPORTADORA JADLOG FRETE CLIENTES',
        amount: -620.00,
        date: '2026-03-12'
    }, contextIndustria);
    assert(rFrete.suggested_category === 'dre.despesas_comercial.transporte_logistica', 'Frete classificado em transporte_logistica');

    // Tarifas Bancárias
    const rTarifa = Classifier.classifyTransaction({
        transaction_id: 'TX-004',
        description: 'TARIFA BANCARIA PACOTE MENSAL CONTA CORRENTE',
        amount: -89.90,
        date: '2026-03-15'
    }, contextServico);
    assert(rTarifa.suggested_category === 'dre.despesas_financeiras.tarifas', 'Tarifa bancária em despesas_financeiras.tarifas');

    // -------------------------------------------------------------------------
    // 2. TESTES DE RECEITAS OPERACIONAIS & FINANCEIRAS
    // -------------------------------------------------------------------------
    console.log('\n2. Testando Receitas Operacionais e Financeiras');

    // Venda de Produtos (Indústria)
    const rVendaProd = Classifier.classifyTransaction({
        transaction_id: 'TX-005',
        description: 'PIX RECEBIDO CLIENTE BETA LTDA DUPLICATA 1142',
        amount: 8500.00,
        date: '2026-03-05'
    }, contextIndustria);
    assert(rVendaProd.suggested_category === 'dre.receita_bruta.produtos', 'Indústria: Recebimento direcionado para venda de produtos');
    assert(rVendaProd.statement_destination === 'DRE', 'Destino é DRE');

    // Prestação de Serviços (Empresa de Serviço)
    const rVendaSrv = Classifier.classifyTransaction({
        transaction_id: 'TX-006',
        description: 'FATURA CLIENTE CONTRATO CONSULTORIA MENSAL',
        amount: 12000.00,
        date: '2026-03-05'
    }, contextServico);
    assert(rVendaSrv.suggested_category === 'dre.receita_bruta.servicos', 'Empresa de Serviço: Faturamento em prestação de serviços');

    // Rendimentos de Aplicação Financeira
    const rRendimento = Classifier.classifyTransaction({
        transaction_id: 'TX-007',
        description: 'RENDIMENTO APLICACAO CDB LIQUIDEZ DIARIA',
        amount: 450.75,
        date: '2026-03-31'
    }, contextIndustria);
    assert(rRendimento.suggested_category === 'dre.receitas_financeiras.rendimentos', 'Rendimento classificado em receitas_financeiras.rendimentos');

    // -------------------------------------------------------------------------
    // 3. TESTES DE EMPRÉSTIMOS (ANTI-CONFUSÃO: RECEITA/DESPESA vs PASSIVO)
    // -------------------------------------------------------------------------
    console.log('\n3. Testando Empréstimos: Não-Confusão com Receita ou Despesa');

    // Entrada de Empréstimo de Capital de Giro (Crédito > 0) -> PASSIVO, NÃO RECEITA!
    const rEntradaEmprestimo = Classifier.classifyTransaction({
        transaction_id: 'TX-008',
        description: 'LIBERACAO EMPRESTIMO CAPITAL DE GIRO PRONAMPE',
        amount: 50000.00,
        date: '2026-03-10'
    }, contextIndustria);
    assert(rEntradaEmprestimo.suggested_category === 'balanco.passivo_circulante.emprestimos_cp', 'Captação de empréstimo classificada no Passivo Circulante');
    assert(rEntradaEmprestimo.statement_destination === 'BALANCO', 'Entrada de mútuo direcionada ao Balanço, NÃO ao DRE');
    assert(rEntradaEmprestimo.financial_nature !== 'RECEITA_OPERACIONAL_BRUTA', 'Inviolável: Entrada de empréstimo NÃO é receita');

    // Amortização de Principal (Débito < 0) -> REDUÇÃO DE PASSIVO, NÃO DESPESA!
    const rAmortizacao = Classifier.classifyTransaction({
        transaction_id: 'TX-009',
        description: 'AMORTIZACAO PRINCIPAL EMPRESTIMO GIRO PARC 04/24',
        amount: -2500.00,
        date: '2026-03-20'
    }, contextIndustria);
    assert(rAmortizacao.suggested_category === 'balanco.passivo_circulante.emprestimos_cp', 'Amortização de principal classificada como baixa de Passivo');
    assert(rAmortizacao.statement_destination === 'BALANCO', 'Inviolável: Amortização de dívida NÃO é despesa DRE');

    // Juros do Empréstimo -> Despesa Financeira
    const rJurosEmprestimo = Classifier.classifyTransaction({
        transaction_id: 'TX-010',
        description: 'DEBITO JUROS E IOF S/ EMPRESTIMO GIRO',
        amount: -340.50,
        date: '2026-03-20'
    }, contextIndustria);
    assert(rJurosEmprestimo.suggested_category === 'dre.despesas_financeiras.juros', 'Juros bancários do empréstimo classificados em despesas_financeiras.juros');
    assert(rJurosEmprestimo.statement_destination === 'DRE', 'Juros debitados transitam pelo DRE');

    // -------------------------------------------------------------------------
    // 4. TESTES DE TRANSFERÊNCIAS ENTRE CONTAS PRÓPRIAS
    // -------------------------------------------------------------------------
    console.log('\n4. Testando Transferências Internas (Mesma Titularidade)');

    const rTransfInterna = Classifier.classifyTransaction({
        transaction_id: 'TX-011',
        description: 'TRANSFERENCIA MESMA TITULARIDADE CONTA ITAU PARA BRADESCO',
        amount: -10000.00,
        date: '2026-03-15'
    }, contextIndustria);
    assert(rTransfInterna.suggested_category === 'transferencia.interna', 'Transferência entre contas próprias categorizada como transferencia.interna');
    assert(rTransfInterna.statement_destination === 'MUTACAO_DISPONIBILIDADES', 'Destino é Mutação de Disponibilidades');
    assert(!rTransfInterna.suggested_category.startsWith('dre.'), 'Inviolável: Transferência NÃO é despesa nem receita');

    // -------------------------------------------------------------------------
    // 5. TESTES DE TRIBUTOS E IMPOSTOS
    // -------------------------------------------------------------------------
    console.log('\n5. Testando Impostos e Deduções');

    const rImpostoDas = Classifier.classifyTransaction({
        transaction_id: 'TX-012',
        description: 'PAGAMENTO GUIA DAS SIMPLES NACIONAL PERIODO 02/2026',
        amount: -3250.80,
        date: '2026-03-20'
    }, contextServico);
    assert(rImpostoDas.suggested_category === 'dre.deducoes.impostos', 'DAS Simples classificado em dre.deducoes.impostos');
    assert(rImpostoDas.financial_nature === 'DEDUCAO_RECEITA_TRIBUTOS', 'Natureza classificada como Dedução da Receita');

    // -------------------------------------------------------------------------
    // 6. TESTES DE FOLHA DE PAGAMENTO, ENCARGOS & SÓCIOS
    // -------------------------------------------------------------------------
    console.log('\n6. Testando Folha de Pagamento, Encargos e Sócios');

    // Salários CLT
    const rSalarios = Classifier.classifyTransaction({
        transaction_id: 'TX-013',
        description: 'PAGTO LIQUIDO FOLHA SALARIOS FUNCIONARIOS REF FEV',
        amount: -18400.00,
        date: '2026-03-05'
    }, contextIndustria);
    assert(rSalarios.suggested_category === 'dre.despesas_pessoal.salarios', 'Salários CLT em dre.despesas_pessoal.salarios');

    // INSS Previdenciário
    const rInss = Classifier.classifyTransaction({
        transaction_id: 'TX-014',
        description: 'PAGTO GPS GUIA DA PREVIDENCIA SOCIAL INSS FOLHA',
        amount: -2800.00,
        date: '2026-03-20'
    }, contextIndustria);
    assert(rInss.suggested_category === 'dre.despesas_pessoal.inss', 'INSS em dre.despesas_pessoal.inss');

    // FGTS
    const rFgts = Classifier.classifyTransaction({
        transaction_id: 'TX-015',
        description: 'PAGTO GUIA FGTS CONECTIVIDADE SOCIAL REF FEV',
        amount: -1472.00,
        date: '2026-03-07'
    }, contextIndustria);
    assert(rFgts.suggested_category === 'dre.despesas_pessoal.fgts', 'FGTS em dre.despesas_pessoal.fgts');

    // Pró-Labore de Sócios
    const rProLabore = Classifier.classifyTransaction({
        transaction_id: 'TX-016',
        description: 'RETIRADA PRO LABORE SOCIO DIRETOR MARCO',
        amount: -6000.00,
        date: '2026-03-05'
    }, contextIndustria);
    assert(rProLabore.suggested_category === 'dre.despesas_administrativas.pro_labore', 'Pró-Labore em despesas_administrativas.pro_labore');

    // Distribuição de Lucros / Dividendos -> PATRIMÔNIO LÍQUIDO, NÃO DESPESA!
    const rDividendos = Classifier.classifyTransaction({
        transaction_id: 'TX-017',
        description: 'DISTRIBUICAO DE LUCROS ANTECIPADOS SOCIO B',
        amount: -15000.00,
        date: '2026-03-28'
    }, contextIndustria);
    assert(rDividendos.suggested_category === 'balanco.patrimonio_liquido.lucros_acumulados', 'Dividendos em balanco.patrimonio_liquido.lucros_acumulados');
    assert(rDividendos.statement_destination === 'BALANCO', 'Inviolável: Dividendos NÃO são despesa da DRE');

    // -------------------------------------------------------------------------
    // 7. TESTES DE ESTOQUES & MATÉRIA-PRIMA (CUSTO CMV vs DESPESA)
    // -------------------------------------------------------------------------
    console.log('\n7. Testando Custos de Mercadorias e Estoques (CMV)');

    const rCmv = Classifier.classifyTransaction({
        transaction_id: 'TX-018',
        description: 'PAGAMENTO FORNECEDOR MATERIA PRIMA ACO DISTRIBUIDORA',
        amount: -7800.00,
        date: '2026-03-14'
    }, contextIndustria);
    assert(rCmv.suggested_category === 'dre.custos.mercadorias', 'Compra de matéria-prima classificada como CMV/Custo');
    assert(rCmv.account_group === 'Custos Diretos', 'Grupo correto: Custos Diretos');

    // -------------------------------------------------------------------------
    // 8. TESTES DE INVESTIMENTOS (CAPEX / ATIVO IMOBILIZADO)
    // -------------------------------------------------------------------------
    console.log('\n8. Testando Investimentos (Ativo Imobilizado / Capex)');

    const rCapex = Classifier.classifyTransaction({
        transaction_id: 'TX-019',
        description: 'PAGAMENTO COMPRA MAQUINA INDUSTRIAL TORNO CNC MODELO 2026',
        amount: -45000.00,
        date: '2026-03-18'
    }, contextIndustria);
    assert(rCapex.suggested_category === 'balanco.ativo_nao_circulante.imobilizado', 'Máquina industrial classificada no Ativo Imobilizado');
    assert(rCapex.statement_destination === 'BALANCO', 'Inviolável: Investimento em Capex NÃO é despesa corrente no DRE');

    // -------------------------------------------------------------------------
    // 9. TESTES DE OPERAÇÕES AMBÍGUAS & PROIBIÇÃO DE ALUCINAÇÃO
    // -------------------------------------------------------------------------
    console.log('\n9. Testando Operações Ambíguas e Proibição de Alucinação');

    const rAmbiguo = Classifier.classifyTransaction({
        transaction_id: 'TX-020',
        description: 'PIX ENVIADO 987654321',
        amount: -450.00,
        date: '2026-03-22'
    }, contextIndustria);
    assert(rAmbiguo.uncertainty_flag === true, 'Operação ambígua marcada com uncertainty_flag: true');
    assert(rAmbiguo.confidence_score < 0.70, 'Confiança baixa (< 70%) para transação sem histórico');
    assert(rAmbiguo.supplier_client === null, 'Inviolável: NÃO inventou fornecedor fantasma');
    assert(rAmbiguo.requires_human_review === true, 'Revisão humana obrigatória');
    assert(rAmbiguo.approval_status === 'SUGESTAO_PENDENTE', 'Sugestão em status SUGESTAO_PENDENTE (não definitiva)');

    // -------------------------------------------------------------------------
    // 10. TESTES DO CICLO DE APRENDIZADO & NÃO-RETROATIVIDADE
    // -------------------------------------------------------------------------
    console.log('\n10. Testando Ciclo de Aprendizado e Não-Retroatividade');

    const memoryStore = [];
    const transactionsList = [
        {
            transaction_id: 'TX-AMB-01',
            description: 'PAGTO BOLETO TIT 44091 ASSINATURA',
            amount: -299.00,
            date: '2026-03-01',
            status: 'Pendente',
            ai_suggestion: Classifier.classifyTransaction({
                transaction_id: 'TX-AMB-01',
                description: 'PAGTO BOLETO TIT 44091 ASSINATURA',
                amount: -299.00
            }, contextServico)
        },
        {
            transaction_id: 'TX-PAST-00',
            description: 'PAGAMENTO ANTERIOR JA FECHADO',
            amount: -100.00,
            date: '2026-02-15',
            status: 'APROVADO',
            assigned_account: 'dre.despesas_administrativas.outras'
        }
    ];

    // Consultor corrige a transação ambígua ensinando que é software de design
    Classifier.correctSuggestion(
        'TX-AMB-01',
        'dre.despesas_administrativas.outras',
        'Refere-se à assinatura de software Adobe Creative Cloud',
        transactionsList,
        memoryStore,
        'Consultor Marcos Saldanha'
    );

    assert(transactionsList[0].status === 'APROVADO_COM_CORRECAO', 'Status atualizado para APROVADO_COM_CORRECAO');
    assert(transactionsList[0].assigned_account === 'dre.despesas_administrativas.outras', 'Conta corrigida pelo consultor aplicada');
    assert(memoryStore.length === 1, 'Memória de aprendizado recebeu 1 novo padrão');
    assert(transactionsList[1].status === 'APROVADO', 'Não-Retroatividade: Transação fechada anterior NÃO foi alterada');

    // Nova transação semelhante chega no lote seguinte
    const contextWithMemory = {
        company: contextServico.company,
        approvedHistory: memoryStore
    };

    const rNovaTransacao = Classifier.classifyTransaction({
        transaction_id: 'TX-AMB-02',
        description: 'PAGTO BOLETO TIT 44091 ASSINATURA REF ABRIL',
        amount: -299.00,
        date: '2026-04-01'
    }, contextWithMemory);

    assert(rNovaTransacao.rule_source === 'HISTORICAL_MEMORY', 'Nova transação classificada pela Memória de Aprendizado');
    assert(rNovaTransacao.suggested_category === 'dre.despesas_administrativas.outras', 'Sugestão futura aprendeu a conta corrigida');
    assert(rNovaTransacao.confidence_score >= 0.95, 'Confiança elevada para 96% devido ao histórico prévio aprovado');

    console.log('\n================================================================================');
    console.log(` RESULTADO FINAL: ${testsPassed} APROVADOS | ${testsFailed} FALHAS`);
    console.log('================================================================================\n');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runClassifierTests();
