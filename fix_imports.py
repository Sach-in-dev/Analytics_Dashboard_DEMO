import os
from glob import glob

base_dir = "/Users/sachinyadav/Documents/Beauty_barm_latest/Archive (1)/analytics-ui/src/modules"

files = glob(f"{base_dir}/**/*.tsx", recursive=True)

target_pattern = 'import {\nimport { useDateRange } from "@/hooks/use-date-range"'
replacement = 'import { useDateRange } from "@/hooks/use-date-range"\nimport {'

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    if target_pattern in content:
        content = content.replace(target_pattern, replacement)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {file}")
