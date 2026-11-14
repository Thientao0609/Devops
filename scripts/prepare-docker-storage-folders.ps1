$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'This preparation step needs Windows administrator approval' }
$approved=@('D:\DockerData','D:\DockerBackup\before-m2-20261114')
foreach ($directory in $approved) {
    $resolved=[IO.Path]::GetFullPath($directory)
    if ($resolved -notin $approved) { throw 'Path is outside the approved migration destinations' }
    New-Item -ItemType Directory -Path $resolved -Force | Out-Null
    & icacls.exe $resolved /inheritance:r /grant:r "$($identity.Name):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not grant access to approved destination: $resolved" }
}
$projectRoot=Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Path (Join-Path $projectRoot '.ci-local') -Force | Out-Null
@{at_utc=(Get-Date).ToUniversalTime().ToString('o');prepared=$approved;account=$identity.Name;operation='Create approved folders and grant current user, SYSTEM and Administrators access; no data moved'} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $projectRoot '.ci-local/storage-folders-ready.json') -Encoding utf8
