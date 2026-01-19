// 监听浏览按钮
document.getElementById('browse-btn').addEventListener('click', async () => {
    // 调用 Python 函数
    const path = await eel.select_folder()();
    if (path) {
        document.getElementById('path-input').value = path;
    }
});

// 监听搜索按钮
document.getElementById('search-btn').addEventListener('click', performSearch);

// 支持回车搜索
document.getElementById('query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = document.getElementById('query').value;
    const path = document.getElementById('path-input').value;
    const extensions = document.getElementById('extensions').value;
    const caseSensitive = document.getElementById('case-sensitive').checked;
    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar');

    if (!query || !path) {
        statusBar.innerText = "错误: 请输入搜索内容并选择目录";
        return;
    }

    // UI 状态更新
    statusBar.innerText = "正在搜索...";
    resultArea.innerHTML = '<div class="empty-state">正在拼命检索中...</div>';
    document.getElementById('search-btn').disabled = true;

    // 调用 Python 搜索
    // 注意：eel.function_name()() 这里的双括号是因为 eel 是异步调用的
    const response = await eel.run_ripgrep(query, path, extensions, caseSensitive)();

    document.getElementById('search-btn').disabled = false;

    if (response.error) {
        statusBar.innerText = "搜索出错";
        resultArea.innerHTML = `<div class="empty-state" style="color:red">${response.error}</div>`;
        return;
    }

    renderResults(response.data, response.count);
}

function renderResults(groupedData, count) {
    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar');
    
    if (count === 0) {
        statusBar.innerText = "完成: 未找到匹配项";
        resultArea.innerHTML = '<div class="empty-state">未找到匹配的结果</div>';
        return;
    }

    statusBar.innerText = `完成: 找到 ${count} 个匹配项`;
    resultArea.innerHTML = '';

    // 遍历字典渲染
    for (const [filePath, matches] of Object.entries(groupedData)) {
        const fileBlock = document.createElement('div');
        fileBlock.className = 'file-block';

        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerText = filePath;
        // 点击文件头可以做一些操作，比如调用系统命令打开文件（需在Python端增加功能）
        fileBlock.appendChild(header);

        // matches.forEach(match => {
        //     const lineDiv = document.createElement('div');
        //     lineDiv.className = 'match-line';
            
        //     // 简单的 HTML 转义防止代码被浏览器解析
        //     const safeContent = match.content
        //         .replace(/&/g, "&amp;")
        //         .replace(/</g, "&lt;")
        //         .replace(/>/g, "&gt;");

        //     lineDiv.innerHTML = `<span class="line-num">${match.line_num}</span> <span>${safeContent}</span>`;
        //     fileBlock.appendChild(lineDiv);
        // });

        matches.forEach(match => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'match-line';
            
            // --- 修改开始 ---
            // 之前是 match.content，现在我们使用后端生成好的 match.content_html
            // 因为后端已经做过 html.escape，所以这里用 innerHTML 是安全的
            lineDiv.innerHTML = `<span class="line-num">${match.line_num}</span> <span>${match.content_html}</span>`;
            // --- 修改结束 ---

            fileBlock.appendChild(lineDiv);
        });

        resultArea.appendChild(fileBlock);
    }
}