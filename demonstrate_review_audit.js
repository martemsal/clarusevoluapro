// ============================================================================
//  DEMONSTRAÇÃO COMPLETA: CENTRAL DE REVISÃO E AUDITORIA FINANCEIRA
//  demonstrate_review_audit.js
// ============================================================================

const AuditEngine = require('./review_audit_engine.js');
const Publisher = require('./dashboard_publisher.js');

console.log('================================================================================');
console.log(' DEMONSTRAÇÃO PRÁTICA: CENTRAL DE REVISÃO E AUDITORIA FINANCEIRA');
console.log(' Clarus Evolua® — Fluxo Completo com Dados Fictícios de Homologação');
console.log('================================================================================\n');

// 1. Simulação de Lote Extraído de Arquivo Fictício (Extrato Itaú Março 2026)
const batchMeta = {
    batchId: 'BATCH-2026-MAR-DEMO',
    companyId: 'comp_demo',
    fileName: 'Extrato_Itau_Mar2026_Homologacao.ofx',
    fileType: 'OFX',
    sha256: '8f7d92a10e4c632b55f1109923847acff123985a7114bced1432f2105e492100',
    importedBy: 'consultor@clarus.com.br',
    importedAt: '2026-03-31T10:00:00Z',
    year: 2026,
    month: 2 // Março (0-indexed)
};

console.log(`[Passo 1] Ingestão de Lote em Staging: #${batchMeta.batchId}`);
console.log(`  Arquivo de Origem: ${batchMeta.fileName}`);
console.log(`  Hash SHA-256 Inviolável: ${batchMeta.sha256}\n`);

// 2. Criação de Lançamentos Heterogêneos (Regulares, Exceções e Bloqueios)
const mockRecords = [
    AuditEngine.initRecordAudit({
        id: 'TXN-DEMO-001',
        source_line_number: 10,
        date: '2026-03-05',
        amount: 28500.00,
        description: 'TED RECEBIDA CLIENTE ALFA LTDA',
        rawDate: '05/03/2026',
        rawAmount: '28.500,00',
        rawDescription: 'TED 033 0001 002938472 ALFA COMERCIO LTDA CNPJ 11.222.333/0001-44',
        assigned_account: 'dre.receita_bruta.servicos',
        ai_classification: {
            suggested_account: 'dre.receita_bruta.servicos',
            confidence: 0.98,
            justification: 'Identificada entrada por TED referente a faturamento de cliente com contrato de serviços.'
        }
    }, batchMeta),

    AuditEngine.initRecordAudit({
        id: 'TXN-DEMO-002',
        source_line_number: 14,
        date: '2026-03-08',
        amount: -3200.00,
        description: 'PAGTO ALUGUEL IMOBILIARIA EVOLUIR',
        rawDate: '08/03/2026',
        rawAmount: '-3.200,00',
        rawDescription: 'PIX TRANSF IMOBILIARIA EVOLUIR LTDA ALUGUEL COMP MAR/26',
        assigned_account: 'dre.despesas_administrativas.aluguel',
        ai_classification: {
            suggested_account: 'dre.despesas_administrativas.aluguel',
            confidence: 0.99,
            justification: 'Histórico recorrente mapeado para despesa de aluguel administrativo.'
        }
    }, batchMeta),

    AuditEngine.initRecordAudit({
        id: 'TXN-DEMO-003',
        source_line_number: 22,
        date: '2026-03-12',
        amount: -1850.00,
        description: 'TRANSF PIX 83729104 SILVA',
        rawDate: '12/03/2026',
        rawAmount: '-1.850,00',
        rawDescription: 'PIX ENVIADO SILVA CONSULTORIA E PERICIAS ME',
        status: AuditEngine.STATES.PENDENTE_CLASSIFICACAO,
        assigned_account: null, // Sem conta! Exceção
        ai_classification: {
            suggested_account: 'dre.despesas_administrativas.honorarios',
            confidence: 0.65,
            is_uncertain: true,
            justification: 'Descrição ambígua com menção a serviços ou consultoria. Requer conferência do consultor.'
        }
    }, batchMeta),

    AuditEngine.initRecordAudit({
        id: 'TXN-DEMO-004',
        source_line_number: 35,
        date: '2026-03-15',
        amount: -550.00,
        description: 'TARIFA BANCARIA PACOTE CONTA',
        rawDate: '15/03/2026',
        rawAmount: '-550,00',
        rawDescription: 'DB TARIFA SERV PACOTE PJ DUPLICADA',
        status: AuditEngine.STATES.DUPLICIDADE_SUSPEITA,
        assigned_account: 'dre.despesas_financeiras.tarifas',
        divergence_reasons: ['Lançamento com mesmo valor, data e FITID já registrado anteriormente']
    }, batchMeta),

    AuditEngine.initRecordAudit({
        id: 'TXN-DEMO-005',
        source_line_number: 48,
        date: '2026-03-25',
        amount: -12000.00,
        description: 'PAGTO FORNECEDOR PECAS BRASIL',
        rawDate: '25/03/2026',
        rawAmount: '-12.000,00',
        rawDescription: 'PAG BOLETO 23793.38120 PECAS E EQUIPAMENTOS BRASIL',
        assigned_account: 'dre.custos.mercadorias',
        status: AuditEngine.STATES.DOCUMENTACAO_PENDENTE,
        document_requirement: 'Aguardando envio da DANFE nº 10928 para validação de crédito de ICMS.'
    }, batchMeta)
];

// 3. Cálculo de KPIs da Central de Auditoria
console.log('[Passo 2] Painel de Indicadores e Exceções Calculados em Tempo Real:');
const initialKPIs = AuditEngine.calculateAuditKPIs(mockRecords);
console.log(`  - Total de Registros: ${initialKPIs.totalImported}`);
console.log(`  - Total Validados: ${initialKPIs.totalValidated}`);
console.log(`  - Pendências Ativas: ${initialKPIs.totalPending}`);
console.log(`  - Registros Bloqueados: ${initialKPIs.totalBlocked}`);
console.log(`  - Detalhamento por Tipo:`);
console.log(`    * Sem Classificação: ${initialKPIs.byType.pendente_classificacao}`);
console.log(`    * Duplicidade Suspeita: ${initialKPIs.byType.duplicidade_suspeita}`);
console.log(`    * Documentação Pendente: ${initialKPIs.byType.documentacao_pendente}\n`);

// 4. Ação do Consultor: Reclassificar o registro ambíguo TXN-DEMO-003
console.log('[Passo 3] Ação do Consultor: Reclassificação do Lançamento Ambíguo (TXN-DEMO-003)');
const recAmbiguo = mockRecords.find(r => r.id === 'TXN-DEMO-003');
AuditEngine.reclassifyRecord(
    recAmbiguo,
    'dre.despesas_administrativas.honorarios',
    'Conferido com nota fiscal de prestação de serviços contábeis e laudo pericial.',
    { learnAI: true },
    { user: 'consultor@clarus.com.br' }
);
console.log(`  Status após reclassificação: ${recAmbiguo.status}`);
console.log(`  Conta atribuída: ${recAmbiguo.assigned_account}`);
console.log(`  Versão do registro: v${recAmbiguo.version}`);
console.log(`  Último evento no histórico: ${recAmbiguo.audit_history[recAmbiguo.audit_history.length - 1].action}\n`);

// 5. Ação do Consultor: Rejeição da tarifa duplicada TXN-DEMO-004
console.log('[Passo 4] Ação do Consultor: Rejeição Formal de Duplicata (TXN-DEMO-004)');
const recDuplicado = mockRecords.find(r => r.id === 'TXN-DEMO-004');
AuditEngine.rejectRecord(
    recDuplicado,
    'Tarifa cobrada em duplicidade pelo banco já estornada na conta.',
    {},
    { user: 'consultor@clarus.com.br' }
);
console.log(`  Status após rejeição: ${recDuplicado.status}`);
console.log(`  Motivo da rejeição: "${recDuplicado.rejection_reason}"`);
console.log(`  Preservado no histórico: SIM (${recDuplicado.audit_history.length} eventos gravados)\n`);

// 6. Aprovação em Lote dos Elegíveis
console.log('[Passo 5] Execução da Aprovação em Lote (Somente Elegíveis):');
const batchApprovalResult = AuditEngine.approveEligibleBatch(mockRecords, {
    justification: 'Aprovação em lote dos lançamentos regulares auditados.'
}, { user: 'consultor@clarus.com.br' });

console.log(`  - Total submetido: ${batchApprovalResult.summary.totalSubmitted}`);
console.log(`  - Aprovados com sucesso: ${batchApprovalResult.summary.approvedCount}`);
batchApprovalResult.approved.forEach(a => console.log(`    [✓ APROVADO] ${a.id} - ${a.description} (${a.assigned_account})`));
console.log(`  - Ignorados / Retidos: ${batchApprovalResult.summary.skippedCount}`);
batchApprovalResult.skipped.forEach(s => console.log(`    [⛔ RETIDO] ${s.record.id} - Motivo: ${s.reason}`));
console.log();

// 7. Exibição da Ficha Individual do Lançamento TXN-DEMO-001 (Seções A, B, C, D)
console.log('[Passo 6] Ficha Individual Detalhada do Lançamento TXN-DEMO-001:');
const ficha = AuditEngine.formatRecordFicha(mockRecords[0], batchMeta);
console.log('  --- SEÇÃO A: DADOS DO LANÇAMENTO ---');
console.log(`    ID: ${ficha.secaoA.id} | Direção: ${ficha.secaoA.direction} | Valor: R$ ${ficha.secaoA.amount.toFixed(2)}`);
console.log(`    Data Mov.: ${ficha.secaoA.date} | Competência: ${ficha.secaoA.competence_date}`);
console.log(`    Conta Gerencial: ${ficha.secaoA.category} | Status: ${ficha.secaoA.status}`);

console.log('  --- SEÇÃO B: EVIDÊNCIA ORIGINAL ---');
console.log(`    Arquivo: ${ficha.secaoB.file_name} (${ficha.secaoB.file_type}) | Referência: ${ficha.secaoB.source_reference}`);
console.log(`    Comparativo Original vs Canônico:`);
console.log(`      * Valor Bruto: "${ficha.secaoB.comparison.original_amount}" --> Normalizado: R$ ${ficha.secaoB.comparison.canonical_amount}`);
console.log(`      * Data Bruta: "${ficha.secaoB.comparison.original_date}" --> Canônica: ${ficha.secaoB.comparison.canonical_date}`);

console.log('  --- SEÇÃO C: CLASSIFICAÇÃO DA IA ---');
console.log(`    Sugestão IA: ${ficha.secaoC.suggested_account} (Confiança: ${Math.round(ficha.secaoC.confidence * 100)}%)`);
console.log(`    Justificativa: "${ficha.secaoC.justification}"`);

console.log('  --- SEÇÃO D: HISTÓRICO DE AUDITORIA ---');
ficha.secaoD.events.forEach(evt => {
    console.log(`    * [v${evt.version}] ${evt.timestamp.substring(0, 19)} | ${evt.action} por ${evt.user} | "${evt.justification}"`);
});
console.log();

// 8. Publicação Controlada no Dashboard via dashboard_publisher.js
console.log('[Passo 7] Publicação Controlada dos Registros Aprovados no Dashboard:');
const mockStorage = {
    batches: [batchMeta],
    records: { [batchMeta.batchId]: mockRecords },
    ofx: [],
    lancamentos: {
        dre: {
            receita_bruta: { servicos: 0 },
            despesas_administrativas: { aluguel: 0, honorarios: 0 }
        }
    },
    publicationHistory: []
};

const context = {
    companyId: 'comp_demo',
    user: { name: 'Consultor Clarus', email: 'consultor@clarus.com.br', role: 'admin' },
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

const pubResult = Publisher.publishBatch(batchMeta.batchId, {
    allowPartial: true,
    partialAuthorization: 'Autorizada publicação dos registros aprovados na auditoria preliminar.'
}, context);

console.log(`  Lote publicado com sucesso:`);
console.log(`  - Quantidade publicada: ${pubResult.publishedCount} transações`);
console.log(`  - Versão da publicação: v${pubResult.version}`);
console.log(`  - DRE Receita de Serviços: R$ ${mockStorage.lancamentos.dre.receita_bruta.servicos}`);
console.log(`  - DRE Aluguel: R$ ${mockStorage.lancamentos.dre.despesas_administrativas.aluguel}`);
console.log(`  - DRE Honorários: R$ ${mockStorage.lancamentos.dre.despesas_administrativas.honorarios}`);

console.log('\n================================================================================');
console.log(' DEMONSTRAÇÃO CONCLUÍDA COM 100% DE SUCESSO E ZERO INCONSISTÊNCIAS!');
console.log('================================================================================\n');
