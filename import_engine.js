// ============================================================================
//  CLARUS EVOLUA® — MÓDULO DE IMPORTAÇÃO CANÔNICO & AUDITORIA FINANCEIRA
//  Etapa 1: Ingestão, Normalização, Mapeamento e Staging (CSV & XLSX)
// ============================================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js
        module.exports = factory(require('crypto'));
    } else {
        // Browser Global
        root.EFO_ImportEngine = factory(null);
    }
}(typeof self !== 'undefined' ? self : this, function (nodeCrypto) {

    // --- 1. CRYPTO & SHA-256 HASH GENERATOR ---
    function computeSha256(content) {
        if (nodeCrypto) {
            return nodeCrypto.createHash('sha256').update(content).digest('hex');
        }
        
        // Browser fallback using pure JS SHA-256 (synchronous & reliable for staging)
        return sha256_sync(content);
    }

    function sha256_sync(ascii) {
        if (typeof ascii !== 'string') {
            if (ascii instanceof Uint8Array || ascii instanceof ArrayBuffer) {
                const bytes = new Uint8Array(ascii);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                ascii = binary;
            } else {
                ascii = String(ascii);
            }
        }
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }
        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        let result = '';
        const words = [];
        const asciiLength = ascii.length * 8;
        
        let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const k = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        
        ascii += '\x80';
        while (ascii.length % 64 - 56) ascii += '\x00';
        for (let i = 0; i < ascii.length; i++) {
            const j = ascii.charCodeAt(i);
            words[i >> 2] |= j << (24 - (i % 4) * 8);
        }
        words[words.length] = ((asciiLength / maxWord) | 0);
        words[words.length] = (asciiLength | 0);
        
        for (let j = 0; j < words.length;) {
            const w = words.slice(j, j += 16);
            const oldHash = hash.slice(0);
            for (let i = 0; i < 64; i++) {
                if (i >= 16) {
                    const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                    const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
                }
                const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
                const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
                const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + w[i]) | 0;
                const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0;
                
                hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
            }
            for (let i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 3; j >= 0; j--) {
                const b = (hash[i] >> (j * 8)) & 255;
                result += (b < 16 ? '0' : '') + b.toString(16);
            }
        }
        return result;
    }

    // --- 2. ENCODING & DELIMITER AUTO-DETECTION ---
    function detectEncoding(bufferOrString) {
        if (typeof bufferOrString === 'string') {
            return 'UTF-8';
        }
        const bytes = new Uint8Array(bufferOrString);
        // Check UTF-8 BOM (0xEF, 0xBB, 0xBF)
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            return 'UTF-8-BOM';
        }
        // Check for valid UTF-8 sequences
        let isUtf8 = true;
        let i = 0;
        while (i < Math.min(bytes.length, 4096)) {
            const b = bytes[i];
            if (b <= 0x7F) {
                i++;
            } else if ((b & 0xE0) === 0xC0) {
                if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) { isUtf8 = false; break; }
                i += 2;
            } else if ((b & 0xF0) === 0xE0) {
                if (i + 2 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) { isUtf8 = false; break; }
                i += 3;
            } else {
                isUtf8 = false;
                break;
            }
        }
        return isUtf8 ? 'UTF-8' : 'ISO-8859-1';
    }

    function decodeBuffer(buffer, encoding) {
        if (typeof buffer === 'string') return buffer;
        const enc = encoding || detectEncoding(buffer);
        const decoder = new TextDecoder(enc === 'ISO-8859-1' ? 'latin1' : 'utf-8');
        return decoder.decode(buffer);
    }

    function detectDelimiter(csvText) {
        const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 15);
        if (lines.length === 0) return ';';

        const candidates = [';', ',', '\t', '|'];
        let bestDelimiter = ';';
        let maxConsistency = -1;

        candidates.forEach(delim => {
            const counts = lines.map(line => {
                let count = 0;
                let insideQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (c === '"') insideQuotes = !insideQuotes;
                    else if (c === delim && !insideQuotes) count++;
                }
                return count;
            });

            const firstCount = counts[0];
            if (firstCount > 0) {
                const consistent = counts.every(c => c === firstCount);
                const score = consistent ? firstCount * 10 : counts.reduce((a, b) => a + b, 0);
                if (score > maxConsistency) {
                    maxConsistency = score;
                    bestDelimiter = delim;
                }
            }
        });

        return bestDelimiter;
    }

    // --- 3. ROBUST CSV PARSER (Handles Quotes, Commas, Line breaks) ---
    function parseCsvString(csvText, customDelimiter) {
        if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) {
            throw new Error('Arquivo CSV vazio ou sem conteúdo textual válido.');
        }

        const delimiter = customDelimiter || detectDelimiter(csvText);
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let insideQuotes = false;

        const text = csvText.replace(/^\uFEFF/, ''); // Remove BOM if present

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentField += '"';
                    i++; // skip escaped quote
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === delimiter && !insideQuotes) {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if ((char === '\r' || char === '\n') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++; // handle CRLF
                }
                currentRow.push(currentField.trim());
                currentField = '';
                // Only push if row has at least one non-empty value
                if (currentRow.some(val => val.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
            } else {
                currentField += char;
            }
        }

        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(val => val.length > 0)) {
                rows.push(currentRow);
            }
        }

        if (rows.length === 0) {
            throw new Error('Nenhuma linha de dados encontrada no arquivo.');
        }

        return { delimiter, rows };
    }

    // --- 4. BRAZILIAN NUMBER PARSER ---
    // Handles: "1.234,56", "R$ 1.234,56", "-1.234,56", "(1.234,56)", "1.234,56 D", "1.234,56 C"
    function parseBrazilianNumber(val) {
        if (val === null || val === undefined) return null;
        if (typeof val === 'number') {
            return isNaN(val) ? null : val;
        }

        let str = String(val).trim();
        if (str === '' || str === '-' || str === '.') return null;

        let isNegative = false;

        // Check parentheses (e.g. "(1.250,00)" -> -1250.00)
        if (str.startsWith('(') && str.endsWith(')')) {
            isNegative = true;
            str = str.substring(1, str.length - 1).trim();
        }

        // Check trailing minus (e.g. "200,75-")
        if (str.endsWith('-')) {
            isNegative = true;
            str = str.substring(0, str.length - 1).trim();
        }

        // Check Debit / Credit indicators at end or start
        if (/[\s]D$/i.test(str) || /^D[\s]/i.test(str) || /[\s]DEB$/i.test(str)) {
            isNegative = true;
            str = str.replace(/[\s]D$/i, '').replace(/^D[\s]/i, '').replace(/[\s]DEB$/i, '').trim();
        } else if (/[\s]C$/i.test(str) || /^C[\s]/i.test(str) || /[\s]CRED$/i.test(str)) {
            str = str.replace(/[\s]C$/i, '').replace(/^C[\s]/i, '').replace(/[\s]CRED$/i, '').trim();
        }

        if (str.startsWith('-')) {
            isNegative = true;
            str = str.substring(1).trim();
        }

        // Remove currency symbols & NBSP
        str = str.replace(/R\$/gi, '').replace(/\$/g, '').replace(/\u00A0/g, '').trim();

        // Check decimal vs thousand separators
        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');

        let cleanNumberStr = '';
        if (lastComma > -1 && lastDot > -1) {
            if (lastComma > lastDot) {
                // Brazilian format: 1.234.567,89 -> remove dots, replace comma with dot
                cleanNumberStr = str.replace(/\./g, '').replace(',', '.');
            } else {
                // International format: 1,234,567.89 -> remove commas
                cleanNumberStr = str.replace(/,/g, '');
            }
        } else if (lastComma > -1) {
            // Only comma present: 1234,56 -> 1234.56
            cleanNumberStr = str.replace(',', '.');
        } else {
            // Only dot or integer: 1234.56 or 1234
            cleanNumberStr = str;
        }

        // Strip any residual non-numeric chars except '.' and '-'
        cleanNumberStr = cleanNumberStr.replace(/[^0-9.-]/g, '');

        const num = parseFloat(cleanNumberStr);
        if (isNaN(num)) return null;

        return isNegative ? -Math.abs(num) : num;
    }

    // --- 5. BRAZILIAN DATE PARSER ---
    // Handles: "DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD/MM/YY", Excel serial numbers (e.g. 45000)
    function parseBrazilianDate(val) {
        if (val === null || val === undefined) return null;

        // If Date object
        if (val instanceof Date) {
            if (isNaN(val.getTime())) return null;
            return val.toISOString().split('T')[0];
        }

        // If Excel serial number (e.g. 45000 = ~2023)
        if (typeof val === 'number') {
            if (val > 20000 && val < 60000) {
                // Excel epoch starts at Dec 30, 1899 due to 1900 leap year bug
                const utcDays = Math.floor(val - 25569);
                const utcValue = utcDays * 86400 * 1000;
                const dateInfo = new Date(utcValue);
                if (!isNaN(dateInfo.getTime())) {
                    return dateInfo.toISOString().split('T')[0];
                }
            }
        }

        let str = String(val).trim();
        if (str.length === 0) return null;

        // Extract clean date portion if string has timestamp (e.g. "2026-03-15 14:30:00" or "15/03/2026T...")
        const partsMatch = str.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/);
        if (!partsMatch) return null;

        const p1 = parseInt(partsMatch[1], 10);
        const p2 = parseInt(partsMatch[2], 10);
        let p3 = parseInt(partsMatch[3], 10);

        let day, month, year;

        if (p1 > 1000) {
            // YYYY-MM-DD
            year = p1;
            month = p2;
            day = p3;
        } else {
            // DD/MM/YYYY or DD/MM/YY
            day = p1;
            month = p2;
            if (p3 < 100) {
                p3 += p3 < 70 ? 2000 : 1900;
            }
            year = p3;
        }

        if (month < 1 || month > 12) return null;
        if (day < 1 || day > 31) return null;

        // Verify day count in month
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day > daysInMonth) return null;

        const pad = (n) => String(n).padStart(2, '0');
        return `${year}-${pad(month)}-${pad(day)}`;
    }

    // --- 6. HEADER DETECTION & DE-DUPLICATION ---
    function detectHeaderRow(rawRows) {
        if (rawRows && !Array.isArray(rawRows) && Array.isArray(rawRows.rows)) {
            rawRows = rawRows.rows;
        }
        if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
            throw new Error('Planilha sem linhas para identificar cabeçalho.');
        }

        // Find the first row that has at least 2 non-empty string headers
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
            const row = rawRows[i];
            const nonEmpties = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim().length > 0);
            if (nonEmpties.length >= 2) {
                headerRowIndex = i;
                break;
            }
        }

        const rawHeaders = rawRows[headerRowIndex];
        const headers = [];
        const nameCounts = {};

        rawHeaders.forEach((col, idx) => {
            let colName = col !== null && col !== undefined ? String(col).trim() : '';
            if (colName.length === 0) {
                colName = `Coluna_${idx + 1}`;
            }

            // De-duplicate identical header names
            if (nameCounts[colName]) {
                nameCounts[colName]++;
                colName = `${colName}_${nameCounts[colName]}`;
            } else {
                nameCounts[colName] = 1;
            }

            headers.push(colName);
        });

        const dataRows = rawRows.slice(headerRowIndex + 1).filter(r => {
            // Exclude completely empty rows
            return r.some(cell => cell !== null && cell !== undefined && String(cell).trim().length > 0);
        });

        return {
            headerRowIndex,
            headers,
            dataRows
        };
    }

    // --- 7. AUTO-SUGGESTION FOR COLUMN MAPPING ---
    function suggestColumnMapping(headers) {
        const mapping = {
            data: '',
            valor: '',
            descricao: '',
            categoria: '',
            documento: '',
            tipo: ''
        };

        const patterns = {
            data: [/data/i, /^dt/i, /date/i, /vencimento/i, /competencia/i, /dia/i, /movimento/i],
            valor: [/valor/i, /^vlr/i, /val/i, /total/i, /quantia/i, /amount/i, /saldo/i, /debito/i, /credito/i, /lancamento/i],
            descricao: [/descri/i, /historico/i, /detalhe/i, /memo/i, /texto/i, /favorecido/i, /beneficiario/i, /discriminacao/i],
            categoria: [/categoria/i, /conta/i, /classificacao/i, /plano/i, /rubrica/i, /grupo/i, /centro/i],
            documento: [/documento/i, /^doc/i, /numero/i, /fitid/i, /nf/i, /cheque/i, /comprovante/i],
            tipo: [/^tipo/i, /sentido/i, /d\/c/i, /deb\/cred/i, /natureza/i, /operacao/i]
        };

        const fields = ['data', 'valor', 'descricao', 'categoria', 'documento', 'tipo'];
        for (const h of headers) {
            const hClean = h.toLowerCase();
            for (const field of fields) {
                if (!mapping[field]) {
                    if (field === 'documento' && (hClean.includes('valor') || mapping.valor === h)) {
                        continue;
                    }
                    const match = patterns[field].some(p => p.test(hClean));
                    if (match) {
                        mapping[field] = h;
                        break;
                    }
                }
            }
        }

        return mapping;
    }

    // --- 8. CANONICAL RECORD NORMALIZATION ---
    function normalizeRecords(headers, dataRows, columnMapping) {
        if (!columnMapping.data || !columnMapping.valor || !columnMapping.descricao) {
            throw new Error('Mapeamento incompleto: as colunas de Data, Valor e Descrição são obrigatórias.');
        }

        const dateIdx = headers.indexOf(columnMapping.data);
        const valorIdx = headers.indexOf(columnMapping.valor);
        const descIdx = headers.indexOf(columnMapping.descricao);
        const catIdx = columnMapping.categoria ? headers.indexOf(columnMapping.categoria) : -1;
        const docIdx = columnMapping.documento ? headers.indexOf(columnMapping.documento) : -1;
        const tipoIdx = columnMapping.tipo ? headers.indexOf(columnMapping.tipo) : -1;

        if (dateIdx === -1 || valorIdx === -1 || descIdx === -1) {
            throw new Error('Uma ou mais colunas mapeadas não foram encontradas nos cabeçalhos da planilha.');
        }

        const normalized = [];
        let validCount = 0;
        let invalidCount = 0;
        let totalCredit = 0;
        let totalDebit = 0;

        dataRows.forEach((row, idx) => {
            const rawDate = row[dateIdx];
            const rawValor = row[valorIdx];
            const rawDesc = row[descIdx];
            const rawCat = catIdx > -1 ? row[catIdx] : null;
            const rawDoc = docIdx > -1 ? row[docIdx] : null;
            const rawTipo = tipoIdx > -1 ? row[tipoIdx] : null;

            const parsedDate = parseBrazilianDate(rawDate);
            let parsedValor = parseBrazilianNumber(rawValor);
            const cleanDesc = rawDesc !== null && rawDesc !== undefined ? String(rawDesc).trim() : '';

            // Handle type indicator if mapped
            if (rawTipo && parsedValor !== null) {
                const tipoStr = String(rawTipo).trim().toUpperCase();
                if (tipoStr === 'D' || tipoStr === 'DEB' || tipoStr === 'DEBITO' || tipoStr === 'SAIDA') {
                    parsedValor = -Math.abs(parsedValor);
                } else if (tipoStr === 'C' || tipoStr === 'CRED' || tipoStr === 'CREDITO' || tipoStr === 'ENTRADA') {
                    parsedValor = Math.abs(parsedValor);
                }
            }

            const isValid = (parsedDate !== null) && (parsedValor !== null) && (cleanDesc.length > 0);

            if (isValid) {
                validCount++;
                if (parsedValor >= 0) totalCredit += parsedValor;
                else totalDebit += Math.abs(parsedValor);
            } else {
                invalidCount++;
            }

            const errorReason = !isValid ? (
                !parsedDate ? 'Data inválida' : (!parsedValor ? 'Valor inválido' : 'Descrição vazia')
            ) : null;

            normalized.push({
                index: idx + 1,
                row_number: idx + 1,
                date: parsedDate,
                rawDate: rawDate,
                amount: parsedValor,
                rawAmount: rawValor,
                direction: parsedValor !== null ? (parsedValor >= 0 ? 'ENTRADA' : 'SAIDA') : 'INDEFINIDO',
                description: cleanDesc,
                category: rawCat ? String(rawCat).trim() : null,
                documentNumber: rawDoc ? String(rawDoc).trim() : null,
                document_number: rawDoc ? String(rawDoc).trim() : null,
                isValid: isValid,
                status: isValid ? 'VALIDO' : 'INVALIDO',
                errorReason: errorReason,
                errors: errorReason ? [errorReason] : [],
                rawRow: row
            });
        });

        const credit = Math.round(totalCredit * 100) / 100;
        const debit = Math.round(totalDebit * 100) / 100;
        return {
            totalRows: dataRows.length,
            validRows: validCount,
            invalidRows: invalidCount,
            totalCredit: credit,
            totalCredits: credit,
            totalDebit: debit,
            totalDebits: debit,
            netBalance: Math.round((credit - debit) * 100) / 100,
            records: normalized
        };
    }

    // --- 9. BATCH STAGING & DUPLICATE PREVENTION ---
    function checkDuplicateBatch(companyId, fileSha256) {
        const key = `EFO_Import_Batches_${companyId}`;
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
            if (!raw) return { isDuplicate: false, existingBatch: null };
            const batches = JSON.parse(raw);
            const found = batches.find(b => (b.fileSha256 === fileSha256 || b.sha256 === fileSha256) && b.status !== 'ESTORNADO');
            if (!found) return { isDuplicate: false, existingBatch: null };
            found.isDuplicate = true;
            found.existingBatch = found;
            return found;
        } catch (e) {
            console.error('Erro ao verificar duplicidade de lote:', e);
            return { isDuplicate: false, existingBatch: null };
        }
    }

    function saveStagingBatch(companyId, batchMeta, rawRecords, normalizedResult) {
        if (typeof companyId === 'object' && companyId !== null) {
            normalizedResult = batchMeta;
            rawRecords = rawRecords || [];
            batchMeta = companyId;
            companyId = batchMeta.companyId;
        }
        if (!companyId) throw new Error('Empresa é obrigatória para registrar lote de importação.');

        const batchesKey = `EFO_Import_Batches_${companyId}`;
        let batches = [];
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(batchesKey) : null;
            if (raw) batches = JSON.parse(raw);
        } catch (e) {
            batches = [];
        }

        // Duplicate batch check
        const existing = batches.find(b => b.fileSha256 === batchMeta.fileSha256 && b.status !== 'ESTORNADO');
        if (existing) {
            throw new Error(`Este arquivo já foi importado anteriormente para esta empresa no Lote #${existing.batchId} em ${new Date(existing.createdAt).toLocaleString('pt-BR')}.`);
        }

        const batchId = `BATCH-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        const newBatch = {
            batchId: batchId,
            companyId: companyId,
            period: batchMeta.period || (new Date().toISOString().substring(0, 7)),
            fileName: batchMeta.fileName,
            fileType: batchMeta.fileType,
            fileSize: batchMeta.fileSize,
            fileSha256: batchMeta.fileSha256 || batchMeta.sha256,
            sha256: batchMeta.fileSha256 || batchMeta.sha256,
            sheetName: batchMeta.sheetName || 'Padrão',
            totalRows: normalizedResult.totalRows,
            validRows: normalizedResult.validRows,
            invalidRows: normalizedResult.invalidRows,
            totalCredit: normalizedResult.totalCredit,
            totalDebit: normalizedResult.totalDebit,
            netBalance: normalizedResult.netBalance,
            mappingUsed: batchMeta.mapping,
            status: 'STAGING_SALVO', // Not published to live DRE!
            importedBy: batchMeta.userName || batchMeta.user || 'Usuário Atual',
            user: batchMeta.userName || batchMeta.user || 'Usuário Atual',
            importedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        batches.unshift(newBatch);

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(batchesKey, JSON.stringify(batches));
            
            // Save records staging
            const recordsKey = `EFO_Import_Records_${batchId}`;
            const stagingPayload = {
                batch: newBatch,
                rawSample: rawRecords.slice(0, 200),
                normalized: normalizedResult.records.filter(r => r.isValid)
            };
            try {
                localStorage.setItem(recordsKey, JSON.stringify(stagingPayload));
            } catch (storageErr) {
                console.warn('Storage quota warning for full payload, saving metadata only:', storageErr);
            }
        }

        return newBatch;
    }

    function listCompanyBatches(companyId) {
        if (!companyId) return [];
        const batchesKey = `EFO_Import_Batches_${companyId}`;
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(batchesKey) : null;
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    // Export interface
    return {
        computeSha256,
        detectEncoding,
        decodeBuffer,
        detectDelimiter,
        parseCsvString,
        parseBrazilianNumber,
        parseBrazilianDate,
        detectHeaderRow,
        suggestColumnMapping,
        normalizeRecords,
        checkDuplicateBatch,
        saveStagingBatch,
        listCompanyBatches
    };
}));
