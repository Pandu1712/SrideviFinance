import sys
import os

files = [
    r'src/pages/DailyCollection.tsx',
    r'src/pages/DailyPosting.tsx',
    r'src/pages/AgentAudit.tsx',
    r'src/pages/DWMBook.tsx',
    r'src/pages/Ledger.tsx',
    r'src/pages/Reports.tsx',
    r'src/App.tsx'
]

workspace = r'e:\Downloads\sri-finance-hub-main\sri-finance-hub-main'

for f_path in files:
    full_path = os.path.join(workspace, f_path)
    if not os.path.exists(full_path):
        print(f"File not found: {f_path}")
        continue
    with open(full_path, 'r', encoding='utf-8') as f:
        text = f.read()

    o_b = text.count('{')
    c_b = text.count('}')
    o_p = text.count('(')
    c_p = text.count(')')
    
    print(f"File: {f_path}")
    print(f"  Braces: {o_b} / {c_b}")
    print(f"  Parens: {o_p} / {c_p}")
    if o_b != c_b or o_p != c_p:
        print(f"  !!! MISMATCH in {f_path}")
