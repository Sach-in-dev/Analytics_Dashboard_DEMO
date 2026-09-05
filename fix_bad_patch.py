import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content.replace('if (typeof v !== "number" || isNaN(v)) return "₹0";\n    ', '')
    new_content = new_content.replace('if (typeof v !== "number" || isNaN(v)) return "₹0";\n', '')
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed: {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts') or file.endswith('.tsx'):
            try:
                fix_file(os.path.join(root, file))
            except Exception as e:
                print(f"Error parsing {file}: {e}")
