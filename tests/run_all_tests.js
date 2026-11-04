// ============================================================================
//  CONSOLIDATED TEST RUNNER: CLARUS EVOLUA®
//  tests/run_all_tests.js
// ============================================================================

const { execSync } = require('child_process');

const suites = [
    { name: 'Central de Revisão e Auditoria', script: 'tests/run_review_audit_tests.js' },
    { name: 'Integração com Dashboard & Regressão', script: 'tests/run_dashboard_integration_tests.js' },
    { name: 'Classificação Assistida por IA', script: 'tests/run_ai_classifier_tests.js' },
    { name: 'Motor de Conciliação Bancária', script: 'tests/run_reconciliation_tests.js' },
    { name: 'Módulo de Importação Canônico', script: 'tests/run_import_tests.js' }
];

console.log('================================================================================');
console.log(' EXECUTANDO SUÍTE COMPLETA DE TESTES DE INTEGRAÇÃO & REGRESSÃO');
console.log('================================================================================\n');

let totalSuitesPassed = 0;

suites.forEach((suite, idx) => {
    console.log(`[${idx + 1}/${suites.length}] Executando: ${suite.name} (${suite.script})...`);
    try {
        const out = execSync(`node ${suite.script}`, { encoding: 'utf8' });
        // Extrai a linha final de resultado
        const match = out.match(/RESULTADO FINAL: (\d+) APROVADOS \| (\d+) FALHAS/);
        if (match) {
            console.log(`   --> ${match[0]}`);
        } else {
            console.log(`   --> Concluído com sucesso.`);
        }
        totalSuitesPassed++;
    } catch (err) {
        console.error(`   --> [FALHA NA SUÍTE]:`, err.message);
        console.error(err.stdout);
        process.exit(1);
    }
});

console.log('\n================================================================================');
console.log(` TODAS AS ${totalSuitesPassed}/${suites.length} SUÍTES DE TESTES FORAM EXECUTADAS COM SUCESSO!`);
console.log('================================================================================\n');
