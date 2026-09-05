$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = "C:\Users\sw\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path -LiteralPath $PythonExe)) { $PythonExe = "py" }
& $PythonExe -m pip install -r (Join-Path $AgentDir "requirements.txt")
Push-Location (Split-Path -Parent $AgentDir)
try { & $PythonExe -m PyInstaller --noconfirm --clean (Join-Path $AgentDir "GhaithPrintAgent.spec") }
finally { Pop-Location }
Write-Host "EXE: $(Join-Path (Split-Path -Parent $AgentDir) 'dist\GhaithPrintAgent.exe')"
