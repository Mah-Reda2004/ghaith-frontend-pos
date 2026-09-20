# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

root = Path(SPECPATH)
a = Analysis(
    [str(root / "service.py")],
    pathex=[str(root.parent)],
    binaries=[],
    datas=[
        (str(root / "assets" / "icon.ico"), "assets"),
        (str(root / "assets" / "ChatGPT Image Aug 1, 2026, 01_18_31 AM 1.png"), "assets"),
    ],
    hiddenimports=["uvicorn.logging", "uvicorn.loops.auto", "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets.auto", "uvicorn.lifespan.on", "win32timezone"],
    hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[], noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="GhaithPrintAgent", debug=False, bootloader_ignore_signals=False, strip=False, upx=True, console=False, icon=str(root / "assets" / "icon.ico"))
