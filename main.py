import eel
import subprocess
import json
import os
import tkinter as tk
from tkinter import filedialog
import html

eel.init('web')

@eel.expose
def select_folder():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder_path = filedialog.askdirectory()
    root.destroy()
    return folder_path

@eel.expose
def open_in_vscode(file_path, line_num, root_path=None):
    """
    调用 VS Code 打开指定文件
    root_path: 如果提供，会先打开该目录作为工作区，再定位文件
    """
    try:
        # 构建命令列表
        cmd = ["code"]
        
        # 如果需要在目录上下文中打开
        if root_path:
            cmd.append(root_path)
            
        # 定位文件和行号
        # 注意：当同时打开文件夹和文件时，VS Code 支持这种写法： code folder_path -g file_path:line
        cmd.append("-g")
        cmd.append(f"{file_path}:{line_num}")
        
        # 隐藏控制台窗口 (Windows)
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
        # shell=True 在某些环境下能更好地找到 code 命令
        subprocess.Popen(cmd, startupinfo=startupinfo, shell=True)
        return True
    except Exception as e:
        print(f"打开 VS Code 失败: {e}")
        return False

def highlight_text(text, submatches):
    if not submatches:
        return html.escape(text)

    try:
        b_text = text.encode('utf-8')
    except Exception:
        return html.escape(text)

    last_end = 0
    result_parts = []
    submatches.sort(key=lambda x: x['start'])

    for match in submatches:
        start = match['start']
        end = match['end']
        if start > last_end:
            segment = b_text[last_end:start].decode('utf-8', errors='replace')
            result_parts.append(html.escape(segment))
        
        match_segment = b_text[start:end].decode('utf-8', errors='replace')
        result_parts.append(f'<span class="highlight">{html.escape(match_segment)}</span>')
        last_end = end

    if last_end < len(b_text):
        remaining = b_text[last_end:].decode('utf-8', errors='replace')
        result_parts.append(html.escape(remaining))

    return "".join(result_parts)

@eel.expose
def run_ripgrep(query, path, extensions, case_sensitive):
    if not query or not path:
        return {"error": "请提供搜索内容和路径"}
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rg_path = os.path.join(base_dir, 'rg.exe')
    
    if not os.path.exists(rg_path):
        return {"error": f"找不到 rg.exe，请将其放在: {base_dir}"}
        
    command = [rg_path, query, path, "--json"]
    
    if not case_sensitive:
        command.append("-i")
        
    if extensions:
        ext_list = [x.strip() for x in extensions.split(',')]
        for ext in ext_list:
            if ext:
                command.append("-g")
                command.append(f"*.{ext}")

    try:
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        process = subprocess.Popen(
            command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            encoding='utf-8',
            errors='replace',
            startupinfo=startupinfo
        )
        
        stdout, stderr = process.communicate()

        results = []
        abs_search_root = os.path.abspath(path)

        for line in stdout.splitlines():
            try:
                item = json.loads(line)
                if item['type'] == 'match':
                    data = item['data']
                    raw_text = data['lines']['text'].rstrip('\r\n')
                    formatted_html = highlight_text(raw_text, data['submatches'])
                    
                    rel_path = data['path']['text']
                    full_path = os.path.join(abs_search_root, rel_path)

                    results.append({
                        'file': rel_path,
                        'full_path': full_path,
                        'line_num': data['line_number'],
                        'content_html': formatted_html
                    })
            except json.JSONDecodeError:
                continue
                
        grouped_results = {}
        for r in results:
            if r['file'] not in grouped_results:
                grouped_results[r['file']] = []
            grouped_results[r['file']].append(r)
            
        return {"success": True, "data": grouped_results, "count": len(results)}

    except Exception as e:
        return {"error": str(e)}

try:
    eel.start('index.html', mode='edge', size=(1000, 800))
except EnvironmentError:
    eel.start('index.html', mode='default')