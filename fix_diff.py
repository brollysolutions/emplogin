import re

diff_path = r'C:\Users\mouli\.gemini\tmp\emp-login\tool-outputs\session-1436a3ec-9c91-4ab5-822c-46b01438546f\run_shell_command__run_shell_command_1780559387776_0.txt'
output_path = r'C:\Users\mouli\OneDrive\Documents\Desktop\emp login\emplogin\reconstruct.diff'

with open(diff_path, 'r', encoding='utf-8') as f:
    raw_lines = f.readlines()

if raw_lines and raw_lines[0].startswith('Output: '):
    raw_lines[0] = raw_lines[0][8:]

def is_valid_start(line):
    if not line: return False
    if line.startswith('--- '): return True
    if line.startswith('+++ '): return True
    if line.startswith('@@ '): return True
    if line.startswith('diff --git '): return True
    if line.startswith('index '): return True
    if line[0] in ('+', '-', ' '): return True
    return False

processed_lines = []
for line in raw_lines:
    if is_valid_start(line):
        processed_lines.append(line)
    elif line == '\n' or line == '\r\n':
        # Truly empty line might be a context line that lost its space
        processed_lines.append(' ' + line)
    else:
        # Wrapped line
        if processed_lines:
            processed_lines[-1] = processed_lines[-1].rstrip('\n\r') + line
        else:
            # Should not happen as first line is diff --git
            processed_lines.append(line)

with open(output_path, 'w', encoding='utf-8') as f:
    f.writelines(processed_lines)
