import sys

diff_path = r'C:\Users\mouli\.gemini\tmp\emp-login\tool-outputs\session-1436a3ec-9c91-4ab5-822c-46b01438546f\run_shell_command__run_shell_command_1780559387776_0.txt'
output_path = r'C:\Users\mouli\OneDrive\Documents\Desktop\emp login\emplogin\reconstruct.diff'

with open(diff_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

if lines and lines[0].startswith('Output: '):
    lines[0] = lines[0][8:]

with open(output_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
