param([string]$Executable = 'src-tauri/target/release/dayweave.exe')
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$exe = (Resolve-Path -LiteralPath (Join-Path $workspace $Executable)).Path
$profile = Join-Path $workspace ('artifacts/windows-test-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$previousProfile = $env:WEBVIEW2_USER_DATA_FOLDER
$previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$env:WEBVIEW2_USER_DATA_FOLDER = $profile
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9240'
$env:DAYWEAVE_NATIVE_TEST = '1'
$owned = @()
function Start-TestApp {
  if (Get-NetTCPConnection -LocalPort 9240 -State Listen -ErrorAction SilentlyContinue) { throw 'Test port 9240 is already in use.' }
  $running = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru
  $script:owned += $running
  for($i=0;$i -lt 50;$i++) {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:9240/json/version'; return } catch { Start-Sleep -Milliseconds 200 }
  }
  throw 'Windows test app did not expose CDP.'
}
Push-Location $workspace
try {
  Start-TestApp
  rtk proxy node tests/windows/native.mjs
  if($LASTEXITCODE -ne 0) { throw 'Native interaction checks failed.' }
  $owned[-1].WaitForExit(10000) | Out-Null
  Start-TestApp
  rtk proxy node tests/windows/restart.mjs
  if($LASTEXITCODE -ne 0) { throw 'Restart checks failed.' }
  $owned[-1].WaitForExit(10000) | Out-Null
  Write-Output "PASS Windows Release checks. Isolated profile: $profile"
} finally {
  foreach($running in $owned) { if(-not $running.HasExited) { Stop-Process -Id $running.Id } }
  $env:WEBVIEW2_USER_DATA_FOLDER = $previousProfile
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments
  Remove-Item Env:DAYWEAVE_NATIVE_TEST -ErrorAction SilentlyContinue
  Pop-Location
}
