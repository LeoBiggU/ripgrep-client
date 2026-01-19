import eel
import subprocess
import json
import os
import tkinter as tk
from tkinter import filedialog
import html  # <--- 新增引入 html 库

eel.init('web')

@eel.expose
def select_folder():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder_path = filedialog.askdirectory()
    root.destroy()
    return folder_path

# --- 新增 helper 函数：处理高亮 ---
def highlight_text(text, submatches):
    """
    根据 ripgrep 的 submatches (字节偏移) 对文本进行 HTML 高亮处理
    """
    if not submatches:
        return html.escape(text)

    # 1. 转换为 bytes，因为 ripgrep 返回的是 byte offsets
    # 注意：ripgrep 的 json 输出中，text 已经是解码后的字符串，
    # 但 submatches 的 start/end 是基于原始字节流的。
    # 这里假设 ripgrep 输出的 text 是 utf-8 编码对应的。
    try:
        b_text = text.encode('utf-8')
    except Exception:
        # 如果编码有问题，直接返回转义后的原文本
        return html.escape(text)

    last_end = 0
    result_parts = []

    # submatches 列表通常是按顺序的，但为了保险起见可以排个序
    submatches.sort(key=lambda x: x['start'])

    for match in submatches:
        start = match['start']
        end = match['end']

        # 1. 添加上一段非高亮文本 (需转义)
        if start > last_end:
            segment = b_text[last_end:start].decode('utf-8', errors='replace')
            result_parts.append(html.escape(segment))
        
        # 2. 添加高亮文本 (需转义，并包裹 span)
        match_segment = b_text[start:end].decode('utf-8', errors='replace')
        result_parts.append(f'<span class="highlight">{html.escape(match_segment)}</span>')
        
        last_end = end

    # 3. 添加剩余文本
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
        return {"error": f"找不到 ripgrep 程序，请确保 rg.exe 位于: {rg_path}"}
        
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
        for line in stdout.splitlines():
            try:
                item = json.loads(line)
                if item['type'] == 'match':
                    data = item['data']
                    
                    # 获取原始文本 (通常包含换行符，我们去掉末尾换行，保留缩进)
                    raw_text = data['lines']['text'].rstrip('\r\n')
                    
                    # --- 这里调用高亮处理函数 ---
                    # submatches 包含了匹配的起止位置
                    formatted_html = highlight_text(raw_text, data['submatches'])

                    results.append({
                        'file': data['path']['text'],
                        'line_num': data['line_number'],
                        'content_html': formatted_html # 传给前端的是处理好的 HTML
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