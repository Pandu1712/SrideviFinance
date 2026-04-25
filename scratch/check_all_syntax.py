import sys
import os

workspace = r'e:\Downloads\sri-finance-hub-main\sri-finance-hub-main'
files = [
    'src/pages/DailyCollection.tsx',
    'src/pages/DailyPosting.tsx',
    'src/pages/AgentAudit.tsx',
    'src/pages/DWMBook.tsx',
    'src/pages/Ledger.tsx',
    'src/pages/Reports.tsx',
    'src/App.tsx'
]

def check_balance(text, open_char, close_char):
    stack = []
    for i, char in enumerate(text):
        if char == open_char:
            stack.append(i)
        elif char == close_char:
            if not stack:
                return i, "extra_close"
            stack.pop()
    if stack:
        return stack[-1], "unclosed"
    return None, "ok"

for f_name in files:
    path = os.path.join(workspace, f_name)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    res, status = check_balance(content, '{', '}')
    if status != "ok":
        print(f"Mismatch in {f_name} (braces): {status} at {res}")
    
    res, status = check_balance(content, '(', ')')
    if status != "ok":
        print(f"Mismatch in {f_name} (parens): {status} at {res}")

print("Check finished")
