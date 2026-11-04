// ============================================================================
//  CLARUS EVOLUA® — CONTROLLER DA CENTRAL DE REVISÃO E AUDITORIA FINANCEIRA
//  review_audit_controller.js
// ============================================================================

(function (root) {
    'use strict';

    // Estado da Central de Auditoria
    let auditActiveCompanyId = '';
    let auditActiveBatchId = 'all';
    let auditActiveYear = 2026;
    let auditActiveMonth = 'all';

    let auditFilters = {
        exceptionType: 'all',
        status: 'all',
        category: 'all',
        searchTerm: '',
        amountMin: '',
        amountMax: '',
        dateFrom: '',
        dateTo: ''
    };

    let auditLoadedRecords = [];
    let auditFilteredRecords = [];
    let auditSelectedRecordIds = new Set();
    let currentFichaRecord = null;
    let currentFichaBatchMeta = null;

    // Helper de Contexto do Usuário
    function getAuditContext() {
        const session = (typeof EFO_Session !== 'undefined' && EFO_Session) ? EFO_Session : null;
        return {
            user: session ? `${session.name || session.email} (${session.role || 'consultor'})` : 'Consultor / Auditor',
            userEmail: session ? session.email : 'admin@clarus.com.br',
            companyId: auditActiveCompanyId || (session ? session.companyId : 'comp_demo'),
            aiLearnCallback: function (decision) {
                if (typeof EFO_AiClassifier !== 'undefined' && EFO_AiClassifier.learnFromDecision) {
                    const memKey = `EFO_AiClassifier_Memory_${decision.company_id || 'all'}`;
                    let mem = [];
                    try { mem = JSON.parse(localStorage.getItem(memKey) || '[]'); } catch (_) { mem = []; }
                    EFO_AiClassifier.learnFromDecision(decision, mem);
                    try { localStorage.setItem(memKey, JSON.stringify(mem)); } catch (_) {}
                }
            }
        };
    }

    // Inicialização da View Principal
    window.renderReviewAuditView = function () {
        const session = (typeof EFO_Session !== 'undefined' && EFO_Session) ? EFO_Session : null;
        auditActiveCompanyId = (session && session.role === 'admin')
            ? (typeof EFO_Active_Company_Id !== 'undefined' && EFO_Active_Company_Id ? EFO_Active_Company_Id : 'comp_demo')
            : (session ? session.companyId : 'comp_demo');

        // 1. Preenche Select de Empresas
        populateAuditCompanySelect();

        // 2. Preenche Select de Lotes Disponíveis
        populateAuditBatchesSelect();

        // 3. Preenche Select do Plano de Contas nos Filtros
        populateAuditCategoryFilterSelect();

        // 4. Carrega registros do Staging e calcula KPIs
        loadAuditRecords();
    };

    function populateAuditCompanySelect() {
        const select = document.getElementById('auditEmpresaSelect');
        if (!select) return;

        select.innerHTML = '';
        const companies = (typeof EFO_Companies !== 'undefined' && EFO_Companies) ? EFO_Companies : {};
        const keys = Object.keys(companies);

        if (keys.length === 0) {
            select.innerHTML = '<option value="comp_demo">Clarus Indústria (comp_demo)</option>';
            return;
        }

        keys.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${companies[id].name || id} (${id})`;
            if (id === auditActiveCompanyId) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = (e) => {
            auditActiveCompanyId = e.target.value;
            auditActiveBatchId = 'all';
            populateAuditBatchesSelect();
            loadAuditRecords();
        };
    }

    function populateAuditBatchesSelect() {
        const select = document.getElementById('auditBatchSelect');
        if (!select) return;

        select.innerHTML = '<option value="all">📚 Todos os Lotes da Empresa</option>';
        const batchesKey = `EFO_Import_Batches_${auditActiveCompanyId}`;
        let batches = [];
        try {
            batches = JSON.parse(localStorage.getItem(batchesKey) || '[]');
        } catch (_) { batches = []; }

        batches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.batchId;
            const dateStr = b.importedAt ? new Date(b.importedAt).toLocaleDateString('pt-BR') : '';
            opt.textContent = `Lote #${b.batchId} — ${b.fileName} (${dateStr}) [${b.status}]`;
            if (b.batchId === auditActiveBatchId) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = (e) => {
            auditActiveBatchId = e.target.value;
            loadAuditRecords();
        };
    }

    function populateAuditCategoryFilterSelect() {
        const select = document.getElementById('auditCategoryFilter');
        if (!select) return;

        select.innerHTML = '<option value="all">Todas as Contas</option>';
        if (typeof EFO_AiClassifier !== 'undefined' && EFO_AiClassifier.CHART_OF_ACCOUNTS) {
            const chart = EFO_AiClassifier.CHART_OF_ACCOUNTS;
            Object.keys(chart).forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc;
                opt.textContent = `${chart[acc].destination}: ${chart[acc].label} (${acc})`;
                select.appendChild(opt);
            });
        }
    }

    // Carrega registros da persistência (Staging)
    function loadAuditRecords() {
        auditLoadedRecords = [];
        auditSelectedRecordIds.clear();

        const batchesKey = `EFO_Import_Batches_${auditActiveCompanyId}`;
        let batches = [];
        try {
            batches = JSON.parse(localStorage.getItem(batchesKey) || '[]');
        } catch (_) { batches = []; }

        const targetBatches = (auditActiveBatchId && auditActiveBatchId !== 'all')
            ? batches.filter(b => b.batchId === auditActiveBatchId)
            : batches;

        targetBatches.forEach(batch => {
            const recKey = `EFO_Import_Records_${batch.batchId}`;
            try {
                const payload = JSON.parse(localStorage.getItem(recKey) || '{}');
                const recs = payload.normalized || payload.records || [];
                recs.forEach(r => {
                    r.batchId = batch.batchId;
                    r.companyId = auditActiveCompanyId;
                    r.source_file_name = batch.fileName;
                    r.source_file_sha256 = batch.sha256 || batch.fileSha256;
                    r.source_file_type = batch.fileType;

                    // Garante auditoria inicializada
                    if (typeof EFO_ReviewAuditEngine !== 'undefined') {
                        EFO_ReviewAuditEngine.initRecordAudit(r, batch);
                    }
                    auditLoadedRecords.push(r);
                });
            } catch (_) {}
        });

        // 1. Atualiza KPIs
        updateAuditKPIs();

        // 2. Aplica Filtros e Renderiza Tabela
        applyAuditFiltersAndRender();
    }

    function updateAuditKPIs() {
        if (typeof EFO_ReviewAuditEngine === 'undefined') return;

        const kpis = EFO_ReviewAuditEngine.calculateAuditKPIs(auditLoadedRecords);

        // Atualiza Cards Principais
        const elTotal = document.getElementById('kpiAuditTotal');
        const elVal = document.getElementById('kpiAuditValidados');
        const elPend = document.getElementById('kpiAuditPendencias');
        const elBloq = document.getElementById('kpiAuditBloqueados');

        if (elTotal) elTotal.textContent = kpis.totalImported;
        if (elVal) elVal.textContent = kpis.totalValidated;
        if (elPend) elPend.textContent = kpis.totalPending;
        if (elBloq) elBloq.textContent = kpis.totalBlocked;

        // Atualiza Badges dos Chips de Exceção
        const setBadge = (id, count) => {
            const el = document.getElementById(id);
            if (el) el.textContent = count;
        };

        setBadge('countPendenteClassificacao', kpis.byType.pendente_classificacao);
        setBadge('countDivergenciaConciliacao', kpis.byType.divergencia_conciliacao);
        setBadge('countDuplicidadeSuspeita', kpis.byType.duplicidade_suspeita);
        setBadge('countDocumentacaoPendente', kpis.byType.documentacao_pendente);
        setBadge('countRejeitado', kpis.byType.rejeitado);
        setBadge('countBloqueado', kpis.byType.bloqueado);

        // Atualiza Badge da Sidebar
        const navBadge = document.getElementById('navAuditoriaPendingCount');
        if (navBadge) {
            navBadge.textContent = kpis.totalPending;
            navBadge.style.display = kpis.totalPending > 0 ? 'inline-block' : 'none';
        }
    }

    window.applyAuditFiltersAndRender = function () {
        if (typeof EFO_ReviewAuditEngine === 'undefined') return;

        // Captura valores dos controles
        const yearSelect = document.getElementById('auditYearSelect');
        const monthSelect = document.getElementById('auditMonthSelect');
        const statusFilter = document.getElementById('auditStatusFilter');
        const exceptionFilter = document.getElementById('auditExceptionFilter');
        const categoryFilter = document.getElementById('auditCategoryFilter');
        const searchInput = document.getElementById('auditSearchInput');
        const amountMin = document.getElementById('auditAmountMin');
        const amountMax = document.getElementById('auditAmountMax');
        const dateFrom = document.getElementById('auditDateFrom');
        const dateTo = document.getElementById('auditDateTo');

        const filters = {
            companyId: auditActiveCompanyId,
            batchId: auditActiveBatchId,
            year: yearSelect ? yearSelect.value : null,
            month: monthSelect ? monthSelect.value : 'all',
            status: statusFilter ? statusFilter.value : 'all',
            exceptionType: exceptionFilter ? exceptionFilter.value : 'all',
            category: categoryFilter ? categoryFilter.value : 'all',
            searchTerm: searchInput ? searchInput.value : '',
            amountMin: amountMin ? amountMin.value : '',
            amountMax: amountMax ? amountMax.value : '',
            dateFrom: dateFrom ? dateFrom.value : '',
            dateTo: dateTo ? dateTo.value : ''
        };

        auditFilteredRecords = EFO_ReviewAuditEngine.filterRecords(auditLoadedRecords, filters);
        renderAuditRecordsTable();
    };

    function renderAuditRecordsTable() {
        const tbody = document.getElementById('auditRecordsTbody');
        const summary = document.getElementById('auditTableSummary');
        if (!tbody) return;

        if (auditFilteredRecords.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center" style="padding: 36px 16px; color: var(--text-secondary);">
                        <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
                        Nenhum lançamento encontrado para os filtros selecionados.
                    </td>
                </tr>
            `;
            if (summary) summary.textContent = 'Exibindo 0 registros';
            return;
        }

        if (summary) {
            summary.textContent = `Exibindo ${auditFilteredRecords.length} de ${auditLoadedRecords.length} lançamentos`;
        }

        let html = '';
        auditFilteredRecords.forEach((rec, idx) => {
            const isChecked = auditSelectedRecordIds.has(rec.id);
            const amt = Number(rec.amount) || 0;
            const isCredit = amt >= 0;
            const amtFormatted = (typeof formatCurrency === 'function')
                ? formatCurrency(amt)
                : `R$ ${amt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

            // Badge de status
            const badgeInfo = getStatusBadgeInfo(rec.status);

            // Conta gerencial formatada
            const accountLabel = formatAccountBadge(rec);

            const rowOrigin = rec.source_line_number ? `Linha ${rec.source_line_number}` :
                             (rec.row_number ? `Linha ${rec.row_number}` : 'Origem');

            html += `
                <tr style="border-bottom: 1px solid var(--glass-border); transition: background 0.15s;" class="audit-row" data-id="${rec.id}">
                    <td style="text-align: center; width: 40px;">
                        <input type="checkbox" onchange="toggleAuditRecordSelect('${rec.id}', this.checked)" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
                    </td>
                    <td style="font-size: 11px; color: var(--text-secondary); width: 85px;">
                        <span title="${rec.source_file_name || ''}">${rowOrigin}</span>
                    </td>
                    <td style="font-size: 12px; font-weight: 500; width: 95px; white-space: nowrap;">
                        ${rec.date || '-'}
                    </td>
                    <td style="font-size: 11.5px; color: var(--text-secondary); width: 95px; white-space: nowrap;">
                        ${rec.competence_date || rec.date || '-'}
                    </td>
                    <td style="max-width: 240px; font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${rec.description || ''}">
                        ${rec.description || '-'}
                    </td>
                    <td style="width: 80px; text-align: center;">
                        <span class="badge" style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ${isCredit ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}; color: ${isCredit ? '#10b981' : '#ef4444'};">
                            ${isCredit ? 'ENTRADA' : 'SAÍDA'}
                        </span>
                    </td>
                    <td style="width: 120px; text-align: right; font-size: 12.5px; font-weight: 700; color: ${isCredit ? 'var(--success)' : 'var(--danger)'}; white-space: nowrap;">
                        ${amtFormatted}
                    </td>
                    <td style="max-width: 190px;">
                        ${accountLabel}
                    </td>
                    <td style="width: 130px; text-align: center;">
                        <span class="badge" style="background: ${badgeInfo.bg}; color: ${badgeInfo.color}; border: 1px solid ${badgeInfo.border}; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 6px;">
                            ${badgeInfo.label}
                        </span>
                    </td>
                    <td style="width: 130px; text-align: center; white-space: nowrap;">
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin: 0;" onclick="openRecordFichaModal('${rec.id}')" title="Revisar Ficha Completa e Evidências">
                                🔍 Ficha
                            </button>
                            <button type="button" class="btn-primary" style="padding: 4px 8px; font-size: 11px; margin: 0; background: #10b981; border-color: #10b981;" onclick="quickApproveRecord('${rec.id}')" title="Aprovar Lançamento">
                                ✓
                            </button>
                            <button type="button" class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px; margin: 0; border-color: var(--danger);" onclick="quickRejectRecordPrompt('${rec.id}')" title="Rejeitar Lançamento">
                                ✕
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        updateSelectedCountUI();
    }

    function getStatusBadgeInfo(status) {
        switch (status) {
            case 'APROVADO':
                return { label: '✓ APROVADO', bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.4)' };
            case 'PUBLICADO':
                return { label: '🚀 PUBLICADO', bg: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', border: 'rgba(99, 102, 241, 0.4)' };
            case 'REJEITADO':
                return { label: '✕ REJEITADO', bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
            case 'BLOQUEADO':
                return { label: '⛔ BLOQUEADO', bg: 'rgba(239, 68, 68, 0.2)', color: '#dc2626', border: 'rgba(220, 38, 38, 0.5)' };
            case 'DIVERGENCIA_CONCILIACAO':
                return { label: '⚖️ DIVERGÊNCIA', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
            case 'DUPLICIDADE_SUSPEITA':
                return { label: '⚠️ DUPLICIDADE', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
            case 'DOCUMENTACAO_PENDENTE':
                return { label: '📄 DOC PENDENTE', bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' };
            case 'PENDENTE_CLASSIFICACAO':
                return { label: '🏷️ SEM CONTA', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
            case 'EM_CONFERENCIA':
                return { label: '📋 EM CONFERÊNCIA', bg: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', border: 'rgba(14, 165, 233, 0.4)' };
            case 'EM_VALIDACAO':
                return { label: '⚙️ EM VALIDAÇÃO', bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.4)' };
            default:
                return { label: status || 'NORMALIZADO', bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', border: 'rgba(156, 163, 175, 0.3)' };
        }
    }

    function formatAccountBadge(rec) {
        const acc = rec.assigned_account || rec.category;
        if (!acc || acc === 'ignore') {
            return `<span style="color: #f59e0b; font-size: 11px; font-weight: 500;">⚠️ Sem Classificação</span>`;
        }

        let label = acc;
        if (typeof EFO_AiClassifier !== 'undefined' && EFO_AiClassifier.CHART_OF_ACCOUNTS && EFO_AiClassifier.CHART_OF_ACCOUNTS[acc]) {
            label = EFO_AiClassifier.CHART_OF_ACCOUNTS[acc].label;
        }

        const isAI = Boolean(rec.ai_classification && !rec.classification_manual);
        const tag = isAI ? '✨ IA' : '👤 Manual';

        return `
            <div style="font-size: 11.5px; font-weight: 500; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${acc}">
                ${label}
            </div>
            <div style="font-size: 10px; color: var(--text-secondary);">${tag}</div>
        `;
    }

    // Seleção Múltipla
    window.toggleAuditRecordSelect = function (id, checked) {
        if (checked) {
            auditSelectedRecordIds.add(id);
        } else {
            auditSelectedRecordIds.delete(id);
        }
        updateSelectedCountUI();
    };

    window.toggleSelectAllAuditRecords = function (checked) {
        auditSelectedRecordIds.clear();
        if (checked) {
            auditFilteredRecords.forEach(r => auditSelectedRecordIds.add(r.id));
        }
        renderAuditRecordsTable();
    };

    function updateSelectedCountUI() {
        const span = document.getElementById('auditSelectedCount');
        if (span) {
            span.textContent = `${auditSelectedRecordIds.size} selecionado(s)`;
        }
        const masterCb = document.getElementById('cbSelectAllAuditRecords');
        if (masterCb) {
            masterCb.checked = auditFilteredRecords.length > 0 && auditSelectedRecordIds.size === auditFilteredRecords.length;
        }
    }

    // -------------------------------------------------------------------------
    // AÇÕES INDIVIDUAIS E RÁPIDAS
    // -------------------------------------------------------------------------

    window.quickApproveRecord = function (recordId) {
        const rec = auditLoadedRecords.find(r => r.id === recordId);
        if (!rec) return;

        try {
            EFO_ReviewAuditEngine.approveRecord(rec, {
                justification: 'Aprovação direta pelo consultor na tabela de auditoria.'
            }, getAuditContext());

            saveRecordChangesToStaging(rec);
            updateAuditKPIs();
            renderAuditRecordsTable();
            if (typeof showToast === 'function') {
                showToast('Aprovado', 'Lançamento aprovado com sucesso!', 'success');
            }
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast('Erro ao Aprovar', err.message, 'danger');
            } else {
                alert(err.message);
            }
        }
    };

    window.quickRejectRecordPrompt = function (recordId) {
        openAuditJustificationModal({
            title: 'Rejeitar Lançamento',
            subtitle: 'Informe a justificativa formal obrigatória para a rejeição do lançamento.',
            actionLabel: 'Confirmar Rejeição',
            actionClass: 'btn-secondary text-danger',
            onConfirm: function (justification) {
                const rec = auditLoadedRecords.find(r => r.id === recordId);
                if (!rec) return;

                EFO_ReviewAuditEngine.rejectRecord(rec, justification, {}, getAuditContext());
                saveRecordChangesToStaging(rec);
                updateAuditKPIs();
                renderAuditRecordsTable();
                if (typeof showToast === 'function') {
                    showToast('Rejeitado', 'Lançamento rejeitado e preservado na trilha de auditoria.', 'warning');
                }
            }
        });
    };

    // -------------------------------------------------------------------------
    // APROVAÇÃO EM LOTE DOS ELEGÍVEIS
    // -------------------------------------------------------------------------
    window.auditApproveEligibleBatchAction = function () {
        // Se houver seleção manual, usa os selecionados; caso contrário, todos os filtrados
        let targetRecords = [];
        if (auditSelectedRecordIds.size > 0) {
            targetRecords = auditLoadedRecords.filter(r => auditSelectedRecordIds.has(r.id));
        } else {
            targetRecords = auditFilteredRecords;
        }

        if (targetRecords.length === 0) {
            if (typeof showToast === 'function') {
                showToast('Aviso', 'Nenhum lançamento selecionado para aprovação.', 'warning');
            }
            return;
        }

        const result = EFO_ReviewAuditEngine.approveEligibleBatch(targetRecords, {
            justification: 'Aprovação em lote realizada pelo consultor.'
        }, getAuditContext());

        // Salva todos os aprovados na persistência
        result.approved.forEach(rec => saveRecordChangesToStaging(rec));

        updateAuditKPIs();
        renderAuditRecordsTable();

        const msg = `${result.summary.approvedCount} aprovados com sucesso. ${result.summary.skippedCount} ignorados por pendências/bloqueios.`;
        if (typeof showToast === 'function') {
            showToast('Aprovação em Lote', msg, result.summary.approvedCount > 0 ? 'success' : 'warning');
        } else {
            alert(msg);
        }
    };

    // -------------------------------------------------------------------------
    // FICHA INDIVIDUAL DO LANÇAMENTO (SEÇÕES A, B, C, D)
    // -------------------------------------------------------------------------
    window.openRecordFichaModal = function (recordId) {
        const rec = auditLoadedRecords.find(r => r.id === recordId);
        if (!rec) return;

        currentFichaRecord = rec;
        const modal = document.getElementById('recordFichaModal');
        if (!modal) return;

        const ficha = EFO_ReviewAuditEngine.formatRecordFicha(rec);

        // Header da Ficha
        document.getElementById('fichaRecordIdTitle').textContent = `Ficha do Lançamento #${rec.id}`;
        const headerBadge = document.getElementById('fichaRecordStatusBadge');
        if (headerBadge) {
            const b = getStatusBadgeInfo(rec.status);
            headerBadge.textContent = b.label;
            headerBadge.style.background = b.bg;
            headerBadge.style.color = b.color;
            headerBadge.style.border = `1px solid ${b.border}`;
        }

        // SEÇÃO A: DADOS DO LANÇAMENTO
        document.getElementById('fichaA_id').value = ficha.secaoA.id;
        document.getElementById('fichaA_company').value = ficha.secaoA.companyId;
        document.getElementById('fichaA_date').value = ficha.secaoA.date || '';
        document.getElementById('fichaA_competence').value = ficha.secaoA.competence_date || '';
        document.getElementById('fichaA_desc').value = ficha.secaoA.description || '';
        document.getElementById('fichaA_amount').value = (typeof formatCurrency === 'function')
            ? formatCurrency(ficha.secaoA.amount)
            : `R$ ${ficha.secaoA.amount.toFixed(2)}`;
        document.getElementById('fichaA_direction').value = ficha.secaoA.direction;
        document.getElementById('fichaA_bank').value = ficha.secaoA.bank_account;
        document.getElementById('fichaA_category').value = ficha.secaoA.category;
        document.getElementById('fichaA_status').value = ficha.secaoA.status;

        // SEÇÃO B: EVIDÊNCIA ORIGINAL
        document.getElementById('fichaB_fileName').textContent = ficha.secaoB.file_name;
        document.getElementById('fichaB_fileType').textContent = ficha.secaoB.file_type;
        document.getElementById('fichaB_sha256').textContent = ficha.secaoB.file_sha256;
        document.getElementById('fichaB_reference').textContent = ficha.secaoB.source_reference;

        // Comparativo Original vs Normalizado
        document.getElementById('fichaB_origDate').textContent = ficha.secaoB.comparison.original_date || '-';
        document.getElementById('fichaB_canonDate').textContent = ficha.secaoB.comparison.canonical_date || '-';
        document.getElementById('fichaB_origAmount').textContent = ficha.secaoB.comparison.original_amount !== undefined ? ficha.secaoB.comparison.original_amount : '-';
        document.getElementById('fichaB_canonAmount').textContent = ficha.secaoB.comparison.canonical_amount !== undefined ? ficha.secaoB.comparison.canonical_amount : '-';
        document.getElementById('fichaB_origDesc').textContent = ficha.secaoB.comparison.original_description || '-';
        document.getElementById('fichaB_canonDesc').textContent = ficha.secaoB.comparison.canonical_description || '-';

        // JSON Bruto
        const rawEl = document.getElementById('fichaB_rawDataJson');
        if (rawEl) {
            rawEl.textContent = ficha.secaoB.raw_data ? JSON.stringify(ficha.secaoB.raw_data, null, 2) : '(Dados brutos não estruturados)';
        }

        // SEÇÃO C: CLASSIFICAÇÃO GERENCIAL
        document.getElementById('fichaC_aiSuggestedAccount').textContent = ficha.secaoC.suggested_account || 'Nenhuma conta sugerida';
        document.getElementById('fichaC_aiConfidence').textContent = ficha.secaoC.confidence ? `${Math.round(ficha.secaoC.confidence * 100)}%` : 'Regra Heurística';
        document.getElementById('fichaC_aiJustification').textContent = ficha.secaoC.justification || 'Classificação inicial realizada no momento da ingestão.';

        // Preenche select do plano de contas para reclassificação
        populateFichaCategorySelect(rec.assigned_account || rec.category);
        document.getElementById('fichaC_reclassifyJustification').value = '';

        // SEÇÃO D: HISTÓRICO DE AUDITORIA (TIMELINE)
        renderFichaAuditTimeline(ficha.secaoD);

        modal.style.display = 'block';
    };

    window.closeRecordFichaModal = function () {
        const modal = document.getElementById('recordFichaModal');
        if (modal) modal.style.display = 'none';
        currentFichaRecord = null;
    };

    function populateFichaCategorySelect(currentAccount) {
        const select = document.getElementById('fichaC_accountSelect');
        if (!select) return;

        select.innerHTML = '';
        if (typeof EFO_AiClassifier !== 'undefined' && EFO_AiClassifier.CHART_OF_ACCOUNTS) {
            const chart = EFO_AiClassifier.CHART_OF_ACCOUNTS;
            Object.keys(chart).forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc;
                opt.textContent = `${chart[acc].destination} • ${chart[acc].label} (${acc})`;
                if (acc === currentAccount) opt.selected = true;
                select.appendChild(opt);
            });
        }
    }

    function renderFichaAuditTimeline(secaoD) {
        const container = document.getElementById('fichaD_timelineContainer');
        if (!container) return;

        const events = secaoD.events || [];
        if (events.length === 0) {
            container.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px;">Nenhum evento registrado.</div>';
            return;
        }

        let html = '<div style="position: relative; padding-left: 20px; border-left: 2px solid var(--accent-primary);">';
        events.forEach(evt => {
            const dateStr = evt.timestamp ? new Date(evt.timestamp).toLocaleString('pt-BR') : '';
            html += `
                <div style="margin-bottom: 18px; position: relative;">
                    <div style="position: absolute; left: -26px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent-primary); border: 2px solid var(--bg-primary);"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                        <strong style="font-size: 12px; color: var(--text-primary);">${evt.action} (v${evt.version})</strong>
                        <span style="font-size: 11px; color: var(--text-secondary);">${dateStr}</span>
                    </div>
                    <div style="font-size: 11.5px; color: var(--accent-primary); margin-bottom: 4px;">Responsável: ${evt.user}</div>
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 4px 0; line-height: 1.4;">${evt.justification || 'Sem observações.'}</p>
                    ${evt.changes && Object.keys(evt.changes).length > 0 ? `
                        <div style="font-size: 11px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; color: var(--text-secondary); font-family: monospace;">
                            ${JSON.stringify(evt.changes)}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    }

    // Ações de dentro da Ficha
    window.fichaSaveReclassification = function () {
        if (!currentFichaRecord) return;
        const newAccount = document.getElementById('fichaC_accountSelect').value;
        const justification = document.getElementById('fichaC_reclassifyJustification').value;

        try {
            EFO_ReviewAuditEngine.reclassifyRecord(currentFichaRecord, newAccount, justification, {
                learnAI: true
            }, getAuditContext());

            saveRecordChangesToStaging(currentFichaRecord);
            updateAuditKPIs();
            renderAuditRecordsTable();
            openRecordFichaModal(currentFichaRecord.id); // re-renderiza ficha atualizada

            if (typeof showToast === 'function') {
                showToast('Reclassificado', 'Conta contábil atualizada e histórico registrado!', 'success');
            }
        } catch (err) {
            alert(err.message);
        }
    };

    window.fichaSaveDataCorrections = function () {
        if (!currentFichaRecord) return;
        const compDate = document.getElementById('fichaA_competence').value;
        const desc = document.getElementById('fichaA_desc').value;

        openAuditJustificationModal({
            title: 'Confirmar Correção de Dados',
            subtitle: 'Informe a justificativa formal para a alteração cadastral deste lançamento.',
            actionLabel: 'Salvar Correções',
            actionClass: 'btn-primary',
            onConfirm: function (justification) {
                EFO_ReviewAuditEngine.correctRecord(currentFichaRecord, {
                    competence_date: compDate,
                    description: desc
                }, justification, {}, getAuditContext());

                saveRecordChangesToStaging(currentFichaRecord);
                updateAuditKPIs();
                renderAuditRecordsTable();
                openRecordFichaModal(currentFichaRecord.id);

                if (typeof showToast === 'function') {
                    showToast('Corrigido', 'Dados corrigidos e auditados com sucesso.', 'success');
                }
            }
        });
    };

    window.fichaApproveRecord = function () {
        if (!currentFichaRecord) return;
        try {
            EFO_ReviewAuditEngine.approveRecord(currentFichaRecord, {
                justification: 'Aprovado formalmente pelo auditor na ficha individual.'
            }, getAuditContext());

            saveRecordChangesToStaging(currentFichaRecord);
            updateAuditKPIs();
            renderAuditRecordsTable();
            openRecordFichaModal(currentFichaRecord.id);

            if (typeof showToast === 'function') {
                showToast('Aprovado', 'Lançamento aprovado com sucesso!', 'success');
            }
        } catch (err) {
            alert(err.message);
        }
    };

    window.fichaRejectRecord = function () {
        if (!currentFichaRecord) return;
        quickRejectRecordPrompt(currentFichaRecord.id);
    };

    window.fichaRequestDocument = function () {
        if (!currentFichaRecord) return;
        openAuditJustificationModal({
            title: 'Solicitar Documentação Complementar',
            subtitle: 'Descreva a nota fiscal, contrato ou comprovante bancário necessário para liberar este lançamento.',
            actionLabel: 'Registrar Pendência Documental',
            actionClass: 'btn-secondary',
            onConfirm: function (docRequirement) {
                EFO_ReviewAuditEngine.requestDocumentRecord(currentFichaRecord, docRequirement, {}, getAuditContext());
                saveRecordChangesToStaging(currentFichaRecord);
                updateAuditKPIs();
                renderAuditRecordsTable();
                openRecordFichaModal(currentFichaRecord.id);

                if (typeof showToast === 'function') {
                    showToast('Documento Solicitado', 'Lançamento marcado como DOCUMENTAÇÃO PENDENTE.', 'warning');
                }
            }
        });
    };

    // -------------------------------------------------------------------------
    // PERSISTÊNCIA EM STAGING
    // -------------------------------------------------------------------------
    function saveRecordChangesToStaging(record) {
        if (!record || !record.batchId) return;

        const recKey = `EFO_Import_Records_${record.batchId}`;
        try {
            const payload = JSON.parse(localStorage.getItem(recKey) || '{}');
            const recs = payload.normalized || payload.records || [];
            const idx = recs.findIndex(r => r.id === record.id);
            if (idx >= 0) {
                recs[idx] = record;
            } else {
                recs.push(record);
            }
            payload.normalized = recs;
            payload.records = recs;
            localStorage.setItem(recKey, JSON.stringify(payload));
        } catch (err) {
            console.error('Erro ao salvar lançamento no Staging:', err);
        }
    }

    // Modal de Justificativa Genérico
    let currentJustificationCallback = null;

    function openAuditJustificationModal(config) {
        const modal = document.getElementById('auditActionJustificationModal');
        if (!modal) return;

        document.getElementById('auditJustificationTitle').textContent = config.title || 'Justificativa Obrigatória';
        document.getElementById('auditJustificationSubtitle').textContent = config.subtitle || '';
        const txt = document.getElementById('auditJustificationText');
        txt.value = '';

        const btnConfirm = document.getElementById('btnConfirmAuditJustification');
        btnConfirm.textContent = config.actionLabel || 'Confirmar';
        btnConfirm.className = config.actionClass || 'btn-primary';

        currentJustificationCallback = config.onConfirm;
        modal.style.display = 'block';
    }

    window.submitAuditJustification = function () {
        const txt = document.getElementById('auditJustificationText');
        const val = txt ? txt.value.trim() : '';

        if (!val || val.length < 5) {
            alert('A justificativa formal é obrigatória e deve ter no mínimo 5 caracteres.');
            return;
        }

        const modal = document.getElementById('auditActionJustificationModal');
        if (modal) modal.style.display = 'none';

        if (typeof currentJustificationCallback === 'function') {
            currentJustificationCallback(val);
        }
        currentJustificationCallback = null;
    };

    window.closeAuditJustificationModal = function () {
        const modal = document.getElementById('auditActionJustificationModal');
        if (modal) modal.style.display = 'none';
        currentJustificationCallback = null;
    };

})(typeof window !== 'undefined' ? window : this);
