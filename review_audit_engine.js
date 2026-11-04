// ============================================================================
//  CLARUS EVOLUA® — CENTRAL DE REVISÃO E AUDITORIA FINANCEIRA
//  review_audit_engine.js
//
//  Motor de Regras, Máquina de Estados, Trilha de Auditoria Inviolável,
//  Classificação, Aprovação em Lote e Rastreabilidade Documental.
// ============================================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js
        module.exports = factory();
    } else {
        // Browser Global
        root.EFO_ReviewAuditEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. ESTADOS DA MÁQUINA DE REVISÃO E AUDITORIA
    // -------------------------------------------------------------------------
    const STATES = {
        // Ciclo Regular
        RECEBIDO: 'RECEBIDO',
        EXTRAIDO: 'EXTRAIDO',
        NORMALIZADO: 'NORMALIZADO',
        EM_VALIDACAO: 'EM_VALIDACAO',
        EM_CONFERENCIA: 'EM_CONFERENCIA',
        APROVADO: 'APROVADO',
        PUBLICADO: 'PUBLICADO',

        // Estados de Exceção
        PENDENTE_CLASSIFICACAO: 'PENDENTE_CLASSIFICACAO',
        DIVERGENCIA_CONCILIACAO: 'DIVERGENCIA_CONCILIACAO',
        DUPLICIDADE_SUSPEITA: 'DUPLICIDADE_SUSPEITA',
        DOCUMENTACAO_PENDENTE: 'DOCUMENTACAO_PENDENTE',
        REJEITADO: 'REJEITADO',
        BLOQUEADO: 'BLOQUEADO'
    };

    // Estados considerados bloqueantes ou com pendências críticas
    const CRITICAL_EXCEPTION_STATES = [
        STATES.PENDENTE_CLASSIFICACAO,
        STATES.DIVERGENCIA_CONCILIACAO,
        STATES.DUPLICIDADE_SUSPEITA,
        STATES.DOCUMENTACAO_PENDENTE,
        STATES.REJEITADO,
        STATES.BLOQUEADO
    ];

    // -------------------------------------------------------------------------
    // 2. VALIDAÇÃO DE TRANSIÇÕES PERMITIDAS
    // -------------------------------------------------------------------------
    const ALLOWED_TRANSITIONS = {
        [STATES.RECEBIDO]: [STATES.EXTRAIDO, STATES.BLOQUEADO, STATES.REJEITADO],
        [STATES.EXTRAIDO]: [STATES.NORMALIZADO, STATES.BLOQUEADO, STATES.REJEITADO],
        [STATES.NORMALIZADO]: [STATES.EM_VALIDACAO, STATES.BLOQUEADO, STATES.REJEITADO],
        [STATES.EM_VALIDACAO]: [
            STATES.EM_CONFERENCIA,
            STATES.PENDENTE_CLASSIFICACAO,
            STATES.DIVERGENCIA_CONCILIACAO,
            STATES.DUPLICIDADE_SUSPEITA,
            STATES.BLOQUEADO,
            STATES.REJEITADO
        ],
        [STATES.EM_CONFERENCIA]: [
            STATES.APROVADO,
            STATES.DOCUMENTACAO_PENDENTE,
            STATES.PENDENTE_CLASSIFICACAO,
            STATES.REJEITADO,
            STATES.BLOQUEADO,
            STATES.EM_VALIDACAO
        ],
        [STATES.PENDENTE_CLASSIFICACAO]: [STATES.EM_CONFERENCIA, STATES.APROVADO, STATES.DOCUMENTACAO_PENDENTE, STATES.REJEITADO, STATES.BLOQUEADO],
        [STATES.DIVERGENCIA_CONCILIACAO]: [STATES.EM_CONFERENCIA, STATES.EM_VALIDACAO, STATES.REJEITADO, STATES.BLOQUEADO],
        [STATES.DUPLICIDADE_SUSPEITA]: [STATES.EM_CONFERENCIA, STATES.REJEITADO, STATES.BLOQUEADO],
        [STATES.DOCUMENTACAO_PENDENTE]: [STATES.EM_CONFERENCIA, STATES.APROVADO, STATES.REJEITADO, STATES.BLOQUEADO],
        [STATES.REJEITADO]: [STATES.EM_CONFERENCIA, STATES.EM_VALIDACAO], // Desrejeição com justificativa
        [STATES.BLOQUEADO]: [STATES.EM_VALIDACAO, STATES.REJEITADO],
        [STATES.APROVADO]: [STATES.PUBLICADO, STATES.EM_CONFERENCIA, STATES.REJEITADO],
        [STATES.PUBLICADO]: [STATES.EM_CONFERENCIA, STATES.APROVADO] // Rollback
    };

    function canTransition(currentStatus, targetStatus) {
        if (!currentStatus) return true;
        if (currentStatus === targetStatus) return true;
        const allowed = ALLOWED_TRANSITIONS[currentStatus];
        return Boolean(allowed && allowed.includes(targetStatus));
    }

    // -------------------------------------------------------------------------
    // 3. ESTRUTURA DO HISTÓRICO DE AUDITORIA & REGISTRO
    // -------------------------------------------------------------------------
    function initRecordAudit(record, batchMeta) {
        if (!record) return null;

        // Garante UUID ou ID único canônico
        if (!record.id) {
            record.id = record.transaction_id || record.fitid ||
                `REC-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        }

        // Metadados de versão
        if (typeof record.version !== 'number') {
            record.version = 1;
        }

        // Trilha de auditoria cronológica
        if (!Array.isArray(record.audit_history)) {
            record.audit_history = [];
        }

        // Registra o evento inicial de criação / extração se vazio
        if (record.audit_history.length === 0) {
            record.audit_history.push({
                event_id: 'EVT-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
                timestamp: new Date().toISOString(),
                user: batchMeta?.importedBy || 'Sistema / Importador',
                action: 'EXTRACAO_INICIAL',
                from_status: null,
                to_status: record.status || STATES.NORMALIZADO,
                changes: {
                    initial_amount: record.amount,
                    initial_date: record.date,
                    initial_description: record.description
                },
                justification: 'Ingestão canônica do documento original.',
                version: record.version,
                immutable: true
            });
        }

        // Status inicial canônico
        if (!record.status) {
            record.status = STATES.NORMALIZADO;
        }

        // Direção canônica
        if (!record.direction) {
            const num = Number(record.amount) || 0;
            record.direction = num >= 0 ? 'ENTRADA' : 'SAIDA';
        }

        return record;
    }

    function appendAuditEvent(record, eventData) {
        if (!record.audit_history) record.audit_history = [];
        
        record.version = (record.version || 1) + 1;

        const event = {
            event_id: 'EVT-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
            timestamp: new Date().toISOString(),
            user: eventData.user || 'Consultor / Auditor',
            action: eventData.action || 'ATUALIZACAO',
            from_status: eventData.from_status || record.status,
            to_status: eventData.to_status || record.status,
            changes: eventData.changes || {},
            justification: (eventData.justification || '').trim(),
            version: record.version,
            immutable: true
        };

        record.audit_history.push(event);
        record.updated_at = event.timestamp;
        record.last_modified_by = event.user;

        return event;
    }

    // -------------------------------------------------------------------------
    // 4. AÇÕES INDIVIDUAIS DO AUDITOR
    // -------------------------------------------------------------------------

    /**
     * Aprovar lançamento
     */
    function approveRecord(record, options, context) {
        options = options || {};
        context = context || {};

        if (!record) throw new Error('Registro inválido para aprovação.');

        // Requisitos para aprovação:
        // 1. Não pode estar em estado de furo de saldo não regularizado
        if (record.status === STATES.DIVERGENCIA_CONCILIACAO && !options.overrideConciliation) {
            throw new Error('Não é possível aprovar registro com divergência crítica de conciliação.');
        }

        // 2. Não pode ser duplicidade confirmada
        if (record.status === STATES.DUPLICIDADE_SUSPEITA && !options.overrideDuplicate) {
            throw new Error('Não é possível aprovar registro com suspeita de duplicidade sem validação prévia.');
        }

        // 3. Precisa ter categoria gerencial atribuída
        const account = record.assigned_account || record.category;
        if (!account || account.trim() === '' || account === 'ignore') {
            throw new Error('Não é possível aprovar um lançamento sem conta contábil/gerencial definida.');
        }

        const prevStatus = record.status;
        record.status = STATES.APROVADO;
        record.approved_at = new Date().toISOString();
        record.approved_by = context.user || 'Consultor / Auditor';

        appendAuditEvent(record, {
            user: context.user || 'Consultor / Auditor',
            action: 'APROVACAO',
            from_status: prevStatus,
            to_status: STATES.APROVADO,
            changes: {
                assigned_account: account,
                amount: record.amount,
                date: record.date
            },
            justification: options.justification || 'Lançamento conferido e aprovado pelo auditor.'
        });

        return record;
    }

    /**
     * Rejeitar lançamento (justificativa estritamente obrigatória, nunca apagado)
     */
    function rejectRecord(record, justification, options, context) {
        options = options || {};
        context = context || {};

        if (!record) throw new Error('Registro inválido para rejeição.');
        
        const cleanJust = (justification || '').trim();
        if (!cleanJust || cleanJust.length < 5) {
            throw new Error('A rejeição exige justificativa formal obrigatória (mínimo de 5 caracteres).');
        }

        const prevStatus = record.status;
        record.status = STATES.REJEITADO;
        record.rejection_reason = cleanJust;
        record.rejected_at = new Date().toISOString();
        record.rejected_by = context.user || 'Consultor / Auditor';

        appendAuditEvent(record, {
            user: context.user || 'Consultor / Auditor',
            action: 'REJEICAO',
            from_status: prevStatus,
            to_status: STATES.REJEITADO,
            changes: {
                previous_status: prevStatus
            },
            justification: cleanJust
        });

        return record;
    }

    /**
     * Corrigir lançamento (alterar valores, datas, competência ou descrição)
     */
    function correctRecord(record, changes, justification, options, context) {
        options = options || {};
        context = context || {};
        changes = changes || {};

        if (!record) throw new Error('Registro inválido para correção.');

        const cleanJust = (justification || '').trim();
        if (!cleanJust || cleanJust.length < 5) {
            throw new Error('Qualquer correção nos dados do lançamento exige justificativa obrigatória.');
        }

        const auditChanges = {};
        const prevStatus = record.status;

        if (changes.date !== undefined && changes.date !== record.date) {
            auditChanges.previous_date = record.date;
            auditChanges.new_date = changes.date;
            record.date = changes.date;
        }

        if (changes.competence_date !== undefined && changes.competence_date !== record.competence_date) {
            auditChanges.previous_competence = record.competence_date || null;
            auditChanges.new_competence = changes.competence_date;
            record.competence_date = changes.competence_date;
        }

        if (changes.amount !== undefined && Number(changes.amount) !== Number(record.amount)) {
            const num = Number(changes.amount);
            if (isNaN(num)) throw new Error('Valor corrigido informado é inválido.');
            auditChanges.previous_amount = record.amount;
            auditChanges.new_amount = num;
            record.amount = num;
            record.direction = num >= 0 ? 'ENTRADA' : 'SAIDA';
        }

        if (changes.description !== undefined && changes.description !== record.description) {
            auditChanges.previous_description = record.description;
            auditChanges.new_description = changes.description;
            record.description = changes.description;
        }

        if (Object.keys(auditChanges).length === 0 && !changes.assigned_account) {
            throw new Error('Nenhuma alteração detectada para registrar.');
        }

        // Se estava com erro de validação, passa para conferência após correção
        if (record.status === STATES.EM_VALIDACAO || record.status === STATES.NORMALIZADO) {
            record.status = STATES.EM_CONFERENCIA;
        }

        appendAuditEvent(record, {
            user: context.user || 'Consultor / Auditor',
            action: 'CORRECAO_DADOS',
            from_status: prevStatus,
            to_status: record.status,
            changes: auditChanges,
            justification: cleanJust
        });

        return record;
    }

    /**
     * Reclassificar lançamento (mudar conta contábil / gerencial)
     */
    function reclassifyRecord(record, newAccount, justification, options, context) {
        options = options || {};
        context = context || {};

        if (!record) throw new Error('Registro inválido para reclassificação.');
        if (!newAccount || newAccount.trim() === '') {
            throw new Error('Conta gerencial de destino é obrigatória.');
        }

        const cleanJust = (justification || '').trim();
        if (!cleanJust || cleanJust.length < 5) {
            throw new Error('A alteração de categoria gerencial exige justificativa obrigatória.');
        }

        const prevAccount = record.assigned_account || record.category || 'Sem Classificação';
        const prevStatus = record.status;

        record.assigned_account = newAccount;
        record.category = newAccount;
        record.classification_manual = true;

        // Se estava pendente de classificação ou normalizado, evolui para conferência
        if (record.status === STATES.PENDENTE_CLASSIFICACAO || record.status === STATES.EM_VALIDACAO || record.status === STATES.NORMALIZADO) {
            record.status = STATES.EM_CONFERENCIA;
        }

        appendAuditEvent(record, {
            user: context.user || 'Consultor / Auditor',
            action: 'RECLASSIFICACAO',
            from_status: prevStatus,
            to_status: record.status,
            changes: {
                previous_account: prevAccount,
                new_account: newAccount
            },
            justification: cleanJust
        });

        // Opcional: registrar aprendizado na IA se módulo disponível
        if (options.learnAI && typeof context.aiLearnCallback === 'function') {
            try {
                context.aiLearnCallback({
                    company_id: record.companyId || context.companyId || 'all',
                    raw_description: record.description,
                    assigned_account: newAccount,
                    amount_sign: Number(record.amount) >= 0 ? 1 : -1,
                    action_by: context.user || 'Consultor / Auditor',
                    action_type: 'RECLASSIFICACAO'
                });
            } catch (aiErr) {
                console.warn('[ReviewAudit] Falha ao gravar aprendizado na IA:', aiErr.message);
            }
        }

        return record;
    }

    /**
     * Solicitar documentação complementar (comprovante / nota fiscal)
     */
    function requestDocumentRecord(record, requirementNote, options, context) {
        options = options || {};
        context = context || {};

        if (!record) throw new Error('Registro inválido.');

        const cleanNote = (requirementNote || '').trim();
        if (!cleanNote || cleanNote.length < 5) {
            throw new Error('Informe o documento ou comprovante solicitado.');
        }

        const prevStatus = record.status;
        record.status = STATES.DOCUMENTACAO_PENDENTE;
        record.document_requirement = cleanNote;
        record.document_requested_at = new Date().toISOString();
        record.document_requested_by = context.user || 'Consultor / Auditor';

        appendAuditEvent(record, {
            user: context.user || 'Consultor / Auditor',
            action: 'SOLICITACAO_DOCUMENTO',
            from_status: prevStatus,
            to_status: STATES.DOCUMENTACAO_PENDENTE,
            changes: {
                requirement: cleanNote
            },
            justification: cleanNote
        });

        return record;
    }

    /**
     * Devolver para reprocessamento
     */
    function reprocessRecord(record, justification, options, context) {
        options = options || {};
        context = context || {};

        if (!record) throw new Error('Registro inválido.');

        const cleanJust = (justification || 'Devolvido para reprocessamento pelo auditor.').trim();
        const prevStatus = record.status;
        record.status = STATES.EM_VALIDACAO;

        appendAuditEvent(record, {
            user: context.user || 'Consultor / Auditor',
            action: 'DEVOLUCAO_PROCESSAMENTO',
            from_status: prevStatus,
            to_status: STATES.EM_VALIDACAO,
            changes: {
                reprocess_requested: true
            },
            justification: cleanJust
        });

        return record;
    }

    // -------------------------------------------------------------------------
    // 5. MOTOR DE ELEGIBILIDADE E APROVAÇÃO EM LOTE
    // -------------------------------------------------------------------------

    /**
     * Avalia se um registro individual é elegível para aprovação em lote.
     * Somente registros sem pendências críticas e com conta gerencial válida.
     */
    function isRecordEligibleForApproval(record) {
        if (!record) return { eligible: false, reason: 'Registro inexistente.' };

        // 1. Já aprovado ou publicado não requer re-aprovação
        if (record.status === STATES.APROVADO || record.status === STATES.PUBLICADO) {
            return { eligible: true, alreadyApproved: true };
        }

        // 2. Rejeitado ou Bloqueado não pode ser aprovado em lote
        if (record.status === STATES.REJEITADO) {
            return { eligible: false, reason: 'Registro rejeitado formalmente. Não pode ser aprovado em lote.' };
        }
        if (record.status === STATES.BLOQUEADO) {
            return { eligible: false, reason: 'Registro bloqueado por integridade estrutural.' };
        }

        // 3. Furo de saldo de conciliação bancária
        if (record.status === STATES.DIVERGENCIA_CONCILIACAO) {
            return { eligible: false, reason: 'Divergência crítica de conciliação bancária não resolvida.' };
        }

        // 4. Suspeita de duplicidade
        if (record.status === STATES.DUPLICIDADE_SUSPEITA) {
            return { eligible: false, reason: 'Suspeita de duplicidade não avaliada.' };
        }

        // 5. Documentação complementar pendente
        if (record.status === STATES.DOCUMENTACAO_PENDENTE) {
            return { eligible: false, reason: 'Aguardando envio de documentação complementar solicitada.' };
        }

        // 6. Pendente de Classificação ou sem conta válida
        const account = record.assigned_account || record.category;
        if (!account || account.trim() === '' || account === 'ignore') {
            return { eligible: false, reason: 'Sem conta contábil/gerencial associada.' };
        }

        // 7. Validade do valor e data
        if (record.amount === null || record.amount === undefined || isNaN(Number(record.amount))) {
            return { eligible: false, reason: 'Valor do lançamento inválido ou nulo.' };
        }
        if (!record.date) {
            return { eligible: false, reason: 'Data do lançamento ausente ou inválida.' };
        }

        return { eligible: true };
    }

    /**
     * Aprova em lote SOMENTE os registros elegíveis.
     * Retorna separação precisa de aprovados vs ignorados com os motivos.
     */
    function approveEligibleBatch(records, options, context) {
        options = options || {};
        context = context || {};
        records = records || [];

        const approved = [];
        const skipped = [];

        records.forEach(rec => {
            const check = isRecordEligibleForApproval(rec);
            if (check.eligible && !check.alreadyApproved) {
                try {
                    approveRecord(rec, {
                        justification: options.justification || 'Aprovação em lote de registros elegíveis.'
                    }, context);
                    approved.push(rec);
                } catch (err) {
                    skipped.push({
                        record: rec,
                        reason: err.message
                    });
                }
            } else if (!check.eligible) {
                skipped.push({
                    record: rec,
                    reason: check.reason
                });
            }
        });

        return {
            approved: approved,
            skipped: skipped,
            summary: {
                totalSubmitted: records.length,
                approvedCount: approved.length,
                skippedCount: skipped.length,
                allApproved: skipped.length === 0
            }
        };
    }

    // -------------------------------------------------------------------------
    // 6. CÁLCULO DE KPIS DE AUDITORIA & EXCEÇÕES
    // -------------------------------------------------------------------------
    function calculateAuditKPIs(records) {
        records = records || [];

        let totalImported = records.length;
        let totalValidated = 0;
        let totalPending = 0;
        let totalBlocked = 0;

        const byType = {
            pendente_classificacao: 0,
            divergencia_conciliacao: 0,
            duplicidade_suspeita: 0,
            documentacao_pendente: 0,
            rejeitado: 0,
            bloqueado: 0
        };

        records.forEach(r => {
            const st = r.status;

            if (st === STATES.APROVADO || st === STATES.PUBLICADO) {
                totalValidated++;
            } else if (st === STATES.REJEITADO || st === STATES.BLOQUEADO) {
                totalBlocked++;
            } else {
                totalPending++;
            }

            if (st === STATES.PENDENTE_CLASSIFICACAO || (
                (st === STATES.NORMALIZADO || st === STATES.EM_VALIDACAO || st === STATES.EM_CONFERENCIA) &&
                (!r.assigned_account || r.assigned_account.trim() === '')
            )) {
                byType.pendente_classificacao++;
            }
            if (st === STATES.DIVERGENCIA_CONCILIACAO) {
                byType.divergencia_conciliacao++;
            }
            if (st === STATES.DUPLICIDADE_SUSPEITA) {
                byType.duplicidade_suspeita++;
            }
            if (st === STATES.DOCUMENTACAO_PENDENTE) {
                byType.documentacao_pendente++;
            }
            if (st === STATES.REJEITADO) {
                byType.rejeitado++;
            }
            if (st === STATES.BLOQUEADO) {
                byType.bloqueado++;
            }
        });

        return {
            totalImported,
            totalValidated,
            totalPending,
            totalBlocked,
            byType,
            validationRate: totalImported > 0 ? Math.round((totalValidated / totalImported) * 100) : 0
        };
    }

    // -------------------------------------------------------------------------
    // 7. MOTOR DE FILTRAGEM MULTICRITÉRIO
    // -------------------------------------------------------------------------
    function filterRecords(records, filters) {
        records = records || [];
        filters = filters || {};

        return records.filter(r => {
            // 1. Filtro por Empresa
            if (filters.companyId && r.companyId && r.companyId !== filters.companyId) {
                return false;
            }

            // 2. Filtro por Competência (Ano / Mês)
            if (filters.year || filters.month !== undefined) {
                const dateStr = r.competence_date || r.date;
                if (dateStr) {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) {
                        if (filters.year && d.getUTCFullYear() !== Number(filters.year)) {
                            return false;
                        }
                        if (filters.month !== undefined && filters.month !== 'all' && filters.month !== '') {
                            if (d.getUTCMonth() !== Number(filters.month)) {
                                return false;
                            }
                        }
                    }
                }
            }

            // 3. Filtro por Arquivo / Lote
            if (filters.batchId && filters.batchId !== 'all') {
                if (r.batchId !== filters.batchId && r.source_batch_id !== filters.batchId) {
                    return false;
                }
            }
            if (filters.fileName && filters.fileName !== 'all') {
                if (r.source_file_name !== filters.fileName && r.fileName !== filters.fileName) {
                    return false;
                }
            }

            // 4. Filtro por Status
            if (filters.status && filters.status !== 'all') {
                if (r.status !== filters.status) return false;
            }

            // 5. Filtro por Tipo de Pendência / Exceção
            if (filters.exceptionType && filters.exceptionType !== 'all') {
                if (filters.exceptionType === 'PENDENTE_CLASSIFICACAO') {
                    const hasAcc = r.assigned_account && r.assigned_account.trim() !== '';
                    if (r.status !== STATES.PENDENTE_CLASSIFICACAO && hasAcc) return false;
                } else if (r.status !== filters.exceptionType) {
                    return false;
                }
            }

            // 6. Filtro por Categoria Gerencial
            if (filters.category && filters.category !== 'all') {
                const acc = r.assigned_account || r.category || '';
                if (!acc.toLowerCase().includes(filters.category.toLowerCase())) {
                    return false;
                }
            }

            // 7. Filtro por Faixa de Valor
            const amt = Math.abs(Number(r.amount) || 0);
            if (filters.amountMin !== undefined && filters.amountMin !== '' && amt < Number(filters.amountMin)) {
                return false;
            }
            if (filters.amountMax !== undefined && filters.amountMax !== '' && amt > Number(filters.amountMax)) {
                return false;
            }

            // 8. Filtro por Data Movimento (De / Até)
            if (filters.dateFrom && r.date && r.date < filters.dateFrom) {
                return false;
            }
            if (filters.dateTo && r.date && r.date > filters.dateTo) {
                return false;
            }

            // 9. Filtro por Termo de Busca Livre
            if (filters.searchTerm && filters.searchTerm.trim() !== '') {
                const term = filters.searchTerm.toLowerCase().trim();
                const desc = (r.description || '').toLowerCase();
                const doc = (r.document_number || r.documentNumber || r.fitid || '').toLowerCase();
                const id = (r.id || '').toLowerCase();
                const amountStr = String(r.amount || '');
                const rawStr = typeof r.rawRow === 'object' ? JSON.stringify(r.rawRow).toLowerCase() : '';

                const matches = desc.includes(term) || doc.includes(term) || id.includes(term) || amountStr.includes(term) || rawStr.includes(term);
                if (!matches) return false;
            }

            return true;
        });
    }

    // -------------------------------------------------------------------------
    // 8. AUXILIARES DE EVIDÊNCIA E COMPARAÇÃO DOCUMENTAL
    // -------------------------------------------------------------------------

    /**
     * Formata e organiza as evidências da ficha individual (Seções A, B, C, D)
     */
    function formatRecordFicha(record, batchMeta) {
        if (!record) return null;

        // Seção A: Dados do Lançamento
        const secaoA = {
            id: record.id,
            companyId: record.companyId || batchMeta?.companyId || 'comp_demo',
            date: record.date,
            competence_date: record.competence_date || record.date,
            description: record.description,
            amount: Number(record.amount) || 0,
            direction: (Number(record.amount) || 0) >= 0 ? 'ENTRADA' : 'SAIDA',
            bank_account: record.bank_account || record.source_bank || 'Conta Principal',
            category: record.assigned_account || record.category || 'Pendente de Classificação',
            status: record.status || STATES.NORMALIZADO
        };

        // Seção B: Evidência Original
        const secaoB = {
            file_name: record.source_file_name || batchMeta?.fileName || 'Extrato Bancário',
            file_type: record.source_file_type || batchMeta?.fileType || 'OFX',
            file_sha256: record.source_file_sha256 || batchMeta?.fileSha256 || batchMeta?.sha256 || 'N/A',
            source_reference: record.source_line_number ? `Linha ${record.source_line_number}` :
                             (record.row_number ? `Linha ${record.row_number}` :
                             (record.page_number ? `Página ${record.page_number}` : 'Linha Original')),
            raw_data: record.rawRow || record.raw_data || record.rawSample || null,
            comparison: {
                original_date: record.rawDate || record.date,
                canonical_date: record.date,
                original_amount: record.rawAmount !== undefined ? record.rawAmount : record.amount,
                canonical_amount: record.amount,
                original_description: record.rawDescription || record.description,
                canonical_description: record.description
            }
        };

        // Seção C: Classificação Assistida por IA
        const aiInfo = record.ai_classification || {};
        const secaoC = {
            suggested_account: aiInfo.suggested_account || record.assigned_account || null,
            confidence: aiInfo.confidence || null,
            justification: aiInfo.justification || 'Classificação inicial realizada por regras de layout homologado.',
            evidences: aiInfo.evidences || [],
            is_uncertain: Boolean(aiInfo.is_uncertain),
            current_account: record.assigned_account || record.category || null,
            document_requirement: record.document_requirement || null
        };

        // Seção D: Histórico de Auditoria
        const secaoD = {
            version: record.version || 1,
            events: (record.audit_history || []).slice().reverse() // Mais recente primeiro
        };

        return {
            record: record,
            secaoA: secaoA,
            secaoB: secaoB,
            secaoC: secaoC,
            secaoD: secaoD
        };
    }

    // -------------------------------------------------------------------------
    // API PÚBLICA DO MÓDULO
    // -------------------------------------------------------------------------
    return {
        STATES: STATES,
        CRITICAL_EXCEPTION_STATES: CRITICAL_EXCEPTION_STATES,
        ALLOWED_TRANSITIONS: ALLOWED_TRANSITIONS,
        canTransition: canTransition,
        initRecordAudit: initRecordAudit,
        appendAuditEvent: appendAuditEvent,
        approveRecord: approveRecord,
        rejectRecord: rejectRecord,
        correctRecord: correctRecord,
        reclassifyRecord: reclassifyRecord,
        requestDocumentRecord: requestDocumentRecord,
        reprocessRecord: reprocessRecord,
        isRecordEligibleForApproval: isRecordEligibleForApproval,
        approveEligibleBatch: approveEligibleBatch,
        calculateAuditKPIs: calculateAuditKPIs,
        filterRecords: filterRecords,
        formatRecordFicha: formatRecordFicha
    };
}));
