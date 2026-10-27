$ErrorActionPreference = 'Stop'
$monitorRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $monitorRoot
$monitorNode = (Get-Command node -ErrorAction Stop).Source
& $monitorNode (Join-Path $PSScriptRoot 'staging-monitor.js')
exit $LASTEXITCODE
