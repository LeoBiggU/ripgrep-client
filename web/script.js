let currentRootPath = ""; 
let treeNodeMap = new Map();

// --- 1. 拖拽调整宽度逻辑 ---
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

// --- 2. 清除选择逻辑 (Fix) ---
document.getElementById('clear-tree-btn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.tree-checkbox input:checked');
    if (checkboxes.length === 0) return;

    checkboxes.forEach(cb => cb.checked = false);
    
    // 动画反馈
    const btn = document.getElementById('clear-tree-btn');
    btn.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-360deg)' }
    ], { duration: 400, easing: 'ease-out' });
});


// --- 3. 核心业务逻辑 ---

document.getElementById('browse-btn').addEventListener('click', async () => {
    const path = await eel.select_folder()();
    if (path) {
        document.getElementById('path-input').value = path;
        currentRootPath = path;
        loadTreeRoot(path);
    }
});

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

document.getElementById('search-btn').addEventListener('click', performSearch);
document.getElementById('query').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});
document.getElementById('extra-args').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = document.getElementById('query').value;
    const extensions = document.getElementById('extensions').value;
    const caseSensitive = document.getElementById('case-sensitive').checked;
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

    // 获取勾选路径
    let targetPaths = getCheckedPaths();
    if (targetPaths.length === 0 || targetPaths.includes(currentRootPath)) {
        targetPaths = [currentRootPath];
    }

    const startTime = performance.now();
    const response = await eel.run_ripgrep(query, targetPaths, extensions, caseSensitive, extraArgs)();

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

    for (const [filePath, matches] of Object.entries(groupedData)) {
        const fileBlock = document.createElement('div');
        fileBlock.className = 'file-block';

        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerText = filePath;
        
        header.addEventListener('click', () => {
             if (matches.length > 0) revealInTree(matches[0].full_path);
        });

        fileBlock.appendChild(header);

        matches.forEach(match => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'match-line';
            lineDiv.title = "左键：标记/联动树 | 右键：打开 VS Code"; 
            lineDiv.innerHTML = `<span class="line-num">${match.line_num}</span><span>${match.content_html}</span>`;
            
            lineDiv.addEventListener('click', () => {
                lineDiv.classList.toggle('checked');
                revealInTree(match.full_path);
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

// --- 4. 树结构逻辑 ---

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
    row.style.paddingLeft = `${level * 15 + 5}px`; 
    
    treeNodeMap.set(item.path, row);

    // 展开箭头
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
    // 防止点击checkbox触发目录展开
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    
    checkContainer.appendChild(checkbox);
    row.appendChild(checkContainer);

    // 图标
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

        if (!childrenContainer.hasChildNodes()) {
             const items = await eel.get_dir_contents(path)();
             items.forEach(subItem => {
                 const node = createTreeNode(subItem, nextLevel);
                 childrenContainer.appendChild(node);
             });
             if (treeNodeMap.get(path)) {
                 treeNodeMap.get(path)._isLoaded = true;
             }
        }
    }
}

async function revealInTree(fullPath) {
    if (!currentRootPath || !fullPath.startsWith(currentRootPath)) return;

    document.querySelectorAll('.tree-node.selected-highlight').forEach(el => el.classList.remove('selected-highlight'));

    if (treeNodeMap.has(fullPath)) {
        const node = treeNodeMap.get(fullPath);
        node.classList.add('selected-highlight');
        node.scrollIntoView({ behavior: 'auto', block: 'center' });
        return;
    }

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
                nodeRow.classList.add('selected-highlight');
                nodeRow.scrollIntoView({ behavior: 'auto', block: 'center' });
            } else {
                const toggle = nodeRow._toggleIcon;
                const container = nodeRow._childrenContainer;
                
                if (toggle && !toggle.classList.contains('expanded')) {
                    const currentPadding = parseInt(nodeRow.style.paddingLeft || '5');
                    const currentLevel = (currentPadding - 5) / 15;
                    await toggleDirectory(currentPath, toggle, container, currentLevel + 1);
                }
            }
        } else {
            break;
        }
    }
}

// --- 5. 获取勾选路径 (Fix) ---
function getCheckedPaths() {
    // 修正选择器
    const checkboxes = document.querySelectorAll('.tree-checkbox input:checked');
    const paths = [];
    checkboxes.forEach(cb => {
        paths.push(cb.dataset.path);
    });
    return paths;
}