import eel
import subprocess
import json
import os
import tkinter as tk
from tkinter import filedialog
import html
import shlex

# 初始化 web 目录
eel.init('web')

# --- 核心工具：构建命令列表 ---
def _build_command(query, target_paths, extensions, extra_args):
    """构建 ripgrep 命令参数列表，供执行和预览使用"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rg_path = os.path.join(base_dir, 'rg.exe')
    
    if not os.path.exists(rg_path):
        raise FileNotFoundError("找不到 rg.exe，请确保它在脚本同级目录下")
        
    # 基础命令
    command = [rg_path, query]
    
    # 默认使用 Smart Case (-S): 全小写时忽略大小写，包含大写时敏感
    command.append("-S")
    
    # 强制输出 JSON 格式供程序解析 (外部调用预览时会过滤掉这个)
    command.append("--json")
    
    # 路径参数
    if isinstance(target_paths, str):
        target_paths = [target_paths]
    command.extend(target_paths)

    # 文件类型后缀过滤
    if extensions:
        # 支持逗号分隔: py,js,html
        ext_list = [x.strip() for x in extensions.replace('，', ',').split(',')]
        for ext in ext_list:
            if ext:
                command.append("-g")
                command.append(f"*.{ext}")

    # 自定义参数 (如 -C 3 等)
    if extra_args:
        try:
            # 使用 shlex 安全分割参数字符串
            args_list = shlex.split(extra_args)
            command.extend(args_list)
        except Exception:
            pass 
            
    return command

# --- 暴露给前端的接口 ---

@eel.expose
def select_folder():
    """打开系统文件夹选择框"""
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder_path = filedialog.askdirectory()
    root.destroy()
    return os.path.normpath(folder_path) if folder_path else None

@eel.expose
def get_dir_contents(directory_path):
    """获取指定目录下的文件和文件夹（用于懒加载树）"""
    items = []
    try:
        if not os.path.exists(directory_path):
            return []
        with os.scandir(directory_path) as entries:
            for entry in entries:
                if entry.name.startswith('.'): continue # 忽略隐藏文件
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
    """调用 VS Code 打开文件并跳转到指定行"""
    try:
        cmd = ["code"]
        # 如果提供了工作区路径，先打开文件夹上下文
        if root_path:
            cmd.append(root_path)
        # -g file:line 是 VS Code 跳转的标准参数
        cmd.append("-g")
        cmd.append(f"{file_path}:{line_num}")
        
        # Windows下隐藏弹出的黑框
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
        subprocess.Popen(cmd, startupinfo=startupinfo, shell=True)
        return True
    except Exception as e:
        print(f"打开 VS Code 失败: {e}")
        return False

@eel.expose
def preview_command(query, target_paths, extensions, extra_args):
    """生成带有 HTML 颜色的命令预览字符串"""
    try:
        # 构建完整命令
        full_cmd_list = _build_command(query, target_paths, extensions, extra_args)
        # 过滤掉内部通讯用的 --json 参数，展示给用户看最纯粹的命令
        display_list = [arg for arg in full_cmd_list if arg != "--json"]
        
        # HTML 着色逻辑
        html_parts = []
        for i, part in enumerate(display_list):
            escaped_part = html.escape(part)
            if i == 0: # rg.exe (绿色)
                html_parts.append(f'<span style="color:#4ec9b0; font-weight:bold;">{escaped_part}</span>')
            elif part.startswith('-'): # 参数 (橙色)
                html_parts.append(f'<span style="color:#ce9178;">{escaped_part}</span>')
            elif i == 1: # 搜索词 (蓝色)
                html_parts.append(f'<span style="color:#569cd6;">"{escaped_part}"</span>')
            else: # 路径或其他 (灰色)
                if " " in escaped_part: 
                    html_parts.append(f'<span style="color:#d4d4d4;">"{escaped_part}"</span>')
                else:
                    html_parts.append(f'<span style="color:#d4d4d4;">{escaped_part}</span>')
                    
        return " ".join(html_parts)
    except Exception as e:
        return f'<span style="color:red">构建命令失败: {str(e)}</span>'

@eel.expose
def run_ripgrep(query, target_paths, extensions, extra_args):
    """执行搜索"""
    if not query or not target_paths:
        return {"error": "请提供搜索内容和路径"}
    
    try:
        command = _build_command(query, target_paths, extensions, extra_args)
        
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        # 执行命令
        process = subprocess.Popen(
            command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            encoding='utf-8',
            errors='replace', # 防止编码错误导致崩溃
            startupinfo=startupinfo
        )
        
        stdout, stderr = process.communicate()
        
        results = []
        # 主目录用于计算相对路径（如果是单个目录搜索）
        main_root = target_paths[0] if target_paths else ""

        # 解析 ripgrep 的 JSON 输出
        for line in stdout.splitlines():
            try:
                item = json.loads(line)
                if item['type'] == 'match':
                    data = item['data']
                    raw_text = data['lines']['text'].rstrip('\r\n')
                    # 处理高亮
                    formatted_html = highlight_text(raw_text, data['submatches'])
                    
                    rel_path_display = data['path']['text']
                    # 计算绝对路径
                    if os.path.isabs(rel_path_display):
                        full_path = rel_path_display
                    else:
                        full_path = os.path.abspath(os.path.join(main_root, rel_path_display))

                    results.append({
                        'file': rel_path_display,
                        'full_path': full_path if os.path.exists(full_path) else rel_path_display,
                        'line_num': data['line_number'],
                        'content_html': formatted_html
                    })
            except json.JSONDecodeError:
                continue
        
        # 按文件分组
        grouped_results = {}
        for r in results:
            if r['file'] not in grouped_results:
                grouped_results[r['file']] = []
            grouped_results[r['file']].append(r)
            
        return {"success": True, "data": grouped_results, "count": len(results)}

    except Exception as e:
        return {"error": str(e)}

def highlight_text(text, submatches):
    """根据字节偏移量给文本添加高亮标签"""
    if not submatches: return html.escape(text)
    try:
        b_text = text.encode('utf-8') # 转为字节处理偏移量
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
        # 添加高亮 span
        result_parts.append(f'<span class="highlight">{html.escape(match_segment)}</span>')
        last_end = end
        
    if last_end < len(b_text):
        remaining = b_text[last_end:].decode('utf-8', errors='replace')
        result_parts.append(html.escape(remaining))
        
    return "".join(result_parts)

# 启动应用
if __name__ == '__main__':
    try:
        # 优先尝试 Edge，如果没有则使用默认浏览器
        eel.start('index.html', mode='edge', size=(1500, 850))
    except EnvironmentError:
        eel.start('index.html', mode='default', size=(1300, 850))