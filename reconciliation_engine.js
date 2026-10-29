// ============================================================================
//  CLARUS EVOLUA® — MOTOR DE CONCILIAÇÃO BANCÁRIA DETERMINÍSTICO
// ============================================================================
// Motor financeiro 100% determinístico e independente de IA.
// Executa validação de equação de saldo, datas, duplicidades, sobreposição de períodos,
// identificação de transferências entre contas próprias e rastreabilidade linha a linha.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EFO_ReconciliationEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // -------------------------------------------------------------------------
    // UTILITÁRIOS MATEMÁTICOS & DATAS
    // -------------------------------------------------------------------------
    function round2(num) {
        return Math.round((Number(num) || 0) * 100) / 100;
    }

    function parseIsoDate(str) {
        if (!str) return null;
        const clean = String(str).trim();
        // OFX Date: YYYYMMDDHHMMSS...
        if (/^\d{8}/.test(clean)) {
            const yr = clean.substring(0, 4);
            const mo = clean.substring(4, 6);
            const da = clean.substring(6, 8);
            return `${yr}-${mo}-${da}`;
        }
        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
            const parts = clean.split('/');
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
            return clean;
        }
        return null;
    }

    function parseBrNumber(valStr) {
        if (typeof valStr === 'number') return valStr;
        if (!valStr) return null;
        let str = String(valStr).trim();
        let isNegative = false;

        if (str.startsWith('-')) {
            isNegative = true;
            str = str.substring(1).trim();
        } else if (str.endsWith('-')) {
            isNegative = true;
            str = str.substring(0, str.length - 1).trim();
        } else if (str.startsWith('(') && str.endsWith(')')) {
            isNegative = true;
            str = str.substring(1, str.length - 1).trim();
        } else if (/[\\s]D$/i.test(str) || /^D[\\s]/i.test(str)) {
            isNegative = true;
            str = str.replace(/[\\s]D$/i, '').replace(/^D[\\s]/i, '').trim();
        } else if (/[\\s]C$/i.test(str) || /^C[\\s]/i.test(str)) {
            str = str.replace(/[\\s]C$/i, '').replace(/^C[\\s]/i, '').trim();
        }

        str = str.replace(/[+R$\s]/g, '');
        str = str.replace(/\./g, '').replace(',', '.');

        const parsed = parseFloat(str);
        if (isNaN(parsed)) return null;
        return isNegative ? -Math.abs(parsed) : Math.abs(parsed);
    }

    // -------------------------------------------------------------------------
    // 1. PARSER OFX (Open Financial Exchange - SGML & XML)
    // -------------------------------------------------------------------------
    function parseOFX(ofxContent, options) {
        options = options || {};
        const fileName = options.fileName || 'extrato.ofx';
        const lines = ofxContent.split(/\r?\n/);

        let bankId = '';
        let branchId = '';
        let acctId = '';
        let acctType = 'CHECKING';
        let curDef = 'BRL';
        let dtStart = null;
        let dtEnd = null;
        let finalBalance = null;
        let finalBalanceDate = null;
        let initialBalance = null;

        const transactions = [];
        let inBankTranList = false;
        let currentTxn = null;

        lines.forEach((line, lineIdx) => {
            const lineNum = lineIdx + 1;
            const trimmed = line.trim();

            if (/<BANKID>(.*?)(?:<\/BANKID>)?$/i.test(trimmed)) {
                bankId = trimmed.match(/<BANKID>(.*?)(?:<\/BANKID>)?$/i)[1].trim();
            }
            if (/<BRANCHID>(.*?)(?:<\/BRANCHID>)?$/i.test(trimmed)) {
                branchId = trimmed.match(/<BRANCHID>(.*?)(?:<\/BRANCHID>)?$/i)[1].trim();
            }
            if (/<ACCTID>(.*?)(?:<\/ACCTID>)?$/i.test(trimmed)) {
                acctId = trimmed.match(/<ACCTID>(.*?)(?:<\/ACCTID>)?$/i)[1].trim();
            }
            if (/<ACCTTYPE>(.*?)(?:<\/ACCTTYPE>)?$/i.test(trimmed)) {
                acctType = trimmed.match(/<ACCTTYPE>(.*?)(?:<\/ACCTTYPE>)?$/i)[1].trim();
            }
            if (/<CURDEF>(.*?)(?:<\/CURDEF>)?$/i.test(trimmed)) {
                curDef = trimmed.match(/<CURDEF>(.*?)(?:<\/CURDEF>)?$/i)[1].trim();
            }
            if (/<DTSTART>(.*?)(?:<\/DTSTART>)?$/i.test(trimmed)) {
                dtStart = parseIsoDate(trimmed.match(/<DTSTART>(.*?)(?:<\/DTSTART>)?$/i)[1]);
            }
            if (/<DTEND>(.*?)(?:<\/DTEND>)?$/i.test(trimmed)) {
                dtEnd = parseIsoDate(trimmed.match(/<DTEND>(.*?)(?:<\/DTEND>)?$/i)[1]);
            }

            // Início e Fim da lista de transações
            if (/<BANKTRANLIST>/i.test(trimmed)) inBankTranList = true;
            if (/<\/BANKTRANLIST>/i.test(trimmed)) {
                if (currentTxn) {
                    transactions.push(currentTxn);
                    currentTxn = null;
                }
                inBankTranList = false;
            }

            // Início de transação <STMTTRN>
            if (/<STMTTRN>/i.test(trimmed)) {
                if (currentTxn) {
                    transactions.push(currentTxn);
                }
                currentTxn = {
                    fileName: fileName,
                    line_number: lineNum,
                    type: 'OTHER',
                    date: null,
                    rawDate: '',
                    amount: 0,
                    fitid: '',
                    document_number: '',
                    description: '',
                    raw_line: trimmed
                };
            }

            if (currentTxn) {
                if (/<TRNTYPE>(.*?)(?:<\/TRNTYPE>)?$/i.test(trimmed)) {
                    currentTxn.type = trimmed.match(/<TRNTYPE>(.*?)(?:<\/TRNTYPE>)?$/i)[1].trim();
                }
                if (/<DTPOSTED>(.*?)(?:<\/DTPOSTED>)?$/i.test(trimmed)) {
                    const rawD = trimmed.match(/<DTPOSTED>(.*?)(?:<\/DTPOSTED>)?$/i)[1].trim();
                    currentTxn.rawDate = rawD;
                    currentTxn.date = parseIsoDate(rawD);
                }
                if (/<TRNAMT>(.*?)(?:<\/TRNAMT>)?$/i.test(trimmed)) {
                    const rawAmt = trimmed.match(/<TRNAMT>(.*?)(?:<\/TRNAMT>)?$/i)[1].trim();
                    currentTxn.amount = parseFloat(rawAmt);
                }
                if (/<FITID>(.*?)(?:<\/FITID>)?$/i.test(trimmed)) {
                    currentTxn.fitid = trimmed.match(/<FITID>(.*?)(?:<\/FITID>)?$/i)[1].trim();
                }
                if (/<CHECKNUM>(.*?)(?:<\/CHECKNUM>)?$/i.test(trimmed)) {
                    currentTxn.document_number = trimmed.match(/<CHECKNUM>(.*?)(?:<\/CHECKNUM>)?$/i)[1].trim();
                }
                if (/<MEMO>(.*?)(?:<\/MEMO>)?$/i.test(trimmed)) {
                    currentTxn.description = trimmed.match(/<MEMO>(.*?)(?:<\/MEMO>)?$/i)[1].trim();
                }

                if (/<\/STMTTRN>/i.test(trimmed)) {
                    transactions.push(currentTxn);
                    currentTxn = null;
                }
            }

            // Saldo Final no Balanço do Extrato <LEDGERBAL>
            if (/<LEDGERBAL>/i.test(trimmed) || /<BALAMT>/i.test(trimmed)) {
                if (/<BALAMT>(.*?)(?:<\/BALAMT>)?$/i.test(trimmed)) {
                    finalBalance = parseFloat(trimmed.match(/<BALAMT>(.*?)(?:<\/BALAMT>)?$/i)[1].trim());
                }
                if (/<DTASOF>(.*?)(?:<\/DTASOF>)?$/i.test(trimmed)) {
                    finalBalanceDate = parseIsoDate(trimmed.match(/<DTASOF>(.*?)(?:<\/DTASOF>)?$/i)[1].trim());
                }
            }
        });

        // Caso a última transação não tenha tag de fechamento explícita </STMTTRN> (OFX 1.x SGML)
        if (currentTxn && !transactions.includes(currentTxn)) {
            transactions.push(currentTxn);
            currentTxn = null;
        }

        // Calcula saldo inicial retroativo se o extrato possuir saldo final informado
        const netSum = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);
        if (initialBalance === null && finalBalance !== null) {
            initialBalance = round2(finalBalance - netSum);
        }

        return {
            format: 'OFX',
            fileName: fileName,
            bankMetadata: {
                bankId: bankId,
                branchId: branchId,
                accountId: acctId,
                accountType: acctType,
                currency: curDef
            },
            period: {
                startDate: dtStart || (transactions.length > 0 ? transactions[0].date : null),
                endDate: dtEnd || (transactions.length > 0 ? transactions[transactions.length - 1].date : null)
            },
            balances: {
                initialBalanceReported: initialBalance,
                finalBalanceReported: finalBalance,
                finalBalanceDate: finalBalanceDate
            },
            transactions: transactions,
            totalRawLines: lines.length
        };
    }

    // -------------------------------------------------------------------------
    // 2. PARSER DE CSVs DE BANCOS HOMOLOGADOS
    // Suporta Itaú, Bradesco, Santander, Banco do Brasil, Inter e Nubank
    // -------------------------------------------------------------------------
    function detectAndParseBankCsv(csvContent, options) {
        options = options || {};
        const fileName = options.fileName || 'extrato.csv';
        const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);

        if (lines.length === 0) {
            throw new Error('Arquivo CSV vazio.');
        }

        // Detecta delimitador (`;` ou `,` ou `\t`)
        const sampleHeader = lines[0];
        let delim = ';';
        if (sampleHeader.includes(';') && (sampleHeader.split(';').length >= 3)) delim = ';';
        else if (sampleHeader.includes(',') && (sampleHeader.split(',').length >= 3)) delim = ',';
        else if (sampleHeader.includes('\t')) delim = '\t';

        const headers = lines[0].split(delim).map(h => h.trim().replace(/^["']|["']$/g, ''));
        const headersLower = headers.map(h => h.toLowerCase());

        let detectedBank = 'GENERICO';
        let initialBalance = null;
        let finalBalance = null;
        const transactions = [];

        // Assinaturas de bancos homologados
        const isBradesco = headersLower.some(h => h.includes('crédito') || h.includes('credito')) &&
                           headersLower.some(h => h.includes('débito') || h.includes('debito'));
        const isItau = headersLower.includes('lançamento') || headersLower.includes('lancamento');
        const isSantander = headersLower.includes('descrição') && headersLower.includes('saldo');
        const isBB = headersLower.includes('lote') && headersLower.includes('histórico');

        if (isBradesco) detectedBank = 'BRADESCO';
        else if (isItau) detectedBank = 'ITAU';
        else if (isSantander) detectedBank = 'SANTANDER';
        else if (isBB) detectedBank = 'BANCO_DO_BRASIL';

        // Mapeia colunas por nome
        let dateColIdx = headersLower.findIndex(h => h.includes('data'));
        let descColIdx = headersLower.findIndex(h => h.includes('hist') || h.includes('lanç') || h.includes('desc'));
        let docColIdx = headersLower.findIndex(h => h.includes('docto') || h.includes('doc') || h.includes('número'));
        let valorColIdx = headersLower.findIndex(h => h === 'valor' || h.includes('valor (r$)') || h.includes('valor'));
        let creditColIdx = headersLower.findIndex(h => h.includes('crédito') || h.includes('credito'));
        let debitColIdx = headersLower.findIndex(h => h.includes('débito') || h.includes('debito'));
        let saldoColIdx = headersLower.findIndex(h => h.includes('saldo'));

        // Processa as linhas de dados (linha 2 em diante)
        for (let i = 1; i < lines.length; i++) {
            const rawLine = lines[i];
            const lineNum = i + 1;
            const cols = rawLine.split(delim).map(c => c.trim().replace(/^["']|["']$/g, ''));
            if (cols.length < 2) continue;

            const rawDesc = descColIdx !== -1 ? (cols[descColIdx] || '') : '';
            const rawSaldo = saldoColIdx !== -1 ? parseBrNumber(cols[saldoColIdx]) : null;

            // Se for linha de Saldo Inicial / Anterior
            if (/saldo\s+anterior|saldo\s+inicial|saldo\s+do\s+dia/i.test(rawDesc)) {
                if (rawSaldo !== null && initialBalance === null) {
                    initialBalance = rawSaldo;
                }
                continue;
            }

            // Determina valor do lançamento
            let amount = 0;
            if (creditColIdx !== -1 && debitColIdx !== -1) {
                // Bradesco com colunas separadas
                const credVal = parseBrNumber(cols[creditColIdx]);
                const debVal = parseBrNumber(cols[debitColIdx]);
                if (credVal !== null && credVal > 0) amount = credVal;
                else if (debVal !== null && debVal > 0) amount = -debVal;
                else if (debVal !== null && debVal < 0) amount = debVal;
            } else if (valorColIdx !== -1) {
                amount = parseBrNumber(cols[valorColIdx]) || 0;
            }

            const rawDate = dateColIdx !== -1 ? cols[dateColIdx] : '';
            const isoDate = parseIsoDate(rawDate);
            const docNum = docColIdx !== -1 ? cols[docColIdx] : '';

            // Guarda saldo da última linha como final
            if (rawSaldo !== null) {
                if (initialBalance === null) initialBalance = rawSaldo; // se não achou antes
                finalBalance = rawSaldo;
            }

            transactions.push({
                fileName: fileName,
                line_number: lineNum,
                date: isoDate,
                rawDate: rawDate,
                description: rawDesc,
                amount: round2(amount),
                document_number: docNum || null,
                balance_after: rawSaldo,
                raw_line: rawLine,
                source_type: `CSV_${detectedBank}`
            });
        }

        const dates = transactions.map(t => t.date).filter(Boolean).sort();

        return {
            format: 'CSV_HOMOLOGADO',
            detectedBank: detectedBank,
            fileName: fileName,
            period: {
                startDate: dates.length > 0 ? dates[0] : null,
                endDate: dates.length > 0 ? dates[dates.length - 1] : null
            },
            balances: {
                initialBalanceReported: initialBalance,
                finalBalanceReported: finalBalance
            },
            transactions: transactions,
            totalRawLines: lines.length
        };
    }

    // -------------------------------------------------------------------------
    // 3. MOTOR DE CONCILIAÇÃO INDEPENDENTE DE IA (DETERMINÍSTICO)
    // -------------------------------------------------------------------------
    function reconcileStatement(statementData, context) {
        context = context || {};
        const existingBatches = context.existingBatches || [];
        const otherAccountTransactions = context.otherAccountTransactions || [];
        const txns = statementData.transactions || [];

        // 1. CÁLCULO DA EQUAÇÃO DE BALANÇO
        let totalCredits = 0;
        let totalDebits = 0;

        txns.forEach(t => {
            if (t.amount > 0) totalCredits += t.amount;
            else if (t.amount < 0) totalDebits += Math.abs(t.amount);
        });

        totalCredits = round2(totalCredits);
        totalDebits = round2(totalDebits);
        const netMovement = round2(totalCredits - totalDebits);

        let initialBalance = 0;
        if (context.initialBalance !== undefined && context.initialBalance !== null) {
            initialBalance = round2(context.initialBalance);
        } else if (statementData.balances && statementData.balances.initialBalanceReported !== null && statementData.balances.initialBalanceReported !== undefined) {
            initialBalance = round2(statementData.balances.initialBalanceReported);
        }

        let reportedFinalBalance = null;
        if (context.finalBalance !== undefined && context.finalBalance !== null) {
            reportedFinalBalance = round2(context.finalBalance);
        } else if (statementData.balances && statementData.balances.finalBalanceReported !== null && statementData.balances.finalBalanceReported !== undefined) {
            reportedFinalBalance = round2(statementData.balances.finalBalanceReported);
        }

        const calculatedFinalBalance = round2(initialBalance + netMovement);
        if (reportedFinalBalance === null) {
            reportedFinalBalance = calculatedFinalBalance;
        }

        const balanceDifference = round2(Math.abs(calculatedFinalBalance - reportedFinalBalance));
        const isBalanceReconciled = balanceDifference < 0.005;

        // 2. DETECÇÃO DE SOBREPOSIÇÃO DE PERÍODOS (OVERLAP)
        const currentStart = statementData.period.startDate;
        const currentEnd = statementData.period.endDate;
        const overlappingBatches = [];

        if (currentStart && currentEnd && existingBatches.length > 0) {
            existingBatches.forEach(b => {
                if (b.periodStart && b.periodEnd) {
                    // Sobreposição se o início do atual <= fim do anterior E fim do atual >= início do anterior
                    if (currentStart <= b.periodEnd && currentEnd >= b.periodStart) {
                        overlappingBatches.push({
                            batchId: b.batchId,
                            period: `${b.periodStart} a ${b.periodEnd}`,
                            fileName: b.fileName
                        });
                    }
                }
            });
        }

        // 3. AUDITORIA INDIVIDUAL DE CADA LANÇAMENTO
        // Regra de Ouro: Ausência de divergência no saldo não isenta auditoria de linhas!
        const auditedTransactions = [];
        const seenFitids = new Set();
        const seenSignatures = new Map();
        const internalTransferPairs = [];
        const divergences = [];

        // Palavras-chave indicativas de transferência entre contas próprias
        const transferRegex = /mesma\s+titularidade|transf.*contas|ted.*mesma|tef.*mesma|pix.*mesma|transferencia\s+propria/i;

        txns.forEach(t => {
            const reasons = [];
            let status = 'CONCILIADO';

            // A) Validação Temporal (Data no Período do Extrato)
            if (t.date && currentStart && currentEnd) {
                if (t.date < currentStart || t.date > currentEnd) {
                    reasons.push(`Lançamento fora do período de competência (${currentStart} a ${currentEnd})`);
                    status = 'PENDENTE_REVISAO';
                }
            }

            // B) Validação de Duplicidade por FITID
            if (t.fitid) {
                if (seenFitids.has(t.fitid)) {
                    reasons.push(`FITID bancário duplicado no mesmo extrato: ${t.fitid}`);
                    status = 'DUPLICIDADE_SUSPEITA';
                } else {
                    seenFitids.add(t.fitid);
                }
            }

            // C) Validação de Duplicidade por Assinatura Composta (Data + Valor + Descrição)
            const signature = `${t.date}_${t.amount}_${(t.description || '').toLowerCase()}_${t.document_number || ''}`;
            if (seenSignatures.has(signature)) {
                const prev = seenSignatures.get(signature);
                reasons.push(`Lançamento idêntico à Linha ${prev.line_number} (mesma data, valor e histórico)`);
                status = 'DUPLICIDADE_SUSPEITA';
            } else {
                seenSignatures.set(signature, t);
            }

            // D) Identificação de Transferências Entre Contas Próprias
            const isExplicitTransfer = transferRegex.test(t.description || '');
            if (isExplicitTransfer) {
                status = 'TRANSFERENCIA_IDENTIFICADA';
            }

            // E) Pareamento com Outras Contas da Mesma Empresa
            if (otherAccountTransactions.length > 0 && Math.abs(t.amount) > 0.001) {
                const match = otherAccountTransactions.find(ot => {
                    if (!ot || Math.abs(ot.amount) < 0.001) return false;
                    // Valor espelhado (saída em uma = entrada na outra)
                    const mirrorAmount = Math.abs(t.amount + ot.amount) < 0.005;
                    // Data igual ou D+1
                    const d1 = new Date(t.date).getTime();
                    const d2 = new Date(ot.date).getTime();
                    const dateMatch = !isNaN(d1) && !isNaN(d2) && Math.abs(d1 - d2) <= (2 * 86400000);
                    return mirrorAmount && dateMatch;
                });

                if (match) {
                    status = 'TRANSFERENCIA_IDENTIFICADA';
                    internalTransferPairs.push({
                        origem: { file: t.fileName, line: t.line_number, amount: t.amount, account: t.bankMetadata?.accountId || statementData.bankMetadata?.accountId },
                        destino: { file: match.fileName, line: match.line_number, amount: match.amount, account: match.account }
                    });
                }
            }

            // F) Ambiguidade / Falta de Informações Críticas
            if (!t.description || t.description.length < 3 || /diversos|outros|lancamento/i.test(t.description)) {
                reasons.push('Descrição ambígua ou genérica — requer classificação manual');
                if (status === 'CONCILIADO') status = 'PENDENTE_REVISAO';
            }

            // G) Baixa Confiança de OCR (se aplicável)
            if (t.is_ocr && t.confidence < 0.95) {
                reasons.push(`Leitura OCR com índice de confiança de ${(t.confidence * 100).toFixed(1)}% (< 95%)`);
                if (status === 'CONCILIADO') status = 'PENDENTE_REVISAO';
            }

            // Se o saldo geral do extrato não bate, todos os lançamentos ganham alerta
            if (!isBalanceReconciled) {
                reasons.push(`Divergência global no extrato: Gap de ${balanceDifference.toFixed(2)} entre saldo calculado e informado`);
                if (status === 'CONCILIADO') status = 'PENDENTE_REVISAO';
            }

            if (reasons.length > 0) {
                divergences.push({
                    fileName: t.fileName,
                    line_number: t.line_number,
                    page_number: t.page_number || 1,
                    date: t.date,
                    amount: t.amount,
                    description: t.description,
                    status: status,
                    reasons: reasons
                });
            }

            auditedTransactions.push(Object.assign({}, t, {
                status: status,
                divergence_reasons: reasons,
                is_reconciled: status === 'CONCILIADO'
            }));
        });

        // Lote só é aprovado sem revisão se não houver divergências de saldo nem itens pendentes
        const hasPendingItems = auditedTransactions.some(t => t.status === 'PENDENTE_REVISAO' || t.status === 'DUPLICIDADE_SUSPEITA');
        const finalBatchStatus = (isBalanceReconciled && !hasPendingItems && overlappingBatches.length === 0)
            ? 'STAGING_AUDITADO'
            : 'PENDENTE_REVISAO';

        return {
            batchStatus: finalBatchStatus,
            equation: {
                initialBalance: initialBalance,
                totalCredits: totalCredits,
                totalDebits: totalDebits,
                netMovement: netMovement,
                calculatedFinalBalance: calculatedFinalBalance,
                reportedFinalBalance: reportedFinalBalance,
                balanceDifference: balanceDifference,
                isBalanceReconciled: isBalanceReconciled,
                equationFormula: `${initialBalance} + ${totalCredits} - ${totalDebits} = ${calculatedFinalBalance} (Informado: ${reportedFinalBalance})`
            },
            periodAudit: {
                startDate: currentStart,
                endDate: currentEnd,
                hasOverlap: overlappingBatches.length > 0,
                overlappingBatches: overlappingBatches
            },
            summaryKpis: {
                totalTransactions: txns.length,
                conciliatedCount: auditedTransactions.filter(t => t.status === 'CONCILIADO').length,
                pendingReviewCount: auditedTransactions.filter(t => t.status === 'PENDENTE_REVISAO').length,
                duplicatesCount: auditedTransactions.filter(t => t.status === 'DUPLICIDADE_SUSPEITA').length,
                internalTransfersCount: auditedTransactions.filter(t => t.status === 'TRANSFERENCIA_IDENTIFICADA').length,
                divergencesCount: divergences.length
            },
            internalTransferPairs: internalTransferPairs,
            divergences: divergences,
            records: auditedTransactions
        };
    }

    return {
        parseOFX: parseOFX,
        detectAndParseBankCsv: detectAndParseBankCsv,
        reconcileStatement: reconcileStatement,
        parseBrNumber: parseBrNumber,
        parseIsoDate: parseIsoDate,
        round2: round2
    };
}));
