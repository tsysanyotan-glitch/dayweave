param([ValidateSet('build','dev')][string]$Mode = 'build', [switch]$Debug, [ValidateSet('aarch64','x86_64')][string[]]$Targets = @('aarch64','x86_64'))
$ErrorActionPreference = 'Stop'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
if (-not $env:NDK_HOME) {
  $ndk = Get-ChildItem -LiteralPath (Join-Path $sdk 'ndk') -Directory | Sort-Object Name -Descending | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'source.properties') } | Select-Object -First 1
  if (-not $ndk) { throw '请先安装 Android NDK（建议 28.2 或更新版本）。' }
  $env:NDK_HOME = $ndk.FullName
}
$env:PATH = (Join-Path $sdk 'platform-tools') + ';' + $env:PATH
# The Windows NDK linker cannot reliably decode non-ASCII response-file paths.
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'DayWeaveBuild\android' }
# No persistent build service is needed after packaging.
$env:GRADLE_OPTS = '-Dorg.gradle.daemon=false'
if ($Mode -eq 'dev') { & npm run tauri -- android dev; exit $LASTEXITCODE }
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$profile = if ($Debug) { 'debug' } else { 'release' }
$variant = if ($Debug) { 'Debug' } else { 'Release' }
$androidProject = Join-Path $root 'src-tauri\gen\android'
$logDir = Join-Path $root 'artifacts\android-build'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$abis = @(); $arches = @(); $excluded = @()
foreach ($target in $Targets) {
  $abi = if ($target -eq 'aarch64') { 'arm64-v8a' } else { 'x86_64' }
  $arch = if ($target -eq 'aarch64') { 'arm64' } else { 'x86_64' }
  $cliArgs = @('run','tauri','--','android','build','--apk','--target',$target,'--ci')
  if ($Debug) { $cliArgs += '--debug' }
  $ErrorActionPreference = 'Continue'
  $log = (& npm @cliArgs 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  [IO.File]::WriteAllText((Join-Path $logDir "$target-$profile.log"), $log, [Text.UTF8Encoding]::new($false))
  if ($code -ne 0) {
    # Windows without Developer Mode may compile successfully but reject the
    # final .so symlink. Copy only after that exact, successful-build failure.
    if ($log -notmatch 'Creation symbolic link is not allowed' -or $log -notmatch 'Finished') { Write-Host $log; throw "Android $target 编译失败，请检查构建记录。" }
    $library = Join-Path $env:CARGO_TARGET_DIR "$target-linux-android\$profile\libdayweave_lib.so"
    if (-not (Test-Path -LiteralPath $library)) { throw "未找到本轮构建的原生库：$library" }
    $destination = Join-Path $androidProject "app\src\main\jniLibs\$abi"
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -LiteralPath $library -Destination (Join-Path $destination 'libdayweave_lib.so') -Force
    Write-Host "$target 原生库已构建，使用文件复制完成 Windows 打包。"
  }
  $abis += $abi; $arches += $arch
  $taskArch = if ($arch -eq 'arm64') { 'Arm64' } else { 'X86_64' }
  $excluded += @('-x', "rustBuild$taskArch$variant")
}
Push-Location -LiteralPath $androidProject
try {
  & .\gradlew.bat --no-daemon "assembleUniversal$variant" "-PabiList=$($abis -join ',')" "-ParchList=$($arches -join ',')" "-PtargetList=$($Targets -join ',')" @excluded
  if ($LASTEXITCODE -ne 0) { throw 'Android 打包失败。' }
} finally { Pop-Location }
