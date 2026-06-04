import sys
import re

def apply_diff(original_file, diff_file, output_file):
    with open(original_file, 'r', encoding='utf-8') as f:
        original_lines = f.readlines()
    
    with open(diff_file, 'r', encoding='utf-8') as f:
        diff_lines = f.readlines()
    
    # Simple state machine to parse the diff
    chunks = []
    current_chunk = None
    
    for line in diff_lines:
        if line.startswith('@@'):
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = {'old_start': 0, 'old_len': 0, 'new_start': 0, 'new_len': 0, 'lines': []}
            match = re.match(r'@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@', line)
            if match:
                current_chunk['old_start'] = int(match.group(1))
                current_chunk['old_len'] = int(match.group(2)) if match.group(2) else 1
                current_chunk['new_start'] = int(match.group(3))
                current_chunk['new_len'] = int(match.group(4)) if match.group(4) else 1
        elif current_chunk is not None:
            current_chunk['lines'].append(line)
            
    if current_chunk:
        chunks.append(current_chunk)
        
    # Apply chunks
    # Since line numbers might be off, we use context matching
    result_lines = list(original_lines)
    offset = 0
    
    for chunk in chunks:
        # Try to find the context in result_lines
        # Context is lines starting with ' '
        context_before = []
        for l in chunk['lines']:
            if l.startswith(' '):
                context_before.append(l[1:])
            elif l.startswith('-') or l.startswith('+'):
                break
            else:
                context_before.append(l) # Handle lines that lost their space
        
        # Clean up context
        context_before = [l.strip() for l in context_before if l.strip()]
        
        # Search for context_before in result_lines
        found_idx = -1
        if context_before:
            for i in range(max(0, chunk['old_start'] + offset - 50), len(result_lines)):
                match = True
                for j in range(min(len(context_before), 3)): # Match first 3 context lines
                    if i + j >= len(result_lines) or context_before[j] not in result_lines[i+j]:
                        match = False
                        break
                if match:
                    found_idx = i
                    break
        else:
            found_idx = chunk['old_start'] + offset - 1
            
        if found_idx == -1:
            print(f"Warning: Could not find context for chunk {chunk['old_start']}")
            # Fallback to line number if context fails
            found_idx = max(0, chunk['old_start'] + offset - 1)
            
        # Extract the changes
        to_remove = []
        to_add = []
        for l in chunk['lines']:
            if l.startswith('-'):
                to_remove.append(l[1:])
            elif l.startswith('+'):
                to_add.append(l[1:])
        
        # This is a very simple and potentially wrong application for complex diffs,
        # but for this case where we just want the '+' lines, maybe it's enough.
        # Wait, if we just want the "new" version, we can just take the '+' and ' ' lines.
        
    # Actually, a better way for THIS specific situation:
    # The diff is mostly additions and some removals.
    # Let's just reconstruct the "new" file by going through the diff chunks.
    # A diff is a set of instructions: "at line X, remove Y lines, add Z lines".
    
    new_lines = []
    # If the diff is complete (starts from line 1), we can just build it.
    if chunks and chunks[0]['old_start'] == 1:
        for chunk in chunks:
            for l in chunk['lines']:
                if l.startswith(' ') or l.startswith('+'):
                    new_lines.append(l[1:])
                # Skip '-' lines
    else:
        print("Diff does not start at line 1, cannot simple-reconstruct.")
        return

    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    apply_diff(sys.argv[1], sys.argv[2], sys.argv[3])
