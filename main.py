import eel
import subprocess
import json
import os
import tkinter as tk
from tkinter import filedialog
import html
import shlex

eel.init('web')

@eel.expose
def select_folder():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder_path = filedialog.askdirectory()
    root.destroy()
    return os.path.normpath(folder_path) if folder_path else None

@eel.expose
def get_dir_contents(directory_path):
    """
    获取指定目录下的内容（用于文件树懒加载）
    返回：[{name, path, is_dir}, ...]
    """
    items = []
    try:
        if not os.path.exists(directory_path):
            return []
            
        with os.scandir(directory_path) as entries:
            for entry in entries:
                # 简单的过滤，跳过隐藏文件等
                if entry.name.startswith('.'):
                    continue
                items.append({
                    'name': entry.name,
                    'path': os.path.normpath(entry.path),
                    'is_dir': entry.is_dir()
                })
        
        # 排序：文件夹在前，文件在后，按名称排序
        items.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        return items
    except Exception as e:
        print(f"Error scanning {directory_path}: {e}")
        return []

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

@eel.expose
def run_ripgrep(query, target_paths, extensions, case_sensitive, extra_args):
    """
    target_paths: list of strings. 如果为空，则前端应该传根目录进来。
    """
    if not query or not target_paths:
        return {"error": "请提供搜索内容和路径"}
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rg_path = os.path.join(base_dir, 'rg.exe')
    
    if not os.path.exists(rg_path):
        return {"error": f"找不到 rg.exe，请将其放在: {base_dir}"}
        
    # 基础命令
    command = [rg_path, query]
    
    # 路径参数 (ripgrep 支持传入多个路径)
    # 确保 target_paths 是列表
    if isinstance(target_paths, str):
        target_paths = [target_paths]
    command.extend(target_paths)
    
    command.append("--json")
    
    if not case_sensitive:
        command.append("-i")
        
    if extensions:
        ext_list = [x.strip() for x in extensions.split(',')]
        for ext in ext_list:
            if ext:
                command.append("-g")
                command.append(f"*.{ext}")

    if extra_args:
        try:
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
        
        # 因为我们现在可能搜多个目录，计算相对路径需要小心。
        # 这里简单起见，我们假设第一个路径是主根，或者我们直接依赖 path.text
        # 为了 '在目录打开' 功能，我们需要知道归属的根目录。
        # 简单处理：以前端传来的第一个路径作为 search_root（通常是项目根目录）
        main_root = target_paths[0] if target_paths else ""

        for line in stdout.splitlines():
            try:
                item = json.loads(line)
                if item['type'] == 'match':
                    data = item['data']
                    raw_text = data['lines']['text'].rstrip('\r\n')
                    formatted_html = highlight_text(raw_text, data['submatches'])
                    
                    # ripgrep 在多路径搜索时，path.text 可能是相对路径也可能是绝对路径
                    # 最好直接使用绝对路径逻辑
                    rel_path_display = data['path']['text']
                    
                    # 尝试构造绝对路径
                    if os.path.isabs(rel_path_display):
                        full_path = rel_path_display
                    else:
                        # 如果是相对路径，它是相对于当前 cwd (即 main.py 所在目录) 还是相对于搜索目标的？
                        # ripgrep 行为：如果给的是绝对路径参数，返回绝对；如果给相对，返回相对。
                        # 我们尽量保证 target_paths 传给后端时是绝对路径。
                        full_path = os.path.abspath(os.path.join(main_root, rel_path_display)) # 备用逻辑

                    results.append({
                        'file': rel_path_display,
                        'full_path': full_path if os.path.exists(full_path) else rel_path_display,
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
    eel.start('index.html', mode='edge', size=(1200, 850)) # 稍微加宽一点适应双栏
except EnvironmentError:
    eel.start('index.html', mode='default')