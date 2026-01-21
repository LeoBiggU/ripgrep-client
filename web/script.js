document.getElementById('browse-btn').addEventListener('click', async () => {
    const path = await eel.select_folder()();
    if (path) {
        document.getElementById('path-input').value = path;
    }
});

// 高级选项切换逻辑
document.getElementById('toggle-advanced').addEventListener('click', () => {
    const area = document.getElementById('advanced-area');
    const btn = document.getElementById('toggle-advanced');
    
    // 切换 CSS class 实现动画
    if (area.classList.contains('open')) {
        area.classList.remove('open');
        btn.style.backgroundColor = '#3c3c3c'; // 恢复默认颜色
    } else {
        area.classList.add('open');
        btn.style.backgroundColor = '#444'; // 激活状态稍微亮一点
    }
});

document.getElementById('search-btn').addEventListener('click', performSearch);
document.getElementById('query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});
// 允许在自定义参数框里回车直接搜索
document.getElementById('extra-args').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = document.getElementById('query').value;
    const path = document.getElementById('path-input').value;
    const extensions = document.getElementById('extensions').value;
    const caseSensitive = document.getElementById('case-sensitive').checked;
    
    // 获取自定义参数
    const extraArgs = document.getElementById('extra-args').value;

    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar-text');

    if (!query || !path) {
        statusBar.innerText = "错误: 请输入搜索内容并选择目录";
        return;
    }

    statusBar.innerText = "正在搜索...";
    resultArea.innerHTML = '<div class="empty-state">正在拼命检索中...</div>';
    document.getElementById('search-btn').disabled = true;

    const startTime = performance.now();

    // 传入 extraArgs
    const response = await eel.run_ripgrep(query, path, extensions, caseSensitive, extraArgs)();

    document.getElementById('search-btn').disabled = false;

    if (response.error) {
        statusBar.innerText = "搜索出错";
        resultArea.innerHTML = `<div class="empty-state" style="color:red">${response.error}</div>`;
        return;
    }

    renderResults(response.data, response.count, path);

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(3);

    if (response.count > 0) {
        statusBar.innerText = `完成: 找到 ${response.count} 个匹配项 (耗时 ${duration} 秒)`;
    }
}

function renderResults(groupedData, count, rootPath) {
    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar-text');
    
    if (count === 0) {
        statusBar.innerText = "完成: 未找到匹配项";
        resultArea.innerHTML = '<div class="empty-state">未找到匹配的结果</div>';
        return;
    }

    statusBar.innerText = `完成: 找到 ${count} 个匹配项`;
    resultArea.innerHTML = '';

    for (const [filePath, matches] of Object.entries(groupedData)) {
        const fileBlock = document.createElement('div');
        fileBlock.className = 'file-block';

        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerText = filePath;
        fileBlock.appendChild(header);

        matches.forEach(match => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'match-line';
            lineDiv.title = "左键：标记已读 | 右键：打开 VS Code"; 
            
            lineDiv.innerHTML = `<span class="line-num">${match.line_num}</span><span>${match.content_html}</span>`;
            
            lineDiv.addEventListener('click', () => {
                lineDiv.classList.toggle('checked');
            });

            lineDiv.addEventListener('contextmenu', async (e) => {
                e.preventDefault(); 
                const useWorkspace = document.getElementById('workspace-mode').checked;
                const workspacePath = useWorkspace ? rootPath : null;
                await eel.open_in_vscode(match.full_path, match.line_num, workspacePath)();
            });

            fileBlock.appendChild(lineDiv);
        });

        resultArea.appendChild(fileBlock);
    }
}