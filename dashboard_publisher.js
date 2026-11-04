// ============================================================================
//  CLARUS EVOLUA® — MÓDULO DE INTEGRAÇÃO & PUBLICAÇÃO CONTROLADA NO DASHBOARD
//  Aprovação Explícita, Anti-Duplicidade, Versionamento, Auditoria & Rollback
// ============================================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js
        module.exports = factory();
    } else {
        // Browser Global
        root.EFO_DashboardPublisher = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // -------------------------------------------------------------------------
    // 1. VALIDAÇÃO DE LOTES E REGISTROS PARA PUBLICAÇÃO
    // -------------------------------------------------------------------------
    function validateBatchForPublication(batch, records, options) {
        options = options || {};
        records = records || [];

        const blockedReasons = [];
        let canPublish = true;
        let isPartial = false;

        if (!batch) {
            return {
                canPublish: false,
                isPartial: false,
                approvedRecords: [],
                pendingRecords: [],
                blockedReasons: ['Lote não encontrado ou inválido.'],
                summary: { total: 0, approved: 0, pending: 0, totalApprovedAmount: 0, totalPendingAmount: 0 }
            };
        }

        // 1. Verificação de Erros Críticos de Conciliação
        // Se o lote estiver retido por divergência de saldo ou sobreposição, bloqueia publicação padrão
        if (batch.status === 'PENDENTE_REVISAO') {
            blockedReasons.push('Lote retido com status PENDENTE_REVISAO por divergências na conciliação bancária.');
            canPublish = false;
        }

        if (batch.reconciliationReport) {
            const eq = batch.reconciliationReport.equation;
            if (eq && eq.isBalanceReconciled === false) {
                const diff = Math.abs(eq.balanceDifference || 0).toFixed(2);
                blockedReasons.push(`Furo de saldo bancário não conciliado (diferença de R$ ${diff}). A publicação é bloqueada para não corromper o Balanço e a DRE.`);
                canPublish = false;
            }

            const period = batch.reconciliationReport.periodAudit;
            if (period && period.hasOverlap && !options.ignoreOverlapWarning) {
                blockedReasons.push('Sobreposição com período de extrato já existente. Verifique se não há lançamentos em duplicidade antes de publicar.');
                canPublish = false;
            }
        }

        // 2. Segregação entre Registros Aprovados e Pendentes
        const approvedRecords = [];
        const pendingRecords = [];
        let totalApprovedAmount = 0;
        let totalPendingAmount = 0;

        records.forEach((rec, idx) => {
            const hasAssignedAccount = rec.assigned_account && rec.assigned_account.trim() !== '' && rec.assigned_account !== 'ignore';
            const isApprovedStatus = (
                rec.status === 'APROVADO' ||
                rec.status === 'APROVADO_COM_CORRECAO' ||
                rec.status === 'Categorizado' ||
                rec.status === 'CONCILIADO_APROVADO'
            );

            // Registro com erro ou duplicidade suspeita nunca é considerado aprovado
            const isCriticalRecord = (
                rec.status === 'DUPLICIDADE_SUSPEITA' ||
                rec.status === 'PENDENTE_REVISAO' ||
                rec.status === 'REJEITADO' ||
                !rec.isValid && rec.isValid !== undefined
            );

            if (hasAssignedAccount && isApprovedStatus && !isCriticalRecord) {
                approvedRecords.push(rec);
                totalApprovedAmount += (Number(rec.amount) || 0);
            } else {
                pendingRecords.push(rec);
                totalPendingAmount += (Number(rec.amount) || 0);
            }
        });

        // 3. Critérios de Publicação Parcial vs Total
        if (approvedRecords.length === 0) {
            blockedReasons.push('Nenhum lançamento foi aprovado com conta gerencial válida para este lote.');
            canPublish = false;
        } else if (pendingRecords.length > 0) {
            if (!options.allowPartial) {
                blockedReasons.push(`O lote contém ${pendingRecords.length} registro(s) pendente(s) de classificação ou aprovação. Para publicar apenas os registros validados, autorize explicitamente a publicação parcial.`);
                canPublish = false;
            } else {
                // Publicação parcial autorizada
                if (!options.partialAuthorization || options.partialAuthorization.trim().length < 5) {
                    blockedReasons.push('Publicação parcial requer justificativa e autorização explícita do consultor.');
                    canPublish = false;
                } else {
                    isPartial = true;
                }
            }
        }

        return {
            canPublish: canPublish && blockedReasons.length === 0,
            isPartial: isPartial,
            approvedRecords: approvedRecords,
            pendingRecords: pendingRecords,
            blockedReasons: blockedReasons,
            summary: {
                total: records.length,
                approved: approvedRecords.length,
                pending: pendingRecords.length,
                totalApprovedAmount: round2(totalApprovedAmount),
                totalPendingAmount: round2(totalPendingAmount)
            }
        };
    }

    // -------------------------------------------------------------------------
    // 2. MOTOR DE PUBLICAÇÃO NO DASHBOARD (OFX & LANÇAMENTOS)
    // -------------------------------------------------------------------------
    function publishBatch(batchId, options, context) {
        options = options || {};
        context = context || {};

        const companyId = context.companyId;
        if (!companyId) throw new Error('Identificador da empresa é obrigatório para publicar lote.');

        // Recupera lotes e registros
        const batches = context.getCompanyBatches(companyId) || [];
        const batch = batches.find(b => b.batchId === batchId);
        if (!batch) throw new Error(`Lote #${batchId} não encontrado no Staging da empresa.`);

        // Proteção contra re-publicação sem reprocessamento explícito
        if ((batch.status === 'PUBLICADO' || batch.status === 'PUBLICACAO_PARCIAL') && !options.reprocess) {
            throw new Error(`Este lote já está publicado no dashboard (${batch.status}) desde ${batch.publishedAt}. Para atualizar, selecione a opção de reprocessamento controlado.`);
        }

        // Se for reprocessamento, primeiro desfaz a publicação anterior
        if (options.reprocess && (batch.status === 'PUBLICADO' || batch.status === 'PUBLICACAO_PARCIAL')) {
            unpublishBatch(batchId, { reason: 'Reprocessamento autorizado de lote' }, context);
        }

        const stagingRecords = context.getBatchRecords(batchId) || [];
        const recordsToEvaluate = Array.isArray(stagingRecords) ? stagingRecords : (stagingRecords.normalized || []);

        // Valida guardrails
        const validation = validateBatchForPublication(batch, recordsToEvaluate, options);
        if (!validation.canPublish) {
            throw new Error(`Publicação impedida: ${validation.blockedReasons.join(' ')}`);
        }

        // Recupera estado atual do Dashboard
        let activeOfx = context.getActiveOfx(companyId) || [];
        let activeLancamentos = context.getActiveLancamentos(companyId) || {};

        const history = context.getPublicationHistory(companyId) || [];
        const nextVersion = (history.length > 0 ? (history[0].version || history.length) : 0) + 1;
        const publicationId = `PUB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const publishTimestamp = new Date().toISOString();
        const publishedByUser = context.user ? (context.user.name || context.user.email) : 'Consultor Clarus';

        const newPublishedTxns = [];
        const affectedAccounts = {};

        // Normaliza e injeta cada registro aprovado com rastreabilidade total
        validation.approvedRecords.forEach((rec, idx) => {
            const lineNum = rec.lineNumber !== undefined ? rec.lineNumber : (idx + 1);
            const amt = Number(rec.amount) || 0;
            const recDate = rec.date ? rec.date.substring(0, 10) : publishTimestamp.substring(0, 10);
            const uniqueIdempotencyKey = `${companyId}_${batch.sha256}_L${lineNum}_${recDate}_${amt}`;

            // Anti-Duplicação estrita: verifica se já existe na base ativa
            const isAlreadyPresent = activeOfx.some(existing => {
                if (existing.idempotency_key && existing.idempotency_key === uniqueIdempotencyKey) return true;
                if (existing.source_batch_id === batchId && existing.source_line_number === lineNum) return true;
                if (rec.fitid && existing.fitid === rec.fitid && existing.source_batch_id === batchId) return true;
                return false;
            });

            if (isAlreadyPresent) {
                // Registro já publicado previamente (proteção de idempotência)
                return;
            }

            const publishedTxn = {
                // Propriedades consumidas pelos cálculos nativos da DRE e Balanço
                transaction_id: rec.transaction_id || `PUB_${batch.batchId}_L${lineNum}`,
                date: recDate,
                description: rec.description || 'Lançamento importado',
                amount: amt,
                status: 'Categorizado', // Exigido por calculateDREData e calculateBalancoData
                assigned_account: rec.assigned_account,
                flag_reason: '',

                // Rastreabilidade e Auditoria Canônica
                idempotency_key: uniqueIdempotencyKey,
                source_batch_id: batch.batchId,
                source_file_name: batch.fileName,
                source_file_sha256: batch.sha256 || batch.fileSha256,
                source_file_type: batch.fileType,
                source_line_number: lineNum,
                source_page_number: rec.pageNumber || null,
                document_number: rec.documentNumber || null,
                fitid: rec.fitid || null,

                // Metadados de IA e Governança
                ai_classification: rec.ai_suggestion ? {
                    suggested_category: rec.ai_suggestion.suggested_category,
                    confidence_score: rec.ai_suggestion.confidence_score,
                    financial_nature: rec.ai_suggestion.financial_nature,
                    statement_destination: rec.ai_suggestion.statement_destination,
                    supplier_client: rec.ai_suggestion.supplier_client,
                    justification: rec.ai_suggestion.justification,
                    evidences_used: rec.ai_suggestion.evidences_used || []
                } : null,
                audit_trail: rec.audit_trail || [],
                approval_status: rec.status,

                // Identificadores de Publicação
                publication_id: publicationId,
                publication_version: nextVersion,
                published_at: publishTimestamp,
                published_by: publishedByUser,
                is_partial: validation.isPartial,

                // Dado bruto de origem
                raw_data: rec.rawData || {}
            };

            newPublishedTxns.push(publishedTxn);

            // Rastreia contas afetadas para auditoria
            const acc = rec.assigned_account;
            affectedAccounts[acc] = (affectedAccounts[acc] || 0) + Math.abs(amt);

            // Atualiza totais de EFO_Lancamentos
            const p = acc.split('.');
            if (activeLancamentos[p[0]] && activeLancamentos[p[0]][p[1]] && activeLancamentos[p[0]][p[1]][p[2]] !== undefined) {
                activeLancamentos[p[0]][p[1]][p[2]] += Math.abs(amt);
            }
        });

        // Adiciona à lista oficial do dashboard
        activeOfx = activeOfx.concat(newPublishedTxns);

        // Atualiza status do lote
        batch.status = validation.isPartial ? 'PUBLICACAO_PARCIAL' : 'PUBLICADO';
        batch.isPartial = validation.isPartial;
        batch.publishedAt = publishTimestamp;
        batch.publishedBy = publishedByUser;
        batch.publishedCount = newPublishedTxns.length;
        batch.pendingCount = validation.pendingRecords.length;
        batch.publicationVersion = nextVersion;
        batch.publicationId = publicationId;
        batch.partialAuthorizationNote = validation.isPartial ? (options.partialAuthorization || null) : null;

        // Atualiza status dos registros individuais no Staging
        validation.approvedRecords.forEach(r => {
            r.published_to_dashboard = true;
            r.publication_id = publicationId;
        });

        // Registro de Auditoria no Log de Publicações
        const logEntry = {
            publication_id: publicationId,
            batch_id: batch.batchId,
            company_id: companyId,
            version: nextVersion,
            action: 'PUBLICACAO',
            type: validation.isPartial ? 'PUBLICACAO_PARCIAL' : 'PUBLICACAO_TOTAL',
            published_at: publishTimestamp,
            published_by: publishedByUser,
            records_count: newPublishedTxns.length,
            pending_count: validation.pendingRecords.length,
            total_amount: validation.summary.totalApprovedAmount,
            partial_authorization: options.partialAuthorization || null,
            affected_accounts: affectedAccounts,
            file_name: batch.fileName,
            file_sha256: batch.sha256
        };

        history.unshift(logEntry);

        // Salva estado persistente via callbacks do contexto
        context.setActiveOfx(companyId, activeOfx);
        context.setActiveLancamentos(companyId, activeLancamentos);
        context.saveCompanyBatches(companyId, batches);
        if (context.saveBatchRecords) {
            context.saveBatchRecords(batchId, stagingRecords);
        }
        context.savePublicationHistory(companyId, history);

        return {
            success: true,
            publicationId: publicationId,
            version: nextVersion,
            isPartial: validation.isPartial,
            publishedCount: newPublishedTxns.length,
            pendingCount: validation.pendingRecords.length,
            batch: batch,
            logEntry: logEntry,
            affectedAccounts: affectedAccounts
        };
    }

    // -------------------------------------------------------------------------
    // 3. REPROCESSAMENTO CONTROLADO & ROLLBACK DE PUBLICAÇÃO
    // -------------------------------------------------------------------------
    function unpublishBatch(batchId, options, context) {
        options = options || {};
        context = context || {};

        const companyId = context.companyId;
        if (!companyId) throw new Error('Identificador da empresa é obrigatório para despublicar lote.');

        const batches = context.getCompanyBatches(companyId) || [];
        const batch = batches.find(b => b.batchId === batchId);
        if (!batch) throw new Error(`Lote #${batchId} não encontrado.`);

        let activeOfx = context.getActiveOfx(companyId) || [];
        let activeLancamentos = context.getActiveLancamentos(companyId) || {};
        const history = context.getPublicationHistory(companyId) || [];

        // Filtra os lançamentos pertencentes a este lote
        const txnsToRevert = activeOfx.filter(t => t.source_batch_id === batchId);
        const revertedCount = txnsToRevert.length;

        // Subtrai de EFO_Lancamentos para restaurar integridade perfeita
        txnsToRevert.forEach(t => {
            if (t.assigned_account) {
                const p = t.assigned_account.split('.');
                if (activeLancamentos[p[0]] && activeLancamentos[p[0]][p[1]] && activeLancamentos[p[0]][p[1]][p[2]] !== undefined) {
                    activeLancamentos[p[0]][p[1]][p[2]] = Math.max(0, activeLancamentos[p[0]][p[1]][p[2]] - Math.abs(t.amount));
                }
            }
        });

        // Remove do activeOfx
        activeOfx = activeOfx.filter(t => t.source_batch_id !== batchId);

        // Atualiza status do lote de volta para Staging
        const previousStatus = batch.status;
        batch.status = 'STAGING_SALVO';
        batch.revertedAt = new Date().toISOString();
        batch.revertedBy = context.user ? (context.user.name || context.user.email) : 'Consultor Clarus';
        batch.revertReason = options.reason || 'Despublicação / Reprocessamento controlado';
        batch.publishedAt = null;
        batch.publishedBy = null;
        batch.publishedCount = 0;

        // Adiciona registro de reversão no log
        const rollbackLog = {
            rollback_id: `ROL-${Date.now().toString(36).toUpperCase()}`,
            batch_id: batchId,
            company_id: companyId,
            action: 'ROLLBACK',
            previous_status: previousStatus,
            reverted_at: batch.revertedAt,
            reverted_by: batch.revertedBy,
            reverted_records_count: revertedCount,
            reason: batch.revertReason
        };

        history.unshift(rollbackLog);

        // Salva estado
        context.setActiveOfx(companyId, activeOfx);
        context.setActiveLancamentos(companyId, activeLancamentos);
        context.saveCompanyBatches(companyId, batches);
        context.savePublicationHistory(companyId, history);

        return {
            success: true,
            revertedCount: revertedCount,
            batch: batch,
            rollbackLog: rollbackLog
        };
    }

    // -------------------------------------------------------------------------
    // 4. RASTREABILIDADE CANÔNICA DE LANÇAMENTOS DO DASHBOARD
    // -------------------------------------------------------------------------
    function tracePublishedRecord(transactionId, activeOfx, batches) {
        activeOfx = activeOfx || [];
        batches = batches || [];

        const txn = activeOfx.find(t => t.transaction_id === transactionId || t.fitid === transactionId);
        if (!txn) return null;

        const batch = batches.find(b => b.batchId === txn.source_batch_id);

        return {
            transactionId: txn.transaction_id,
            date: txn.date,
            description: txn.description,
            amount: txn.amount,
            assignedAccount: txn.assigned_account,
            source: {
                batchId: txn.source_batch_id || (batch ? batch.batchId : null),
                fileName: txn.source_file_name || (batch ? batch.fileName : 'Manual / OFX'),
                fileSha256: txn.source_file_sha256 || (batch ? batch.sha256 : null),
                lineNumber: txn.source_line_number || null,
                pageNumber: txn.source_page_number || null,
                fitid: txn.fitid || null,
                documentNumber: txn.document_number || null
            },
            publication: {
                publicationId: txn.publication_id || null,
                version: txn.publication_version || 1,
                publishedAt: txn.published_at || null,
                publishedBy: txn.published_by || null,
                isPartial: txn.is_partial || false
            },
            aiAudit: txn.ai_classification || null,
            auditTrail: txn.audit_trail || []
        };
    }

    // -------------------------------------------------------------------------
    // 5. STATUS DE PUBLICAÇÃO DO PERÍODO (DETECÇÃO DE PUBLICAÇÃO PARCIAL)
    // -------------------------------------------------------------------------
    function getPeriodPublicationStatus(companyId, year, month, batches) {
        batches = batches || [];
        const monthNum = Number(month);
        const yearNum = Number(year);

        const periodBatches = batches.filter(b => {
            const matchYear = Number(b.year) === yearNum;
            const matchMonth = Number(b.month) === monthNum;
            return matchYear && matchMonth;
        });

        const partialBatches = periodBatches.filter(b => b.status === 'PUBLICACAO_PARCIAL');
        const publishedBatches = periodBatches.filter(b => b.status === 'PUBLICADO' || b.status === 'PUBLICACAO_PARCIAL');
        const stagingBatches = periodBatches.filter(b => b.status === 'STAGING_SALVO' || b.status === 'STAGING_AUDITADO');

        const hasPartial = partialBatches.length > 0;
        let alertMessage = null;

        if (hasPartial) {
            const pendingTotal = partialBatches.reduce((acc, b) => acc + (b.pendingCount || 0), 0);
            alertMessage = `Atenção: Este período possui publicação parcial ativa no Lote #${partialBatches.map(b => b.batchId).join(', ')} (${pendingTotal} lançamento(s) pendente(s) de conciliação). Os números do DRE e Balanço refletem estritamente os dados aprovados.`;
        }

        return {
            period: `${monthNum + 1}/${yearNum}`,
            hasPublishedData: publishedBatches.length > 0,
            hasPartial: hasPartial,
            hasPendingStaging: stagingBatches.length > 0,
            partialBatchesCount: partialBatches.length,
            alertMessage: alertMessage,
            batchesInPeriod: periodBatches
        };
    }

    function round2(num) {
        return Math.round((Number(num) || 0) * 100) / 100;
    }

    return {
        validateBatchForPublication: validateBatchForPublication,
        publishBatch: publishBatch,
        unpublishBatch: unpublishBatch,
        tracePublishedRecord: tracePublishedRecord,
        getPeriodPublicationStatus: getPeriodPublicationStatus
    };
}));
