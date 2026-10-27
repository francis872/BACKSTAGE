$ErrorActionPreference = 'Stop'
$monitorRoot = Split-Path -Parent $PSScriptRoot
$monitorFile = Join-Path $PSScriptRoot 'run-staging-monitor.ps1'
$monitorHash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($monitorRoot))).Replace('-', '').Substring(0, 8)
$monitorTaskName = 'BACKSTAGE-Staging-Monitor-' + $monitorHash
$monitorArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $monitorFile + '"'
$monitorExisting = Get-ScheduledTask -TaskName $monitorTaskName -ErrorAction SilentlyContinue
if ($monitorExisting) {
  if ($monitorExisting.Actions.Arguments -ne $monitorArgs) { throw 'Existing task has a different owner or action; refusing to replace it.' }
} else {
  $monitorAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $monitorArgs -WorkingDirectory $monitorRoot
  $monitorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $monitorPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $monitorSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $monitorTaskName -Action $monitorAction -Trigger $monitorTrigger -Principal $monitorPrincipal -Settings $monitorSettings -Description 'BACKSTAGE protected staging health checks; local alerts only; requires this computer and signed-in user.' | Out-Null
}
$monitorTask = Get-ScheduledTask -TaskName $monitorTaskName
$monitorEvidence = [ordered]@{ checked_at = [DateTime]::UtcNow.ToString('o'); task_name = $monitorTaskName; state = $monitorTask.State.ToString(); interval_minutes = 5; scope = 'protected_staging_only'; requires_local_computer_and_signed_in_user = $true; external_alert_delivery = $false; production_monitoring = $false }
$monitorJson = $monitorEvidence | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $monitorRoot 'docs/backstage-2.0/evidence/readiness-monitor-schedule.json'), $monitorJson, [System.Text.UTF8Encoding]::new($false))
Write-Output $monitorJson
