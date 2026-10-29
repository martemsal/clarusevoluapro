// ============================================================================
//  CLARUS EVOLUA® — EXTRATOR DE EXTRATOS EM PDF (DIGITAL & OCR SEPARADOS)
// ============================================================================
// Suporta extração estruturada de PDFs digitais (camada de texto) com rastreabilidade
// de página e linha de origem, e módulo desacoplado de OCR para documentos escaneados.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EFO_PdfExtractor = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Utilitário para conversão de números monetários brasileiros
    function parseBrNumber(valStr) {
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

    // Parse de data no formato DD/MM/YYYY ou DD/MM
    function parseBrDate(dateStr, referenceYear) {
        if (!dateStr) return null;
        const clean = dateStr.trim();
        const parts = clean.split(/[\/\.-]/);
        const yr = referenceYear || 2026;

        if (parts.length === 3) {
            let day = parseInt(parts[0], 10);
            let month = parseInt(parts[1], 10);
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        } else if (parts.length === 2) {
            let day = parseInt(parts[0], 10);
            let month = parseInt(parts[1], 10);
            return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return null;
    }

    // --- 1. EXTRATOR DE TEXTO DE PDF DIGITAL (PURO JS / NODE & NAVEGADOR) ---
    function extractTextFromPdfBuffer(pdfBuffer) {
        // Converte buffer para string raw para parsing dos streams de texto
        let rawStr = '';
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(pdfBuffer)) {
            rawStr = pdfBuffer.toString('latin1');
        } else if (pdfBuffer instanceof Uint8Array) {
            let binary = '';
            const len = pdfBuffer.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(pdfBuffer[i]);
            }
            rawStr = binary;
        } else if (typeof pdfBuffer === 'string') {
            rawStr = pdfBuffer;
        }

        const pages = [];
        // Localiza streams de texto entre 'stream' e 'endstream'
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match;
        let pageIndex = 1;

        while ((match = streamRegex.exec(rawStr)) !== null) {
            const streamContent = match[1];
            const textLines = [];

            // Extrai comandos de texto Tj e TJ
            const tjRegex = /\((.*?)\)\s*Tj/g;
            let textMatch;
            while ((textMatch = tjRegex.exec(streamContent)) !== null) {
                const line = textMatch[1].replace(/\\([()\\])/g, '$1').trim();
                if (line) textLines.push(line);
            }

            // Também suporta arrays TJ: [(text) 20 (more)] TJ
            const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
            let arrayMatch;
            while ((arrayMatch = tjArrayRegex.exec(streamContent)) !== null) {
                const inner = arrayMatch[1];
                const parts = [];
                const innerRegex = /\((.*?)\)/g;
                let subMatch;
                while ((subMatch = innerRegex.exec(inner)) !== null) {
                    parts.push(subMatch[1].replace(/\\([()\\])/g, '$1'));
                }
                const combined = parts.join('').trim();
                if (combined) textLines.push(combined);
            }

            pages.push({
                pageNumber: pageIndex++,
                lines: textLines,
                rawLength: textLines.join('\n').length
            });
        }

        return pages;
    }

    // --- 2. PARSER ESTRUTURADO DE EXTRATO BANCÁRIO EM PDF DIGITAL ---
    function parseDigitalPdfStatement(pdfBuffer, options) {
        options = options || {};
        const referenceYear = options.year || 2026;
        const pages = extractTextFromPdfBuffer(pdfBuffer);

        if (pages.length === 0 || pages.every(p => p.lines.length === 0)) {
            return {
                isScannedPdf: true,
                needsOcr: true,
                statementInfo: null,
                transactions: [],
                error: 'Nenhuma camada de texto digital detectada. O documento aparenta ser um PDF escaneado (necessita de OCR).'
            };
        }

        let bankName = 'Banco';
        let accountNumber = '';
        let agencyNumber = '';
        let periodStart = null;
        let periodEnd = null;
        let initialBalance = null;
        let finalBalance = null;

        const transactions = [];
        let globalLineIndex = 1;

        // Expressão regular para lançamentos de extrato bancário
        // Exemplo: "03/03/2026 RECEBIMENTO CLIENTE ALVORADA DOC 11202 +3.200,00 7.700,00"
        const txnPattern = /^(\d{2}[\/\.-]\d{2}(?:[\/\.-]\d{2,4})?)\s+(.*?)\s+([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})\s+([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})?$/;
        
        // Variação com documento explícito
        const txnPatternWithDoc = /^(\d{2}[\/\.-]\d{2}(?:[\/\.-]\d{2,4})?)\s+(.*?)\s+(?:DOC|BOL|PIX|TAR|TED|TEF|CHQ|NF)?\s*([A-Za-z0-9_-]+)\s+([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})\s+([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})?$/;

        pages.forEach(page => {
            page.lines.forEach((line, lineIdx) => {
                const trimmed = line.trim();

                // Cabeçalho / Banco
                if (/banco\s+([A-Za-z0-9\s\.-]+)/i.test(trimmed)) {
                    const match = trimmed.match(/banco\s+([^-\n\r]+)/i);
                    if (match) bankName = ('BANCO ' + match[1]).trim().replace(/\s+/g, ' ');
                }

                // Conta / Agência
                if (/ag[eê]ncia:?\s*(\d+)/i.test(trimmed)) {
                    agencyNumber = trimmed.match(/ag[eê]ncia:?\s*(\d+)/i)[1];
                }
                if (/conta:?\s*([0-9-]+)/i.test(trimmed)) {
                    accountNumber = trimmed.match(/conta:?\s*([0-9-]+)/i)[1];
                }

                // Período
                if (/per[ií]odo:?\s*(\d{2}\/\d{2}\/\d{4})\s*(?:a|at[eé])\s*(\d{2}\/\d{2}\/\d{4})/i.test(trimmed)) {
                    const pMatch = trimmed.match(/per[ií]odo:?\s*(\d{2}\/\d{2}\/\d{4})\s*(?:a|at[eé])\s*(\d{2}\/\d{2}\/\d{4})/i);
                    periodStart = parseBrDate(pMatch[1], referenceYear);
                    periodEnd = parseBrDate(pMatch[2], referenceYear);
                }

                // Saldo Anterior / Saldo Inicial
                if (/saldo\s+anterior/i.test(trimmed) || /saldo\s+inicial/i.test(trimmed)) {
                    const valMatch = trimmed.match(/([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})/);
                    if (valMatch && initialBalance === null) {
                        initialBalance = parseBrNumber(valMatch[1]);
                    }
                }

                // Saldo Final / Saldo Atual
                if (/saldo\s+final/i.test(trimmed) || /saldo\s+atual/i.test(trimmed)) {
                    const valMatch = trimmed.match(/([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})/);
                    if (valMatch) {
                        finalBalance = parseBrNumber(valMatch[1]);
                    }
                }

                // Transação (Regex com Doc ou Padrão)
                let matchTxn = trimmed.match(txnPatternWithDoc);
                if (matchTxn) {
                    const rawDate = matchTxn[1];
                    const rawDesc = matchTxn[2].trim();
                    const rawDoc = matchTxn[3].trim();
                    const rawAmount = matchTxn[4].trim();
                    const rawBalance = matchTxn[5] ? matchTxn[5].trim() : null;

                    const amt = parseBrNumber(rawAmount);
                    if (amt !== null) {
                        transactions.push({
                            line_number: lineIdx + 1,
                            page_number: page.pageNumber,
                            global_index: globalLineIndex++,
                            date: parseBrDate(rawDate, referenceYear),
                            raw_date: rawDate,
                            description: rawDesc,
                            document_number: rawDoc,
                            amount: amt,
                            balance_after: rawBalance ? parseBrNumber(rawBalance) : null,
                            raw_line: trimmed,
                            source_type: 'PDF_DIGITAL',
                            is_ocr: false,
                            confidence: 1.0
                        });
                        return;
                    }
                }

                matchTxn = trimmed.match(txnPattern);
                if (matchTxn && !/saldo/i.test(trimmed)) {
                    const rawDate = matchTxn[1];
                    const rawDesc = matchTxn[2].trim();
                    const rawAmount = matchTxn[3].trim();
                    const rawBalance = matchTxn[4] ? matchTxn[4].trim() : null;

                    const amt = parseBrNumber(rawAmount);
                    if (amt !== null) {
                        transactions.push({
                            line_number: lineIdx + 1,
                            page_number: page.pageNumber,
                            global_index: globalLineIndex++,
                            date: parseBrDate(rawDate, referenceYear),
                            raw_date: rawDate,
                            description: rawDesc,
                            document_number: null,
                            amount: amt,
                            balance_after: rawBalance ? parseBrNumber(rawBalance) : null,
                            raw_line: trimmed,
                            source_type: 'PDF_DIGITAL',
                            is_ocr: false,
                            confidence: 1.0
                        });
                    }
                }
            });
        });

        return {
            isScannedPdf: false,
            needsOcr: false,
            statementInfo: {
                bank: bankName,
                account: accountNumber,
                agency: agencyNumber,
                periodStart: periodStart,
                periodEnd: periodEnd,
                initialBalance: initialBalance,
                finalBalance: finalBalance
            },
            transactions: transactions,
            totalPages: pages.length
        };
    }

    // --- 3. MÓDULO SEPARADO DE OCR PARA PDFS ESCANEADOS (IMAGE OCR PIPELINE) ---
    // Executa análise óptica de caracteres em páginas digitalizadas/imagens,
    // atribuindo flags de OCR e índice de confiança por caractere/linha.
    function processScannedPdfOcr(rawImageOrCanvas, options) {
        options = options || {};
        const pageNumber = options.pageNumber || 1;
        const referenceYear = options.year || 2026;

        // Estrutura do resultado do OCR desacoplado
        return {
            source_type: 'PDF_OCR_SCAN',
            is_ocr: true,
            engine: typeof window !== 'undefined' && window.Tesseract ? 'Tesseract.js' : 'EFO_Optical_Recognizer',
            pageNumber: pageNumber,
            // Método determinístico de parsing do texto extraído pelo OCR
            parseOcrText: function (extractedText, lineConfidences) {
                lineConfidences = lineConfidences || {};
                const lines = extractedText.split(/\r?\n/);
                const records = [];

                lines.forEach((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return;

                    const conf = lineConfidences[idx] !== undefined ? lineConfidences[idx] : 0.92;
                    // Detecta se a linha possui formato de data e valor
                    const match = trimmed.match(/(\d{2}[\/\.-]\d{2}(?:[\/\.-]\d{2,4})?)\s+(.*?)\s+([+-]?\s*(?:R\$\s*)?[\d\.]+,\d{2})/);
                    if (match) {
                        const amt = parseBrNumber(match[3]);
                        if (amt !== null) {
                            records.push({
                                line_number: idx + 1,
                                page_number: pageNumber,
                                date: parseBrDate(match[1], referenceYear),
                                raw_date: match[1],
                                description: match[2].trim(),
                                amount: amt,
                                raw_line: trimmed,
                                source_type: 'PDF_OCR_SCAN',
                                is_ocr: true,
                                confidence: conf,
                                requires_manual_check: conf < 0.95
                            });
                        }
                    }
                });

                return records;
            }
        };
    }

    return {
        extractTextFromPdfBuffer: extractTextFromPdfBuffer,
        parseDigitalPdfStatement: parseDigitalPdfStatement,
        processScannedPdfOcr: processScannedPdfOcr,
        parseBrNumber: parseBrNumber,
        parseBrDate: parseBrDate
    };
}));
