# tests/generate_advanced_fixtures.py
# -*- coding: utf-8 -*-
"""
CLARUS EVOLUA® — GERADOR DE FIXTURES BANCÁRIAS DE RESULTADO CONHECIDO
Gera extratos bancários reais em formato OFX, CSV homologados (Itaú, Bradesco, Santander, BB)
e arquivos PDF digitais com cenários controlados para auditoria e conciliação matemática.
"""

import os
import struct

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)

# -----------------------------------------------------------------------------
# 1. FIXTURE OFX VÁLIDO (Extrato 100% Conciliado)
# Saldo Inicial: R$ 5.000,00 | Entradas: R$ 8.500,00 | Saídas: -R$ 4.250,50
# Saldo Final Calculado: R$ 9.249,50 | Saldo Final Informado: R$ 9.249,50
# -----------------------------------------------------------------------------
ofx_valido_content = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260331120000[-03:EST]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>341
<BRANCHID>0500
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260301120000[-03:EST]
<DTEND>20260331120000[-03:EST]
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260305120000[-03:EST]
<TRNAMT>5000.00
<FITID>20260305001
<CHECKNUM>101
<MEMO>PIX RECEBIDO CLIENTE BETA LTDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260310120000[-03:EST]
<TRNAMT>-1250.50
<FITID>20260310002
<CHECKNUM>102
<MEMO>PAGTO FORNECEDOR PECAS AUTOMOTIVAS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260315120000[-03:EST]
<TRNAMT>3500.00
<FITID>20260315003
<CHECKNUM>103
<MEMO>TED RECEBIDA PRESTACAO DE SERVICOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260320120000[-03:EST]
<TRNAMT>-3000.00
<FITID>20260320004
<CHECKNUM>104
<MEMO>FOLHA PAGAMENTO SALARIOS
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>9249.50
<DTASOF>20260331120000[-03:EST]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_valido.ofx'), 'w', encoding='utf-8') as f:
    f.write(ofx_valido_content)

# -----------------------------------------------------------------------------
# 2. FIXTURE OFX COM DIVERGÊNCIA DE SALDO (Saldo Informado != Calculado)
# Saldo Final Informado no Extrato: R$ 10.000,00
# Saldo Final Calculado pelas Transações: R$ 9.249,50
# Divergência detectável: GAP de R$ 750,50 (lançamento faltante no extrato)
# -----------------------------------------------------------------------------
ofx_divergencia_content = ofx_valido_content.replace(
    '<BALAMT>9249.50',
    '<BALAMT>10000.00'
)

with open(os.path.join(FIXTURES_DIR, 'extrato_divergencia_saldo.ofx'), 'w', encoding='utf-8') as f:
    f.write(ofx_divergencia_content)

# -----------------------------------------------------------------------------
# 3. FIXTURE CSV HOMOLOGADO ITAÚ (Data;Lançamento;Valor;Saldo)
# Saldo Inicial: R$ 2.000,00
# -----------------------------------------------------------------------------
csv_itau_content = """Data;Lançamento;Valor;Saldo
02/03/2026;SALDO ANTERIOR;;2.000,00
03/03/2026;PIX RECEBIDO MERCADO LIVRE;1.450,00;3.450,00
05/03/2026;PAGAMENTO ELETRONICO ENERGIA;-320,80;3.129,20
12/03/2026;TARIFA MENSAL CONTA CORRENTE;-89,90;3.039,30
25/03/2026;TRANSFERENCIA PIX RECEBIDA;2.000,00;5.039,30
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_itau_homologado.csv'), 'w', encoding='utf-8') as f:
    f.write(csv_itau_content)

# -----------------------------------------------------------------------------
# 4. FIXTURE CSV HOMOLOGADO BRADESCO (Data;Histórico;Docto.;Crédito;Débito;Saldo)
# Colunas separadas de crédito e débito
# -----------------------------------------------------------------------------
csv_bradesco_content = """Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
01/03/2026;SALDO INICIAL;000000;;;10.000,00
04/03/2026;DUPLICATA RECEBIDA CLIENTE;012345;4.500,00;;14.500,00
10/03/2026;RESGATE APLICACAO AUTOMATICA;009876;1.200,00;;15.700,00
18/03/2026;PAGTO LIQ FOLHA FUNCIONARIOS;005432;;6.300,00;9.400,00
28/03/2026;IMPOSTO SIMPLES NACIONAL DAS;001122;;1.850,50;7.549,50
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_bradesco_homologado.csv'), 'w', encoding='utf-8') as f:
    f.write(csv_bradesco_content)

# -----------------------------------------------------------------------------
# 5. FIXTURE CSV HOMOLOGADO SANTANDER (Data;Descrição;Docto;Valor;Saldo)
# -----------------------------------------------------------------------------
csv_santander_content = """Data;Descrição;Docto;Valor;Saldo
01/03/2026;SALDO DO DIA;;;3.500,00
06/03/2026;DEPOSITO EM CHEQUE COMPENSADO;000412;1.800,00;5.300,00
14/03/2026;DEBITO CARTAO MASTER CORPORATIVO;009988;-1.420,00;3.880,00
22/03/2026;DEB CONTRATO SEGURO EMPRESARIAL;001144;-280,00;3.600,00
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_santander_homologado.csv'), 'w', encoding='utf-8') as f:
    f.write(csv_santander_content)

# -----------------------------------------------------------------------------
# 6. FIXTURES DE TRANSFERÊNCIA ENTRE CONTAS PRÓPRIAS (Pair de Contas A e B)
# Conta A (Itaú): Saída de R$ 10.000,00 em 15/03/2026 (TED Mesma Titularidade para Bradesco)
# Conta B (Bradesco): Entrada de R$ 10.000,00 em 15/03/2026 (TED Mesma Titularidade recebida)
# -----------------------------------------------------------------------------
ofx_transf_conta_a = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>341
<ACCTID>CONTA_ITAU_MATRIZ
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260301120000
<DTEND>20260331120000
<STMTTRN>
<TRNTYPE>XFER
<DTPOSTED>20260315120000
<TRNAMT>-10000.00
<FITID>TRANSF-OUT-001
<MEMO>TED MESMA TITULARIDADE PARA BRADESCO AG 100 CC 9999
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260318120000
<TRNAMT>-500.00
<FITID>PAGTO-002
<MEMO>PAGTO FORNECEDOR DIVERSOS
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>15000.00
<DTASOF>20260331120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""

ofx_transf_conta_b = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>237
<ACCTID>CONTA_BRADESCO_FILIAL
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260301120000
<DTEND>20260331120000
<STMTTRN>
<TRNTYPE>XFER
<DTPOSTED>20260315120000
<TRNAMT>10000.00
<FITID>TRANSF-IN-001
<MEMO>TED MESMA TITULARIDADE RECEBIDA DE ITAU MATRIZ
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260322120000
<TRNAMT>2500.00
<FITID>REC-002
<MEMO>RECEBIMENTO CLIENTE DRE
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>22500.00
<DTASOF>20260331120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_transferencia_conta_a.ofx'), 'w', encoding='utf-8') as f:
    f.write(ofx_transf_conta_a)

with open(os.path.join(FIXTURES_DIR, 'extrato_transferencia_conta_b.ofx'), 'w', encoding='utf-8') as f:
    f.write(ofx_transf_conta_b)

# -----------------------------------------------------------------------------
# 7. FIXTURE DE SOBREPOSIÇÃO DE PERÍODOS (Overlap)
# Extrato 1: 01/03/2026 a 20/03/2026 (Já importado)
# Extrato 2: 15/03/2026 a 31/03/2026 (Sobreposição dos dias 15 a 20 de março!)
# -----------------------------------------------------------------------------
ofx_sobreposicao = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>341
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260315120000
<DTEND>20260331120000
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260315120000
<TRNAMT>3500.00
<FITID>20260315003
<MEMO>TED RECEBIDA PRESTACAO DE SERVICOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260328120000
<TRNAMT>-800.00
<FITID>20260328005
<MEMO>TARIFA CARTAO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>11949.50
<DTASOF>20260331120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_sobreposicao.ofx'), 'w', encoding='utf-8') as f:
    f.write(ofx_sobreposicao)

# -----------------------------------------------------------------------------
# 8. FIXTURE COM DUPLICIDADE IDÊNTICA
# -----------------------------------------------------------------------------
csv_duplicidade = """Data;Descrição;Valor;Documento
10/03/2026;Pagamento de Licença de Software;-350,00;NF-505
10/03/2026;Pagamento de Licença de Software;-350,00;NF-505
15/03/2026;Recebimento de Consultoria;2.500,00;NF-1002
"""

with open(os.path.join(FIXTURES_DIR, 'extrato_duplicidade.csv'), 'w', encoding='utf-8') as f:
    f.write(csv_duplicidade)

# -----------------------------------------------------------------------------
# 9. FIXTURE PDF DIGITAL GERADO EM FORMATO PADRÃO VETORIAL
# Gera um PDF estruturado real com camada de texto limpa contendo extrato bancário
# -----------------------------------------------------------------------------
def generate_simple_digital_pdf(filepath):
    """
    Gera um PDF sintético padrão 1.4 puramente vetorial com texto legível.
    """
    content_stream = (
        "BT\n"
        "/F1 16 Tf\n"
        "50 780 Td\n"
        "(BANCO CLARUS S.A. - EXTRATO DE CONTA CORRENTE) Tj\n"
        "/F1 10 Tf\n"
        "0 -25 Td\n"
        "(Agencia: 0102  Conta: 98765-4  Periodo: 01/03/2026 a 31/03/2026) Tj\n"
        "0 -20 Td\n"
        "(SALDO ANTERIOR EM 28/02/2026: R$ 4.500,00) Tj\n"
        "0 -30 Td\n"
        "(DATA       HISTORICO                                  DOCUMENTO       VALOR (R$)       SALDO (R$)) Tj\n"
        "0 -18 Td\n"
        "(03/03/2026 RECEBIMENTO CLIENTE ALVORADA               DOC 11202       +3.200,00        7.700,00) Tj\n"
        "0 -16 Td\n"
        "(09/03/2026 PAGTO FORNECEDOR EMBALAGENS SA            DOC 44901       -1.450,50        6.249,50) Tj\n"
        "0 -16 Td\n"
        "(14/03/2026 TARIFA MANUTENCAO MENSAL DE CONTA         TAR 00021         -65,00        6.184,50) Tj\n"
        "0 -16 Td\n"
        "(22/03/2026 PIX RECEBIDO VENDA BALCAO                 PIX 88310       +2.100,00        8.284,50) Tj\n"
        "0 -16 Td\n"
        "(29/03/2026 LIQUIDACAO BOLETO EQUIPAMENTOS TI         BOL 77123       -2.850,00        5.434,50) Tj\n"
        "0 -30 Td\n"
        "(SALDO FINAL ATUAL EM 31/03/2026: R$ 5.434,50) Tj\n"
        "ET\n"
    ).encode('latin1')

    stream_len = len(content_stream)

    pdf = bytearray()
    pdf.extend(b"%PDF-1.4\n")
    
    offsets = []
    
    # Obj 1: Catalog
    offsets.append(len(pdf))
    pdf.extend(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    
    # Obj 2: Pages
    offsets.append(len(pdf))
    pdf.extend(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    
    # Obj 3: Page
    offsets.append(len(pdf))
    pdf.extend(
        b"3 0 obj\n"
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
        b"endobj\n"
    )
    
    # Obj 4: Contents Stream
    offsets.append(len(pdf))
    pdf.extend(f"4 0 obj\n<< /Length {stream_len} >>\nstream\n".encode('ascii'))
    pdf.extend(content_stream)
    pdf.extend(b"\nendstream\nendobj\n")
    
    # Obj 5: Font
    offsets.append(len(pdf))
    pdf.extend(b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")
    
    # XRef Table
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 6\n0000000000 65535 f \n".encode('ascii'))
    for off in offsets:
        pdf.extend(f"{off:010d} 00000 n \n".encode('ascii'))
        
    pdf.extend(f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode('ascii'))
    
    with open(filepath, 'wb') as f:
        f.write(pdf)

generate_simple_digital_pdf(os.path.join(FIXTURES_DIR, 'extrato_pdf_digital.pdf'))

print("Sucesso: Todas as fixtures avancadas foram geradas em tests/fixtures/")
