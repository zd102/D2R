param([ValidateSet('Install', 'Stop', 'Uninstall')][string]$Action = 'Install')
$ErrorActionPreference = 'Stop'
$service = Get-Service -Name D2RServer -ErrorAction SilentlyContinue
if ($service -and $service.Status -ne 'Stopped') {
    Stop-Service -Name D2RServer
    (Get-Service D2RServer).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
}
if ($Action -eq 'Stop') { exit 0 }
if ($Action -eq 'Uninstall') {
    if ($service) {
        & "$PSScriptRoot\d2r-server.exe" uninstall
        if ($LASTEXITCODE -ne 0) { throw 'Service uninstall failed' }
    }
    exit 0
}
$dataRoot = Join-Path $env:ProgramData 'D2RServer'
New-Item -ItemType Directory -Force -Path "$dataRoot\data", "$dataRoot\logs" | Out-Null
if (-not (Test-Path -LiteralPath "$dataRoot\server.env")) {
    Copy-Item -LiteralPath "$PSScriptRoot\server.env" -Destination "$dataRoot\server.env"
}
# LocalService can write saves/logs, but cannot modify the service configuration.
& icacls.exe $dataRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX'
if ($LASTEXITCODE -ne 0) { throw 'Data directory permissions failed' }
foreach ($directory in @("$dataRoot\data", "$dataRoot\logs")) {
    & icacls.exe $directory /grant:r '*S-1-5-19:(OI)(CI)M'
    if ($LASTEXITCODE -ne 0) { throw 'Service write permissions failed' }
}
if (-not $service) {
    & "$PSScriptRoot\d2r-server.exe" install
    if ($LASTEXITCODE -ne 0) { throw 'Service install failed' }
}
Start-Service D2RServer
(Get-Service D2RServer).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
Start-Sleep -Seconds 3
if ((Get-Service D2RServer).Status -ne 'Running') { throw "Service failed. Check $dataRoot\logs" }
