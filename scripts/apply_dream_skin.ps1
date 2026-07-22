[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Apply', 'Restore')]
  [string]$Action,

  [string]$ImagePath,
  [string]$Name,
  [switch]$RestartExisting
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$resultPrefix = 'COGAME_RESULT:'

try {
  $stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $engineRoot = Join-Path $stateRoot 'engine'
  $runtimeScripts = Join-Path $engineRoot 'scripts'
  $themeScript = Join-Path $runtimeScripts 'theme-windows.ps1'
  $startScript = Join-Path $runtimeScripts 'start-dream-skin.ps1'
  $restoreScript = Join-Path $runtimeScripts 'restore-dream-skin.ps1'
  foreach ($requiredDirectory in @($stateRoot, $engineRoot, $runtimeScripts)) {
    if (-not (Test-Path -LiteralPath $requiredDirectory -PathType Container)) {
      throw "Codex Dream Skin runtime directory is missing: $requiredDirectory"
    }
    if ((Get-Item -LiteralPath $requiredDirectory -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "Codex Dream Skin runtime directory cannot be a reparse point: $requiredDirectory"
    }
  }

  foreach ($required in @($themeScript, $startScript, $restoreScript)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Codex Dream Skin runtime is incomplete: $required"
    }
    if ((Get-Item -LiteralPath $required -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "Codex Dream Skin runtime script cannot be a reparse point: $required"
    }
  }

  if ($Action -eq 'Apply') {
    if (-not $ImagePath) { throw 'ImagePath is required for Apply.' }
    $fullImagePath = [System.IO.Path]::GetFullPath($ImagePath)
    if (-not (Test-Path -LiteralPath $fullImagePath -PathType Leaf)) {
      throw "Skin image does not exist: $fullImagePath"
    }

    . $themeScript
    $null = Set-DreamSkinActiveTheme `
      -ImagePath $fullImagePath `
      -Theme $null `
      -Name $Name `
      -StateRoot $stateRoot
    Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot | Out-Null

    $powerShell = Join-Path $PSHOME 'powershell.exe'
    $launchArguments = @(
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', $startScript
    )
    if ($RestartExisting) { $launchArguments += '-RestartExisting' }
    & $powerShell @launchArguments
    if ($LASTEXITCODE) { throw "Dream Skin launcher exited with code $LASTEXITCODE" }

    $payload = [ordered]@{ ok = $true; action = 'apply'; message = '皮肤已应用'; name = $Name }
  } else {
    if (-not $RestartExisting) {
      throw 'Restore requires explicit restart confirmation.'
    }
    $powerShell = Join-Path $PSHOME 'powershell.exe'
    $restoreArguments = @(
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
      '-File', $restoreScript, '-RestoreBaseTheme', '-ForceRestart'
    )
    & $powerShell @restoreArguments
    if ($LASTEXITCODE) { throw "Dream Skin restore exited with code $LASTEXITCODE" }
    $payload = [ordered]@{ ok = $true; action = 'restore'; message = '已恢复官方外观' }
  }

  Write-Output ($resultPrefix + ($payload | ConvertTo-Json -Compress))
} catch {
  $payload = [ordered]@{ ok = $false; action = $Action.ToLowerInvariant(); message = $_.Exception.Message }
  Write-Output ($resultPrefix + ($payload | ConvertTo-Json -Compress))
  Write-Error $_.Exception.Message
  exit 1
}
