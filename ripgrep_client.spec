# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# 定义要包含的文件和目录
a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[('rg.exe', '.')],  # 包含rg.exe可执行文件
    datas=[('web', 'web')],  # 包含web目录及其所有内容
    hiddenimports=['eel', 'tkinter', 'json', 'os', 'subprocess', 'html', 'shlex'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# 创建单个可执行文件
executable = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='RipGrep Client',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # 使用UPX压缩
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 不显示控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
