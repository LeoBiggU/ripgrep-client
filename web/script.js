document.getElementById('browse-btn').addEventListener('click', async () => {
    const path = await eel.select_folder()();
    if (path) {
        document.getElementById('path-input').value = path;
    }
});

document.getElementById('search-btn').addEventListener('click', performSearch);
document.getElementById('query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = document.getElementById('query').value;
    const path = document.getElementById('path-input').value;
    const extensions = document.getElementById('extensions').value;
    const caseSensitive = document.getElementById('case-sensitive').checked;
    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar-text');

    if (!query || !path) {
        statusBar.innerText = "错误: 请输入搜索内容并选择目录";
        return;
    }

    statusBar.innerText = "正在搜索...";
    resultArea.innerHTML = '<div class="empty-state">正在拼命检索中...</div>';
    document.getElementById('search-btn').disabled = true;

    // --- 1. 计时开始 ---
    const startTime = performance.now();

    // 调用 Python
    const response = await eel.run_ripgrep(query, path, extensions, caseSensitive)();

    document.getElementById('search-btn').disabled = false;

    if (response.error) {
        statusBar.innerText = "搜索出错";
        resultArea.innerHTML = `<div class="empty-state" style="color:red">${response.error}</div>`;
        return;
    }

    // 渲染结果
    renderResults(response.data, response.count);

    // --- 2. 计时结束 ---
    const endTime = performance.now();
    
    // 计算耗时 (毫秒转秒，保留3位小数)
    const duration = ((endTime - startTime) / 1000).toFixed(3);

    // --- 3. 更新状态栏显示时间 ---
    if (response.count > 0) {
        // 覆盖 renderResults 里设置的文字，加上时间
        statusBar.innerText = `完成: 找到 ${response.count} 个匹配项 (耗时 ${duration} 秒)`;
    }
}

function renderResults(groupedData, count) {
    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar-text');
    
    if (count === 0) {
        statusBar.innerText = "完成: 未找到匹配项";
        resultArea.innerHTML = '<div class="empty-state">未找到匹配的结果</div>';
        return;
    }

    // 先设置一个基础文本，稍后会在 performSearch 里被覆盖加上时间
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
            
            // 左键单击：划掉/恢复
            lineDiv.addEventListener('click', () => {
                lineDiv.classList.toggle('checked');
            });

            // 右键单击：打开 VS Code
            lineDiv.addEventListener('contextmenu', async (e) => {
                e.preventDefault(); 
                await eel.open_in_vscode(match.full_path, match.line_num)();
            });

            fileBlock.appendChild(lineDiv);
        });

        resultArea.appendChild(fileBlock);
    }
}