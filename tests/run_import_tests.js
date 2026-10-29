// ============================================================================
//  CLARUS EVOLUA® — SUÍTE DE TESTES AUTOMATIZADOS DO MÓDULO DE IMPORTAÇÃO
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Engine = require('../import_engine.js');

// Mock localStorage for Node.js testing of staging storage
const mockStorage = {};
global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

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

function runTests() {
    console.log('\n============================================================');
    console.log(' INICIANDO SUÍTE DE TESTES: MÓDULO DE IMPORTAÇÃO CANÔNICA');
    console.log('============================================================\n');

    // -------------------------------------------------------------
    // TESTE 1: Delimitador e Formato Brasileiro (Ponto e Vírgula)
    // -------------------------------------------------------------
    console.log('1. Testando Layout 1: CSV com delimitador ";" e números com vírgula decimal');
    try {
        const fileContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_ponto_virgula.csv'), 'utf-8');
        const delim = Engine.detectDelimiter(fileContent);
        assert(delim === ';', 'Detecção automática do delimitador ponto e vírgula (;)', `Detectado: ${delim}`);

        const parsed = Engine.parseCsvString(fileContent);
        assert(parsed.rows.length === 5, 'Leitura de todas as 5 linhas da planilha', `Total: ${parsed.rows.length}`);

        const inspected = Engine.detectHeaderRow(parsed.rows);
        assert(inspected.headers.length === 5, 'Detecção dos 5 cabeçalhos');

        const mapping = Engine.suggestColumnMapping(inspected.headers);
        assert(mapping.data && mapping.valor && mapping.descricao, 'Mapeamento automático de colunas obrigatórias');

        const normalized = Engine.normalizeRecords(inspected.headers, inspected.dataRows, mapping);
        assert(normalized.validRows === 4, '4 linhas válidas normalizadas');
        assert(normalized.records[0].amount === 1540.50, 'Conversão correta de valor positivo 1.540,50 -> 1540.5');
        assert(normalized.records[1].amount === -850.20, 'Conversão correta de valor negativo -850,20 -> -850.2');
        assert(normalized.records[0].date === '2026-03-05', 'Conversão de data brasileira 05/03/2026 -> 2026-03-05');
    } catch (e) {
        assert(false, 'Layout 1 falhou com erro', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 2: Delimitador Vírgula e Moeda com "R$" e Aspas
    // -------------------------------------------------------------
    console.log('\n2. Testando Layout 2: CSV com delimitador "," e campos cotados com R$');
    try {
        const fileContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_virgula.csv'), 'utf-8');
        const delim = Engine.detectDelimiter(fileContent);
        assert(delim === ',', 'Detecção automática do delimitador vírgula (,)', `Detectado: ${delim}`);

        const parsed = Engine.parseCsvString(fileContent, ',');
        const inspected = Engine.detectHeaderRow(parsed.rows);
        const mapping = Engine.suggestColumnMapping(inspected.headers);
        const normalized = Engine.normalizeRecords(inspected.headers, inspected.dataRows, mapping);

        assert(normalized.validRows === 3, '3 linhas válidas extraídas com campos cotados');
        assert(normalized.records[0].amount === 5000.00, 'Remoção de "R$" e conversão de 5.000,00 -> 5000.0');
        assert(normalized.records[1].amount === -1250.75, 'Tratamento de "-R$ 1.250,75" -> -1250.75');
    } catch (e) {
        assert(false, 'Layout 2 falhou com erro', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 3: Formatos Variados de Valores Negativos
    // -------------------------------------------------------------
    console.log('\n3. Testando Múltiplas Notações de Números Negativos');
    try {
        const fileContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_negativos.csv'), 'utf-8');
        const parsed = Engine.parseCsvString(fileContent);
        const inspected = Engine.detectHeaderRow(parsed.rows);
        const mapping = { data: 'Data', valor: 'Valor', descricao: 'Descricao' };
        const normalized = Engine.normalizeRecords(inspected.headers, inspected.dataRows, mapping);

        assert(normalized.records[0].amount === -100.50, 'Sinal de menos no início: -100,50 -> -100.5');
        assert(normalized.records[1].amount === -200.75, 'Sinal de menos no final: 200,75- -> -200.75');
        assert(normalized.records[2].amount === -350.00, 'Parênteses contábeis: (350,00) -> -350.0');
        assert(normalized.records[3].amount === -420.25, 'Sufixo de débito D: 420,25 D -> -420.25');
        assert(normalized.records[4].amount === 900.00, 'Sufixo de crédito C: 900,00 C -> 900.0 (positivo)');
    } catch (e) {
        assert(false, 'Teste de negativos falhou', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 4: Linhas Vazias e Espaçamentos Descartados
    // -------------------------------------------------------------
    console.log('\n4. Testando Descarte de Linhas Vazias e Espaçamentos');
    try {
        const fileContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_linhas_vazias.csv'), 'utf-8');
        const parsed = Engine.parseCsvString(fileContent);
        const inspected = Engine.detectHeaderRow(parsed.rows);
        const mapping = Engine.suggestColumnMapping(inspected.headers);
        const normalized = Engine.normalizeRecords(inspected.headers, inspected.dataRows, mapping);

        assert(normalized.validRows === 2, 'Apenas 2 linhas reais de dados foram processadas, ignorando vazios');
        assert(normalized.records.length === 2, 'Nenhuma linha fantasma foi gerada');
    } catch (e) {
        assert(false, 'Teste de linhas vazias falhou', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 5: Cabeçalhos Repetidos e Colunas Vazias
    // -------------------------------------------------------------
    console.log('\n5. Testando Tratamento de Cabeçalhos Repetidos e Colunas Sem Nome');
    try {
        const fileContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_cabecalhos_repetidos.csv'), 'utf-8');
        const parsed = Engine.parseCsvString(fileContent);
        const inspected = Engine.detectHeaderRow(parsed.rows);

        assert(inspected.headers.includes('Valor'), 'Contém primeira coluna "Valor"');
        assert(inspected.headers.includes('Valor_2'), 'Segunda coluna "Valor" desduplicada para "Valor_2"');
        assert(inspected.headers.some(h => h.startsWith('Coluna_')), 'Coluna sem nome renomeada para Coluna_N');
    } catch (e) {
        assert(false, 'Teste de cabeçalhos repetidos falhou', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 6: Múltiplas Abas em Arquivos Excel (XLSX)
    // -------------------------------------------------------------
    console.log('\n6. Testando Múltiplas Abas em Arquivo Excel (XLSX)');
    try {
        const xlsxPath = path.join(FIXTURES_DIR, 'layout_multiplas_abas.xlsx');
        const helperPath = path.join(__dirname, 'read_xlsx.py');
        const output = execSync(`python "${helperPath}" "${xlsxPath}"`, { encoding: 'utf-8' });
        const sheetsData = JSON.parse(output);

        const sheetNames = Object.keys(sheetsData);
        assert(sheetNames.length === 3, 'Identificadas com sucesso 3 abas na planilha', `Abas: ${sheetNames.join(', ')}`);
        assert(sheetNames.includes('Janeiro') && sheetNames.includes('Fevereiro') && sheetNames.includes('Metas_Anuais'), 'Nomes das abas correspondem aos dados');

        // Test normalising sheet "Fevereiro" specifically
        const fevRows = sheetsData['Fevereiro'];
        const inspected = Engine.detectHeaderRow(fevRows);
        const mapping = Engine.suggestColumnMapping(inspected.headers);
        const normalized = Engine.normalizeRecords(inspected.headers, inspected.dataRows, mapping);

        assert(normalized.validRows === 2, '2 transações da aba "Fevereiro" normalizadas');
        assert(normalized.records[0].amount === 4800.00, 'Valor de serviço 4800.00 correto');
        assert(normalized.records[1].amount === -3200.50, 'Valor de folha -3200.50 correto');
    } catch (e) {
        assert(false, 'Teste de múltiplas abas XLSX falhou', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 7: Arquivos Inválidos e Mensagens Claras de Erro
    // -------------------------------------------------------------
    console.log('\n7. Testando Tratamento de Arquivos Inválidos e Erros Descritivos');
    try {
        let threwOnEmpty = false;
        try {
            const emptyContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_invalido_corrompido.csv'), 'utf-8');
            Engine.parseCsvString(emptyContent);
        } catch (err) {
            threwOnEmpty = true;
            assert(err.message.includes('vazio') || err.message.includes('dados encontrada'), 'Mensagem clara para CSV sem dados', err.message);
        }
        assert(threwOnEmpty, 'Exceção lançada corretamente para arquivo vazio');

        let threwOnMissingMapping = false;
        try {
            Engine.normalizeRecords(['A', 'B'], [['1', '2']], { data: '', valor: '', descricao: '' });
        } catch (err) {
            threwOnMissingMapping = true;
            assert(err.message.includes('obrigatórias'), 'Mensagem clara de mapeamento incompleto', err.message);
        }
        assert(threwOnMissingMapping, 'Exceção lançada para mapeamento ausente');
    } catch (e) {
        assert(false, 'Teste de arquivos inválidos falhou', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 8: Reimportação do Mesmo Arquivo e Anti-Duplicidade
    // -------------------------------------------------------------
    console.log('\n8. Testando Anti-Duplicidade em Reimportações e Isolamento de Lotes');
    try {
        const fileContent = fs.readFileSync(path.join(FIXTURES_DIR, 'layout_ponto_virgula.csv'), 'utf-8');
        const fileSha256 = Engine.computeSha256(fileContent);

        const compA = 'empresa_cliente_A';
        const compB = 'empresa_cliente_B';

        const batchMeta = {
            fileName: 'extrato_marco_2026.csv',
            fileType: 'CSV',
            fileSize: fileContent.length,
            fileSha256: fileSha256,
            period: '2026-03',
            mapping: { data: 'Data', valor: 'Valor', descricao: 'Descricao' },
            userName: 'Saldanha (Consultor)'
        };

        const mockNormalized = {
            totalRows: 4,
            validRows: 4,
            invalidRows: 0,
            totalCredit: 1661.30,
            totalDebit: 895.20,
            netBalance: 766.10,
            records: [{ isValid: true, amount: 100 }]
        };

        // 1ª importação para Empresa A
        const batch1 = Engine.saveStagingBatch(compA, batchMeta, [['raw']], mockNormalized);
        assert(batch1.batchId.startsWith('BATCH-'), '1º Lote registrado com sucesso em staging');
        assert(batch1.status === 'STAGING_SALVO', 'Status do lote registrado como STAGING_SALVO');

        // 2ª importação do MESMO arquivo para a MESMA Empresa A
        let threwDuplicate = false;
        try {
            Engine.saveStagingBatch(compA, batchMeta, [['raw']], mockNormalized);
        } catch (dupErr) {
            threwDuplicate = true;
            assert(dupErr.message.includes('já foi importado anteriormente'), 'Anti-duplicidade bloqueou reimportação do mesmo lote');
        }
        assert(threwDuplicate, 'Bloqueio de duplicidade disparado para a mesma empresa');

        // 3ª importação do MESMO arquivo para Empresa B (deve ser permitida pelo isolamento multi-tenant)
        let allowedCompB = false;
        try {
            const batchCompB = Engine.saveStagingBatch(compB, batchMeta, [['raw']], mockNormalized);
            allowedCompB = batchCompB && batchCompB.companyId === compB;
        } catch (err) {
            allowedCompB = false;
        }
        assert(allowedCompB, 'Isolamento multi-tenant: o mesmo arquivo foi aceito para empresa B diferente');

        // Verificar histórico de lotes da Empresa A
        const historyA = Engine.listCompanyBatches(compA);
        assert(historyA.length === 1, 'Empresa A possui exatamente 1 lote no histórico');
        assert(historyA[0].fileSha256 === fileSha256, 'Hash SHA-256 preservado com integridade');
    } catch (e) {
        assert(false, 'Teste de anti-duplicidade falhou', e.message);
    }

    // -------------------------------------------------------------
    // TESTE 9: Formatos Diversos de Data Brasileira
    // -------------------------------------------------------------
    console.log('\n9. Testando Conversão de Formatos de Data');
    assert(Engine.parseBrazilianDate('15/03/2026') === '2026-03-15', 'Data com barra DD/MM/YYYY');
    assert(Engine.parseBrazilianDate('15-03-2026') === '2026-03-15', 'Data com traço DD-MM-YYYY');
    assert(Engine.parseBrazilianDate('2026-03-15') === '2026-03-15', 'Data ISO YYYY-MM-DD');
    assert(Engine.parseBrazilianDate('15/03/26') === '2026-03-15', 'Data ano abreviado DD/MM/YY');
    assert(Engine.parseBrazilianDate('31/02/2026') === null, 'Data inexistente (31 de Fevereiro) rejeitada como null');

    console.log('\n============================================================');
    console.log(` RESULTADO FINAL: ${testsPassed} APROVADOS | ${testsFailed} FALHAS`);
    console.log('============================================================\n');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runTests();
