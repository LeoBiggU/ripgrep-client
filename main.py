import eel
import subprocess
import json
import os
import tkinter as tk
from tkinter import filedialog
import html
import shlex  # <--- 新增：用于解析命令行字符串

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
    try:
        cmd = ["code"]
        if root_path:
            cmd.append(root_path)
        cmd.append("-g")
        cmd.append(f"{file_path}:{line_num}")
        
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

# --- 修改：新增 extra_args 参数 ---
@eel.expose
def run_ripgrep(query, path, extensions, case_sensitive, extra_args):
    if not query or not path:
        return {"error": "请提供搜索内容和路径"}
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rg_path = os.path.join(base_dir, 'rg.exe')
    
    if not os.path.exists(rg_path):
        return {"error": f"找不到 rg.exe，请将其放在: {base_dir}"}
        
    # 基础命令
    command = [rg_path, query, path, "--json"]
    
    if not case_sensitive:
        command.append("-i")
        
    if extensions:
        ext_list = [x.strip() for x in extensions.split(',')]
        for ext in ext_list:
            if ext:
                command.append("-g")
                command.append(f"*.{ext}")

    # --- 处理自定义参数 ---
    if extra_args:
        try:
            # shlex.split 能够正确处理带引号的参数，例如：--type-add "web:*.html"
            args_list = shlex.split(extra_args)
            command.extend(args_list)
        except Exception as e:
            return {"error": f"自定义参数解析失败: {str(e)}"}

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
    eel.start('index.html', mode='edge', size=(1000, 850)) # 稍微调高一点高度
except EnvironmentError:
    eel.start('index.html', mode='default')