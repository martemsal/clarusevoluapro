// ============================================================================
//  CLARUS EVOLUA® — MOTOR DE CLASSIFICAÇÃO GERENCIAL ASSISTIDA POR IA (LIA)
// ============================================================================
// Motor híbrido determinístico e semântico para classificação contábil-gerencial.
// Adere estritamente ao Plano de Contas da Clarus Evolua, às normas contábeis
// (DRE, Balanço, Fluxo de Caixa) e às diretrizes anti-alucinação.
//
// REGRAS INVIOLÁVEIS:
// 1. Nunca inventar fornecedor, conta contábil, competência ou natureza.
// 2. Não confundir débito bancário com despesa (ex: amortização de empréstimo, Capex).
// 3. Não confundir crédito bancário com receita (ex: captação de mútuo, aporte).
// 4. Não confundir transferências entre contas próprias com receita/despesa.
// 5. Sugestões NUNCA são gravadas como definitivas sem aprovação do consultor.
// 6. As correções aprovadas aprimoram o aprendizado contínuo sem alterar o passado.
// ============================================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EFO_AiClassifier = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. PLANO DE CONTAS CANÔNICO DA CLARUS EVOLUA
    // -------------------------------------------------------------------------
    const CHART_OF_ACCOUNTS = {
        // --- RECEITAS DRE ---
        'dre.receita_bruta.produtos': {
            label: 'Venda de Produtos',
            destination: 'DRE',
            nature: 'RECEITA_OPERACIONAL_BRUTA',
            allowed_sign: [1], // Somente créditos
            group: 'Receitas Operacionais'
        },
        'dre.receita_bruta.servicos': {
            label: 'Prestação de Serviços',
            destination: 'DRE',
            nature: 'RECEITA_OPERACIONAL_BRUTA',
            allowed_sign: [1],
            group: 'Receitas Operacionais'
        },
        'dre.receita_bruta.outras': {
            label: 'Outras Receitas Operacionais',
            destination: 'DRE',
            nature: 'RECEITA_OPERACIONAL_BRUTA',
            allowed_sign: [1],
            group: 'Receitas Operacionais'
        },
        'dre.receitas_financeiras.rendimentos': {
            label: 'Receitas Financeiras / Rendimentos',
            destination: 'DRE',
            nature: 'RECEITA_FINANCEIRA',
            allowed_sign: [1],
            group: 'Receitas Financeiras'
        },
        'dre.receitas_financeiras.juros_recebidos': {
            label: 'Juros Ativos Recebidos',
            destination: 'DRE',
            nature: 'RECEITA_FINANCEIRA',
            allowed_sign: [1],
            group: 'Receitas Financeiras'
        },

        // --- DEDUÇÕES E CUSTOS DRE ---
        'dre.deducoes.impostos': {
            label: 'Impostos S/ Faturamento (DAS/ICMS/ISS/PIS/COFINS)',
            destination: 'DRE',
            nature: 'DEDUCAO_RECEITA_TRIBUTOS',
            allowed_sign: [-1], // Débito
            group: 'Deduções da Receita'
        },
        'dre.deducoes.devolucoes': {
            label: 'Devoluções de Vendas',
            destination: 'DRE',
            nature: 'DEDUCAO_RECEITA',
            allowed_sign: [-1],
            group: 'Deduções da Receita'
        },
        'dre.deducoes.descontos': {
            label: 'Descontos Incondicionais Concedidos',
            destination: 'DRE',
            nature: 'DEDUCAO_RECEITA',
            allowed_sign: [-1],
            group: 'Deduções da Receita'
        },
        'dre.custos.mercadorias': {
            label: 'CMV (Compra de Mercadorias e Insumos Diretos)',
            destination: 'DRE',
            nature: 'CUSTO_MERCADORIA_VENDIDA',
            allowed_sign: [-1],
            group: 'Custos Diretos'
        },
        'dre.custos.producao': {
            label: 'Custos Diretos de Produção',
            destination: 'DRE',
            nature: 'CUSTO_PRODUCAO',
            allowed_sign: [-1],
            group: 'Custos Diretos'
        },
        'dre.custos.servicos': {
            label: 'CSP (Custos dos Serviços Prestados / Subcontratação)',
            destination: 'DRE',
            nature: 'CUSTO_SERVICOS_PRESTADOS',
            allowed_sign: [-1],
            group: 'Custos Diretos'
        },

        // --- DESPESAS OPERACIONAIS DRE ---
        'dre.despesas_comercial.trafego': {
            label: 'Marketing Digital / Tráfego Pago',
            destination: 'DRE',
            nature: 'DESPESA_COMERCIAL_MARKETING',
            allowed_sign: [-1],
            group: 'Despesas Comerciais'
        },
        'dre.despesas_comercial.transporte_logistica': {
            label: 'Fretes, Transporte e Logística de Vendas',
            destination: 'DRE',
            nature: 'DESPESA_COMERCIAL_LOGISTICA',
            allowed_sign: [-1],
            group: 'Despesas Comerciais'
        },
        'dre.despesas_comercial.comissao': {
            label: 'Comissão s/ Vendas',
            destination: 'DRE',
            nature: 'DESPESA_COMERCIAL_VARIAVEL',
            allowed_sign: [-1],
            group: 'Despesas Comerciais'
        },
        'dre.despesas_comercial.viagens': {
            label: 'Viagens e Hospedagens Comerciais',
            destination: 'DRE',
            nature: 'DESPESA_COMERCIAL_GERAL',
            allowed_sign: [-1],
            group: 'Despesas Comerciais'
        },
        'dre.despesas_administrativas.aluguel': {
            label: 'Aluguel e Condomínio ADM',
            destination: 'DRE',
            nature: 'DESPESA_ADMINISTRATIVA_OCUPACAO',
            allowed_sign: [-1],
            group: 'Despesas Administrativas'
        },
        'dre.despesas_administrativas.honorarios': {
            label: 'Honorários Contábeis, Jurídicos e Consultoria',
            destination: 'DRE',
            nature: 'DESPESA_ADMINISTRATIVA_HONORARIOS',
            allowed_sign: [-1],
            group: 'Despesas Administrativas'
        },
        'dre.despesas_administrativas.pro_labore': {
            label: 'Pró-Labore de Sócios e Diretores',
            destination: 'DRE',
            nature: 'REMUNERACAO_SOCIOS_PRO_LABORE',
            allowed_sign: [-1],
            group: 'Despesas com Pessoal'
        },
        'dre.despesas_administrativas.outras': {
            label: 'Outras Despesas Administrativas / Softwares / Telecom',
            destination: 'DRE',
            nature: 'DESPESA_ADMINISTRATIVA_GERAL',
            allowed_sign: [-1],
            group: 'Despesas Administrativas'
        },
        'dre.despesas_pessoal.salarios': {
            label: 'Salários e Remuneração de Funcionários',
            destination: 'DRE',
            nature: 'DESPESA_PESSOAL_SALARIOS',
            allowed_sign: [-1],
            group: 'Despesas com Pessoal'
        },
        'dre.despesas_pessoal.inss': {
            label: 'INSS Patronal / Folha',
            destination: 'DRE',
            nature: 'DESPESA_PESSOAL_ENCARGOS',
            allowed_sign: [-1],
            group: 'Despesas com Pessoal'
        },
        'dre.despesas_pessoal.fgts': {
            label: 'FGTS s/ Folha',
            destination: 'DRE',
            nature: 'DESPESA_PESSOAL_ENCARGOS',
            allowed_sign: [-1],
            group: 'Despesas com Pessoal'
        },
        'dre.despesas_pessoal.beneficios': {
            label: 'Benefícios (VR, VA, VT, Plano de Saúde)',
            destination: 'DRE',
            nature: 'DESPESA_PESSOAL_BENEFICIOS',
            allowed_sign: [-1],
            group: 'Despesas com Pessoal'
        },
        'dre.despesas_estrutura.manutencao': {
            label: 'Manutenção Predial e Limpeza',
            destination: 'DRE',
            nature: 'DESPESA_ESTRUTURA_MANUTENCAO',
            allowed_sign: [-1],
            group: 'Despesas Operacionais'
        },
        'dre.despesas_veiculos.combustivel': {
            label: 'Combustível e Manutenção de Frotas',
            destination: 'DRE',
            nature: 'DESPESA_OPERACIONAL_VEICULOS',
            allowed_sign: [-1],
            group: 'Despesas Operacionais'
        },
        'dre.despesas_financeiras.tarifas': {
            label: 'Tarifas Bancárias, TED/PIX e Taxas de Cartão',
            destination: 'DRE',
            nature: 'DESPESA_FINANCEIRA_TARIFAS',
            allowed_sign: [-1],
            group: 'Despesas Financeiras'
        },
        'dre.despesas_financeiras.juros': {
            label: 'Juros Passivos e Encargos Financeiros',
            destination: 'DRE',
            nature: 'DESPESA_FINANCEIRA_JUROS',
            allowed_sign: [-1],
            group: 'Despesas Financeiras'
        },
        'dre.despesas_financeiras.iof': {
            label: 'IOF Bancário / Operações de Crédito',
            destination: 'DRE',
            nature: 'DESPESA_FINANCEIRA_IOF',
            allowed_sign: [-1],
            group: 'Despesas Financeiras'
        },

        // --- BALANÇO: ATIVO CIRCULANTE & NÃO CIRCULANTE ---
        'balanco.ativo_circulante.caixa_bancos': {
            label: 'Caixa e Contas Bancárias (Disponibilidades)',
            destination: 'BALANCO',
            nature: 'ATIVO_CIRCULANTE_DISPONIBILIDADES',
            allowed_sign: [-1, 1],
            group: 'Ativo Circulante'
        },
        'balanco.ativo_circulante.aplicacoes': {
            label: 'Aplicações Financeiras de Curto Prazo (CDB/DI)',
            destination: 'BALANCO',
            nature: 'ATIVO_CIRCULANTE_APLICACOES',
            allowed_sign: [-1, 1],
            group: 'Ativo Circulante'
        },
        'balanco.ativo_circulante.estoques': {
            label: 'Estoques de Mercadorias / Matéria-Prima',
            destination: 'BALANCO',
            nature: 'ATIVO_CIRCULANTE_ESTOQUES',
            allowed_sign: [-1, 1],
            group: 'Ativo Circulante'
        },
        'balanco.ativo_circulante.adiantamentos': {
            label: 'Adiantamentos Concedidos (Funcionários/Fornecedores)',
            destination: 'BALANCO',
            nature: 'ATIVO_CIRCULANTE_ADIANTAMENTOS',
            allowed_sign: [-1, 1],
            group: 'Ativo Circulante'
        },
        'balanco.ativo_circulante.clientes_receber': {
            label: 'Contas a Receber de Clientes / Duplicatas',
            destination: 'BALANCO',
            nature: 'ATIVO_CIRCULANTE_CREDITOS',
            allowed_sign: [-1, 1],
            group: 'Ativo Circulante'
        },
        'balanco.ativo_nao_circulante.imobilizado': {
            label: 'Ativo Imobilizado (Máquinas, Veículos, Equipamentos, Obras)',
            destination: 'BALANCO',
            nature: 'ATIVO_NAO_CIRCULANTE_CAPEX',
            allowed_sign: [-1], // Saída de caixa por aquisição de bens duráveis
            group: 'Ativo Não Circulante'
        },

        // --- BALANÇO: PASSIVO E PATRIMÔNIO LÍQUIDO ---
        'balanco.passivo_circulante.fornecedores': {
            label: 'Fornecedores a Pagar (Liquidação de Título)',
            destination: 'BALANCO',
            nature: 'PASSIVO_LIQUIDACAO_FORNECEDORES',
            allowed_sign: [-1],
            group: 'Passivo Circulante'
        },
        'balanco.passivo_circulante.emprestimos_cp': {
            label: 'Empréstimos e Financiamentos CP (Amortização / Captação)',
            destination: 'BALANCO',
            nature: 'PASSIVO_MUTUO_EMPRESTIMO',
            allowed_sign: [-1, 1], // +1 captação (entrada), -1 amortização (saída)
            group: 'Passivo Circulante'
        },
        'balanco.passivo_circulante.obrigacoes_trab': {
            label: 'Obrigações Trabalhistas a Pagar',
            destination: 'BALANCO',
            nature: 'PASSIVO_TRABALHISTA_LIQUIDACAO',
            allowed_sign: [-1],
            group: 'Passivo Circulante'
        },
        'balanco.passivo_circulante.obrigacoes_trib': {
            label: 'Obrigações Tributárias / Parcelamentos Fiscais',
            destination: 'BALANCO',
            nature: 'PASSIVO_TRIBUTARIO_LIQUIDACAO',
            allowed_sign: [-1],
            group: 'Passivo Circulante'
        },
        'balanco.passivo_nao_circulante.emprestimos_lp': {
            label: 'Empréstimos e Financiamentos de Longo Prazo',
            destination: 'BALANCO',
            nature: 'PASSIVO_MUTUO_LP',
            allowed_sign: [-1, 1],
            group: 'Passivo Não Circulante'
        },
        'balanco.patrimonio_liquido.capital_social': {
            label: 'Capital Social (Aportes / Integralização de Sócios)',
            destination: 'BALANCO',
            nature: 'PATRIMONIO_LIQUIDO_APORTE',
            allowed_sign: [1], // Entrada de dinheiro dos sócios NÃO É RECEITA
            group: 'Patrimônio Líquido'
        },
        'balanco.patrimonio_liquido.lucros_acumulados': {
            label: 'Distribuição de Lucros / Dividendos aos Sócios',
            destination: 'BALANCO',
            nature: 'PATRIMONIO_LIQUIDO_DIVIDENDOS',
            allowed_sign: [-1], // Retirada de sócios NÃO É DESPESA
            group: 'Patrimônio Líquido'
        },

        // --- DISPONIBILIDADES / TRANSF INTERNA ---
        'transferencia.interna': {
            label: 'Transferência Entre Contas Próprias / Mesma Titularidade',
            destination: 'MUTACAO_DISPONIBILIDADES',
            nature: 'TRANSFERENCIA_MESMA_TITULARIDADE',
            allowed_sign: [-1, 1],
            group: 'Disponibilidades'
        },
        'ignore': {
            label: 'Ignorar / Não Contabilizar',
            destination: 'IGNORADO',
            nature: 'EXTRA_GERENCIAL',
            allowed_sign: [-1, 1],
            group: 'Outros'
        }
    };

    // -------------------------------------------------------------------------
    // 2. EXTRAÇÃO ESTRITA DE FORNECEDORES & CONTRAPARTES (NUNCA INVENTA)
    // -------------------------------------------------------------------------
    function extractSupplierOrCounterparty(description) {
        if (!description || typeof description !== 'string') return null;
        const clean = description.trim().toUpperCase();

        // Se for descrição genérica ou ambígua sem nome, retorna NULL
        const genericPatterns = [
            /^PIX\s*(?:ENVIADO|RECEBIDO|TRANSF)?\s*$/i,
            /^TED\s*(?:ENVIADA|RECEBIDA)?\s*$/i,
            /^DOC\s*(?:ENVIADO|RECEBIDO)?\s*$/i,
            /^TRANSFERENCIA\s*(?:PIX|TED|DOC|CONTA)?\s*$/i,
            /^PAGAMENTO\s*(?:ELETRONICO|TITULO|BOLETO|CONTA)?\s*$/i,
            /^PAGTO\s*(?:ELETRONICO|TITULO|BOLETO)?\s*$/i,
            /^DIVERSOS\s*$/i,
            /^OUTROS\s*$/i,
            /^LANCAMENTO\s*(?:A|DE)?\s*DEBITO/i,
            /^LANCAMENTO\s*(?:A|DE)?\s*CREDITO/i,
            /^TARIFA\s*BANCARIA/i,
            /^DEBITO\s*AUTOMATICO/i,
            /^SAQUE\s*(?:BANCO|ATM|24H)?/i
        ];

        for (const gen of genericPatterns) {
            if (gen.test(clean)) return null;
        }

        // 1. Extração estruturada de PIX com favorecido:
        // "PIX TRANSF FORNECEDOR ALVORADA ALIMENTOS LTDA 05/03" -> "ALVORADA ALIMENTOS LTDA"
        // "PIX RECEBIDO CLIENTE MERCADO LIVRE" -> "MERCADO LIVRE"
        const pixMatch = clean.match(/(?:PIX\s+(?:TRANSF|ENVIADO|RECEBIDO|DE|PARA)\s+)(?:FORNECEDOR|CLIENTE)?\s*([A-Z0-9\s\.\-_]+?)(?:\s+DOC|\s+CPF|\s+CNPJ|\s+AUT|\s+\d{2}\/\d{2}|$)/);
        if (pixMatch && pixMatch[1].trim().length >= 3) {
            const candidate = pixMatch[1].trim();
            if (!genericPatterns.some(g => g.test(candidate))) {
                return candidate;
            }
        }

        // 2. Extração de Fornecedor explícito: "PAGTO FORNECEDOR XYZ SA" ou estabelecimento comercial
        const fornMatch = clean.match(/(?:FORNECEDOR|FAVORECIDO|PAGTO\s+A\b|CREDITO\s+DE\b)\s*[:\-]?\s*([A-Z0-9\s\.\-_]+?)(?:\s+DOC|\s+NF|\s+CHQ|\s+PEDIDO|\s+\d{2}\/\d{2}|$)/);
        if (fornMatch && fornMatch[1].trim().length >= 3) {
            return fornMatch[1].trim();
        }

        const orgMatch = clean.match(/(?:(?:IMOBILIARIA|POSTO|DISTRIBUIDORA|ATACADO|TRANSPORTADORA|AUTO\s*POSTO)\s+[A-Z0-9\.\-_]+)/);
        if (orgMatch && orgMatch[0].trim().length >= 3) {
            return orgMatch[0].trim();
        }

        // 3. Fornecedores conhecidos de infraestrutura/telecom/tech recorrentes
        const knownVendors = [
            { key: 'GOOGLE', name: 'Google Brasil' },
            { key: 'FACEBOOK', name: 'Meta Platforms / Facebook' },
            { key: 'META ADS', name: 'Meta Platforms' },
            { key: 'AWS', name: 'Amazon Web Services' },
            { key: 'MICROSOFT', name: 'Microsoft' },
            { key: 'CLARO', name: 'Claro Telecom' },
            { key: 'VIVO', name: 'Telefônica Brasil (Vivo)' },
            { key: 'TIM', name: 'TIM Celular' },
            { key: 'CELESC', name: 'Celesc Distribuição' },
            { key: 'ENEL', name: 'Enel Energia' },
            { key: 'COPEL', name: 'Copel Energia' },
            { key: 'SABESP', name: 'Sabesp' },
            { key: 'CASAN', name: 'Casan' },
            { key: 'POSTO IPIRANGA', name: 'Posto Ipiranga' },
            { key: 'POSTO SHELL', name: 'Posto Shell' },
            { key: 'POSTO PETROBRAS', name: 'Posto Petrobras' },
            { key: 'UBER', name: 'Uber Technologies' },
            { key: 'APPLE', name: 'Apple Brasil' },
            { key: 'DELL', name: 'Dell Computadores' }
        ];

        for (const v of knownVendors) {
            if (clean.includes(v.key)) {
                return v.name;
            }
        }

        // Não conseguiu extrair um nome seguro -> retorna NULL (proibido inventar)
        return null;
    }

    // -------------------------------------------------------------------------
    // 3. MOTOR DE CLASSIFICAÇÃO GERENCIAL DETERMINÍSTICO & ASSISTIDO
    // -------------------------------------------------------------------------
    function classifyTransaction(transaction, context) {
        context = context || {};
        const company = context.company || { tipo_atividade: 'Serviço', segment: 'Serviços' };
        const activityType = company.tipo_atividade || 'Serviço';
        const memoryHistory = context.approvedHistory || []; // Memória de decisões anteriores

        const rawDesc = (transaction.description || '').trim();
        const descUpper = rawDesc.toUpperCase();
        const amount = Number(transaction.amount) || 0;
        const absAmount = Math.abs(amount);
        const isCredit = amount > 0;
        const isDebit = amount < 0;

        const evidences = [];
        let category = null;
        let confidence = 0.50;
        let justification = '';
        let uncertaintyFlag = false;
        let ruleSource = 'EXPERT_HEURISTIC';
        const detectedSupplier = extractSupplierOrCounterparty(rawDesc);

        if (detectedSupplier) {
            evidences.push(`Contraparte identificada: "${detectedSupplier}"`);
        }

        // =====================================================================
        // PASSO 1: CONSULTA À MEMÓRIA DE CLASSIFICAÇÕES APROVADAS (HISTÓRICO)
        // Regra: Correções e decisões prévias do consultor têm precedência.
        // =====================================================================
        if (memoryHistory.length > 0) {
            const memoryMatch = memoryHistory.find(mem => {
                // Deve casar o sinal da operação (+ ou -)
                const signMatches = (amount > 0 && mem.amount_sign > 0) || (amount < 0 && mem.amount_sign < 0);
                if (!signMatches) return false;

                // Casamento de descrição (exata ou por tokens chaves normalizados)
                if (mem.raw_description && mem.raw_description.toUpperCase() === descUpper) {
                    return true;
                }
                if (mem.pattern_token && descUpper.includes(mem.pattern_token.toUpperCase())) {
                    return true;
                }
                if (mem.tokens && mem.tokens.length > 0 && mem.tokens.every(t => descUpper.includes(t))) {
                    return true;
                }
                if (detectedSupplier && mem.supplier_client && mem.supplier_client.toUpperCase() === detectedSupplier.toUpperCase()) {
                    return true;
                }
                return false;
            });

            if (memoryMatch && CHART_OF_ACCOUNTS[memoryMatch.assigned_account]) {
                category = memoryMatch.assigned_account;
                confidence = 0.96;
                ruleSource = 'HISTORICAL_MEMORY';
                justification = `Classificação proposta com base no histórico aprovado pelo consultor para o padrão "${memoryMatch.pattern_token || memoryMatch.raw_description}".`;
                evidences.push(`Histórico prévio aprovado por: ${memoryMatch.action_by || 'Consultor'}`);
                evidences.push(`Padrão correspondente: "${memoryMatch.pattern_token || memoryMatch.raw_description}"`);

                return formatClassificationResult(transaction, category, confidence, justification, evidences, uncertaintyFlag, ruleSource, detectedSupplier);
            }
        }

        // =====================================================================
        // PASSO 2: REGRAS INVIOLÁVEIS ANTI-CONFUSÃO FINANCEIRA
        // =====================================================================

        // ---------------------------------------------------------------------
        // REGRA A: TRANSFERÊNCIAS ENTRE CONTAS PRÓPRIAS (NÃO É RECEITA NEM DESPESA)
        // ---------------------------------------------------------------------
        const isTransferKeywords = /TRANSFERENCIA\s+MESMA\s+TITULARIDADE|TRANSF.*CONTA\s+PROPRIA|PIX\s+MESMA\s+TITULARIDADE|TED\s+MESMA\s+TITULARIDADE|APLICACAO\s+DIARIA|RESGATE\s+INVESTIMENTO/i.test(descUpper);
        if (isTransferKeywords || transaction.status === 'TRANSFERENCIA_IDENTIFICADA') {
            category = 'transferencia.interna';
            confidence = 0.95;
            justification = 'Movimentação financeira entre contas da própria empresa ou aplicação imediata. Não representa despesa nem receita operacional, preservando o resultado gerencial neutro.';
            evidences.push('Identificação de mesma titularidade bancária');
            evidences.push('Preservação de neutralidade no DRE (Mutação de Disponibilidades)');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA B: EMPRÉSTIMOS E FINANCIAMENTOS (PASSIVO vs DESPESA FINANCEIRA)
        // ---------------------------------------------------------------------
        const isLoanKeyword = /EMPRESTIMO|FINANCIAMENTO|MUTUO|CAPITAL\s+DE\s+GIRO|GIRO\s+FACIL|BNDES|PRONAMPE|GIROCOMPLEX/i.test(descUpper);
        if (isLoanKeyword) {
            // Se for entrada de recursos (Crédito > 0): É PASSIVO, NUNCA RECEITA!
            if (isCredit) {
                category = 'balanco.passivo_circulante.emprestimos_cp';
                confidence = 0.93;
                justification = 'Entrada de recursos decorrente de captação de empréstimo/financiamento. Contabilizado no Passivo Circulante (obrigação financeira a liquidar), NÃO configurando receita de vendas.';
                evidences.push('Valor credor (+) associado a contrato de crédito bancário');
                evidences.push('Classificação de passivo conforme NBC TG (não transita pelo DRE)');
                return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
            }

            // Se for saída de recursos (Débito < 0):
            // Pode ser amortização de principal (Passivo) ou juros/tarifas (Despesa Financeira)
            if (isDebit) {
                if (/JUROS|TAXA|ENCARGOS|IOF/i.test(descUpper)) {
                    category = 'dre.despesas_financeiras.juros';
                    confidence = 0.92;
                    justification = 'Pagamento de juros e encargos sobre operações de crédito. Reconhecido como Despesa Financeira no DRE.';
                    evidences.push('Menção explícita a juros/encargos de mútuo bancário');
                    return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
                } else {
                    // Amortização de principal reduz o Passivo (NÃO é despesa operacional!)
                    category = 'balanco.passivo_circulante.emprestimos_cp';
                    confidence = 0.91;
                    justification = 'Amortização de principal de empréstimo bancário. Redução direta de obrigação no Passivo Circulante (saída de caixa que NÃO constitui despesa no DRE).';
                    evidences.push('Quitação de parcela de principal de financiamento');
                    evidences.push('Impacto patrimonial exclusivo no Balanço Gerencial');
                    return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
                }
            }
        }

        // ---------------------------------------------------------------------
        // REGRA C: INVESTIMENTOS EM BENS DURÁVEIS (CAPEX / ATIVO IMOBILIZADO)
        // ---------------------------------------------------------------------
        const isCapexKeyword = /MAQUINA|EQUIPAMENTO\s+INDUSTRIAL|TORNO|VEICULO|CAMINHAO|REFORMA\s+GALPAO|NOTEBOOK|SERVIDOR|DELL\s+COMPUTADORES|APPLE\s+COMPUTER/i.test(descUpper);
        if (isDebit && isCapexKeyword && absAmount >= 1500) {
            category = 'balanco.ativo_nao_circulante.imobilizado';
            confidence = 0.90;
            justification = `Aquisição de bem patrimonial durável de valor expressivo (${formatCurrencyLocal(absAmount)}). Classificado no Ativo Não Circulante (Imobilizado / Capex) e sujeito a depreciação, não sendo despesa imediata.`;
            evidences.push(`Valor acima da linha de corte de imobilização (>= R$ 1.500,00)`);
            evidences.push(`Termo indicativo de ativo imobilizado na descrição: "${descUpper}"`);
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA D: APORTES DE SÓCIOS vs DISTRIBUIÇÃO DE LUCROS
        // ---------------------------------------------------------------------
        if (/APORTE\s+SOCIO|INTEGRALIZACAO|AUMENTO\s+CAPITAL/i.test(descUpper) && isCredit) {
            category = 'balanco.patrimonio_liquido.capital_social';
            confidence = 0.95;
            justification = 'Ingresso de capital próprio por aporte dos sócios. Integra o Patrimônio Líquido no Balanço, NÃO gerando tributação nem receita no DRE.';
            evidences.push('Entrada de sócios classificada em Capital Social');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        if (/(?:DISTRIBUICAO\s+(?:DE\s+)?LUCROS|DIVIDENDOS|RETIRADA\s+(?:DE\s+)?LUCRO)/i.test(descUpper) && isDebit) {
            category = 'balanco.patrimonio_liquido.lucros_acumulados';
            confidence = 0.93;
            justification = 'Distribuição de lucros aos sócios já apurados em exercícios anteriores. Baixa direta no Patrimônio Líquido, não transitando pelas despesas da DRE.';
            evidences.push('Remuneração de capital classificada como dividendos');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA E: FOLHA DE PAGAMENTO vs PRÓ-LABORE DE SÓCIOS
        // ---------------------------------------------------------------------
        if (isDebit && (/PRO\s*LABORE|RETIRADA\s+PROLABORE/i.test(descUpper))) {
            category = 'dre.despesas_administrativas.pro_labore';
            confidence = 0.94;
            justification = 'Remuneração formal mensal de sócio/administrador (Pró-Labore), sujeita a retenção de INSS e IRPF.';
            evidences.push('Identificado termo Pró-Labore na movimentação de débito');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        if (isDebit && (/(?:FOLHA.*(?:SALARIO|PAGAMENTO)|PAGTO.*SALARIO|SALARIO\s+MENSAL|ADIANTAMENTO\s+SALARIAL|13\s*SALARIO)/i.test(descUpper))) {
            category = 'dre.despesas_pessoal.salarios';
            confidence = 0.94;
            justification = 'Liquidação de folha de pagamento ou adiantamento salarial de colaboradores CLT.';
            evidences.push('Movimentação característica de folha de salários');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        if (isDebit && (/GPS|INSS|GUIA\s+PREVIDENCIA/i.test(descUpper))) {
            category = 'dre.despesas_pessoal.inss';
            confidence = 0.93;
            justification = 'Recolhimento previdenciário patronal e de colaboradores via GPS/DAE/DCTFWeb.';
            evidences.push('Guia previdenciária identificada');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        if (isDebit && (/FGTS|GRF|CONECTIVIDADE\s+SOCIAL/i.test(descUpper))) {
            category = 'dre.despesas_pessoal.fgts';
            confidence = 0.93;
            justification = 'Encargo social obrigatório de FGTS incidente sobre a folha salarial.';
            evidences.push('Guia do FGTS identificada');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA F: TRIBUTOS S/ FATURAMENTO (DEDUÇÕES DA RECEITA)
        // ---------------------------------------------------------------------
        if (isDebit && (/DAS\s+SIMPLES|SIMPLES\s+NACIONAL|DARF\s+SIMPLES|RECEITA\s+FEDERAL\s+DAS|PIS\/COFINS|GUIA\s+ISS|RECEITA\s+ESTADUAL\s+ICMS/i.test(descUpper))) {
            category = 'dre.deducoes.impostos';
            confidence = 0.95;
            justification = 'Tributo direto sobre faturamento (Simples Nacional / DAS / ISS / ICMS). Reduz a Receita Bruta para apuração da Receita Líquida no DRE.';
            evidences.push('Guia tributária federal/estadual/municipal identificada');
            evidences.push('Classificação nas Deduções da Receita Bruta');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA G: CUSTOS DIRETOS (CMV / COMPRA DE MATÉRIA-PRIMA / ESTOQUES)
        // ---------------------------------------------------------------------
        if (isDebit && (/FORNECEDOR\s+PECAS|FORNECEDOR\s+INSUMOS|MATERIA\s+PRIMA|COMPRA\s+ESTOQUE|DISTRIBUIDORA\s+ACO|ATACADO\s+ALIMENTOS|DISTRIBUIDORA\s+EMBALAGENS/i.test(descUpper))) {
            category = 'dre.custos.mercadorias';
            confidence = 0.91;
            justification = 'Aquisição direta de insumos para produção ou mercadorias para revenda comercial (CMV).';
            evidences.push('Histórico associado a fornecedor de matéria-prima ou produtos');
            evidences.push('Vinculação a custo direto no DRE');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA H: DESPESAS OPERACIONAIS ESPECÍFICAS (COMERCIAL / ADM / FINANCEIRA)
        // ---------------------------------------------------------------------
        // Marketing / Tráfego
        if (isDebit && (/FACEBOOK|META\s+ADS|GOOGLE\s+ADS|LINKEDIN\s+ADS|INSTAGRAM\s+ADS|AGENCIA\s+MARKETING/i.test(descUpper))) {
            category = 'dre.despesas_comercial.trafego';
            confidence = 0.95;
            justification = 'Investimento em canais de mídia e campanhas de tráfego pago para geração de demanda.';
            evidences.push('Plataforma de anúncios / mídia digital identificada');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        // Logística e Fretes
        if (isDebit && (/FRETE|TRANSPORTADORA|CORREIOS|LOGISTICA|MOTOBOY|EXPEDICAO/i.test(descUpper))) {
            category = 'dre.despesas_comercial.transporte_logistica';
            confidence = 0.92;
            justification = 'Custos de frete, distribuição e logística de entregas comerciais.';
            evidences.push('Termo de transporte/frete na descrição');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        // Aluguel ADM
        if (isDebit && (/ALUGUEL|LOCACAO\s+IMOVEL|IMOBILIARIA|CONDOMINIO\s+SALA|CONDOMINIO\s+GALPAO/i.test(descUpper))) {
            category = 'dre.despesas_administrativas.aluguel';
            confidence = 0.94;
            justification = 'Despesa fixa de ocupação física e locação do imóvel administrativo/operacional.';
            evidences.push('Identificação de pagamento de locação / condomínio');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        // Honorários Profissionais
        if (isDebit && (/HONORARIOS\s+CONTAB|ASSESSORIA\s+CONTABIL|HONORARIOS\s+ADVOCAT|CONSULTORIA/i.test(descUpper))) {
            category = 'dre.despesas_administrativas.honorarios';
            confidence = 0.93;
            justification = 'Honorários de serviços profissionais contábeis, jurídicos ou de auditoria externa.';
            evidences.push('Serviço especializado de assessoria/honorários');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        // Tarifas Bancárias
        if (isDebit && (/TARIFA\s+BANCARIA|TAXA\s+CONTA|MANUTENCAO\s+CONTA|PACOTE\s+SERVICOS\s+BANCARIOS|TED\s+TARIFA|PIX\s+TAXA/i.test(descUpper))) {
            category = 'dre.despesas_financeiras.tarifas';
            confidence = 0.95;
            justification = 'Tarifas operacionais e taxas de manutenção cobradas pela instituição financeira.';
            evidences.push('Tarifa bancária padronizada');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }
        // Software / Telecom / Utilities
        if (isDebit && (/ENERGIA|CELESC|ENEL|COPEL|INTERNET|CLARO|VIVO|TELEFONE|SANEAMENTO|AGUA/i.test(descUpper))) {
            category = 'dre.despesas_administrativas.outras';
            confidence = 0.91;
            justification = 'Despesa recorrente de utilidades operacionais (energia elétrica, telecomunicações, saneamento).';
            evidences.push('Concessionária de serviço essencial');
            return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
        }

        // ---------------------------------------------------------------------
        // REGRA I: RECEITAS OPERACIONAIS DE VENDAS (CRÉDITOS BANCÁRIOS)
        // ---------------------------------------------------------------------
        if (isCredit) {
            // Rendimentos financeiros
            if (/RENDIMENTO\s+APLICACAO|JUROS\s+RECEBIDOS|REMUNERACAO\s+SALDO|CREDITO\s+DE\s+JUROS/i.test(descUpper)) {
                category = 'dre.receitas_financeiras.rendimentos';
                confidence = 0.94;
                justification = 'Rendimento de aplicação financeira de liquidez (CDB/DI/Tesouro Selic).';
                evidences.push('Crédito com natureza de rentabilidade financeira');
                return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
            }

            // Venda de Produtos vs Serviços conforme atividade da empresa
            if (/RECEBIMENTO\s+CLIENTE|VENDA|DUPLICATA\s+RECEBIDA|FATURA\s+CLIENTE|PIX\s+RECEBIDO/i.test(descUpper)) {
                if (activityType === 'Serviço') {
                    category = 'dre.receita_bruta.servicos';
                    confidence = 0.88;
                    justification = 'Recebimento de faturamento por prestação de serviços conforme o cadastro e atividade da empresa.';
                    evidences.push('Tipo de atividade cadastrada: "Serviço"');
                    evidences.push('Recebimento comercial de cliente');
                } else {
                    category = 'dre.receita_bruta.produtos';
                    confidence = 0.88;
                    justification = 'Recebimento de vendas mercantis conforme atividade da empresa (Indústria/Comércio).';
                    evidences.push(`Tipo de atividade cadastrada: "${activityType}"`);
                    evidences.push('Recebimento comercial de cliente');
                }
                return formatClassificationResult(transaction, category, confidence, justification, evidences, false, ruleSource, detectedSupplier);
            }
        }

        // =====================================================================
        // PASSO 3: TRATAMENTO DE OPERAÇÕES AMBÍGUAS E PROIBIÇÃO DE ALUCINAÇÃO
        // =====================================================================
        // Se a descrição for genérica (ex: "PAGAMENTO 123", "DIVERSOS", "PIX ENVIADO")
        uncertaintyFlag = true;
        confidence = 0.45;
        ruleSource = 'UNCERTAIN_FALLBACK';

        if (isDebit) {
            category = 'dre.despesas_administrativas.outras';
            justification = 'Descrição genérica e sem favorecido identificado. Sugerida temporariamente como Outras Despesas ADM sob ALTA INCERTEZA. Requer conferência e classificação manual pelo consultor.';
            evidences.push('Descrição ambígua ou incompleta');
            evidences.push('Contraparte não identificada no histórico nem em documentos');
        } else {
            category = activityType === 'Serviço' ? 'dre.receita_bruta.servicos' : 'dre.receita_bruta.produtos';
            justification = 'Crédito financeiro sem contraparte informada. Sugerido sob ALTA INCERTEZA como recebimento operacional. Requer conferência pelo consultor.';
            evidences.push('Crédito de origem ambígua');
            evidences.push('Contraparte não identificada');
        }

        return formatClassificationResult(transaction, category, confidence, justification, evidences, uncertaintyFlag, ruleSource, null);
    }

    // -------------------------------------------------------------------------
    // 4. ESTRUTURAÇÃO PADRONIZADA DO RESULTADO DA IA
    // -------------------------------------------------------------------------
    function formatClassificationResult(transaction, categoryKey, confidence, justification, evidences, uncertaintyFlag, ruleSource, supplier) {
        const catMeta = CHART_OF_ACCOUNTS[categoryKey] || {
            label: categoryKey,
            destination: 'DRE',
            nature: 'OUTRAS',
            group: 'Geral'
        };

        const compDate = transaction.date ? transaction.date.substring(0, 10) : new Date().toISOString().substring(0, 10);

        return {
            transaction_id: transaction.transaction_id || transaction.fitid || transaction.id || null,
            line_number: transaction.line_number || transaction.row_number || null,
            raw_description: transaction.description || '',
            amount: transaction.amount || 0,
            date: transaction.date || null,
            suggested_category: categoryKey,
            category_label: catMeta.label,
            statement_destination: catMeta.destination,
            financial_nature: catMeta.nature,
            account_group: catMeta.group,
            confidence_score: round2(confidence),
            uncertainty_flag: uncertaintyFlag || confidence < 0.70,
            requires_human_review: true, // NUNCA É GRAVADO DEFINITIVO SEM APROVAÇÃO!
            approval_status: 'SUGESTAO_PENDENTE',
            justification: justification,
            evidences_used: evidences,
            competence_date: compDate, // Default para data do fato sem inventar
            supplier_client: supplier || null, // NUNCA INVENTA FORNECEDOR
            rule_source: ruleSource
        };
    }

    // -------------------------------------------------------------------------
    // 5. CLASSIFICAÇÃO EM LOTE (BATCH)
    // -------------------------------------------------------------------------
    function classifyBatch(transactions, context) {
        transactions = transactions || [];
        const results = transactions.map(txn => classifyTransaction(txn, context));

        const highConfidenceCount = results.filter(r => r.confidence_score >= 0.85 && !r.uncertainty_flag).length;
        const uncertainCount = results.filter(r => r.uncertainty_flag || r.confidence_score < 0.70).length;

        return {
            total_records: results.length,
            high_confidence_count: highConfidenceCount,
            uncertain_count: uncertainCount,
            suggestions: results
        };
    }

    // -------------------------------------------------------------------------
    // 6. CICLO DE APROVAÇÃO, CORREÇÃO E REJEIÇÃO (HUMAN-IN-THE-LOOP)
    // -------------------------------------------------------------------------
    function approveSuggestion(transactionId, transactionsList, memoryList, reviewer) {
        reviewer = reviewer || 'Consultor Clarus';
        const txn = transactionsList.find(t => (t.transaction_id === transactionId || t.fitid === transactionId));
        if (!txn) {
            throw new Error(`Transação ${transactionId} não encontrada para aprovação.`);
        }

        const suggestion = txn.ai_suggestion;
        if (!suggestion) {
            throw new Error(`Transação ${transactionId} não possui sugestão de IA gerada.`);
        }

        // Aplica a aprovação
        txn.assigned_account = suggestion.suggested_category;
        txn.status = 'APROVADO';
        txn.audit_trail = txn.audit_trail || [];
        txn.audit_trail.push({
            action: 'APROVACAO',
            user: reviewer,
            timestamp: new Date().toISOString(),
            approved_category: suggestion.suggested_category,
            confidence: suggestion.confidence_score,
            justification: suggestion.justification
        });

        // Alimenta a memória de aprendizado contínuo
        learnFromDecision({
            company_id: txn.company_id || 'default',
            raw_description: txn.description,
            amount_sign: txn.amount >= 0 ? 1 : -1,
            assigned_account: suggestion.suggested_category,
            supplier_client: suggestion.supplier_client,
            action_by: reviewer,
            action_type: 'APROVACAO'
        }, memoryList);

        return txn;
    }

    function correctSuggestion(transactionId, correctedCategory, justification, transactionsList, memoryList, reviewer) {
        reviewer = reviewer || 'Consultor Clarus';
        if (!CHART_OF_ACCOUNTS[correctedCategory]) {
            throw new Error(`Conta gerencial "${correctedCategory}" não pertence ao Plano de Contas aprovado.`);
        }

        const txn = transactionsList.find(t => (t.transaction_id === transactionId || t.fitid === transactionId));
        if (!txn) {
            throw new Error(`Transação ${transactionId} não encontrada para correção.`);
        }

        const previousCategory = txn.assigned_account || (txn.ai_suggestion && txn.ai_suggestion.suggested_category) || null;

        txn.assigned_account = correctedCategory;
        txn.status = 'APROVADO_COM_CORRECAO';
        txn.audit_trail = txn.audit_trail || [];
        txn.audit_trail.push({
            action: 'CORRECAO',
            user: reviewer,
            timestamp: new Date().toISOString(),
            previous_suggestion: previousCategory,
            final_category: correctedCategory,
            justification: justification || 'Correção manual pelo consultor especialista'
        });

        // Alimenta a memória com prioridade máxima de aprendizado
        learnFromDecision({
            company_id: txn.company_id || 'default',
            raw_description: txn.description,
            amount_sign: txn.amount >= 0 ? 1 : -1,
            assigned_account: correctedCategory,
            supplier_client: (txn.ai_suggestion && txn.ai_suggestion.supplier_client) || extractSupplierOrCounterparty(txn.description),
            action_by: reviewer,
            action_type: 'CORRECAO'
        }, memoryList);

        return txn;
    }

    function rejectSuggestion(transactionId, reason, transactionsList, reviewer) {
        reviewer = reviewer || 'Consultor Clarus';
        const txn = transactionsList.find(t => (t.transaction_id === transactionId || t.fitid === transactionId));
        if (!txn) {
            throw new Error(`Transação ${transactionId} não encontrada para rejeição.`);
        }

        const rejectedCat = txn.ai_suggestion ? txn.ai_suggestion.suggested_category : null;
        txn.assigned_account = null;
        txn.status = 'REJEITADO'; // Permanece pendente de classificação manual
        txn.audit_trail = txn.audit_trail || [];
        txn.audit_trail.push({
            action: 'REJEICAO',
            user: reviewer,
            timestamp: new Date().toISOString(),
            rejected_category: rejectedCat,
            reason: reason || 'Sugestão rejeitada pelo consultor (requer análise de contrato/NF)'
        });

        return txn;
    }

    // -------------------------------------------------------------------------
    // 7. SISTEMA DE APRENDIZADO CONTÍNUO (FEEDBACK LOOP)
    // -------------------------------------------------------------------------
    function learnFromDecision(decision, memoryList) {
        if (!memoryList || !Array.isArray(memoryList)) return;
        if (!decision || !decision.raw_description || !decision.assigned_account) return;

        // Extrai tokens relevantes da descrição
        const cleanTokens = decision.raw_description
            .toUpperCase()
            .replace(/[\d\.\-\/]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4 && !/^(PAGTO|PAGAMENTO|TRANSF|TRANSFERENCIA|LANCAMENTO|CREDITO|DEBITO|VALOR)$/.test(t));

        const mainToken = cleanTokens.length > 0 ? cleanTokens.slice(0, 3).join(' ') : decision.raw_description.substring(0, 20);

        const memoryItem = {
            id: 'MEM-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
            company_id: decision.company_id || 'all',
            pattern_token: mainToken,
            tokens: cleanTokens,
            raw_description: decision.raw_description,
            amount_sign: decision.amount_sign || -1,
            assigned_account: decision.assigned_account,
            supplier_client: decision.supplier_client || null,
            action_by: decision.action_by || 'Consultor',
            action_type: decision.action_type || 'APROVACAO',
            created_at: new Date().toISOString()
        };

        // Remove duplicatas prévias do mesmo token para evitar redundância
        const existingIdx = memoryList.findIndex(m => m.pattern_token === mainToken && m.amount_sign === memoryItem.amount_sign);
        if (existingIdx >= 0) {
            memoryList.splice(existingIdx, 1);
        }

        memoryList.unshift(memoryItem);
    }

    // -------------------------------------------------------------------------
    // UTILITÁRIOS
    // -------------------------------------------------------------------------
    function round2(num) {
        return Math.round((Number(num) || 0) * 100) / 100;
    }

    function formatCurrencyLocal(val) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }

    // Retorna API Pública
    return {
        CHART_OF_ACCOUNTS: CHART_OF_ACCOUNTS,
        classifyTransaction: classifyTransaction,
        classifyBatch: classifyBatch,
        approveSuggestion: approveSuggestion,
        correctSuggestion: correctSuggestion,
        rejectSuggestion: rejectSuggestion,
        learnFromDecision: learnFromDecision,
        extractSupplierOrCounterparty: extractSupplierOrCounterparty
    };
}));
