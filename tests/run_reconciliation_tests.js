// ============================================================================
//  CLARUS EVOLUA® — SUÍTE DE TESTES: MOTOR DE CONCILIAÇÃO & PARSERS BANCÁRIOS
// ============================================================================
// Executa testes rigorosos com arquivos de resultado conhecido para validação de
// OFX, CSV homologados, PDF digital, OCR, equações de saldo, duplicidades,
// sobreposições de período, transferências internas e rastreabilidade linha a linha.

const fs = require('fs');
const path = require('path');
const Engine = require('../reconciliation_engine.js');
const PdfExtractor = require('../pdf_extractor.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

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

function runReconciliationTests() {
    console.log('\n================================================================================');
    console.log(' SUÍTE DE TESTES: CONCILIAÇÃO BANCÁRIA, OFX, CSV HOMOLOGADO & AUDITORIA');
    console.log('================================================================================\n');

    // -------------------------------------------------------------------------
    // TESTE 1: Extrato OFX Válido e Conciliação Matemática de Saldo
    // -------------------------------------------------------------------------
    console.log('1. Testando Extrato OFX Válido e Batimento da Equação Fundamental');
    try {
        const ofxContent = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_valido.ofx'), 'utf-8');
        const parsed = Engine.parseOFX(ofxContent, { fileName: 'extrato_valido.ofx' });

        assert(parsed.format === 'OFX', 'Formato reconhecido como OFX');
        assert(parsed.bankMetadata.bankId === '341', 'Identificado código do banco Itaú (341)');
        assert(parsed.bankMetadata.accountId === '12345-6', 'Identificada conta corrente 12345-6');
        assert(parsed.transactions.length === 4, 'Extraídas todas as 4 transações do OFX');
        assert(parsed.transactions[0].line_number > 0, 'Rastreabilidade: linha de origem preservada para cada item');
        assert(parsed.transactions[0].fitid === '20260305001', 'Preservação de FITID bancário único');

        const reconciliation = Engine.reconcileStatement(parsed);
        assert(reconciliation.equation.initialBalance === 5000.00, 'Saldo inicial retroativo calculado: R$ 5.000,00');
        assert(reconciliation.equation.totalCredits === 8500.00, 'Total de créditos: R$ 8.500,00');
        assert(reconciliation.equation.totalDebits === 4250.50, 'Total de débitos: R$ 4.250,50');
        assert(reconciliation.equation.calculatedFinalBalance === 9249.50, 'Saldo final calculado: R$ 9.249,50');
        assert(reconciliation.equation.reportedFinalBalance === 9249.50, 'Saldo final informado no extrato: R$ 9.249,50');
        assert(reconciliation.equation.isBalanceReconciled === true, 'Equação de saldo perfeitamente conciliada (Delta 0,00)');
        assert(reconciliation.batchStatus === 'STAGING_AUDITADO', 'Status do lote validado como STAGING_AUDITADO');
    } catch (e) {
        assert(false, 'Teste de OFX válido falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 2: Extrato OFX com Divergência Deliberada de Saldo (Furo de Saldo)
    // -------------------------------------------------------------------------
    console.log('\n2. Testando Detecção de Divergência de Saldo (Gap / Lançamento Faltante)');
    try {
        const ofxDivergente = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_divergencia_saldo.ofx'), 'utf-8');
        const parsed = Engine.parseOFX(ofxDivergente, { fileName: 'extrato_divergencia_saldo.ofx', initialBalance: 5000.00 });
        const reconciliation = Engine.reconcileStatement(parsed, { initialBalance: 5000.00 });

        assert(reconciliation.equation.isBalanceReconciled === false, 'Detectada quebra da equação de saldo');
        assert(reconciliation.equation.balanceDifference === 750.50, 'Valor exato da divergência identificado: R$ 750,50');
        assert(reconciliation.batchStatus === 'PENDENTE_REVISAO', 'Lote automaticamente retido com status PENDENTE_REVISAO');
        assert(reconciliation.divergences.length > 0, 'Divergências registradas com apontamento claro');
    } catch (e) {
        assert(false, 'Teste de divergência de saldo falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 3: CSV Homologado Itaú (Data;Lançamento;Valor;Saldo)
    // -------------------------------------------------------------------------
    console.log('\n3. Testando CSV Homologado Itaú com Saldo Acumulado');
    try {
        const csvContent = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_itau_homologado.csv'), 'utf-8');
        const parsed = Engine.detectAndParseBankCsv(csvContent, { fileName: 'extrato_itau_homologado.csv' });

        assert(parsed.detectedBank === 'ITAU', 'Assinatura bancária identificada como ITAU');
        assert(parsed.transactions.length === 4, '4 lançamentos movimentados extraídos');
        assert(parsed.balances.initialBalanceReported === 2000.00, 'Saldo inicial capturado da linha anterior: R$ 2.000,00');
        assert(parsed.balances.finalBalanceReported === 5039.30, 'Saldo final reportado: R$ 5.039,30');

        const reconciliation = Engine.reconcileStatement(parsed);
        assert(reconciliation.equation.isBalanceReconciled === true, 'Equação de saldo do Itaú 100% batida');
        assert(reconciliation.equation.calculatedFinalBalance === 5039.30, 'Saldo calculado coincide com saldo da última linha');
    } catch (e) {
        assert(false, 'Teste de CSV Itaú falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 4: CSV Homologado Bradesco (Colunas Separadas de Crédito e Débito)
    // -------------------------------------------------------------------------
    console.log('\n4. Testando CSV Homologado Bradesco (Colunas Crédito/Débito Separadas)');
    try {
        const csvContent = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_bradesco_homologado.csv'), 'utf-8');
        const parsed = Engine.detectAndParseBankCsv(csvContent, { fileName: 'extrato_bradesco_homologado.csv' });

        assert(parsed.detectedBank === 'BRADESCO', 'Assinatura bancária identificada como BRADESCO');
        assert(parsed.transactions.length === 4, '4 transações extraídas');
        assert(parsed.balances.initialBalanceReported === 10000.00, 'Saldo inicial: R$ 10.000,00');
        assert(parsed.balances.finalBalanceReported === 7549.50, 'Saldo final: R$ 7.549,50');

        const reconciliation = Engine.reconcileStatement(parsed);
        assert(reconciliation.equation.totalCredits === 5700.00, 'Soma correta de créditos unificados: R$ 5.700,00');
        assert(reconciliation.equation.totalDebits === 8150.50, 'Soma correta de débitos unificados: R$ 8.150,50');
        assert(reconciliation.equation.isBalanceReconciled === true, 'Equação do Bradesco conciliada (Delta 0,00)');
    } catch (e) {
        assert(false, 'Teste de CSV Bradesco falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 5: CSV Homologado Santander
    // -------------------------------------------------------------------------
    console.log('\n5. Testando CSV Homologado Santander');
    try {
        const csvContent = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_santander_homologado.csv'), 'utf-8');
        const parsed = Engine.detectAndParseBankCsv(csvContent, { fileName: 'extrato_santander_homologado.csv' });

        assert(parsed.detectedBank === 'SANTANDER', 'Assinatura bancária identificada como SANTANDER');
        assert(parsed.balances.initialBalanceReported === 3500.00, 'Saldo do dia inicial: R$ 3.500,00');
        assert(parsed.balances.finalBalanceReported === 3600.00, 'Saldo final: R$ 3.600,00');

        const reconciliation = Engine.reconcileStatement(parsed);
        assert(reconciliation.equation.isBalanceReconciled === true, 'Equação Santander conciliada');
    } catch (e) {
        assert(false, 'Teste de CSV Santander falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 6: Leitura e Conciliação de PDF Digital
    // -------------------------------------------------------------------------
    console.log('\n6. Testando Extração de PDF Digital com Camada de Texto e Rastreabilidade');
    try {
        const pdfBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_pdf_digital.pdf'));
        const parsed = PdfExtractor.parseDigitalPdfStatement(pdfBuffer, { year: 2026 });

        assert(parsed.isScannedPdf === false, 'Detectado que o arquivo possui camada de texto digital');
        assert(parsed.statementInfo.bank.includes('BANCO CLARUS'), 'Banco identificado no cabeçalho do PDF');
        assert(parsed.statementInfo.initialBalance === 4500.00, 'Saldo anterior extraído: R$ 4.500,00');
        assert(parsed.statementInfo.finalBalance === 5434.50, 'Saldo final extraído: R$ 5.434,50');
        assert(parsed.transactions.length === 5, '5 lançamentos estruturados extraídos do PDF');
        assert(parsed.transactions[0].page_number === 1, 'Página de origem rastreada: Página 1');
        assert(parsed.transactions[0].line_number > 0, 'Linha no PDF rastreada');

        const reconciliation = Engine.reconcileStatement({
            period: { startDate: parsed.statementInfo.periodStart, endDate: parsed.statementInfo.periodEnd },
            balances: { initialBalanceReported: parsed.statementInfo.initialBalance, finalBalanceReported: parsed.statementInfo.finalBalance },
            transactions: parsed.transactions
        });

        assert(reconciliation.equation.isBalanceReconciled === true, 'Equação do PDF digital perfeitamente conciliada');
        assert(reconciliation.equation.calculatedFinalBalance === 5434.50, 'Saldo calculado coincide com saldo impresso');
    } catch (e) {
        assert(false, 'Teste de PDF digital falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 7: Módulo Separado de OCR para PDFs Escaneados
    // -------------------------------------------------------------------------
    console.log('\n7. Testando Módulo Desacoplado de OCR para PDFs Escaneados');
    try {
        const ocrModule = PdfExtractor.processScannedPdfOcr(null, { pageNumber: 2, year: 2026 });
        assert(ocrModule.is_ocr === true, 'Módulo de OCR marcado explicitamente como is_ocr: true');

        const simulatedOcrText = "12/03/2026 COMPRA MATERIAL ESCRITORIO -450,80\n20/03/2026 SERVICO CONSULTORIA 1.200,00";
        const ocrRecords = ocrModule.parseOcrText(simulatedOcrText, { 0: 0.98, 1: 0.91 });

        assert(ocrRecords.length === 2, '2 registros ópticos reconhecidos');
        assert(ocrRecords[0].page_number === 2, 'Página do OCR registrada: Página 2');
        assert(ocrRecords[0].confidence === 0.98, 'Score de confiança 98% no item 1');
        assert(ocrRecords[1].confidence === 0.91 && ocrRecords[1].requires_manual_check === true, 'Score 91% (< 95%) marcado para revisão manual obrigatória');
    } catch (e) {
        assert(false, 'Teste de módulo de OCR falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 8: Identificação de Transferências Entre Contas Próprias
    // -------------------------------------------------------------------------
    console.log('\n8. Testando Identificação de Transferências Entre Contas Próprias');
    try {
        const ofxA = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_transferencia_conta_a.ofx'), 'utf-8');
        const ofxB = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_transferencia_conta_b.ofx'), 'utf-8');

        const parsedA = Engine.parseOFX(ofxA, { fileName: 'conta_a_itau.ofx' });
        const parsedB = Engine.parseOFX(ofxB, { fileName: 'conta_b_bradesco.ofx' });

        // Concilia Conta A informando as movimentações da Conta B no contexto
        const reconciliationA = Engine.reconcileStatement(parsedA, {
            otherAccountTransactions: parsedB.transactions.map(t => Object.assign({}, t, { account: 'CONTA_BRADESCO_FILIAL' }))
        });

        const transfItem = reconciliationA.records.find(t => t.status === 'TRANSFERENCIA_IDENTIFICADA');
        assert(transfItem !== undefined, 'Transferência entre contas próprias detectada automaticamente');
        assert(transfItem.amount === -10000.00, 'Valor de débito de R$ 10.000,00 identificado como transferência');
        assert(reconciliationA.internalTransferPairs.length === 1, 'Par de transferência interna vinculado entre Conta A e Conta B');
    } catch (e) {
        assert(false, 'Teste de transferências entre contas falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 9: Detecção de Sobreposição de Períodos (Overlap)
    // -------------------------------------------------------------------------
    console.log('\n9. Testando Alerta de Sobreposição de Períodos de Extrato');
    try {
        const ofxSobreposicao = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_sobreposicao.ofx'), 'utf-8');
        const parsed = Engine.parseOFX(ofxSobreposicao, { fileName: 'extrato_sobreposicao.ofx' });

        // Simula lote já existente de 01/03/2026 a 20/03/2026
        const context = {
            existingBatches: [
                { batchId: 'BATCH-MAR-PARTE1', periodStart: '2026-03-01', periodEnd: '2026-03-20', fileName: 'extrato_parte1.ofx' }
            ]
        };

        const reconciliation = Engine.reconcileStatement(parsed, context);
        assert(reconciliation.periodAudit.hasOverlap === true, 'Detectada sobreposição de período com lote existente');
        assert(reconciliation.periodAudit.overlappingBatches[0].batchId === 'BATCH-MAR-PARTE1', 'Identificado o lote sobreposto');
        assert(reconciliation.batchStatus === 'PENDENTE_REVISAO', 'Lote sobreposto retido em PENDENTE_REVISAO');
    } catch (e) {
        assert(false, 'Teste de sobreposição de períodos falhou', e.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 10: Detecção de Duplicidades e Não-Descarte Silencioso
    // -------------------------------------------------------------------------
    console.log('\n10. Testando Detecção de Duplicidades e Garantia de Não-Descarte');
    try {
        const csvDuplicidade = fs.readFileSync(path.join(FIXTURES_DIR, 'extrato_duplicidade.csv'), 'utf-8');
        const parsed = Engine.detectAndParseBankCsv(csvDuplicidade, { fileName: 'extrato_duplicidade.csv' });
        const reconciliation = Engine.reconcileStatement(parsed);

        assert(parsed.transactions.length === 3, 'Todos os 3 lançamentos mantidos (nenhum descarte silencioso)');
        const dupItem = reconciliation.records.find(t => t.status === 'DUPLICIDADE_SUSPEITA');
        assert(dupItem !== undefined, 'Lançamento repetido identificado como DUPLICIDADE_SUSPEITA');
        assert(dupItem.line_number === 3, 'Linha duplicada rastreada exatamente: Linha 3');
        assert(reconciliation.batchStatus === 'PENDENTE_REVISAO', 'Lote com duplicidade retido em PENDENTE_REVISAO');
    } catch (e) {
        assert(false, 'Teste de duplicidades falhou', e.message);
    }

    console.log('\n================================================================================');
    console.log(` RESULTADO FINAL: ${testsPassed} APROVADOS | ${testsFailed} FALHAS`);
    console.log('================================================================================\n');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runReconciliationTests();
