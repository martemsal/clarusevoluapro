// ============================================================================
//  SUÍTE DE TESTES AUTOMATIZADOS: CENTRAL DE REVISÃO E AUDITORIA FINANCEIRA
//  tests/run_review_audit_tests.js
// ============================================================================

const assert = require('assert');
const AuditEngine = require('../review_audit_engine.js');
const Publisher = require('../dashboard_publisher.js');

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
    try {
        fn();
        console.log(`  [OK] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  [FALHA] ${description}`);
        console.error(`         ${err.message}`);
        failedTests++;
    }
}

console.log('\n================================================================================');
console.log(' SUÍTE DE TESTES: CENTRAL DE REVISÃO E AUDITORIA FINANCEIRA | CLARUS EVOLUA');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// GRUPO 1: Máquina de Estados e Transições Permitidas
// -----------------------------------------------------------------------------
console.log('1. Testando Ciclo Canônico e Transições de Estados');

it('Deve inicializar o registro com status canônico NORMALIZADO e evento de criação', () => {
    const raw = {
        transaction_id: 'TXN-001',
        date: '2026-03-10',
        amount: -1250.50,
        description: 'PAGTO FORNECEDOR ABC'
    };
    const rec = AuditEngine.initRecordAudit(raw, { importedBy: 'Admin Teste' });

    assert.strictEqual(rec.status, AuditEngine.STATES.NORMALIZADO);
    assert.strictEqual(rec.version, 1);
    assert.strictEqual(rec.direction, 'SAIDA');
    assert.strictEqual(rec.audit_history.length, 1);
    assert.strictEqual(rec.audit_history[0].action, 'EXTRACAO_INICIAL');
});

it('Deve validar transições permitidas no ciclo regular (RECEBIDO -> PUBLICADO)', () => {
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.RECEBIDO, AuditEngine.STATES.EXTRAIDO), true);
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.EXTRAIDO, AuditEngine.STATES.NORMALIZADO), true);
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.NORMALIZADO, AuditEngine.STATES.EM_VALIDACAO), true);
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.EM_VALIDACAO, AuditEngine.STATES.EM_CONFERENCIA), true);
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.EM_CONFERENCIA, AuditEngine.STATES.APROVADO), true);
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.APROVADO, AuditEngine.STATES.PUBLICADO), true);
});

it('Deve impedir transição direta inválida (ex: RECEBIDO diretamente para PUBLICADO)', () => {
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.RECEBIDO, AuditEngine.STATES.PUBLICADO), false);
    assert.strictEqual(AuditEngine.canTransition(AuditEngine.STATES.NORMALIZADO, AuditEngine.STATES.PUBLICADO), false);
});

// -----------------------------------------------------------------------------
// GRUPO 2: Aprovação e Rejeição com Justificativa Obrigatória
// -----------------------------------------------------------------------------
console.log('\n2. Testando Aprovação e Rejeição com Justificativa Obrigatória');

it('Deve aprovar lançamento com conta gerencial válida e incrementar versão', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-002',
        date: '2026-03-15',
        amount: -2500.00,
        description: 'ALUGUEL ESCRITORIO',
        assigned_account: 'dre.despesas_administrativas.aluguel'
    });

    AuditEngine.approveRecord(rec, { justification: 'Conferido com contrato de locação.' }, { user: 'consultor@clarus.com.br' });

    assert.strictEqual(rec.status, AuditEngine.STATES.APROVADO);
    assert.strictEqual(rec.version, 2);
    assert.strictEqual(rec.approved_by, 'consultor@clarus.com.br');
    assert.strictEqual(rec.audit_history.length, 2);
    assert.strictEqual(rec.audit_history[1].action, 'APROVACAO');
});

it('Deve bloquear aprovação de registro sem conta gerencial associada', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-003',
        date: '2026-03-15',
        amount: -800.00,
        description: 'DEBITO NAO IDENTIFICADO'
    });

    assert.throws(() => {
        AuditEngine.approveRecord(rec, {}, { user: 'consultor@clarus.com.br' });
    }, /sem conta contábil\/gerencial/);
});

it('Deve exigir justificativa formal obrigatória para rejeição', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-004',
        date: '2026-03-16',
        amount: -500.00,
        description: 'DEBITO DUPLICADO',
        assigned_account: 'dre.despesas_administrativas.outras'
    });

    // Sem justificativa -> lança erro
    assert.throws(() => {
        AuditEngine.rejectRecord(rec, '', {}, { user: 'consultor@clarus.com.br' });
    }, /justificativa formal obrigatória/);

    // Com justificativa -> rejeita com sucesso
    AuditEngine.rejectRecord(rec, 'Lançamento já debitado em outro extrato.', {}, { user: 'consultor@clarus.com.br' });
    assert.strictEqual(rec.status, AuditEngine.STATES.REJEITADO);
    assert.strictEqual(rec.rejection_reason, 'Lançamento já debitado em outro extrato.');
});

// -----------------------------------------------------------------------------
// GRUPO 3: Preservação Inviolável de Registros Rejeitados
// -----------------------------------------------------------------------------
console.log('\n3. Testando Preservação Inviolável de Registros Rejeitados');

it('Registro rejeitado NUNCA é excluído e mantém histórico imutável completo', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-005',
        date: '2026-03-17',
        amount: -150.00,
        description: 'TARIFA INDEVIDA ESTORNADA'
    });

    AuditEngine.rejectRecord(rec, 'Tarifa bancária indevida objeto de estorno.', {}, { user: 'auditor@clarus.com.br' });

    assert.strictEqual(rec.status, AuditEngine.STATES.REJEITADO);
    assert.strictEqual(rec.audit_history.length, 2);
    assert.strictEqual(rec.audit_history[1].action, 'REJEICAO');
    assert.strictEqual(rec.audit_history[1].immutable, true);
    assert.strictEqual(rec.audit_history[1].version, 2);
    assert.strictEqual(rec.audit_history[0].action, 'EXTRACAO_INICIAL');
});

// -----------------------------------------------------------------------------
// GRUPO 4: Correção e Reclassificação com Histórico e Aprendizado
// -----------------------------------------------------------------------------
console.log('\n4. Testando Correção de Dados e Reclassificação com Auditoria');

it('Deve permitir corrigir valor e data registrando antes vs depois na auditoria', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-006',
        date: '2026-03-10',
        amount: -100.00,
        description: 'COMPRA MATERIAL'
    });

    AuditEngine.correctRecord(rec, {
        amount: -120.50,
        competence_date: '2026-03-01'
    }, 'Ajuste conforme comprovante fiscal anexo.', {}, { user: 'consultor@clarus.com.br' });

    assert.strictEqual(rec.amount, -120.50);
    assert.strictEqual(rec.competence_date, '2026-03-01');
    assert.strictEqual(rec.version, 2);
    
    const lastEvt = rec.audit_history[rec.audit_history.length - 1];
    assert.strictEqual(lastEvt.action, 'CORRECAO_DADOS');
    assert.strictEqual(lastEvt.changes.previous_amount, -100.00);
    assert.strictEqual(lastEvt.changes.new_amount, -120.50);
});

it('Deve permitir reclassificação de conta exigindo justificativa e acionando aprendizado', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-007',
        date: '2026-03-12',
        amount: -4500.00,
        description: 'AMORT EMPRESTIMO BANCARIO',
        assigned_account: 'dre.despesas_financeiras.juros' // Erro proposital: amortização não é despesa
    });

    let aiLearned = false;
    const aiLearnCallback = (decision) => {
        if (decision.assigned_account === 'balanco.passivo_circulante.emprestimos_cp') {
            aiLearned = true;
        }
    };

    AuditEngine.reclassifyRecord(
        rec,
        'balanco.passivo_circulante.emprestimos_cp',
        'Amortização de principal reduz passivo no Balanço, não é despesa da DRE.',
        { learnAI: true },
        { user: 'consultor@clarus.com.br', aiLearnCallback }
    );

    assert.strictEqual(rec.assigned_account, 'balanco.passivo_circulante.emprestimos_cp');
    assert.strictEqual(aiLearned, true);
    assert.strictEqual(rec.status, AuditEngine.STATES.EM_CONFERENCIA);
    assert.strictEqual(rec.audit_history[rec.audit_history.length - 1].action, 'RECLASSIFICACAO');
});

// -----------------------------------------------------------------------------
// GRUPO 5: Ficha Individual e Comparação de Evidência Bruta vs Normalizada
// -----------------------------------------------------------------------------
console.log('\n5. Testando Ficha Individual e Comparativo Documental (Seções A, B, C, D)');

it('Deve montar a ficha individual completa com as 4 seções', () => {
    const rec = AuditEngine.initRecordAudit({
        id: 'REC-008',
        companyId: 'comp_demo',
        date: '2026-03-20',
        amount: 15000.00,
        description: 'RECEBIMENTO PIX CLIENTE XYZ',
        rawDate: '20/03/2026',
        rawAmount: '15.000,00',
        rawDescription: 'PIX TRANSF CLIENTE XYZ LTDA CNPJ 12.345.678/0001-90',
        source_file_name: 'extrato_mar2026.ofx',
        source_file_type: 'OFX',
        source_line_number: 42,
        assigned_account: 'dre.receita_bruta.servicos',
        ai_classification: {
            suggested_account: 'dre.receita_bruta.servicos',
            confidence: 0.95,
            justification: 'Identificada entrada referente a contrato de prestação de serviços.'
        }
    });

    const ficha = AuditEngine.formatRecordFicha(rec, { fileName: 'extrato_mar2026.ofx' });

    // Seção A
    assert.strictEqual(ficha.secaoA.direction, 'ENTRADA');
    assert.strictEqual(ficha.secaoA.amount, 15000.00);

    // Seção B
    assert.strictEqual(ficha.secaoB.file_name, 'extrato_mar2026.ofx');
    assert.strictEqual(ficha.secaoB.source_reference, 'Linha 42');
    assert.strictEqual(ficha.secaoB.comparison.original_amount, '15.000,00');
    assert.strictEqual(ficha.secaoB.comparison.canonical_amount, 15000.00);

    // Seção C
    assert.strictEqual(ficha.secaoC.confidence, 0.95);
    assert.strictEqual(ficha.secaoC.suggested_account, 'dre.receita_bruta.servicos');

    // Seção D
    assert.strictEqual(ficha.secaoD.version, 1);
    assert.strictEqual(ficha.secaoD.events.length, 1);
});

// -----------------------------------------------------------------------------
// GRUPO 6: Bloqueio Estrito de Registros Críticos para Publicação
// -----------------------------------------------------------------------------
console.log('\n6. Testando Bloqueio Estrito de Registros Críticos');

it('Deve bloquear publicação se existirem registros com pendências críticas', () => {
    const batch = {
        batchId: 'BATCH-AUD-01',
        companyId: 'comp_demo',
        status: 'STAGING_SALVO'
    };

    const records = [
        { id: '1', status: AuditEngine.STATES.APROVADO, assigned_account: 'dre.receita_bruta.servicos', amount: 1000 },
        { id: '2', status: AuditEngine.STATES.DIVERGENCIA_CONCILIACAO, assigned_account: 'dre.custos.mercadorias', amount: -300 }, // Crítico!
        { id: '3', status: AuditEngine.STATES.REJEITADO, amount: -100 } // Rejeitado
    ];

    const validation = Publisher.validateBatchForPublication(batch, records);
    assert.strictEqual(validation.canPublish, false);
    assert.strictEqual(validation.approvedRecords.length, 1);
    assert.strictEqual(validation.pendingRecords.length, 2);
});

// -----------------------------------------------------------------------------
// GRUPO 7: Aprovação em Lote Somente de Registros Elegíveis
// -----------------------------------------------------------------------------
console.log('\n7. Testando Aprovação em Lote com Filtro de Elegibilidade');

it('Deve aprovar em lote SOMENTE registros elegíveis e ignorar pendências críticas', () => {
    const rec1 = AuditEngine.initRecordAudit({ id: 'R1', date: '2026-03-01', amount: 5000, assigned_account: 'dre.receita_bruta.servicos' });
    const rec2 = AuditEngine.initRecordAudit({ id: 'R2', date: '2026-03-02', amount: -1200, assigned_account: 'dre.custos.mercadorias' });
    const rec3 = AuditEngine.initRecordAudit({ id: 'R3', date: '2026-03-03', amount: -400 }); // Sem categoria! Inelegível
    const rec4 = AuditEngine.initRecordAudit({ id: 'R4', date: '2026-03-04', amount: -600, status: AuditEngine.STATES.DUPLICIDADE_SUSPEITA, assigned_account: 'dre.despesas_administrativas.outras' }); // Duplicidade! Inelegível
    const rec5 = AuditEngine.initRecordAudit({ id: 'R5', date: '2026-03-05', amount: -900, status: AuditEngine.STATES.REJEITADO, assigned_account: 'dre.despesas_administrativas.outras' }); // Rejeitado! Inelegível

    const batchResult = AuditEngine.approveEligibleBatch([rec1, rec2, rec3, rec4, rec5], {
        justification: 'Aprovação em lote dos conferidos.'
    }, { user: 'consultor@clarus.com.br' });

    assert.strictEqual(batchResult.approved.length, 2); // Somente R1 e R2
    assert.strictEqual(batchResult.skipped.length, 3); // R3, R4 e R5 ignorados
    assert.strictEqual(rec1.status, AuditEngine.STATES.APROVADO);
    assert.strictEqual(rec2.status, AuditEngine.STATES.APROVADO);
    assert.strictEqual(rec3.status, AuditEngine.STATES.NORMALIZADO);
    assert.strictEqual(rec4.status, AuditEngine.STATES.DUPLICIDADE_SUSPEITA);
    assert.strictEqual(rec5.status, AuditEngine.STATES.REJEITADO);
});

// -----------------------------------------------------------------------------
// GRUPO 8: Isolamento Multi-Tenant por Empresa
// -----------------------------------------------------------------------------
console.log('\n8. Testando Isolamento Multi-Tenant por Empresa');

it('Filtro de auditoria deve segregar estritamente registros por empresa', () => {
    const allRecords = [
        AuditEngine.initRecordAudit({ id: 'R-A1', companyId: 'comp_demo', date: '2026-03-01', amount: 100 }),
        AuditEngine.initRecordAudit({ id: 'R-A2', companyId: 'comp_demo', date: '2026-03-02', amount: 200 }),
        AuditEngine.initRecordAudit({ id: 'R-B1', companyId: 'comp_outra', date: '2026-03-01', amount: 999 })
    ];

    const demoRecords = AuditEngine.filterRecords(allRecords, { companyId: 'comp_demo' });
    const outraRecords = AuditEngine.filterRecords(allRecords, { companyId: 'comp_outra' });

    assert.strictEqual(demoRecords.length, 2);
    assert.strictEqual(outraRecords.length, 1);
    assert.strictEqual(demoRecords.every(r => r.companyId === 'comp_demo'), true);
    assert.strictEqual(outraRecords.every(r => r.companyId === 'comp_outra'), true);
});

// -----------------------------------------------------------------------------
// GRUPO 9: Prevenção de Duplicidade e Idempotência
// -----------------------------------------------------------------------------
console.log('\n9. Testando Prevenção de Duplicidade');

it('Deve calcular chave de idempotência consistente e evitar reprocessamento duplicado', () => {
    const rec = {
        companyId: 'comp_demo',
        source_file_sha256: 'HASH123ABC',
        source_line_number: 14,
        date: '2026-03-10',
        amount: -250.00
    };

    const key1 = `${rec.companyId}_${rec.source_file_sha256}_L${rec.source_line_number}_${rec.date}_${rec.amount}`;
    const key2 = `${rec.companyId}_${rec.source_file_sha256}_L${rec.source_line_number}_${rec.date}_${rec.amount}`;

    assert.strictEqual(key1, key2);
    assert.strictEqual(key1, 'comp_demo_HASH123ABC_L14_2026-03-10_-250');
});

// -----------------------------------------------------------------------------
// GRUPO 10: KPIs de Auditoria e Agrupamento de Exceções
// -----------------------------------------------------------------------------
console.log('\n10. Testando KPIs da Central de Auditoria e Indicadores de Pendências');

it('Deve calcular precisamente totais importados, validados, pendentes e bloqueados', () => {
    const records = [
        AuditEngine.initRecordAudit({ id: '1', status: AuditEngine.STATES.APROVADO, assigned_account: 'A' }),
        AuditEngine.initRecordAudit({ id: '2', status: AuditEngine.STATES.PUBLICADO, assigned_account: 'B' }),
        AuditEngine.initRecordAudit({ id: '3', status: AuditEngine.STATES.PENDENTE_CLASSIFICACAO }),
        AuditEngine.initRecordAudit({ id: '4', status: AuditEngine.STATES.DIVERGENCIA_CONCILIACAO }),
        AuditEngine.initRecordAudit({ id: '5', status: AuditEngine.STATES.DOCUMENTACAO_PENDENTE }),
        AuditEngine.initRecordAudit({ id: '6', status: AuditEngine.STATES.REJEITADO }),
        AuditEngine.initRecordAudit({ id: '7', status: AuditEngine.STATES.BLOQUEADO })
    ];

    const kpis = AuditEngine.calculateAuditKPIs(records);

    assert.strictEqual(kpis.totalImported, 7);
    assert.strictEqual(kpis.totalValidated, 2); // Aprovado + Publicado
    assert.strictEqual(kpis.totalPending, 3); // Pendente Classif + Divergencia + Doc Pendente
    assert.strictEqual(kpis.totalBlocked, 2); // Rejeitado + Bloqueado
    assert.strictEqual(kpis.byType.pendente_classificacao, 1);
    assert.strictEqual(kpis.byType.divergencia_conciliacao, 1);
    assert.strictEqual(kpis.byType.documentacao_pendente, 1);
    assert.strictEqual(kpis.byType.rejeitado, 1);
    assert.strictEqual(kpis.byType.bloqueado, 1);
});

// -----------------------------------------------------------------------------
// RESULTADO FINAL
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(` RESULTADO FINAL: ${passedTests} APROVADOS | ${failedTests} FALHAS`);
console.log('================================================================================\n');

if (failedTests > 0) {
    process.exit(1);
}
