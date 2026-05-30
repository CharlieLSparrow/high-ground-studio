import os

def fix_file(path):
    with open(path, 'r') as f:
        content = f.read()
    
    # Fix escaped backticks and dollars
    content = content.replace(r'\`', '`')
    content = content.replace(r'\$', '$')
    
    # Fix unclosed viewMode in page.tsx
    if "page.tsx" in path and "viewMode === 'timeline' ? (" in content:
        # It seems the parenthesis is never closed for the ternary operator.
        # Let's replace `{viewMode === 'timeline' ? (` with `{viewMode === 'timeline' && (`
        content = content.replace("{viewMode === 'timeline' ? (", "{viewMode === 'timeline' && (")
    
    with open(path, 'w') as f:
        f.write(content)

for root, _, files in os.walk("apps/studio/src"):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            fix_file(os.path.join(root, file))

print("Syntax fixed!")
