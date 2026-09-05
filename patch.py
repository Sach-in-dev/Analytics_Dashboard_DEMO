import os, re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. formatCurrency fix
    new_content = re.sub(
        r'function formatCurrency\(([^)]*value[^)]*)\)\s*:\s*string\s*\{',
        r'function formatCurrency(\1): string {\n    if (typeof value !== "number" || isNaN(value)) return "₹0";',
        content
    )
    new_content = re.sub(
        r'function formatCurrency\(([^)]*v[^)]*)\)\s*:\s*string\s*\{',
        r'function formatCurrency(\1): string {\n    if (typeof v !== "number" || isNaN(v)) return "₹0";',
        new_content
    )
    
    # 2. .toLocaleString() -> ?.toLocaleString()
    new_content = re.sub(
        r'(?<!\?)\.toLocaleString\(',
        r'?.toLocaleString(',
        new_content
    )
    
    # 3. .toFixed() -> ?.toFixed()
    new_content = re.sub(
        r'(?<!\?)\.toFixed\(',
        r'?.toFixed(',
        new_content
    )

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Patched: {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts') or file.endswith('.tsx'):
            try:
                fix_file(os.path.join(root, file))
            except Exception as e:
                print(f"Error parsing {file}: {e}")
