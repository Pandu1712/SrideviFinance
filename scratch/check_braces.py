import sys

with open(r'e:\Downloads\sri-finance-hub-main\sri-finance-hub-main\src\pages\DailyCollection.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

open_braces = text.count('{')
close_braces = text.count('}')
print(f"Open: {open_braces}, Close: {close_braces}")

# More advanced check
stack = []
for i, char in enumerate(text):
    if char == '{':
        stack.append(i)
    elif char == '}':
        if not stack:
            print(f"Extra close brace at char {i}")
        else:
            stack.pop()

if stack:
    for pos in stack:
        print(f"Unclosed brace starting at char {pos}")
        # Print context
        start = max(0, pos - 20)
        end = min(len(text), pos + 20)
        print(f"Context: {text[start:end]}")
