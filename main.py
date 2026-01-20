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
def open_in_vscode(file_path, line_num):
    """
    调用 VS Code 打开指定文件并跳转到行号
    需要确保 'code' 命令在系统环境变量中
    """
    try:
        # -g 选项允许格式为 file:line
        cmd = ["code", "-g", f"{file_path}:{line_num}"]
        
        # 隐藏控制台窗口 (Windows)
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
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
        # 获取搜索根目录的绝对路径，用于拼接完整路径
        abs_search_root = os.path.abspath(path)

        for line in stdout.splitlines():
            try:
                item = json.loads(line)
                if item['type'] == 'match':
                    data = item['data']
                    raw_text = data['lines']['text'].rstrip('\r\n')
                    formatted_html = highlight_text(raw_text, data['submatches'])
                    
                    # 拼接绝对路径
                    rel_path = data['path']['text']
                    full_path = os.path.join(abs_search_root, rel_path)

                    results.append({
                        'file': rel_path,      # 展示用的相对路径
                        'full_path': full_path,# 打开用的绝对路径
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

# 启动
try:
    eel.start('index.html', mode='edge', size=(1400, 800))
except EnvironmentError:
    eel.start('index.html', mode='default')