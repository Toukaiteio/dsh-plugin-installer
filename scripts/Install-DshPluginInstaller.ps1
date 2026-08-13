<#
.SYNOPSIS
Downloads and installs the latest DSH Plugin Installer release.

.DESCRIPTION
Installs the latest stable release into a DSH Profile through DSH's own plugin
command. The default web Profile is started after a successful installation.

.EXAMPLE
.\Install-DshPluginInstaller.ps1

.EXAMPLE
.\Install-DshPluginInstaller.ps1 -Profile work -NoStart
#>
[CmdletBinding()]
param(
  [ValidatePattern('^[A-Za-z0-9_-]+$')]
  [string] $Profile = 'web',

  [switch] $NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repository = 'Toukaiteio/dsh-plugin-installer'
$headers = @{
  Accept = 'application/vnd.github+json'
  'User-Agent' = 'dsh-plugin-installer-bootstrap'
}

if ($null -eq (Get-Command dsh -ErrorAction SilentlyContinue)) {
  throw 'The DSH CLI was not found on PATH. Install DeepSeek Harness first, then run this script again.'
}

Write-Host 'Finding the latest DSH Plugin Installer release...'
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest" -Headers $headers
$asset = @($release.assets) |
  Where-Object { $_.name -match '^dsh-plugin-installer-.+\.tgz$' } |
  Select-Object -First 1

if ($null -eq $asset) {
  throw "Release $($release.tag_name) does not contain a DSH Plugin Installer package archive."
}

$dshHome = if ($null -ne $env:DSH_HOME -and $env:DSH_HOME.Trim().Length -gt 0) {
  [System.IO.Path]::GetFullPath($env:DSH_HOME)
} else {
  Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)) '.dsh'
}
$archiveDirectory = Join-Path (Join-Path $dshHome 'plugin-archives') 'dsh-plugin-installer'
$archivePath = Join-Path $archiveDirectory $asset.name
$downloadPath = Join-Path $archiveDirectory ".$($asset.name).$([guid]::NewGuid().ToString('N')).download"

try {
  New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null

  Write-Host "Downloading $($release.tag_name)..."
  Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $downloadPath

  if ($asset.PSObject.Properties.Name -contains 'digest' -and $asset.digest -match '^sha256:(?<hash>[0-9a-fA-F]{64})$') {
    $expectedHash = $Matches.hash.ToLowerInvariant()
    $actualHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      throw 'The downloaded package checksum does not match the GitHub Release checksum.'
    }
  }

  # `dsh plugin add` preserves a file: dependency. Keep this archive under
  # DSH_HOME instead of a temporary directory so later plugin operations can
  # still resolve the installed package.
  Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force

  Write-Host "Installing into the '$Profile' DSH Profile..."
  & dsh plugin --profile $Profile add $archivePath
  if ($LASTEXITCODE -ne 0) {
    throw "DSH plugin installation failed with exit code $LASTEXITCODE."
  }

  Write-Host "DSH Plugin Installer $($release.tag_name) was installed successfully."

  if (-not $NoStart -and $Profile -eq 'web') {
    Write-Host 'Starting DSH Web...'
    & dsh web
    if ($LASTEXITCODE -ne 0) {
      throw "DSH Web exited with code $LASTEXITCODE."
    }
  } elseif (-not $NoStart) {
    Write-Host "Installation is complete. Start this Profile with: dsh --profile $Profile"
  }
} finally {
  if (Test-Path -LiteralPath $downloadPath) {
    Remove-Item -LiteralPath $downloadPath -Force
  }
}
