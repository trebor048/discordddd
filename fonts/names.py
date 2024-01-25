import os
from fontTools import ttLib

folder_path = os.getcwd()  # Use the current working directory

font_families = {}

for filename in os.listdir(folder_path):
    if filename.lower().endswith(".ttf"):
        font_path = os.path.join(folder_path, filename)
        try:
            font = ttLib.TTFont(font_path)
            family_name = font['name'].getName(1, 3, 1, 1033).string.decode('utf-16-be')
            font_families[filename] = family_name
        except Exception as e:
            print(f"Error processing {filename}: {e}")

output_path = 'output.txt'
with open(output_path, 'w') as output_file:
    output_file.write("const fontFamilies: Record<string, string> = {\n")
    for font_file, family_name in font_families.items():
        output_file.write(f"    '{font_file}': '{family_name}',\n")
    output_file.write("};")

print(f"Output written to {output_path}")
