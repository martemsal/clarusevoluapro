import json
from collections import defaultdict

with open("company_txns.json", "r", encoding="utf-8") as f:
    txns = json.load(f)

with open("company_lancamentos.json", "r", encoding="utf-8") as f:
    lancamentos = json.load(f)

# Let's see years in transactions
years = set()
for t in txns:
    if t.get('date'):
        years.add(t['date'][:4])
print("Available years in transactions:", sorted(list(years)))

# Filter categorized
categorized = [t for t in txns if t.get('status') == 'Categorizado']
print(f"Total categorized transactions: {len(categorized)}")

# Calculate monthly DRE for 2026 (since sample txn date was 2026-03-03)
target_year = "2026"
months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

# Accumulate accounts
dre_monthly = defaultdict(lambda: [0.0]*12)
balanco_monthly = defaultdict(lambda: [0.0]*12)

for t in categorized:
    date_str = t.get('date')
    if not date_str or not date_str.startswith(target_year):
        continue
    month_idx = int(date_str[5:7]) - 1
    acc = t.get('assigned_account')
    amt = abs(t.get('amount', 0.0))
    
    if acc.startswith('dre.'):
        # Normalize
        if acc == 'dre.despesas_veiculos': acc = 'dre.despesas_veiculos.manutencao'
        elif acc == 'dre.despesas_estrutura': acc = 'dre.despesas_estrutura.manutencao'
        elif acc == 'dre.receitas_financeiras': acc = 'dre.receitas_financeiras.rendimentos'
        elif acc == 'dre.despesas_financeiras': acc = 'dre.despesas_financeiras.tarifas'
        
        dre_monthly[acc][month_idx] += amt
    elif acc.startswith('balanco.'):
        balanco_monthly[acc][month_idx] += amt

# Let's print monthly DRE summary
print(f"\n--- DRE GERENCIAL {target_year} ---")
# Accounts mapping
dre_structure = {
    "Receita Bruta (Produtos)": "dre.receita_bruta.produtos",
    "Receita Bruta (Serviços)": "dre.receita_bruta.servicos",
    "Receita Bruta (Outras)": "dre.receita_bruta.outras",
    "Deduções (Impostos)": "dre.deducoes.impostos",
    "Custos (Mercadorias - CMV)": "dre.custos.mercadorias",
    "Despesas Comercial (Comissões)": "dre.despesas_comercial.comissao",
    "Despesas Comercial (Trafego/Mkt)": "dre.despesas_comercial.trafego",
    "Despesas Comercial (Transp/Log)": "dre.despesas_comercial.transporte_logistica",
    "Despesas Admin (Aluguel)": "dre.despesas_administrativas.aluguel",
    "Despesas Admin (Outras)": "dre.despesas_administrativas.outras",
    "Despesas Pessoal (Salários)": "dre.despesas_pessoal.salarios",
    "Despesas Fin (Tarifas)": "dre.despesas_financeiras.tarifas",
}

print(f"{'Conta':<35} | " + " | ".join(f"{m:>10}" for m in months) + " | " + f"{'Total':>10}")
print("-" * 185)

for name, key in dre_structure.items():
    vals = dre_monthly[key]
    tot = sum(vals)
    print(f"{name:<35} | " + " | ".join(f"{v:10.2f}" for v in vals) + " | " + f"{tot:10.2f}")

# Calculate Gross Profit, EBITDA, and Net Profit
receita_bruta = [0.0]*12
deducoes = [0.0]*12
custos = [0.0]*12
despesas = [0.0]*12

for i in range(12):
    receita_bruta[i] = dre_monthly["dre.receita_bruta.produtos"][i] + dre_monthly["dre.receita_bruta.servicos"][i] + dre_monthly["dre.receita_bruta.outras"][i]
    deducoes[i] = dre_monthly["dre.deducoes.impostos"][i] + dre_monthly["dre.deducoes.devolucoes"][i] + dre_monthly["dre.deducoes.descontos"][i]
    custos[i] = dre_monthly["dre.custos.mercadorias"][i] + dre_monthly["dre.custos.producao"][i] + dre_monthly["dre.custos.servicos"][i] + dre_monthly["dre.custos.operacionais"][i]
    
    # Despesas total
    d_com = dre_monthly["dre.despesas_comercial.marketing"][i] + dre_monthly["dre.despesas_comercial.trafego"][i] + dre_monthly["dre.despesas_comercial.comissao"][i] + dre_monthly["dre.despesas_comercial.viagens"][i] + dre_monthly["dre.despesas_comercial.transporte_logistica"][i] + dre_monthly["dre.despesas_comercial.outras"][i]
    d_adm = dre_monthly["dre.despesas_administrativas.pro_labore"][i] + dre_monthly["dre.despesas_administrativas.salarios"][i] + dre_monthly["dre.despesas_administrativas.encargos"][i] + dre_monthly["dre.despesas_administrativas.aluguel"][i] + dre_monthly["dre.despesas_administrativas.outras"][i]
    d_pes = dre_monthly["dre.despesas_pessoal.salarios"][i] + dre_monthly["dre.despesas_pessoal.inss"][i] + dre_monthly["dre.despesas_pessoal.fgts"][i] + dre_monthly["dre.despesas_pessoal.beneficios"][i] + dre_monthly["dre.despesas_pessoal.rescisoes"][i]
    d_est = dre_monthly["dre.despesas_estrutura.manutencao"][i] + dre_monthly["dre.despesas_estrutura.reparos"][i] + dre_monthly["dre.despesas_estrutura.limpeza"][i]
    d_vei = dre_monthly["dre.despesas_veiculos.combustivel"][i] + dre_monthly["dre.despesas_veiculos.manutencao"][i] + dre_monthly["dre.despesas_veiculos.seguro"][i] + dre_monthly["dre.despesas_veiculos.ipva"][i]
    d_fin = dre_monthly["dre.despesas_financeiras.tarifas"][i] + dre_monthly["dre.despesas_financeiras.juros"][i] + dre_monthly["dre.despesas_financeiras.iof"][i]
    despesas[i] = d_com + d_adm + d_pes + d_est + d_vei + d_fin

r_liquida = [receita_bruta[i] - deducoes[i] for i in range(12)]
l_bruto = [r_liquida[i] - custos[i] for i in range(12)]
ebitda = [l_bruto[i] - despesas[i] for i in range(12)]
lucro_liq = ebitda # Assuming no tax on profit for simplicity in EFO

print("-" * 185)
print(f"{'Receita Bruta':<35} | " + " | ".join(f"{v:10.2f}" for v in receita_bruta) + " | " + f"{sum(receita_bruta):10.2f}")
print(f"{'Receita Líquida':<35} | " + " | ".join(f"{v:10.2f}" for v in r_liquida) + " | " + f"{sum(r_liquida):10.2f}")
print(f"{'Lucro Bruto':<35} | " + " | ".join(f"{v:10.2f}" for v in l_bruto) + " | " + f"{sum(l_bruto):10.2f}")
print(f"{'EBITDA / Lucro Líquido':<35} | " + " | ".join(f"{v:10.2f}" for v in lucro_liq) + " | " + f"{sum(lucro_liq):10.2f}")


print(f"\n--- BALANÇO GERENCIAL {target_year} ---")
bal_structure = {
    "Ativo Circulante (Aplicações)": "balanco.ativo_circulante.aplicacoes",
    "Passivo Circulante (Empréstimos CP)": "balanco.passivo_circulante.emprestimos_cp",
}
for name, key in bal_structure.items():
    vals = balanco_monthly[key]
    tot = sum(vals)
    print(f"{name:<35} | " + " | ".join(f"{v:10.2f}" for v in vals) + " | " + f"{tot:10.2f}")
