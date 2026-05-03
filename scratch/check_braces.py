import sys
import os

def check_braces(filename):
    if not os.path.exists(filename):
        print(f"File {filename} not found")
        return
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    line_no = 1
    col_no = 1
    
    for i, char in enumerate(content):
        if char == '\n':
            line_no += 1
            col_no = 1
        else:
            col_no += 1
            
        if char == '{':
            stack.append(('{', line_no, col_no))
        elif char == '}':
            if not stack:
                print(f"Unexpected closing brace at {line_no}:{col_no}")
                return
            stack.pop()
            
    if stack:
        for char, l, c in stack:
            print(f"Unclosed {char} starting at {l}:{c}")
    else:
        print(f"Braces are balanced in {filename}")

if __name__ == "__main__":
    check_braces(sys.argv[1])
