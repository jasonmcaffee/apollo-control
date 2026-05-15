# install-startup.ps1
# Creates a Windows Startup folder shortcut that launches apollo_volume.py
# headlessly (pythonw.exe — no console window) on login.
# Run once: powershell -ExecutionPolicy Bypass -File install-startup.ps1

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $scriptDir "src\apollo_volume.py"
$pythonW    = Join-Path (Split-Path (Get-Command python).Source) "pythonw.exe"
$startupDir = [Environment]::GetFolderPath("Startup")
$lnkPath    = Join-Path $startupDir "Apollo Volume Control.lnk"

if (-not (Test-Path $pythonW)) {
    Write-Error "pythonw.exe not found alongside python.exe at $(Split-Path (Get-Command python).Source)"
    exit 1
}

$shell   = New-Object -ComObject WScript.Shell
$lnk     = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = $pythonW
$lnk.Arguments        = "`"$scriptPath`""
$lnk.WorkingDirectory = $scriptDir
$lnk.Description      = "Apollo Volume Keyboard Control"
$lnk.WindowStyle      = 7   # minimised / hidden (no taskbar flash)
$lnk.Save()

Write-Host "Shortcut created: $lnkPath"
Write-Host "Target:           $pythonW `"$scriptPath`""
Write-Host ""
Write-Host "To remove, delete: $lnkPath"
