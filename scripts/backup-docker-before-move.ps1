$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$dockerSource=[IO.Path]::GetFullPath('C:\Users\Acer\AppData\Local\Docker\wsl')
$backupRoot=[IO.Path]::GetFullPath('D:\DockerBackup\before-m2-20261114')
if ($dockerSource -ne 'C:\Users\Acer\AppData\Local\Docker\wsl' -or $backupRoot -ne 'D:\DockerBackup\before-m2-20261114') { throw 'Unexpected approved paths' }
$sources=@(
    (Join-Path $dockerSource 'disk/docker_data.vhdx'),
    (Join-Path $dockerSource 'main/ext4.vhdx'),
    'C:\Users\Acer\AppData\Roaming\Docker\settings-store.json'
)
foreach ($source in $sources) { if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing source: $source" } }
$required=($sources | ForEach-Object { (Get-Item -LiteralPath $_).Length } | Measure-Object -Sum).Sum
if ((Get-PSDrive -Name D).Free -lt ($required * 2 + 5GB)) { throw 'Insufficient space for backup, migration and reserve' }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$taskIdentity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $backupRoot /inheritance:r /grant:r "${taskIdentity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict backup folder access' }
& docker desktop stop --timeout 45
if ($LASTEXITCODE -ne 0) {
    & docker desktop stop --force --timeout 30
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not stop; do not copy a live disk' }
}
foreach ($disk in $sources[0..1]) {
    $exclusive=[IO.File]::Open($disk,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    $exclusive.Dispose()
}
$records=@()
foreach ($source in $sources) {
    $relative=if ($source.EndsWith('docker_data.vhdx')) { 'disk/docker_data.vhdx' } elseif ($source.EndsWith('ext4.vhdx')) { 'main/ext4.vhdx' } else { 'settings-store.json' }
    $target=Join-Path $backupRoot $relative
    if (-not ([IO.Path]::GetFullPath($target).StartsWith($backupRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))) { throw 'Backup escaped approved directory' }
    if (Test-Path -LiteralPath $target) { throw "Backup exists; will not overwrite: $target" }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Write-Output "Copying $relative"
    Copy-Item -LiteralPath $source -Destination $target
    $sourceHash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $targetHash=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($sourceHash -ne $targetHash) { throw "Backup hash mismatch: $relative" }
    $records += [pscustomobject]@{source=$source;backup=$target;bytes=(Get-Item -LiteralPath $target).Length;sha256=$targetHash;hash_match=$true}
    Write-Output "Verified SHA256: $relative"
}
$snapshot=[ordered]@{at_utc=(Get-Date).ToUniversalTime().ToString('o');status='BACKUP_VERIFIED_NOT_MIGRATED';docker_stopped=$true;approved_backup=$backupRoot;proposed_data='D:\DockerData';files=$records}
$snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupRoot 'backup-manifest.json') -Encoding utf8
$evidenceRoot=Join-Path $projectRoot ('docs/evidence/docker-storage-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'backup-manifest.json') -Encoding utf8
Write-Output "Backup verified; evidence: $evidenceRoot"
