$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceExe = Join-Path (Split-Path -Parent $AgentDir) "dist\GhaithPrintAgent.exe"
if (-not (Test-Path -LiteralPath $SourceExe)) { throw "Build the EXE with build-exe.ps1 first." }
$StartupDir = [Environment]::GetFolderPath("Startup")
$UserProfileDir = $StartupDir -replace '\\AppData\\Roaming\\.*$', ''
$InstallDir = Join-Path $UserProfileDir "AppData\Local\GhaithPrintAgent"
$InstalledExe = Join-Path $InstallDir "GhaithPrintAgent-Ghaith.exe"
$InstalledIcon = Join-Path $InstallDir "ghaith.ico"
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Get-Process GhaithPrintAgent,GhaithPrintAgent-Ghaith -ErrorAction SilentlyContinue | Stop-Process -Force
Copy-Item -LiteralPath $SourceExe -Destination $InstalledExe -Force
Copy-Item -LiteralPath (Join-Path $AgentDir "assets\icon.ico") -Destination $InstalledIcon -Force
$OldShortcutPath = Join-Path $StartupDir "Ghaith Print Agent.lnk"
if (Test-Path -LiteralPath $OldShortcutPath) { Remove-Item -LiteralPath $OldShortcutPath -Force }
$ShortcutPath = Join-Path $StartupDir "Ghaith Print Agent v2.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $InstalledExe
$Shortcut.Arguments = "--background"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = "$InstalledIcon,0"
$Shortcut.WindowStyle = 7
$Shortcut.Save()
if (-not (Test-Path -LiteralPath $ShortcutPath)) { throw "Could not create the Startup shortcut." }
Start-Process -FilePath $InstalledExe -ArgumentList "--background" -WorkingDirectory $InstallDir -WindowStyle Hidden
Write-Host "Ghaith Print Agent is installed and will start automatically with Windows."
