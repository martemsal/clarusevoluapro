import urllib.request
import json
import ssl

url = "https://eiozmfbyfoaogszypkbg.supabase.co"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpb3ptZmJ5Zm9hb2dzenlwa2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODE1NzYsImV4cCI6MjA5NTE1NzU3Nn0.50kHcrOVeLS8jKIp4rHiZuSV7rnghLf4AsLwfkwD80Q"

headers = {
    "apikey": anon_key,
    "Authorization": f"Bearer {anon_key}",
    "Content-Type": "application/json"
}

context = ssl._create_unverified_context()

def fetch_url(endpoint):
    req_url = f"{url}/rest/v1/{endpoint}"
    req = urllib.request.Request(req_url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=context) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching {endpoint}: {e}")
        return None

if __name__ == "__main__":
    company_id = "comp_6n6xf73"
    
    print("Fetching company details...")
    companies = fetch_url(f"efo_companies?id=eq.{company_id}")
    if companies:
        company = companies[0]
        print(f"Name: {company['name']}")
        print(f"Config: {json.dumps(company['config'])}")
        print(f"Parametros: {json.dumps(company['parametros'])}")
        
        # Save lancamentos to a file so we can view it
        with open("company_lancamentos.json", "w", encoding="utf-8") as f:
            json.dump(company['lancamentos'], f, indent=2, ensure_ascii=False)
        print("Saved company_lancamentos.json")
        
    print("\nFetching OFX raw transactions for company...")
    txns = fetch_url(f"efo_ofx_raw?company_id=eq.{company_id}")
    if txns:
        print(f"Found {len(txns)} transactions.")
        # Group by status
        status_counts = {}
        for t in txns:
            st = t.get('status')
            status_counts[st] = status_counts.get(st, 0) + 1
        print(f"Status counts: {status_counts}")
        
        # Save a summary of categorized transactions
        categorized = [t for t in txns if t.get('status') == 'Categorizado']
        print(f"Sample categorized transaction: {categorized[0] if categorized else 'None'}")
        
        with open("company_txns.json", "w", encoding="utf-8") as f:
            json.dump(txns, f, indent=2, ensure_ascii=False)
        print("Saved company_txns.json")
