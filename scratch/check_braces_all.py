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

    open_braces = text.count('{')
    close_braces = text.count('}')
    print(f"File: {f_path} | Open: {open_braces}, Close: {close_braces}")
    if open_braces != close_braces:
        print(f"!!! Braces mismatched in {f_path}")
