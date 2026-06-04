import sys
import re

def apply_patch(original_file, patch_file, output_file):
    with open(original_file, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    with open(patch_file, 'r', encoding='utf-8', errors='ignore') as f:
        patch_content = f.read()
    
    # Split into chunks
    chunks = re.split(r'^@@', patch_content, flags=re.MULTILINE)
    # First part is header
    header = chunks[0]
    chunks = chunks[1:]
    
    new_lines = list(lines)
    offset = 0
    
    for chunk in chunks:
        # Re-add the @@ that was removed by split
        chunk = '@@' + chunk
        lines_in_chunk = chunk.splitlines(keepends=True)
        header_line = lines_in_chunk[0]
        match = re.match(r'@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@', header_line)
        if not match:
            continue
            
        old_start = int(match.group(1))
        old_len = int(match.group(2)) if match.group(2) else 1
        
        # Line numbers in diff are 1-indexed
        idx = old_start - 1 + offset
        
        # Filter the chunk lines
        chunk_data = lines_in_chunk[1:]
        
        # Calculate what to remove and what to add
        to_remove_count = 0
        added_lines = []
        
        for l in chunk_data:
            if l.startswith('-'):
                to_remove_count += 1
            elif l.startswith('+'):
                added_lines.append(l[1:])
            elif l.startswith(' '):
                # Context line, must match or we just skip it in our simplified applier
                added_lines.append(l[1:])
                to_remove_count += 1
            elif l.strip() == '':
                # Possibly a context line that lost its space
                added_lines.append(l)
                to_remove_count += 1
        
        # Replace lines
        new_lines[idx:idx+to_remove_count] = added_lines
        offset += len(added_lines) - to_remove_count
        
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    apply_patch(sys.argv[1], sys.argv[2], sys.argv[3])
