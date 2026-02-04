let currentRootPath = ""; 
let treeNodeMap = new Map();

// --- 1. 侧边栏拖拽逻辑 ---
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize'; 
    document.body.style.userSelect = 'none'; 
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newWidth = e.clientX - 10; 
    if (newWidth < 150) newWidth = 150;
    if (newWidth > 600) newWidth = 600;
    sidebar.style.width = `${newWidth}px`;
});

document.addEventListener('mouseup', () => {
    isResizing = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
});

// --- 2. 侧边栏树操作逻辑 ---

// 清除选择
document.getElementById('clear-tree-btn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.tree-checkbox input:checked');
    if (checkboxes.length === 0) return;

    checkboxes.forEach(cb => cb.checked = false);
    
    // 按钮旋转动画反馈
    const btn = document.getElementById('clear-tree-btn');
    btn.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-360deg)' }
    ], { duration: 400, easing: 'ease-out' });
});

async function loadTreeRoot(path) {
    const treeContainer = document.getElementById('file-tree');
    treeContainer.innerHTML = '';
    treeNodeMap.clear();

    const items = await eel.get_dir_contents(path)();
    
    const rootContainer = document.createElement('div');
    items.forEach(item => {
        const node = createTreeNode(item, 0);
        rootContainer.appendChild(node);
    });
    treeContainer.appendChild(rootContainer);
}

function createTreeNode(item, level) {
    const container = document.createElement('div');
    
    const row = document.createElement('div');
    row.className = 'tree-node';
    // 利用 padding 做缩进
    row.style.paddingLeft = `${level * 15 + 5}px`; 
    
    treeNodeMap.set(item.path, row);

    // 展开/收起箭头
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    if (!item.is_dir) toggle.classList.add('invisible');
    toggle.innerText = '▶'; 
    row.appendChild(toggle);

    // 复选框容器
    const checkContainer = document.createElement('div');
    checkContainer.className = 'tree-checkbox'; 
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.path = item.path; 
    checkbox.addEventListener('click', (e) => e.stopPropagation()); // 防止点击触发目录展开
    checkContainer.appendChild(checkbox);
    row.appendChild(checkContainer);

    // 文件/文件夹图标
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerText = item.is_dir ? '📁' : '📄';
    row.appendChild(icon);

    // 名称
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-name';
    nameSpan.innerText = item.name;
    row.appendChild(nameSpan);

    // 子项容器
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    
    if (item.is_dir) {
        row.addEventListener('click', async () => {
            await toggleDirectory(item.path, toggle, childrenContainer, level + 1);
        });
    }

    container.appendChild(row);
    container.appendChild(childrenContainer);
    
    // 绑定数据到 DOM 元素以便后续操作
    row._childrenContainer = childrenContainer;
    row._toggleIcon = toggle;
    row._isLoaded = false;

    return container;
}

async function toggleDirectory(path, toggleIcon, childrenContainer, nextLevel) {
    const isExpanded = toggleIcon.classList.contains('expanded');
    
    if (isExpanded) {
        toggleIcon.classList.remove('expanded');
        toggleIcon.style.transform = '';
        childrenContainer.classList.remove('visible');
    } else {
        toggleIcon.classList.add('expanded');
        toggleIcon.style.transform = 'rotate(90deg)';
        childrenContainer.classList.add('visible');

        // 懒加载：如果子容器是空的，才去请求
        if (!childrenContainer.hasChildNodes()) {
             const items = await eel.get_dir_contents(path)();
             items.forEach(subItem => {
                 const node = createTreeNode(subItem, nextLevel);
                 childrenContainer.appendChild(node);
             });
             // 标记已加载
             if (treeNodeMap.get(path)) {
                 treeNodeMap.get(path)._isLoaded = true;
             }
        }
    }
}

// 联动：点击搜索结果，展开树
async function revealInTree(fullPath) {
    if (!currentRootPath || !fullPath.startsWith(currentRootPath)) return;

    // 清除旧的高亮
    document.querySelectorAll('.tree-node.selected-highlight').forEach(el => el.classList.remove('selected-highlight'));

    // 如果节点已经存在（已展开过），直接高亮
    if (treeNodeMap.has(fullPath)) {
        const node = treeNodeMap.get(fullPath);
        node.classList.add('selected-highlight');
        node.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
    }

    // 如果节点不存在，需要逐级展开
    // 移除根路径部分，按分隔符切分
    let relPath = fullPath.substring(currentRootPath.length);
    if (relPath.startsWith('\\') || relPath.startsWith('/')) relPath = relPath.substring(1);
    
    const sep = fullPath.includes('\\') ? '\\' : '/';
    const segments = relPath.split(sep);
    let currentPath = currentRootPath;

    for (let i = 0; i < segments.length; i++) {
        currentPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + segments[i];
        const nodeRow = treeNodeMap.get(currentPath);
        
        if (nodeRow) {
            if (i === segments.length - 1) {
                // 找到了目标文件
                nodeRow.classList.add('selected-highlight');
                nodeRow.scrollIntoView({ behavior: 'auto', block: 'center' });
            } else {
                // 是中间目录，展开它
                const toggle = nodeRow._toggleIcon;
                const container = nodeRow._childrenContainer;
                
                if (toggle && !toggle.classList.contains('expanded')) {
                    // 反算层级：(paddingLeft - 5) / 15
                    const currentPadding = parseInt(nodeRow.style.paddingLeft || '5');
                    const currentLevel = (currentPadding - 5) / 15;
                    await toggleDirectory(currentPath, toggle, container, currentLevel + 1);
                }
            }
        } else {
            break; // 路径对不上（理论上不应发生）
        }
    }
}

function getCheckedPaths() {
    // 查找 checked 的 checkbox，并读取 data-path
    const checkboxes = document.querySelectorAll('.tree-checkbox input:checked');
    const paths = [];
    checkboxes.forEach(cb => {
        paths.push(cb.dataset.path);
    });
    return paths;
}


// --- 3. 搜索与控制逻辑 ---

// 浏览目录
document.getElementById('browse-btn').addEventListener('click', async () => {
    const path = await eel.select_folder()();
    if (path) {
        document.getElementById('path-input').value = path;
        currentRootPath = path;
        loadTreeRoot(path);
    }
});

// 展开高级选项
document.getElementById('toggle-advanced').addEventListener('click', () => {
    const area = document.getElementById('advanced-area');
    const btn = document.getElementById('toggle-advanced');
    if (area.classList.contains('open')) {
        area.classList.remove('open');
        btn.style.backgroundColor = '#3c3c3c';
    } else {
        area.classList.add('open');
        btn.style.backgroundColor = '#444';
    }
});

// 命令预览
const modal = document.getElementById('cmd-modal');
const closeModalBtn = document.getElementById('close-modal');

document.getElementById('preview-cmd-btn').addEventListener('click', async () => {
    const query = document.getElementById('query').value;
    const extensions = document.getElementById('extensions').value;
    const extraArgs = document.getElementById('extra-args').value;
    
    // 逻辑复用：获取当前生效的路径
    let targetPaths = getCheckedPaths();
    if (targetPaths.length === 0 && currentRootPath) {
        targetPaths = [currentRootPath];
    } else if (targetPaths.length === 0 && !currentRootPath) {
        targetPaths = ["(请选择目录)"];
    }

    const html = await eel.preview_command(query || "(搜索词)", targetPaths, extensions, extraArgs)();
    
    document.getElementById('cmd-preview-content').innerHTML = html;
    modal.style.display = 'flex';
});

closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
});

// 执行搜索
document.getElementById('search-btn').addEventListener('click', performSearch);
document.getElementById('query').addEventListener('keyup', (e) => { if (e.key === 'Enter') performSearch(); });
document.getElementById('extra-args').addEventListener('keyup', (e) => { if (e.key === 'Enter') performSearch(); });

async function performSearch() {
    const query = document.getElementById('query').value;
    const extensions = document.getElementById('extensions').value;
    const extraArgs = document.getElementById('extra-args').value;
    const resultArea = document.getElementById('results-area');
    const statusBar = document.getElementById('status-bar-text');

    if (!query || !currentRootPath) {
        statusBar.innerText = "错误: 请输入搜索内容并选择目录";
        return;
    }

    statusBar.innerText = "正在搜索...";
    resultArea.innerHTML = '<div class="empty-state">正在拼命检索中...</div>';
    document.getElementById('search-btn').disabled = true;

    // 确定检索范围
    let targetPaths = getCheckedPaths();
    if (targetPaths.length === 0 || targetPaths.includes(currentRootPath)) {
        targetPaths = [currentRootPath]; // 未勾选则搜索根目录，或者包含了根目录也直接搜根目录
    }

    const startTime = performance.now();
    const response = await eel.run_ripgrep(query, targetPaths, extensions, extraArgs)();
    document.getElementById('search-btn').disabled = false;

    if (response.error) {
        statusBar.innerText = "搜索出错";
        resultArea.innerHTML = `<div class="empty-state" style="color:red">${response.error}</div>`;
        return;
    }

    renderResults(response.data, response.count, currentRootPath);

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(3);
    const countText = response.count > 0 ? `找到 ${response.count} 个匹配项` : "未找到匹配项";
    statusBar.innerText = `完成: ${countText} (耗时 ${duration} 秒)`;
}

function renderResults(groupedData, count, rootPath) {
    const resultArea = document.getElementById('results-area');
    resultArea.innerHTML = '';
    
    if (count === 0) {
        resultArea.innerHTML = '<div class="empty-state">未找到匹配的结果</div>';
        return;
    }

    // 遍历文件
    for (const [filePath, matches] of Object.entries(groupedData)) {
        const fileBlock = document.createElement('div');
        fileBlock.className = 'file-block';

        // 文件头
        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerText = filePath;
        // 点击文件名 -> 树联动
        header.addEventListener('click', () => {
             if (matches.length > 0) revealInTree(matches[0].full_path);
        });
        fileBlock.appendChild(header);

        // 匹配行
        matches.forEach(match => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'match-line';
            lineDiv.title = "左键：标记/联动树 | 右键：打开 VS Code"; 
            lineDiv.innerHTML = `<span class="line-num">${match.line_num}</span><span>${match.content_html}</span>`;
            
            // 单击：标记 + 树联动
            lineDiv.addEventListener('click', () => {
                lineDiv.classList.toggle('checked');
                revealInTree(match.full_path);
            });

            // 右键：打开 VS Code
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